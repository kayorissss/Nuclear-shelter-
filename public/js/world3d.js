// ============================================================================
// БУНКЕР «ЗАСЛОН-19» — 3D ДВИЖОК (Three.js: Бункер, Пустошь, НПС, Мутанты,
// Оружие от 1-го лица, Двери, Вылазки, Стрельба)
// ============================================================================

class World3D {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById("viewport-3d");
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Player 3D state
    this.zone = "bunker"; // "bunker" or "surface"
    this.playerPos = new THREE.Vector3(0, 1.7, 8.5);
    this.yaw = 0;
    this.pitch = 0;
    this.velY = 0;
    this.onGround = true;
    this.walkBobTimer = 0;

    // Groups
    this.bunkerGroup = new THREE.Group();
    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.bunkerGroup);
    this.scene.add(this.surfaceGroup);
    this.scene.add(this.camera);

    // Interactive registries
    this.doors = [];
    this.interactables = [];
    this.npcMeshes = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.wallCollidersBunker = [];
    this.wallCollidersSurface = [];
    this.heatSources = []; // campfires & thermal anomalies
    this.radZones = [];    // radioactive pools on surface
    this.antiqueDisplayGroup = new THREE.Group();

    // First-person weapon model
    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup);
    this.recoilOffset = 0;
    this.reloadAnim = 0;
    this.muzzleLight = new THREE.PointLight(0xf59e0b, 0, 8);
    this.muzzleLight.position.set(0.25, -0.18, -0.9);
    this.camera.add(this.muzzleLight);

    this.raycaster = new THREE.Raycaster();
    this.hoveredTarget = null;

    this.initLights();
    this.buildBunkerWorld();
    this.buildSurfaceWorld();
    this.buildWeaponViewModel("wpn_pm");
    this.setZone("bunker");

    window.addEventListener("resize", () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0x6b7f72, 0.75);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0x94a3b8, 0.8);
    this.dirLight.position.set(30, 65, 25);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    // Player flashlight
    this.flashlight = new THREE.SpotLight(0xfffbeb, 1.35, 36, Math.PI / 4.2, 0.45, 1.2);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
  }

  // ==========================================================================
  // ПОСТРОЕНИЕ 3D БУНКЕРА «ЗАСЛОН-19»
  // ==========================================================================
  buildBunkerWorld() {
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e2520,
      roughness: 0.85,
      metalness: 0.25
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x141915,
      roughness: 0.9
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a342d,
      roughness: 0.75,
      metalness: 0.3
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.5,
      metalness: 0.4
    });

    // Main floor & ceiling covering the bunker complex (-22..22 X, -20..15 Z)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(52, 44), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -4);
    floor.receiveShadow = true;
    this.bunkerGroup.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(52, 44), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.8, -4);
    this.bunkerGroup.add(ceil);

    // Helper to add a wall segment with collision box
    const addWall = (x, z, w, d, h = 3.8, mat = wallMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.bunkerGroup.add(mesh);

      // Baseboard hazard stripe
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.22, d + 0.04), stripeMat);
      trim.position.set(x, 0.12, z);
      this.bunkerGroup.add(trim);

      this.wallCollidersBunker.push({
        minX: x - w / 2 - 0.45,
        maxX: x + w / 2 + 0.45,
        minZ: z - d / 2 - 0.45,
        maxZ: z + d / 2 + 0.45
      });
    };

    // Outer perimeter walls of the bunker
    addWall(0, 14, 14, 0.8);     // South wall (Airlock entrance)
    addWall(-6.8, 9, 0.8, 10);   // Airlock West
    addWall(6.8, 9, 0.8, 10);    // Airlock East

    // Partition between Airlock (z: 4..14) and Central Hall (z: -8..4) with doorway at x=0
    addWall(-4.2, 4, 5.2, 0.8);
    addWall(4.2, 4, 5.2, 0.8);

    // Outer walls for West (Medbay & Storage) and East (Engineering) wings
    addWall(-20, -6, 0.8, 22);   // Far West wall
    addWall(20, -2, 0.8, 14);    // Far East wall
    addWall(0, -18, 40, 0.8);    // Far North wall

    // Central corridor West wall with doorways at z=-2 (Medbay) and z=-13 (Storage)
    addWall(-6.8, 1.5, 0.8, 4.2);
    addWall(-6.8, -7.5, 0.8, 7.2);
    addWall(-6.8, -16.2, 0.8, 3.2);

    // Central corridor East wall with doorway at z=-2 (Engineering)
    addWall(6.8, 1.5, 0.8, 4.2);
    addWall(6.8, -11, 0.8, 13.5);
    addWall(13.4, 4, 13.2, 0.8);
    addWall(13.4, -8.5, 13.2, 0.8);

    // Divider between Medbay (z: -8..4) and Storage/Hydroponics (z: -18..-8)
    addWall(-13.4, 4, 13.2, 0.8);
    addWall(-13.4, -8, 13.2, 0.8);

    // Partition between Central Hall and Command Center (z = -8) with doorway at x=0
    addWall(-4.2, -8, 5.2, 0.8);
    addWall(4.2, -8, 5.2, 0.8);

    // Interactive Blast Doors [E]
    this.addBlastDoor(0, 4, 3.2, 0.35, "z", "Гермодверь Шлюза №1");
    this.addBlastDoor(0, -8, 3.2, 0.35, "z", "Гермодверь Командного Центра");
    this.addBlastDoor(-6.8, -2, 0.35, 3.2, "x", "Дверь Медблока");
    this.addBlastDoor(6.8, -2, 0.35, 3.2, "x", "Дверь Инженерного отсека");
    this.addBlastDoor(-6.8, -13, 0.35, 3.2, "x", "Дверь Склада и Гидропоники");

    // Ceiling point lights in each room
    const roomLights = [
      { x: 0, z: 9, color: 0xf59e0b, intensity: 1.4 },     // Airlock (Amber)
      { x: 0, z: -2, color: 0xd1fae5, intensity: 1.5 },    // Central Hall
      { x: 0, z: -13, color: 0x38bdf8, intensity: 1.6 },   // Command Center
      { x: -13.5, z: -2, color: 0xf8fafc, intensity: 1.6 },// Medbay
      { x: 13.5, z: -2, color: 0xfb923c, intensity: 1.6 }, // Engineering
      { x: -13.5, z: -13, color: 0x4ade80, intensity: 1.5 }// Hydroponics
    ];
    roomLights.forEach((rl) => {
      const pl = new THREE.PointLight(rl.color, rl.intensity, 18);
      pl.position.set(rl.x, 3.3, rl.z);
      this.bunkerGroup.add(pl);

      const lampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.12, 0.4),
        new THREE.MeshBasicMaterial({ color: rl.color })
      );
      lampMesh.position.set(rl.x, 3.72, rl.z);
      this.bunkerGroup.add(lampMesh);
    });

    // 1. AIRLOCK EXIT GATE TO SURFACE [E]
    const exitGate = new THREE.Group();
    exitGate.position.set(0, 0, 13.4);
    const gateFrame = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.7, roughness: 0.3 })
    );
    gateFrame.rotation.x = Math.PI / 2;
    gateFrame.position.y = 1.8;
    exitGate.add(gateFrame);

    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 })
    );
    wheel.position.set(0, 1.8, -0.28);
    exitGate.add(wheel);
    this.bunkerGroup.add(exitGate);

    this.registerInteractable(exitGate, {
      type: "exit_to_surface",
      zone: "bunker",
      name: "ГЕРМОЗАТВОР ВЫХОДА НА ПОВЕРХНОСТЬ",
      prompt: "[E] Выйти на улицу (Пустошь Урала — -28°C, Радиация)"
    });

    // 2. WORKBENCH IN ENGINEERING [E]
    const bench = new THREE.Group();
    bench.position.set(16.5, 0, 1.2);
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.95, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.5 })
    );
    table.position.y = 0.48;
    bench.add(table);
    const vise = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.35, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd97706 })
    );
    vise.position.set(-0.7, 1.1, 0);
    bench.add(vise);
    this.bunkerGroup.add(bench);

    this.registerInteractable(bench, {
      type: "workbench",
      zone: "bunker",
      name: "ИНЖЕНЕРНЫЙ ВЕРСТАК «КРЕМНИЙ-М»",
      prompt: "[E] Открыть Верстак (Крафт, Ремонт оружия/брони, Реставрация Старины)"
    });

    // 3. DIESEL GENERATOR & HEATING BOILER IN ENGINEERING [E]
    const genGroup = new THREE.Group();
    genGroup.position.set(16.8, 0, -4.8);
    const genBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 2.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.6, roughness: 0.4 })
    );
    genBody.position.y = 1.05;
    genGroup.add(genBody);
    this.bunkerGroup.add(genGroup);

    this.registerInteractable(genGroup, {
      type: "bunker_systems",
      zone: "bunker",
      name: "ДИЗЕЛЬ-ГЕНЕРАТОР ДГ-400 И КОТЁЛ ОТОПЛЕНИЯ КВ-19",
      prompt: "[E] Управление и Ремонт систем жизнеобеспечения (Холод/Жар/Питание)"
    });

    // 4. COMMAND RADAR & RADIO "ANGARA" [E]
    const radarDesk = new THREE.Group();
    radarDesk.position.set(0, 0, -16.2);
    const deskMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 1.1, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 })
    );
    deskMesh.position.y = 0.55;
    radarDesk.add(deskMesh);
    const screenMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.0, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    screenMesh.position.set(0, 1.6, 0);
    radarDesk.add(screenMesh);
    this.bunkerGroup.add(radarDesk);

    this.registerInteractable(radarDesk, {
      type: "command_terminal",
      zone: "bunker",
      name: "ТЕРМИНАЛ СПРН И РАДИОСТАНЦИЯ «АНГАРА-1»",
      prompt: "[E] Открыть Тактическую Карту и Журнал Заданий"
    });

    // 5. BED IN MEDBAY / QUARTERS (REST & WARM UP) [E]
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-16.8, 0, 1.5);
    const bedFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.55, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x475569 })
    );
    bedFrame.position.y = 0.28;
    bedGroup.add(bedFrame);
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.2, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    );
    mattress.position.y = 0.62;
    bedGroup.add(mattress);
    this.bunkerGroup.add(bedGroup);

    this.registerInteractable(bedGroup, {
      type: "rest_bed",
      zone: "bunker",
      name: "КОЙКА МЕДБЛОКА И ОБОГРЕВАТЕЛЬ",
      prompt: "[E] Отдохнуть и нормализовать температуру тела (+35 ХП, 36.6°C)"
    });

    // 6. ANTIQUE DISPLAY SHELF ("УГОЛОК СТАРИНЫ") IN STORAGE/QUARTERS
    this.antiqueDisplayGroup.position.set(-10.5, 0, -16.2);
    const shelfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.1, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 })
    );
    shelfMesh.position.y = 0.55;
    this.antiqueDisplayGroup.add(shelfMesh);
    this.bunkerGroup.add(this.antiqueDisplayGroup);

    this.registerInteractable(this.antiqueDisplayGroup, {
      type: "antiques_shelf",
      zone: "bunker",
      name: "МУЗЕЙНЫЙ СТЕНД «СТАРИНА И ПАМЯТЬ РОДИНЫ»",
      prompt: "[E] Осмотреть отреставрированные реликвии прошлого мира"
    });

    // 7. INITIAL BUNKER SUPPLY CRATES [E]
    const bunkerCrates = [
      { x: -3.8, z: 9.5, name: "Аварийный шкаф РХБЗ (Шлюз)", items: ["filter_fgp", "med_bandage", "ammo_9x18"] },
      { x: 3.8, z: 9.5, name: "Ящик табельного снаряжения", items: ["food_tushonka", "water_clean", "ammo_9x18"] },
      { x: 16.2, z: -1.5, name: "Инженерный ящик ЗИП", items: ["mat_scrap", "mat_scrap", "mat_elec", "mat_charcoal"] },
      { x: -16.5, z: -14.5, name: "Контейнер Росрезерва №19", items: ["food_irp", "water_tea", "mat_cloth", "mat_powder"] }
    ];
    bunkerCrates.forEach((c, idx) => {
      this.spawnLootCrate(this.bunkerGroup, "bunker", c.x, c.z, c.name, c.items, `bunker_crate_${idx}`);
    });

    // 8. SPAWN 3D NPCs (MALE & FEMALE) IN BUNKER
    window.GAME_DATA.npcs.forEach((npc) => {
      this.spawnNPC(npc);
    });
  }

  addBlastDoor(x, z, w, d, axis, label) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      metalness: 0.75,
      roughness: 0.35
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 3.3, d), doorMat);
    mesh.position.y = 1.65;
    group.add(mesh);

    // Yellow hazard bar across middle of blast door
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.04, 0.32, d + 0.04),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    bar.position.y = 1.65;
    group.add(bar);

    this.bunkerGroup.add(group);

    const doorObj = {
      group,
      closedX: x,
      closedZ: z,
      axis,
      open: false,
      progress: 0,
      w,
      d,
      label
    };
    this.doors.push(doorObj);

    this.registerInteractable(group, {
      type: "door",
      zone: "bunker",
      doorObj,
      name: label,
      prompt: `[E] Открыть / Закрыть (${label})`
    });
  }

  spawnNPC(npcData) {
    const g = new THREE.Group();
    g.position.set(npcData.pos.x, 0, npcData.pos.z);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.22), legMat);
    leftLeg.position.set(-0.14, 0.42, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.22), legMat);
    rightLeg.position.set(0.14, 0.42, 0);
    g.add(leftLeg, rightLeg);

    // Torso (slightly different proportions for male vs female)
    const isFemale = npcData.gender === "Женщина";
    const torsoW = isFemale ? 0.46 : 0.56;
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW, 0.78, 0.3),
      new THREE.MeshStandardMaterial({ color: npcData.color, roughness: 0.6 })
    );
    torso.position.y = 1.22;
    g.add(torso);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.5 })
    );
    head.position.y = 1.82;
    g.add(head);

    // Hair / Cap
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshStandardMaterial({ color: npcData.hairColor })
    );
    hair.position.set(0, 1.88, -0.03);
    hair.scale.set(1.02, isFemale ? 1.15 : 0.7, 1.05);
    g.add(hair);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: npcData.color });
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.16), armMat);
    lArm.position.set(-(torsoW / 2 + 0.11), 1.2, 0);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.16), armMat);
    rArm.position.set(torsoW / 2 + 0.11, 1.2, 0);
    g.add(lArm, rArm);

    this.bunkerGroup.add(g);
    this.npcMeshes.push({ group: g, data: npcData, baseY: 0 });

    this.registerInteractable(g, {
      type: "npc",
      zone: "bunker",
      npcData,
      name: `${npcData.name} (${npcData.gender}, ${npcData.age} л.) — ${npcData.role}`,
      prompt: `[E] Поговорить с ${npcData.name}`
    });
  }

  // ==========================================================================
  // ПОСТРОЕНИЕ 3D ПОВЕРХНОСТИ (ЯДЕРНАЯ ЗИМА УРАЛА, РУИНЫ, МУТАНТЫ, СТАРИНА)
  // ==========================================================================
  buildSurfaceWorld() {
    // Snow & Ash Ground Plane
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 32, 32), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.surfaceGroup.add(ground);

    // Bunker Surface Headhouse (Entrance at 0, 0, 0)
    const bunkerEntrance = new THREE.Group();
    bunkerEntrance.position.set(0, 0, 0);
    const concreteBlock = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
    );
    concreteBlock.position.y = 2.1;
    bunkerEntrance.add(concreteBlock);

    const doorPortal = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3.0, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 })
    );
    doorPortal.position.set(0, 1.5, 4.05);
    bunkerEntrance.add(doorPortal);

    // Beacon light on top of Bunker Entrance so player can always find way home
    const beacon = new THREE.PointLight(0xf59e0b, 2.2, 35);
    beacon.position.set(0, 5.5, 4);
    bunkerEntrance.add(beacon);

    this.surfaceGroup.add(bunkerEntrance);
    this.wallCollidersSurface.push({ minX: -4.2, maxX: 4.2, minZ: -4.2, maxZ: 3.8 });

    this.registerInteractable(bunkerEntrance, {
      type: "enter_bunker",
      zone: "surface",
      name: "ВХОДНОЙ СТВОЛ БУНКЕРА «ЗАСЛОН-19»",
      prompt: "[E] Вернуться в Бункер «Заслон-19» (Безопасная зона +21°C)"
    });

    // Major Surface Buildings / POIs
    const buildings = [
      // 1. Guardhouse near entrance
      { x: -12, z: 16, w: 6, h: 3.8, d: 6, color: 0x475569, name: "Сторожка КПП Шахты" },
      // 2. Rosrezerv Warehouse (North-West)
      { x: -58, z: -52, w: 18, h: 7.5, d: 12, color: 0x3f4f3e, name: "Склад Росрезерва №4" },
      // 3. City Clinic #4 (East)
      { x: 62, z: -18, w: 14, h: 9.5, d: 12, color: 0x475569, name: "Городская Поликлиника №4" },
      // 4. Military Checkpoint (North-East)
      { x: 56, z: -64, w: 14, h: 5.5, d: 10, color: 0x364135, name: "Военный Блокпост ВС РФ" },
      // 5. Ruined Soviet Khrushchyovka Apartments (South-West)
      { x: -54, z: 48, w: 16, h: 14, d: 10, color: 0x334155, name: "Разрушенный Жилой Дом" },
      { x: -32, z: 38, w: 12, h: 11, d: 9, color: 0x3e4c59, name: "Руины Панельного Дома" }
    ];

    buildings.forEach((b) => {
      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.d),
        new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.9 })
      );
      bMesh.position.set(b.x, b.h / 2, b.z);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      this.surfaceGroup.add(bMesh);
      this.wallCollidersSurface.push({
        minX: b.x - b.w / 2 - 0.5,
        maxX: b.x + b.w / 2 + 0.5,
        minZ: b.z - b.d / 2 - 0.5,
        maxZ: b.z + b.d / 2 + 0.5
      });
    });

    // 6. MAIN RADIO TOWER (South-East: 58, 56) + Final Quest Terminal
    const towerGroup = new THREE.Group();
    towerGroup.position.set(58, 0, 56);
    const towerTruss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 3.8, 38, 8, 4, true),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, wireframe: true })
    );
    towerTruss.position.y = 19;
    towerGroup.add(towerTruss);

    const towerBeacon = new THREE.PointLight(0xef4444, 2.5, 45);
    towerBeacon.position.set(0, 36, 0);
    towerGroup.add(towerBeacon);

    const towerTerm = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.5, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6 })
    );
    towerTerm.position.set(0, 0.75, -4.5);
    towerGroup.add(towerTerm);
    this.surfaceGroup.add(towerGroup);

    this.registerInteractable(towerTerm, {
      type: "radio_tower_terminal",
      zone: "surface",
      worldPos: new THREE.Vector3(58, 1, 51.5),
      name: "ТЕРМИНАЛ ГЛАВНОЙ ТЕЛЕВЫШКИ «УРАЛ-СВЯЗЬ»",
      prompt: "[E] Активировать радиомаяк объединения бункеров России"
    });

    // Campfire Barrels (Warm up from freezing Cold!) & Thermal Anomalies (Extreme Heat!)
    const heatLocations = [
      { x: 6, z: 14, radius: 7.5, tempBoost: 5.5, isAnomaly: false, name: "Бочка с костром у шлюза (Согревает)" },
      { x: -46, z: -42, radius: 7.5, tempBoost: 5.5, isAnomaly: false, name: "Костёр сталкеров у Склада" },
      { x: 48, z: -16, radius: 7.5, tempBoost: 5.5, isAnomaly: false, name: "Бочка с огнём у Поликлиники" },
      { x: 44, z: -56, radius: 7.5, tempBoost: 5.5, isAnomaly: false, name: "Костёр Военного блокпоста" },
      // Thermal Anomaly "Жар-Котёл" (Causes dangerous HEAT / Hyperthermia if too close!)
      { x: -38, z: 52, radius: 13.0, tempBoost: 14.0, isAnomaly: true, name: "Термальный разлом «Жар-Котёл» (+65°C ЖАР!)" }
    ];

    heatLocations.forEach((hl) => {
      const hGroup = new THREE.Group();
      hGroup.position.set(hl.x, 0, hl.z);

      if (hl.isAnomaly) {
        const lavaPool = new THREE.Mesh(
          new THREE.CircleGeometry(4.5, 20),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
        );
        lavaPool.rotation.x = -Math.PI / 2;
        lavaPool.position.y = 0.06;
        hGroup.add(lavaPool);
      } else {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12),
          new THREE.MeshStandardMaterial({ color: 0x4b5563 })
        );
        barrel.position.y = 0.55;
        hGroup.add(barrel);

        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.4, 0.85, 8),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b })
        );
        flame.position.y = 1.35;
        hGroup.add(flame);
      }

      const fireLight = new THREE.PointLight(hl.isAnomaly ? 0xff4500 : 0xf59e0b, 2.0, 18);
      fireLight.position.y = 2.0;
      hGroup.add(fireLight);

      this.surfaceGroup.add(hGroup);
      this.heatSources.push(hl);
    });

    // Radioactive Crater Zones on Surface
    const radPools = [
      { x: -24, z: -22, r: 9 },
      { x: 28, z: -38, r: 10 },
      { x: 18, z: 32, r: 9 }
    ];
    radPools.forEach((rp) => {
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(rp.r, 24),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.28 })
      );
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(rp.x, 0.04, rp.z);
      this.surfaceGroup.add(disk);
      this.radZones.push(rp);
    });

    // Dead Pine Trees across wasteland
    for (let i = 0; i < 48; i++) {
      const tx = (Math.random() - 0.5) * 210;
      const tz = (Math.random() - 0.5) * 210;
      if (Math.hypot(tx, tz) < 18) continue;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.35, 5.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x27272a })
      );
      trunk.position.set(tx, 2.75, tz);
      this.surfaceGroup.add(trunk);
    }

    // Snow / Ash Particle System
    const snowGeo = new THREE.BufferGeometry();
    const snowCount = 900;
    const snowPos = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount * 3; i += 3) {
      snowPos[i] = (Math.random() - 0.5) * 160;
      snowPos[i + 1] = Math.random() * 28;
      snowPos[i + 2] = (Math.random() - 0.5) * 160;
    }
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
    const snowMat = new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.25, transparent: true, opacity: 0.75 });
    this.snowParticles = new THREE.Points(snowGeo, snowMat);
    this.surfaceGroup.add(this.snowParticles);

    // Spawn Surface Loot Crates + Quest Items
    const surfaceCrates = [
      { x: -8, z: 16, name: "Ящик снабжения КПП", items: ["ammo_9x18", "food_tushonka", "water_dirty", "mat_scrap"] },
      { x: -18, z: 24, name: "Брошенный багажник УАЗа", items: ["wpn_toz", "ammo_12g", "repair_kit", "mat_fuel"] },
      { x: -48, z: -48, name: "Спецконтейнер Связи Росрезерва", items: ["quest_radio_unit", "ammo_545", "food_irp", "mat_elec"] },
      { x: -64, z: -42, name: "Военный ящик Росрезерва", items: ["wpn_ak74m", "ammo_545", "suit_bushlat", "filter_fgp"] },
      { x: 52, z: -18, name: "Медицинский сейф Поликлиники №4", items: ["quest_medkit_box", "med_ai4", "med_antirad", "suit_ozk"] },
      { x: 48, z: -58, name: "Сейф Коменданта Блокпоста", items: ["quest_cipher_key", "wpn_vss", "ammo_9x39", "suit_ratnik"] },
      { x: -44, z: 44, name: "Тайник выживших в Жилом Доме", items: ["water_tea", "food_soup", "med_cooling", "mat_powder"] },
      { x: 46, z: 48, name: "Контейнер спецназа у Телевышки", items: ["ammo_9x39", "ammo_plasma", "med_ai4", "filter_fgp"] }
    ];
    surfaceCrates.forEach((sc, idx) => {
      this.spawnLootCrate(this.surfaceGroup, "surface", sc.x, sc.z, sc.name, sc.items, `surf_crate_${idx}`);
    });

    // Spawn Pre-War Antiques («СТАРИНА») on Surface
    const antiqueSpawns = [
      { id: "ant_vef", x: -10, z: 19 },
      { id: "ant_vostok", x: -52, z: -44 },
      { id: "ant_patefon", x: 54, z: -12 },
      { id: "ant_samovar", x: -46, z: 50 },
      { id: "ant_dp5v", x: 50, z: -62 },
      { id: "ant_album", x: 50, z: 54 }
    ];
    antiqueSpawns.forEach((as) => {
      const antData = window.GAME_DATA.antiques[as.id];
      if (!antData) return;
      const g = new THREE.Group();
      g.position.set(as.x, 0, as.z);
      const ped = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.55, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.7, roughness: 0.3 })
      );
      ped.position.y = 0.28;
      g.add(ped);

      const beaconRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.05, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      beaconRing.rotation.x = Math.PI / 2;
      beaconRing.position.y = 0.7;
      g.add(beaconRing);

      this.surfaceGroup.add(g);
      this.registerInteractable(g, {
        type: "antique_pickup",
        zone: "surface",
        antiqueId: as.id,
        meshGroup: g,
        name: `РЕЛИКВИЯ СТАРИНЫ: ${antData.name}`,
        prompt: `[E] Забрать реликвию старины «${antData.name}» для реставрации`
      });
    });

    // Spawn Enemies, Mutants, Beasts & Boss on Surface
    this.spawnInitialSurfaceEnemies();
  }

  spawnInitialSurfaceEnemies() {
    const spawns = [
      // Wolves near yard & perimeter
      { type: "mutant_wolf", x: -22, z: 10 },
      { type: "mutant_wolf", x: 20, z: 18 },
      { type: "mutant_wolf", x: -32, z: -18 },
      // Ghouls near Clinic #4
      { type: "mutant_ghoul", x: 42, z: -14 },
      { type: "mutant_ghoul", x: 50, z: -24 },
      { type: "mutant_spitter", x: 56, z: -8 },
      // Marauders & Wolves near Rosrezerv Warehouse
      { type: "marauder_raven", x: -42, z: -38 },
      { type: "marauder_raven", x: -50, z: -34 },
      { type: "mutant_wolf", x: -36, z: -48 },
      // Military Checkpoint: Marauders & Ural Bear
      { type: "marauder_raven", x: 38, z: -48 },
      { type: "mutant_bear", x: 46, z: -52 },
      // South-West Apartments
      { type: "mutant_ghoul", x: -38, z: 36 },
      { type: "mutant_spitter", x: -48, z: 38 },
      // South-East Radio Tower: BOSS CHIMERA-19 + guards
      { type: "mutant_spitter", x: 42, z: 42 },
      { type: "boss_chimera", x: 52, z: 48 }
    ];

    spawns.forEach((s) => this.spawnEnemy(s.type, s.x, s.z));
  }

  spawnEnemy(enemyId, x, z) {
    const tpl = window.GAME_DATA.enemies[enemyId];
    if (!tpl) return;

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const sc = tpl.scale || 1.0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: tpl.color,
      roughness: 0.65,
      metalness: 0.2
    });

    if (enemyId === "mutant_wolf" || enemyId === "mutant_bear") {
      // Quadruped beast model (Wolf / Mutant Bear)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75 * sc, 0.65 * sc, 1.45 * sc), bodyMat);
      body.position.y = 0.65 * sc;
      g.add(body);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * sc, 0.5 * sc, 0.6 * sc), bodyMat);
      head.position.set(0, 0.9 * sc, 0.8 * sc);
      g.add(head);

      // Glowing mutant eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: tpl.eyeColor });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06 * sc, 8, 8), eyeMat);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06 * sc, 8, 8), eyeMat);
      eyeL.position.set(-0.15 * sc, 0.98 * sc, 1.1 * sc);
      eyeR.position.set(0.15 * sc, 0.98 * sc, 1.1 * sc);
      g.add(eyeL, eyeR);

      // 4 legs
      [
        [-0.25, -0.5], [0.25, -0.5],
        [-0.25, 0.5], [0.25, 0.5]
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18 * sc, 0.6 * sc, 0.18 * sc), bodyMat);
        leg.position.set(lx * sc, 0.3 * sc, lz * sc);
        g.add(leg);
      });
    } else {
      // Bipedal Mutant / Marauder / Boss Chimera
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68 * sc, 0.95 * sc, 0.42 * sc), bodyMat);
      torso.position.y = 1.15 * sc;
      g.add(torso);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26 * sc, 12, 12), bodyMat);
      head.position.set(0, 1.82 * sc, 0);
      g.add(head);

      if (enemyId === "boss_chimera") {
        // Second mutated head for Boss Chimera-19!
        const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.22 * sc, 12, 12), bodyMat);
        head2.position.set(0.28 * sc, 1.78 * sc, 0.1 * sc);
        g.add(head2);
      }

      const eyeMat = new THREE.MeshBasicMaterial({ color: tpl.eyeColor });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055 * sc, 8, 8), eyeMat);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.055 * sc, 8, 8), eyeMat);
      eyeL.position.set(-0.1 * sc, 1.85 * sc, 0.22 * sc);
      eyeR.position.set(0.1 * sc, 1.85 * sc, 0.22 * sc);
      g.add(eyeL, eyeR);

      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22 * sc, 0.75 * sc, 0.22 * sc), bodyMat);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22 * sc, 0.75 * sc, 0.22 * sc), bodyMat);
      legL.position.set(-0.18 * sc, 0.38 * sc, 0);
      legR.position.set(0.18 * sc, 0.38 * sc, 0);
      g.add(legL, legR);
    }

    // 3D Floating HP Bar above every Mutant / Enemy!
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4 * sc, 0.16 * sc),
      new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide })
    );
    hpBg.position.y = 2.35 * sc;
    g.add(hpBg);

    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.36 * sc, 0.12 * sc),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
    );
    hpFill.position.set(0, 2.35 * sc, 0.01);
    g.add(hpFill);

    this.surfaceGroup.add(g);

    this.enemies.push({
      id: enemyId,
      tpl,
      group: g,
      hpFill,
      hpBg,
      hp: tpl.hp,
      maxHp: tpl.hp,
      damage: tpl.damage,
      attackTimer: 0,
      homeX: x,
      homeZ: z,
      dead: false
    });
  }

  spawnLootCrate(parentGroup, zone, x, z, name, items, crateId) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.75, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.7, metalness: 0.3 })
    );
    box.position.y = 0.38;
    g.add(box);

    const lidStripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.1, 0.88),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    lidStripe.position.y = 0.72;
    g.add(lidStripe);

    parentGroup.add(g);

    this.registerInteractable(g, {
      type: "loot_crate",
      zone,
      crateId,
      items: [...items],
      looted: false,
      meshGroup: g,
      name,
      prompt: `[E] Обыскать: ${name}`
    });
  }

  registerInteractable(meshGroup, meta) {
    meshGroup.userData.interactMeta = meta;
    this.interactables.push({ group: meshGroup, meta });
  }

  // ==========================================================================
  // 3D МОДЕЛЬ ОРУЖИЯ В РУКАХ ИГРОКА ОТ ПЕРВОГО ЛИЦА
  // ==========================================================================
  buildWeaponViewModel(weaponId) {
    while (this.weaponGroup.children.length > 0) {
      this.weaponGroup.remove(this.weaponGroup.children[0]);
    }
    const wpn = window.GAME_DATA.weapons[weaponId] || window.GAME_DATA.weapons.wpn_pm;
    const g = new THREE.Group();

    const gunMat = new THREE.MeshStandardMaterial({
      color: wpn.color || 0x3f3f46,
      metalness: 0.75,
      roughness: 0.3
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25
    });

    if (weaponId === "wpn_crowbar") {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.75, 10), gunMat);
      bar.rotation.x = Math.PI / 3;
      bar.position.set(0.28, -0.26, -0.52);
      g.add(bar);
    } else {
      const len = weaponId === "wpn_pm" ? 0.36 : weaponId === "wpn_vss" ? 0.82 : 0.68;
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, len), gunMat);
      receiver.position.set(0.26, -0.24, -0.52);
      g.add(receiver);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, len * 0.75, 10),
        darkMetal
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.26, -0.2, -0.52 - len * 0.45);
      g.add(barrel);

      // Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.19, 0.08), darkMetal);
      mag.position.set(0.26, -0.35, -0.55);
      mag.rotation.x = 0.22;
      g.add(mag);

      if (weaponId === "wpn_vss" || weaponId === "wpn_plasma") {
        // Scope / Energy coils
        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.028, 0.26, 12),
          new THREE.MeshBasicMaterial({
            color: weaponId === "wpn_plasma" ? 0x22d3ee : 0x27272a
          })
        );
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0.26, -0.14, -0.5);
        g.add(scope);
      }
    }

    this.weaponGroup.add(g);
  }

  // ==========================================================================
  // ПЕРЕКЛЮЧЕНИЕ МЕЖДУ БУНКЕРОМ И ПОВЕРХНОСТЬЮ
  // ==========================================================================
  setZone(zoneName) {
    this.zone = zoneName;
    if (zoneName === "bunker") {
      this.bunkerGroup.visible = true;
      this.surfaceGroup.visible = false;
      this.scene.background = new THREE.Color(0x090d0a);
      this.scene.fog = new THREE.FogExp2(0x090d0a, 0.032);
      this.ambientLight.intensity = 0.65;
      this.dirLight.intensity = 0.25;
      this.playerPos.set(0, 1.7, 10.5);
      this.yaw = 0;
    } else {
      this.bunkerGroup.visible = false;
      this.surfaceGroup.visible = true;
      this.scene.background = new THREE.Color(0x1e293b);
      this.scene.fog = new THREE.FogExp2(0x1e293b, 0.022);
      this.ambientLight.intensity = 0.85;
      this.dirLight.intensity = 0.95;
      this.playerPos.set(0, 1.7, 6.5);
      this.yaw = Math.PI;
    }
  }

  // ==========================================================================
  // ОБНОВЛЕНИЕ СОСТОЯНИЯ СТЕНДА «СТАРИНА» В 3D
  // ==========================================================================
  refreshAntiqueShelf3D() {
    while (this.antiqueDisplayGroup.children.length > 1) {
      this.antiqueDisplayGroup.remove(this.antiqueDisplayGroup.children[1]);
    }
    const keys = Object.keys(window.GAME_DATA.antiques);
    keys.forEach((k, idx) => {
      const ant = window.GAME_DATA.antiques[k];
      if (ant.restored) {
        const relicMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.38, 0.32),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.2 })
        );
        relicMesh.position.set(-1.3 + idx * 0.52, 1.3, 0);
        this.antiqueDisplayGroup.add(relicMesh);
      }
    });
  }

  // ==========================================================================
  // СТРЕЛЬБА И АТАКА ИГРОКА (ЛКМ)
  // ==========================================================================
  fireWeapon(wpn) {
    this.recoilOffset = 0.14;
    if (wpn.type !== "melee") {
      this.muzzleLight.intensity = 3.5;
      setTimeout(() => {
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
      }, 65);
    }

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    // Spawn visible tracer line for ranged weapons
    if (wpn.type !== "melee") {
      const endPt = origin.clone().add(dir.clone().multiplyScalar(wpn.range));
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        origin.clone().add(new THREE.Vector3(0.15, -0.15, 0)),
        endPt
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: wpn.id === "wpn_plasma" ? 0x22d3ee : 0xfacc15
      });
      const tracer = new THREE.Line(lineGeo, lineMat);
      this.scene.add(tracer);
      setTimeout(() => this.scene.remove(tracer), 75);
    }

    if (this.zone !== "surface") return;

    // Check hit against all alive enemies on surface
    const ammoInfo = wpn.ammoType ? window.GAME_DATA.ammo[wpn.ammoType] : null;
    const bonusDmg = ammoInfo ? ammoInfo.bonusDmg : 0;
    const antBonus = window.GAME_DATA.antiques.ant_album.restored ? 1.15 : 1.0;
    const totalDmg = Math.round((wpn.damage + bonusDmg) * antBonus);

    let bestEnemy = null;
    let bestDist = wpn.range;

    this.enemies.forEach((en) => {
      if (en.dead) return;
      const enCenter = en.group.position.clone().add(new THREE.Vector3(0, 1.1 * (en.tpl.scale || 1), 0));
      const toEnemy = enCenter.clone().sub(origin);
      const dist = toEnemy.length();
      if (dist > bestDist) return;

      const proj = toEnemy.dot(dir);
      if (proj < 0) return;
      const perpSq = toEnemy.lengthSq() - proj * proj;
      const hitRadius = (en.tpl.scale || 1) * (wpn.id === "wpn_toz" ? 1.35 : 0.95);
      if (perpSq <= hitRadius * hitRadius) {
        bestDist = dist;
        bestEnemy = en;
      }
    });

    if (bestEnemy) {
      bestEnemy.hp = Math.max(0, bestEnemy.hp - totalDmg);
      const ratio = bestEnemy.hp / bestEnemy.maxHp;
      bestEnemy.hpFill.scale.x = Math.max(0.001, ratio);
      this.game.showHitMarker(totalDmg, bestEnemy.tpl.name);

      if (bestEnemy.hp <= 0) {
        this.killEnemy(bestEnemy);
      }
    }
  }

  killEnemy(en) {
    en.dead = true;
    en.group.rotation.x = -Math.PI / 2;
    en.group.position.y = 0.2;
    en.hpBg.visible = false;
    en.hpFill.visible = false;

    this.game.onEnemyKilled(en);

    // Spawn loot drop crate at enemy position
    const lootList = en.tpl.loot || ["mat_scrap"];
    const dropItem = lootList[Math.floor(Math.random() * lootList.length)];
    this.spawnLootCrate(
      this.surfaceGroup,
      "surface",
      en.group.position.x + 0.6,
      en.group.position.z + 0.6,
      `Трофеи: ${en.tpl.name}`,
      [dropItem, "ammo_9x18"],
      `drop_${Date.now()}_${Math.random()}`
    );
  }

  // ==========================================================================
  // ОСНОВНОЙ ЦИКЛ ОБНОВЛЕНИЯ 3D МИРА (Движение WASD, Двери, ИИ Мутантов, Лучи)
  // ==========================================================================
  update(dt, keys) {
    // 1. Animate Blast Doors
    this.doors.forEach((d) => {
      const target = d.open ? 1 : 0;
      d.progress += (target - d.progress) * Math.min(1, dt * 5);
      if (d.axis === "z") {
        d.group.position.x = d.closedX + d.progress * (d.w - 0.3);
      } else {
        d.group.position.z = d.closedZ + d.progress * (d.d - 0.3);
      }
    });

    // 2. WASD Player Movement
    const moveSpeed = (keys["ShiftLeft"] || keys["ShiftRight"]) ? 7.4 : 4.8;
    let forward = 0;
    let strafe = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) forward += 1;
    if (keys["KeyS"] || keys["ArrowDown"]) forward -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) strafe += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      const len = Math.hypot(forward, strafe);
      forward /= len;
      strafe /= len;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const dx = (-sinY * forward + cosY * strafe) * moveSpeed * dt;
      const dz = (-cosY * forward - sinY * strafe) * moveSpeed * dt;

      this.tryMovePlayer(dx, dz);
      this.walkBobTimer += dt * (moveSpeed * 1.8);
    } else {
      this.walkBobTimer = 0;
    }

    // Jump / Gravity
    if (keys["Space"] && this.onGround) {
      this.velY = 5.2;
      this.onGround = false;
    }
    this.velY -= 14.5 * dt;
    this.playerPos.y += this.velY * dt;
    if (this.playerPos.y <= 1.7) {
      this.playerPos.y = 1.7;
      this.velY = 0;
      this.onGround = true;
    }

    // Update Camera Transform
    const bobY = Math.sin(this.walkBobTimer) * 0.045;
    this.camera.position.set(this.playerPos.x, this.playerPos.y + bobY, this.playerPos.z);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);

    // Weapon viewmodel recoil & reload animation
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.85);
    if (this.game.isReloading) {
      this.reloadAnim = Math.min(1, this.reloadAnim + dt * 3.5);
    } else {
      this.reloadAnim = Math.max(0, this.reloadAnim - dt * 4.5);
    }
    this.weaponGroup.position.set(
      Math.cos(this.walkBobTimer * 0.5) * 0.015,
      Math.sin(this.walkBobTimer) * 0.018 - this.reloadAnim * 0.22,
      this.recoilOffset
    );
    this.weaponGroup.rotation.x = -this.reloadAnim * 0.65 + this.recoilOffset * 1.2;

    // 3. Zone-specific updates
    if (this.zone === "bunker") {
      // NPC idle animations & look toward player
      this.npcMeshes.forEach((n, idx) => {
        n.group.position.y = Math.sin(performance.now() * 0.002 + idx) * 0.03;
        const dx = this.playerPos.x - n.group.position.x;
        const dz = this.playerPos.z - n.group.position.z;
        if (Math.hypot(dx, dz) < 7) {
          n.group.rotation.y = Math.atan2(dx, dz);
        }
      });
    } else {
      // Surface snowfall animation
      if (this.snowParticles) {
        const pos = this.snowParticles.geometry.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) {
          pos[i] -= dt * 3.8;
          if (pos[i] < 0) pos[i] = 26;
        }
        this.snowParticles.geometry.attributes.position.needsUpdate = true;
      }

      // Update Surface Enemies AI & Combat
      this.updateEnemies(dt);
    }

    // 4. Raycast / Proximity check for center crosshair target
    this.updateCrosshairTarget();

    // Render 3D scene
    this.renderer.render(this.scene, this.camera);
  }

  tryMovePlayer(dx, dz) {
    const nextX = this.playerPos.x + dx;
    const nextZ = this.playerPos.z + dz;

    if (!this.isColliding(nextX, this.playerPos.z)) {
      this.playerPos.x = nextX;
    }
    if (!this.isColliding(this.playerPos.x, nextZ)) {
      this.playerPos.z = nextZ;
    }
  }

  isColliding(x, z) {
    if (this.zone === "bunker") {
      // Check closed blast doors
      for (const d of this.doors) {
        if (!d.open) {
          const halfW = d.w / 2 + 0.35;
          const halfD = d.d / 2 + 0.35;
          if (
            x > d.closedX - halfW &&
            x < d.closedX + halfW &&
            z > d.closedZ - halfD &&
            z < d.closedZ + halfD
          ) {
            return true;
          }
        }
      }
      for (const c of this.wallCollidersBunker) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
      return false;
    } else {
      // Surface world boundaries
      if (Math.abs(x) > 118 || Math.abs(z) > 118) return true;
      for (const c of this.wallCollidersSurface) {
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
      return false;
    }
  }

  updateEnemies(dt) {
    this.enemies.forEach((en) => {
      if (en.dead) return;
      // Billboard HP bar toward player camera
      en.hpBg.lookAt(this.camera.position);
      en.hpFill.lookAt(this.camera.position);

      const dx = this.playerPos.x - en.group.position.x;
      const dz = this.playerPos.z - en.group.position.z;
      const dist = Math.hypot(dx, dz);

      en.attackTimer = Math.max(0, en.attackTimer - dt);

      if (dist <= en.tpl.detectRange) {
        en.group.rotation.y = Math.atan2(dx, dz);

        if (dist > en.tpl.attackRange * 0.88) {
          const step = en.tpl.speed * dt;
          const nx = en.group.position.x + (dx / dist) * step;
          const nz = en.group.position.z + (dz / dist) * step;
          if (!this.isColliding(nx, nz)) {
            en.group.position.x = nx;
            en.group.position.z = nz;
          }
        }

        if (dist <= en.tpl.attackRange && en.attackTimer <= 0) {
          en.attackTimer = en.tpl.attackCooldown;
          if (window.SFX) window.SFX.playMutantGrowl();
          this.game.onPlayerHitByEnemy(en);
        }
      }
    });
  }

  updateCrosshairTarget() {
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    this.hoveredTarget = null;

    // 1. Check nearby interactables (within 4.2m and in front of camera)
    let bestInteract = null;
    let bestDist = 4.2;

    for (const item of this.interactables) {
      if (item.meta.zone !== this.zone) continue;
      if (item.meta.type === "loot_crate" && item.meta.looted) continue;
      if (item.meta.type === "antique_pickup" && window.GAME_DATA.antiques[item.meta.antiqueId].found) continue;

      const worldPos = item.meta.worldPos || item.group.position;
      const targetPt = new THREE.Vector3(worldPos.x, 1.3, worldPos.z);
      const toObj = targetPt.sub(origin);
      const dist = toObj.length();
      if (dist <= bestDist) {
        const dot = toObj.normalize().dot(dir);
        if (dot > 0.68) {
          bestDist = dist;
          bestInteract = item.meta;
        }
      }
    }

    if (bestInteract) {
      this.hoveredTarget = { kind: "interact", meta: bestInteract };
      this.game.updateTargetHUD(this.hoveredTarget);
      return;
    }

    // 2. If on surface, check aimed-at Enemy/Mutant to show HP & Damage info!
    if (this.zone === "surface") {
      let bestEn = null;
      let minEnDist = 65;
      for (const en of this.enemies) {
        if (en.dead) continue;
        const center = en.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        const toEn = center.sub(origin);
        const dist = toEn.length();
        if (dist < minEnDist) {
          const dot = toEn.normalize().dot(dir);
          if (dot > 0.94) {
            minEnDist = dist;
            bestEn = en;
          }
        }
      }
      if (bestEn) {
        this.hoveredTarget = { kind: "enemy", enemy: bestEn };
      }
    }

    this.game.updateTargetHUD(this.hoveredTarget);
  }
}

window.World3D = World3D;
