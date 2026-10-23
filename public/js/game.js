// ============================================================================
// БУНКЕР «ЗАСЛОН-19»: ПЕПЕЛ УРАЛА — ЯДРО ИГРЫ (Выживание, Инвентарь, Крафт,
// Ремонт, Старина, Холод/Жар, Противогазы, Мини-карта с Туманом Войны, Сюжет)
// ============================================================================

class BunkerGame {
  constructor() {
    this.started = false;
    this.paused = true;
    this.activeModalTab = null;

    // Главный герой: Артём Волков, мужчина, 28 лет
    this.stats = {
      hp: 100,
      maxHp: 100,
      hunger: 88,      // Еда / Сытость %
      thirst: 86,      // Вода / Жажда %
      bodyTemp: 36.6,  // Температура тела °C (Ниже 35.0 = ХОЛОД/Гипотермия, Выше 38.2 = ЖАР/Перегрев)
      envTemp: 21.0,   // Температура среды °C
      radiation: 4,    // Доза радиации (0..100 мЗв)
      stamina: 100,
      morale: 82
    };

    // Противогаз
    this.gasMaskOn = false;
    this.equippedMask = "mask_gp5";
    this.filterCharge = 100; // 0..100%

    // Экипировка
    this.equippedWeapon = "wpn_pm";
    this.equippedSuit = "suit_jacket";

    // Инвентарь (id -> count)
    this.inventory = {
      wpn_crowbar: 1,
      wpn_pm: 1,
      suit_jacket: 1,
      mask_gp5: 1,
      ammo_9x18: 32,
      ammo_12g: 8,
      food_tushonka: 2,
      water_clean: 2,
      med_bandage: 2,
      med_ai4: 1,
      filter_fgp: 2,
      repair_kit: 1,
      mat_scrap: 4,
      mat_charcoal: 2,
      mat_elec: 2,
      mat_cloth: 2,
      mat_powder: 2,
      mat_fuel: 1
    };

    // Текущие заряженные магазины и прочность снаряжения
    this.weaponMags = {
      wpn_crowbar: 0,
      wpn_pm: 8,
      wpn_toz: 6,
      wpn_ak74m: 30,
      wpn_vss: 10,
      wpn_plasma: 5
    };

    this.durability = {
      wpn_crowbar: 150,
      wpn_pm: 100,
      wpn_toz: 120,
      wpn_ak74m: 160,
      wpn_vss: 130,
      wpn_plasma: 140,
      suit_jacket: 80,
      suit_bushlat: 110,
      suit_ozk: 95,
      suit_ratnik: 160,
      suit_exo: 240,
      mask_gp5: 80,
      mask_pmk3: 140,
      mask_ip4m: 180
    };

    // Боевые таймеры
    this.fireCooldown = 0;
    this.isReloading = false;
    this.reloadTimer = 0;

    // Климат бункера: возможна авария котла ("cold" или "heat")
    this.bunkerThermalMode = "normal"; // "normal", "cold_leak", "heat_surge"
    this.bunkerEventTimer = 45;

    // Туман войны (Мини-карта поверхности 44x44 ячеек)
    this.fogSize = 44;
    this.fogGrid = new Uint8Array(this.fogSize * this.fogSize); // 0 = скрыто, 1 = изучено
    this.exploredPercent = 0;

    // Сюжет и прогресс
    this.currentChapter = 1;
    this.completedObjectives = new Set();
    this.enemiesKilled = 0;
    this.bossKilled = false;
    this.hintIndex = 0;
    this.hintTimer = 0;
    this.annaRationTimer = 0;

    // Ввод клавиатуры и мыши
    this.keys = {};
    this.pointerLocked = false;

    this.initWindowControls();
    this.initInput();
    this.world = new World3D(this);
    this.cutscene = new IntroCutscene(() => this.onCutsceneFinished());

    this.updateHUD();
    this.startMainLoop();
  }

  // ==========================================================================
  // КАСТОМНАЯ РАМКА ОКНА WINDOWS (Свернуть, Развернуть, Закрыть, Перетаскивание)
  // ==========================================================================
  initWindowControls() {
    if (window.location.search.includes("native_exe=1")) {
      document.body.classList.add("in-native-exe");
    }
    const sendWinCmd = (act) => {
      fetch(`/__win_cmd?act=${act}`, { method: "POST" }).catch(() => {});
    };

    const btnMin = document.getElementById("win-btn-min");
    const btnMax = document.getElementById("win-btn-max");
    const btnClose = document.getElementById("win-btn-close");
    const dragBar = document.getElementById("window-drag-region");

    if (btnMin) {
      btnMin.addEventListener("click", () => {
        if (window.SFX) window.SFX.playClick();
        sendWinCmd("min");
        this.notify("Окно терминала «Заслон-19»: команда СВЕРНУТЬ", "info");
      });
    }

    if (btnMax) {
      btnMax.addEventListener("click", () => {
        if (window.SFX) window.SFX.playClick();
        sendWinCmd("max");
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        if (window.SFX) window.SFX.playClick();
        this.saveGame(true);
        sendWinCmd("close");
        this.openMainMenu();
      });
    }

    if (dragBar) {
      dragBar.addEventListener("mousedown", (e) => {
        if (e.target.closest(".win-ctrl-btn") || e.target.closest(".titlebar-quick-btn")) return;
        sendWinCmd("drag");
      });
    }
  }

  // ==========================================================================
  // ВВОД (WASD, R — перезарядка, E — взаимодействие, G — противогаз, I, C, M, J)
  // ==========================================================================
  initInput() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;

      if (!this.started) return;

      if (e.code === "KeyR") {
        this.reloadWeapon();
      } else if (e.code === "KeyE") {
        this.interactWithHovered();
      } else if (e.code === "KeyG") {
        this.toggleGasMask();
      } else if (e.code === "KeyF") {
        this.replaceGasMaskFilter();
      } else if (e.code === "KeyI" || e.code === "Tab") {
        e.preventDefault();
        this.toggleModal("inventory");
      } else if (e.code === "KeyC") {
        this.toggleModal("craft");
      } else if (e.code === "KeyN") {
        this.toggleModal("npcs");
      } else if (e.code === "KeyM") {
        this.toggleModal("map");
      } else if (e.code === "KeyJ" || e.code === "KeyH") {
        this.toggleModal("codex");
      } else if (e.code === "Digit1") {
        this.cycleWeaponSlot(0);
      } else if (e.code === "Digit2") {
        this.cycleWeaponSlot(1);
      } else if (e.code === "Digit3") {
        this.quickUseItem(["med_ai4", "med_bandage"]);
      } else if (e.code === "Digit4") {
        this.quickUseItem(["food_soup", "food_irp", "food_tushonka", "food_suhari"]);
      } else if (e.code === "Digit5") {
        this.quickUseItem(["water_tea", "water_clean", "med_cooling", "med_antirad"]);
      } else if (e.code === "Escape") {
        if (this.activeModalTab) {
          this.closeModal();
        } else {
          this.openMainMenu();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    const viewport = document.getElementById("viewport-3d");
    viewport.addEventListener("mousedown", (e) => {
      if (!this.started || this.paused) return;
      if (window.SFX) window.SFX.init();

      if (!this.pointerLocked) {
        viewport.requestPointerLock?.();
      }

      if (e.button === 0) {
        this.tryShoot();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === viewport;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.started || this.paused) return;
      if (this.pointerLocked || e.buttons === 1 || e.buttons === 2) {
        const sens = 0.0023;
        this.world.yaw -= e.movementX * sens;
        this.world.pitch = Math.max(
          -1.35,
          Math.min(1.35, this.world.pitch - e.movementY * sens)
        );
      }
    });
  }

  // ==========================================================================
  // МЕНЮ И ЗАПУСК НАЧАЛЬНОЙ КАТ-СЦЕНЫ
  // ==========================================================================
  startNewGameWithCutscene() {
    if (window.SFX) window.SFX.playClick();
    document.getElementById("main-menu").classList.add("hidden");
    this.cutscene.start();
  }

  startQuickGameSkipCutscene() {
    if (window.SFX) window.SFX.playClick();
    document.getElementById("main-menu").classList.add("hidden");
    this.onCutsceneFinished();
  }

  onCutsceneFinished() {
    this.started = true;
    this.paused = false;
    document.getElementById("hud-layer").classList.remove("hidden");
    this.notify(
      "Артём Волков (28 лет): Вы очнулись в тамбур-шлюзе бункера «Заслон-19». Нажмите [E] у гермодвери, чтобы войти в комплекс!",
      "warn"
    );
    this.updateHUD();
  }

  openMainMenu() {
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    document.getElementById("main-menu").classList.remove("hidden");
  }

  // ==========================================================================
  // СТРЕЛЬБА (ЛКМ) И ПЕРЕЗАРЯДКА (R)
  // ==========================================================================
  tryShoot() {
    if (this.isReloading || this.fireCooldown > 0) return;
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    if (!wpn) return;

    if ((this.durability[wpn.id] || 0) <= 0) {
      this.notify(`Оружие «${wpn.name}» сломано! Почините его в меню [C]`, "danger");
      return;
    }

    if (wpn.type === "ranged") {
      const curMag = this.weaponMags[wpn.id] || 0;
      if (curMag <= 0) {
        this.notify(`Магазин пуст! Нажмите [R] для перезарядки (${wpn.name})`, "warn");
        if (window.SFX) window.SFX.playClick();
        return;
      }
      this.weaponMags[wpn.id] = curMag - 1;
    }

    // Расход прочности оружия (Замедляется, если отреставрированы часы «Восток»)
    const wearMult = window.GAME_DATA.antiques.ant_vostok.restored ? 0.65 : 1.0;
    this.durability[wpn.id] = Math.max(0, (this.durability[wpn.id] || wpn.maxDurability) - 0.8 * wearMult);

    this.fireCooldown = wpn.fireRate;
    if (window.SFX) window.SFX.playGunshot(wpn.id);
    this.world.fireWeapon(wpn);
    this.updateHUD();
  }

  reloadWeapon() {
    if (this.isReloading) return;
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    if (!wpn || wpn.type === "melee") return;

    const curMag = this.weaponMags[wpn.id] || 0;
    if (curMag >= wpn.magSize) {
      this.notify("Магазин уже полон!", "info");
      return;
    }

    const ammoId = wpn.ammoType;
    const reserve = this.inventory[ammoId] || 0;
    if (reserve <= 0) {
      const ammoName = window.GAME_DATA.ammo[ammoId]?.name || "патронов";
      this.notify(`Нет боеприпасов: ${ammoName}! Скрафтите их на верстаке [C]`, "danger");
      return;
    }

    this.isReloading = true;
    const speedBonus = window.GAME_DATA.antiques.ant_vostok.restored ? 0.85 : 1.0;
    this.reloadTimer = wpn.reloadTime * speedBonus;
    if (window.SFX) window.SFX.playReload();
    this.notify(`Перезарядка: ${wpn.name}...`, "info");
    this.updateHUD();
  }

  finishReload() {
    this.isReloading = false;
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    if (!wpn || !wpn.ammoType) return;

    const curMag = this.weaponMags[wpn.id] || 0;
    const needed = wpn.magSize - curMag;
    const avail = this.inventory[wpn.ammoType] || 0;
    const toLoad = Math.min(needed, avail);

    this.weaponMags[wpn.id] = curMag + toLoad;
    this.inventory[wpn.ammoType] = avail - toLoad;
    if (this.inventory[wpn.ammoType] <= 0) delete this.inventory[wpn.ammoType];

    this.notify(`Заряжено: ${wpn.name} (${this.weaponMags[wpn.id]}/${wpn.magSize})`, "good");
    this.updateHUD();
  }

  cycleWeaponSlot(slotIdx) {
    const ownedWeapons = Object.keys(window.GAME_DATA.weapons).filter(
      (id) => (this.inventory[id] || 0) > 0
    );
    if (ownedWeapons.length === 0) return;
    if (slotIdx === 0) {
      this.equipItem("wpn_crowbar");
    } else {
      const ranged = ownedWeapons.filter((id) => id !== "wpn_crowbar");
      if (ranged.length === 0) return;
      const curIdx = ranged.indexOf(this.equippedWeapon);
      const nextId = ranged[(curIdx + 1) % ranged.length];
      this.equipItem(nextId);
    }
  }

  // ==========================================================================
  // ПРОТИВОГАЗ [G] И СМЕННЫЕ ФИЛЬТРЫ [F]
  // ==========================================================================
  toggleGasMask() {
    this.gasMaskOn = !this.gasMaskOn;
    if (window.SFX) window.SFX.playClick();
    const maskOverlay = document.getElementById("gasmask-overlay");
    if (maskOverlay) {
      maskOverlay.classList.toggle("hidden", !this.gasMaskOn);
    }
    const maskName = window.GAME_DATA.masks[this.equippedMask]?.name || "Противогаз";
    this.notify(
      this.gasMaskOn
        ? `Надет ${maskName} (Заряд фильтра: ${Math.round(this.filterCharge)}%)`
        : `${maskName} снят`,
      this.gasMaskOn ? "good" : "warn"
    );
    this.updateHUD();
  }

  replaceGasMaskFilter() {
    if ((this.inventory.filter_fgp || 0) <= 0) {
      this.notify("Нет запасных фильтров ФГП-130! Соберите фильтр в меню Крафта [C]", "danger");
      return;
    }
    if (this.filterCharge >= 99) {
      this.notify("Текущий фильтр противогаза ещё полностью исправен (100%)", "info");
      return;
    }
    this.removeItem("filter_fgp", 1);
    this.filterCharge = 100;
    if (window.SFX) window.SFX.playPickup();
    this.notify("Установлен новый угольный фильтр ФГП-130 (Заряд: 100%)", "good");
    this.updateHUD();
  }

  // ==========================================================================
  // ВЗАИМОДЕЙСТВИЕ ПО КЛАВИШЕ [E] (Двери, Лут, НПС, Шлюз, Верстак, Старина)
  // ==========================================================================
  interactWithHovered() {
    const target = this.world.hoveredTarget;
    if (!target || target.kind !== "interact") return;
    const meta = target.meta;

    if (meta.type === "door") {
      meta.doorObj.open = !meta.doorObj.open;
      if (window.SFX) window.SFX.playDoorHydraulics();
      this.notify(
        `${meta.doorObj.label}: ${meta.doorObj.open ? "ОТКРЫТА" : "ЗАКРЫТА"}`,
        "info"
      );
      return;
    }

    if (meta.type === "loot_crate") {
      if (meta.looted) return;
      meta.looted = true;
      meta.meshGroup.scale.set(0.95, 0.45, 0.95);
      if (window.SFX) window.SFX.playPickup();

      const names = [];
      meta.items.forEach((itemId) => {
        this.addItem(itemId, 1);
        const info = this.getItemInfo(itemId);
        if (info) names.push(info.name);
      });
      this.notify(`Подобрано из «${meta.name}»: ${names.join(", ")}`, "good");
      this.checkQuestProgress();
      this.updateHUD();
      return;
    }

    if (meta.type === "antique_pickup") {
      const ant = window.GAME_DATA.antiques[meta.antiqueId];
      if (!ant || ant.found) return;
      ant.found = true;
      meta.meshGroup.visible = false;
      if (window.SFX) window.SFX.playPickup();
      this.notify(
        `Найдена реликвия старины: «${ant.name}»! Отреставрируйте её на верстаке [C] → Старина!`,
        "good"
      );
      this.updateHUD();
      return;
    }

    if (meta.type === "npc") {
      this.openNPCDialogue(meta.npcData);
      return;
    }

    if (meta.type === "workbench") {
      this.toggleModal("craft");
      return;
    }

    if (meta.type === "bunker_systems") {
      this.toggleModal("npcs");
      return;
    }

    if (meta.type === "command_terminal") {
      this.toggleModal("map");
      return;
    }

    if (meta.type === "antiques_shelf") {
      this.toggleModal("craft");
      return;
    }

    if (meta.type === "rest_bed") {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 35);
      this.stats.bodyTemp = 36.6;
      this.stats.stamina = 100;
      if (window.SFX) window.SFX.playPickup();
      this.notify("Вы отдохнули в медблоке: Здоровье восстановлено, температура тела 36.6°C", "good");
      this.updateHUD();
      return;
    }

    if (meta.type === "exit_to_surface") {
      if (!this.gasMaskOn) {
        this.notify(
          "ВНИМАНИЕ! Вы вышли на поверхность без противогаза! Срочно нажмите [G], чтобы надеть противогаз!",
          "danger"
        );
      } else {
        this.notify("Выход на поверхность: Сектор Урал (-28°C, Ядерная зима). Берегите тепло и фильтр!", "warn");
      }
      if (window.SFX) window.SFX.playDoorHydraulics();
      this.world.setZone("surface");
      this.completedObjectives.add("go_surface");
      this.checkQuestProgress();
      this.updateHUD();
      return;
    }

    if (meta.type === "enter_bunker") {
      if (window.SFX) window.SFX.playDoorHydraulics();
      this.world.setZone("bunker");
      this.notify("Вы вернулись в бункер «Заслон-19». Проведена дезактивация шлюза.", "good");
      this.updateHUD();
      return;
    }

    if (meta.type === "radio_tower_terminal") {
      if (!this.bossKilled) {
        this.notify("Терминал заблокирован био-угрозой! Сначала уничтожьте босса «Химера-19» рядом с вышкой!", "danger");
        return;
      }
      if (!this.inventory.quest_cipher_key && !this.completedObjectives.has("find_cipher")) {
        this.notify("Требуется Перфокарта кодов доступа с Военного блокпоста (Северо-Восток)!", "warn");
        return;
      }
      this.completedObjectives.add("activate_tower");
      this.checkQuestProgress();
      this.showVictoryScreen();
    }
  }

  // ==========================================================================
  // ДИАЛОГИ С НПС И СЮЖЕТНЫЕ КВЕСТЫ
  // ==========================================================================
  openNPCDialogue(npc) {
    if (window.SFX) window.SFX.playClick();
    if (npc.id === "npc_gromov") {
      this.completedObjectives.add("talk_gromov");
    } else if (npc.id === "npc_ilya") {
      this.completedObjectives.add("talk_ilya");
    } else if (npc.id === "npc_elena") {
      // Бесплатная медпомощь у доктора Елены Морозовой
      this.stats.hp = this.stats.maxHp;
      this.stats.radiation = Math.max(0, this.stats.radiation - 50);
      this.stats.bodyTemp = 36.6;
      if (this.inventory.quest_medkit_box) {
        delete this.inventory.quest_medkit_box;
        this.completedObjectives.add("find_medbox");
        this.addItem("med_ai4", 3);
        this.notify("Доктор Елена получила «Регенератор-М»! Выдано 3 аптечки АИ-4!", "good");
      } else {
        this.notify("Доктор Елена Морозова обработала ваши раны и вывела радиацию!", "good");
      }
    } else if (npc.id === "npc_darya") {
      if (this.inventory.quest_radio_unit) {
        delete this.inventory.quest_radio_unit;
        this.completedObjectives.add("find_radio");
        this.addItem("ammo_545", 60);
        this.notify("Дарья установила блок «Ангара-КВ»! Радиосвязь с бункерами Урала восстановлена!", "good");
      }
    } else if (npc.id === "npc_anna") {
      if (this.annaRationTimer <= 0) {
        this.annaRationTimer = 45;
        this.addItem("food_soup", 1);
        this.addItem("water_clean", 1);
        this.notify("Анна Петровна выдала вам горячую похлёбку и флягу чистой воды из гидропоники!", "good");
      }
    }

    this.checkQuestProgress();
    this.selectedNPC = npc;
    this.toggleModal("npcs");
  }

  // ==========================================================================
  // ВЫЖИВАНИЕ: ЕДА, ВОДА, ХОЛОД, ЖАР, РАДИАЦИЯ, ТУМАН ВОЙНЫ
  // ==========================================================================
  updateSurvival(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.annaRationTimer = Math.max(0, this.annaRationTimer - dt);

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.finishReload();
      }
    }

    const suit = window.GAME_DATA.suits[this.equippedSuit] || window.GAME_DATA.suits.suit_jacket;
    const mask = window.GAME_DATA.masks[this.equippedMask] || window.GAME_DATA.masks.mask_gp5;

    // 1. Расход сытости и жажды
    const isSurface = this.world.zone === "surface";
    this.stats.hunger = Math.max(0, this.stats.hunger - dt * (isSurface ? 0.34 : 0.16));
    this.stats.thirst = Math.max(0, this.stats.thirst - dt * (isSurface ? 0.42 : 0.20));

    // 2. Системы бункера и температурный режим (ХОЛОД / ЖАР)
    const genSys = window.GAME_DATA.bunkerSystems[0];
    const heatSys = window.GAME_DATA.bunkerSystems[1];
    const ventSys = window.GAME_DATA.bunkerSystems[2];

    genSys.hp = Math.max(0, genSys.hp - dt * 0.11);
    heatSys.hp = Math.max(0, heatSys.hp - dt * 0.14);
    ventSys.hp = Math.max(0, ventSys.hp - dt * 0.10);

    // Определение внешней температуры (envTemp) и влияния на температуру тела (bodyTemp)
    if (!isSurface) {
      // Внутри бункера: если котёл КВ-19 неисправен (<40%), случается либо авария перегрева (ЖАР +43°C), либо отказ отопления (ХОЛОД +3°C)
      if (genSys.hp < 25) {
        this.stats.envTemp = 2.0; // Генератор встал — ледяной холод
      } else if (heatSys.hp < 42) {
        this.bunkerEventTimer -= dt;
        if (this.bunkerEventTimer <= 0) {
          this.bunkerEventTimer = 35;
          this.bunkerThermalMode = this.bunkerThermalMode === "heat_surge" ? "cold_leak" : "heat_surge";
          this.notify(
            this.bunkerThermalMode === "heat_surge"
              ? "🔥 АВАРИЯ КОТЛА КВ-19: Прорыв горячего пара в отсеках! Температура +43°C (ЖАР)!"
              : "❄️ СБОЙ ОТОПЛЕНИЯ КВ-19: Падение давления! Температура в бункере упала до +4°C (ХОЛОД)!",
            "warn"
          );
        }
        this.stats.envTemp = this.bunkerThermalMode === "heat_surge" ? 43.0 : 4.0;
      } else {
        this.bunkerThermalMode = "normal";
        this.stats.envTemp = 21.0;
      }
    } else {
      // На поверхности: базовая температура ядерной зимы -28°C
      let localTemp = -28.0;
      // Проверка близости к бочкам с огнём или термальному разлому «Жар-Котёл»
      for (const hs of this.world.heatSources) {
        const d = Math.hypot(this.world.playerPos.x - hs.x, this.world.playerPos.z - hs.z);
        if (d < hs.radius) {
          if (hs.isAnomaly) {
            localTemp = 62.0; // Экстремальный ЖАР у термального разлома!
          } else {
            localTemp = 24.0; // Тёплый костёр согревает!
          }
        }
      }
      this.stats.envTemp = localTemp;
    }

    // Расчёт динамики температуры тела (36.6°C норма)
    if (this.stats.envTemp < 10) {
      // ХОЛОД: костюм защищает на coldProtect %
      const coldMitigation = Math.min(0.92, (suit.coldProtect || 15) / 100);
      const freezeRate = (1 - coldMitigation) * 0.22;
      this.stats.bodyTemp = Math.max(32.0, this.stats.bodyTemp - freezeRate * dt);
    } else if (this.stats.envTemp > 32) {
      // ЖАР / ПЕРЕГРЕВ: костюм защищает на heatProtect %
      const heatMitigation = Math.min(0.92, (suit.heatProtect || 20) / 100);
      const heatRate = (1 - heatMitigation) * 0.26;
      this.stats.bodyTemp = Math.min(41.5, this.stats.bodyTemp + heatRate * dt);
      this.stats.thirst = Math.max(0, this.stats.thirst - dt * 0.35); // В жару сильнее мучает жажда
    } else {
      // Комфортная температура — возврат к 36.6°C
      this.stats.bodyTemp += (36.6 - this.stats.bodyTemp) * Math.min(1, dt * 0.6);
    }

    // 3. Радиация и фильтр противогаза
    let radExposure = 0;
    if (isSurface) {
      radExposure = 2.6;
      for (const rz of this.world.radZones) {
        const d = Math.hypot(this.world.playerPos.x - rz.x, this.world.playerPos.z - rz.z);
        if (d < rz.r) radExposure += 6.5;
      }
    } else if (ventSys.hp < 35) {
      radExposure = 0.8; // Утечка радиации при сломанной ФВУ
    }

    if (this.gasMaskOn && this.filterCharge > 0) {
      if (isSurface || radExposure > 0) {
        this.filterCharge = Math.max(0, this.filterCharge - dt * 0.9 * (mask.filterDrainRate || 1));
      }
      radExposure *= 1 - (mask.radFilter || 65) / 100;
    }

    const antRadBonus = window.GAME_DATA.antiques.ant_dp5v.restored ? 15 : 0;
    const totalSuitRad = Math.min(96, (suit.radResist || 10) + antRadBonus);
    radExposure *= 1 - totalSuitRad / 100;

    if (radExposure > 0.05) {
      this.stats.radiation = Math.min(100, this.stats.radiation + radExposure * dt);
      if (Math.random() < Math.min(0.6, radExposure * 0.15)) {
        if (window.SFX) window.SFX.playGeigerTick();
      }
    }

    // 4. Влияние голода, жажды, холода, жара и радиации на Здоровье (HP)
    let hpDrain = 0;
    if (this.stats.hunger <= 0) hpDrain += 1.2;
    if (this.stats.thirst <= 0) hpDrain += 1.5;
    if (this.stats.bodyTemp < 35.0) hpDrain += (35.0 - this.stats.bodyTemp) * 1.4; // Урон от ХОЛОДА
    if (this.stats.bodyTemp > 38.4) hpDrain += (this.stats.bodyTemp - 38.4) * 1.6; // Урон от ЖАРА
    if (this.stats.radiation > 65) hpDrain += (this.stats.radiation - 65) * 0.05;

    if (hpDrain > 0) {
      this.stats.hp = Math.max(0, this.stats.hp - hpDrain * dt);
      if (this.stats.hp <= 0) {
        this.onPlayerCollapsed();
      }
    } else if (!isSurface && window.GAME_DATA.antiques.ant_patefon.restored) {
      // Бонус от отреставрированного патефона «Молот» с пластинкой «Кино»
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + dt * 0.4);
    }

    // 5. Открытие «Тумана войны» на мини-карте при исследовании поверхности
    if (isSurface) {
      this.revealFogAroundPlayer();
    }

    // 6. Ротация полезных подсказок
    this.hintTimer += dt;
    if (this.hintTimer > 14) {
      this.hintTimer = 0;
      this.hintIndex = (this.hintIndex + 1) % window.GAME_DATA.hints.length;
      const hintEl = document.getElementById("hud-hint-banner");
      if (hintEl) hintEl.textContent = window.GAME_DATA.hints[this.hintIndex];
    }
  }

  onPlayerHitByEnemy(en) {
    const suit = window.GAME_DATA.suits[this.equippedSuit] || window.GAME_DATA.suits.suit_jacket;
    const armorPct = (this.durability[suit.id] || 0) > 0 ? suit.armor : 0;
    const finalDmg = Math.max(3, Math.round(en.damage * (1 - armorPct / 100)));

    this.stats.hp = Math.max(0, this.stats.hp - finalDmg);
    this.durability[suit.id] = Math.max(0, (this.durability[suit.id] || suit.maxDurability) - 2.5);

    if (en.id === "mutant_ghoul" || en.id === "mutant_spitter") {
      this.stats.radiation = Math.min(100, this.stats.radiation + 3.5);
    }

    this.notify(`${en.tpl.name} атаковал вас! (-${finalDmg} ХП, броня поглотила ${armorPct}%)`, "danger");
    if (this.stats.hp <= 0) {
      this.onPlayerCollapsed();
    }
    this.updateHUD();
  }

  onEnemyKilled(en) {
    this.enemiesKilled++;
    if (en.id === "boss_chimera") {
      this.bossKilled = true;
      this.completedObjectives.add("kill_boss");
      this.notify("🏆 БОСС «ХИМЕРА-19» ПОВЕРЖЕН! Теперь активируйте терминал Телевышки [E]!", "good");
    } else {
      this.notify(`Ликвидирован враг: ${en.tpl.name}! Обыщите трофейный ящик [E]`, "good");
    }
    if (this.enemiesKilled >= 5) {
      this.completedObjectives.add("kill_mutants_5");
    }
    this.checkQuestProgress();
    this.updateHUD();
  }

  onPlayerCollapsed() {
    this.world.setZone("bunker");
    this.stats.hp = 65;
    this.stats.bodyTemp = 36.6;
    this.stats.hunger = Math.max(40, this.stats.hunger);
    this.stats.thirst = Math.max(40, this.stats.thirst);
    this.stats.radiation = Math.max(10, this.stats.radiation - 30);
    this.notify(
      "Патруль бункера эвакуировал вас в медблок к доктору Елене Морозовой! Снаряжение сохранено.",
      "warn"
    );
    this.updateHUD();
  }

  // ==========================================================================
  // МИНИ-КАРТА И КАРТА СЕКТОРА С «ТУМАНОМ ВОЙНЫ» (Которую надо изучать!)
  // ==========================================================================
  revealFogAroundPlayer() {
    const px = this.world.playerPos.x;
    const pz = this.world.playerPos.z;
    const normX = (px + 110) / 220;
    const normZ = (pz + 110) / 220;
    const gx = Math.floor(normX * this.fogSize);
    const gz = Math.floor(normZ * this.fogSize);

    // Радиус разведки (увеличивается при реставрации радиоприёмника «ВЭФ-202»)
    const radCells = window.GAME_DATA.antiques.ant_vef.restored ? 5 : 3;

    let newlyRevealed = false;
    for (let dz = -radCells; dz <= radCells; dz++) {
      for (let dx = -radCells; dx <= radCells; dx++) {
        if (dx * dx + dz * dz > radCells * radCells) continue;
        const cx = gx + dx;
        const cz = gz + dz;
        if (cx >= 0 && cx < this.fogSize && cz >= 0 && cz < this.fogSize) {
          const idx = cz * this.fogSize + cx;
          if (this.fogGrid[idx] === 0) {
            this.fogGrid[idx] = 1;
            newlyRevealed = true;
          }
        }
      }
    }

    if (newlyRevealed) {
      let count = 0;
      for (let i = 0; i < this.fogGrid.length; i++) count += this.fogGrid[i];
      this.exploredPercent = Math.min(100, Math.round((count / (this.fogSize * this.fogSize * 0.55)) * 100));
      if (this.exploredPercent >= 25) {
        this.completedObjectives.add("explore_map");
        this.checkQuestProgress();
      }
    }
  }

  drawMapCanvas(canvas, isFullMap = false) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#080d0a";
    ctx.fillRect(0, 0, w, h);

    if (this.world.zone === "bunker" && !isFullMap) {
      // Схема отсеков бункера на мини-карте
      ctx.strokeStyle = "rgba(74, 222, 128, 0.35)";
      ctx.lineWidth = 1.5;
      const scale = w / 46;
      const toMap = (x, z) => [w / 2 + x * scale, h / 2 + (z + 2) * scale];

      const rooms = [
        { x: -5, z: 4, rw: 10, rd: 10, label: "ШЛЮЗ" },
        { x: -6, z: -8, rw: 12, rd: 12, label: "КОРИДОР" },
        { x: -6, z: -18, rw: 12, rd: 10, label: "ШТАБ" },
        { x: -20, z: -8, rw: 13, rd: 12, label: "МЕДБЛОК" },
        { x: 7, z: -8, rw: 13, rd: 12, label: "ГЕНЕРАТОР" },
        { x: -20, z: -18, rw: 13, rd: 10, label: "СКЛАД" }
      ];
      rooms.forEach((r) => {
        const [rx, rz] = toMap(r.x, r.z);
        ctx.fillStyle = "rgba(20, 40, 26, 0.75)";
        ctx.fillRect(rx, rz, r.rw * scale, r.rd * scale);
        ctx.strokeRect(rx, rz, r.rw * scale, r.rd * scale);
        ctx.fillStyle = "#86efac";
        ctx.font = "9px monospace";
        ctx.fillText(r.label, rx + 4, rz + 12);
      });

      // Иконки НПС
      window.GAME_DATA.npcs.forEach((n) => {
        const [nx, nz] = toMap(n.pos.x, n.pos.z);
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(nx, nz, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Игрок
      const [px, pz] = toMap(this.world.playerPos.x, this.world.playerPos.z);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(px, pz, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Карта Поверхности с ТУМАНОМ ВОЙНЫ
    const worldToMap = (wx, wz) => [
      ((wx + 110) / 220) * w,
      ((wz + 110) / 220) * h
    ];

    // Сетка координат
    ctx.strokeStyle = "rgba(74, 222, 128, 0.14)";
    for (let i = 0; i < w; i += w / 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }

    // Ключевые объекты на карте
    const pois = [
      { x: 0, z: 0, color: "#4ade80", label: "БУНКЕР ЗАСЛОН-19" },
      { x: -58, z: -52, color: "#38bdf8", label: "СКЛАД РОСРЕЗЕРВА" },
      { x: 62, z: -18, color: "#f43f5e", label: "ПОЛИКЛИНИКА №4" },
      { x: 56, z: -64, color: "#f59e0b", label: "ВОЕННЫЙ БЛОКПОСТ" },
      { x: -54, z: 48, color: "#fb923c", label: "ЖИЛОЙ ДОМ / ЖАР-КОТЁЛ" },
      { x: 58, z: 56, color: "#a855f7", label: "ТЕЛЕВЫШКА (БОСС)" }
    ];

    pois.forEach((p) => {
      const [mx, mz] = worldToMap(p.x, p.z);
      ctx.fillStyle = p.color;
      ctx.fillRect(mx - 5, mz - 5, 10, 10);
      if (isFullMap) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 11px monospace";
        ctx.fillText(p.label, mx + 8, mz + 4);
      }
    });

    // Враги / Мутанты
    this.world.enemies.forEach((en) => {
      if (en.dead) return;
      const [ex, ez] = worldToMap(en.group.position.x, en.group.position.z);
      ctx.fillStyle = en.id === "boss_chimera" ? "#e11d48" : "#ef4444";
      ctx.beginPath();
      ctx.arc(ex, ez, en.id === "boss_chimera" ? 5.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Наложение ТУМАНА ВОЙНЫ (неизученные ячейки скрыты тёмной пеленой помех!)
    const cellW = w / this.fogSize;
    const cellH = h / this.fogSize;
    ctx.fillStyle = "rgba(7, 11, 9, 0.92)";
    for (let cz = 0; cz < this.fogSize; cz++) {
      for (let cx = 0; cx < this.fogSize; cx++) {
        // Центр бункера всегда виден
        const distCenter = Math.hypot(cx - this.fogSize / 2, cz - this.fogSize / 2);
        if (distCenter < 3.2) continue;
        if (this.fogGrid[cz * this.fogSize + cx] === 0) {
          ctx.fillRect(cx * cellW, cz * cellH, cellW + 0.8, cellH + 0.8);
        }
      }
    }

    // Маркер игрока и вектор взгляда
    const [px, pz] = worldToMap(
      this.world.zone === "surface" ? this.world.playerPos.x : 0,
      this.world.zone === "surface" ? this.world.playerPos.z : 0
    );
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(px, pz, isFullMap ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    const lookX = px - Math.sin(this.world.yaw) * (isFullMap ? 18 : 11);
    const lookZ = pz - Math.cos(this.world.yaw) * (isFullMap ? 18 : 11);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(lookX, lookZ);
    ctx.stroke();
  }

  // ==========================================================================
  // ИНВЕНТАРЬ, ПРЕДМЕТЫ, КРАФТ, РЕМОНТ И РЕСТАВРАЦИЯ «СТАРИНЫ»
  // ==========================================================================
  getItemInfo(id) {
    return (
      window.GAME_DATA.weapons[id] ||
      window.GAME_DATA.suits[id] ||
      window.GAME_DATA.masks[id] ||
      window.GAME_DATA.ammo[id] ||
      window.GAME_DATA.consumables[id] ||
      window.GAME_DATA.materials[id] ||
      null
    );
  }

  addItem(id, count = 1) {
    this.inventory[id] = (this.inventory[id] || 0) + count;
    if (id === "quest_cipher_key") {
      this.completedObjectives.add("find_cipher");
      this.checkQuestProgress();
    }
  }

  removeItem(id, count = 1) {
    if (!this.inventory[id]) return false;
    this.inventory[id] -= count;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    return true;
  }

  equipItem(id) {
    if (window.SFX) window.SFX.playClick();
    if (window.GAME_DATA.weapons[id]) {
      this.equippedWeapon = id;
      this.isReloading = false;
      this.world.buildWeaponViewModel(id);
      this.notify(`Экипировано оружие: ${window.GAME_DATA.weapons[id].name}`, "good");
    } else if (window.GAME_DATA.suits[id]) {
      this.equippedSuit = id;
      this.notify(`Надет костюм: ${window.GAME_DATA.suits[id].name}`, "good");
    } else if (window.GAME_DATA.masks[id]) {
      this.equippedMask = id;
      this.notify(`Выбран противогаз: ${window.GAME_DATA.masks[id].name}`, "good");
    }
    this.updateHUD();
    if (this.activeModalTab === "inventory") this.renderModalContent();
  }

  useConsumable(id) {
    if ((this.inventory[id] || 0) <= 0) return;
    const item = window.GAME_DATA.consumables[id];
    if (!item) return;

    if (item.category === "filter") {
      this.replaceGasMaskFilter();
      if (this.activeModalTab) this.renderModalContent();
      return;
    }

    if (item.category === "tool") {
      // Ремкомплект ЗИП чинит текущее оружие и костюм!
      this.repairEquipmentWithKit();
      return;
    }

    this.removeItem(id, 1);
    if (window.SFX) window.SFX.playPickup();

    // Бонус от отреставрированного Тульского самовара (+25% к эффективности еды и воды)
    const samovarMult = window.GAME_DATA.antiques.ant_samovar.restored ? 1.25 : 1.0;

    if (item.hunger) {
      this.stats.hunger = Math.min(100, Math.max(0, this.stats.hunger + item.hunger * samovarMult));
    }
    if (item.thirst) {
      this.stats.thirst = Math.min(100, Math.max(0, this.stats.thirst + item.thirst * samovarMult));
    }
    if (item.hp) {
      this.stats.hp = Math.min(this.stats.maxHp, Math.max(1, this.stats.hp + item.hp));
    }
    if (item.tempDelta) {
      this.stats.bodyTemp = Math.max(33.5, Math.min(40.5, this.stats.bodyTemp + item.tempDelta));
    }
    if (item.radDelta) {
      this.stats.radiation = Math.max(0, Math.min(100, this.stats.radiation + item.radDelta));
    }

    this.notify(`Использовано: ${item.name}`, "good");
    this.updateHUD();
    if (this.activeModalTab) this.renderModalContent();
  }

  quickUseItem(candidateIds) {
    for (const id of candidateIds) {
      if ((this.inventory[id] || 0) > 0) {
        this.useConsumable(id);
        return;
      }
    }
    this.notify("В инвентаре нет подходящего предмета для быстрого слота!", "warn");
  }

  repairEquipmentWithKit() {
    if ((this.inventory.repair_kit || 0) <= 0) {
      this.notify("Нет ремкомплекта ЗИП!", "danger");
      return;
    }
    this.removeItem("repair_kit", 1);
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    const suit = window.GAME_DATA.suits[this.equippedSuit];
    if (wpn) this.durability[wpn.id] = wpn.maxDurability;
    if (suit) this.durability[suit.id] = suit.maxDurability;
    if (window.SFX) window.SFX.playPickup();
    this.notify("Оружие и защитный костюм отремонтированы на 100%!", "good");
    this.updateHUD();
    if (this.activeModalTab) this.renderModalContent();
  }

  canAfford(costObj) {
    for (const [matId, reqCount] of Object.entries(costObj)) {
      if ((this.inventory[matId] || 0) < reqCount) return false;
    }
    return true;
  }

  payCost(costObj) {
    for (const [matId, reqCount] of Object.entries(costObj)) {
      this.removeItem(matId, reqCount);
    }
  }

  craftRecipe(recipeId) {
    const rec = window.GAME_DATA.recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    if (!this.canAfford(rec.cost)) {
      this.notify("Недостаточно материалов для крафта!", "danger");
      return;
    }
    this.payCost(rec.cost);
    this.addItem(rec.resultId, rec.resultCount);
    if (window.SFX) window.SFX.playPickup();
    this.notify(`Создано на верстаке: ${rec.name}`, "good");
    this.updateHUD();
    this.renderModalContent();
  }

  repairBunkerSystem(sysId) {
    const sys = window.GAME_DATA.bunkerSystems.find((s) => s.id === sysId);
    if (!sys) return;
    if (!this.canAfford(sys.repairCost)) {
      this.notify("Не хватает запчастей для ремонта узла бункера!", "danger");
      return;
    }
    this.payCost(sys.repairCost);
    sys.hp = sys.maxHp;
    if (sysId === "sys_heating") {
      this.bunkerThermalMode = "normal";
      this.stats.envTemp = 21.0;
    }
    this.completedObjectives.add("repair_bunker");
    if (window.SFX) window.SFX.playPickup();
    this.notify(`Узел «${sys.name}» отремонтирован до 100%!`, "good");
    this.checkQuestProgress();
    this.updateHUD();
    this.renderModalContent();
  }

  restoreAntique(antId) {
    const ant = window.GAME_DATA.antiques[antId];
    if (!ant || !ant.found || ant.restored) return;
    if (!this.canAfford(ant.repairCost)) {
      this.notify("Недостаточно деталей для реставрации предмета старины!", "danger");
      return;
    }
    this.payCost(ant.repairCost);
    ant.restored = true;
    if (antId === "ant_album") {
      this.stats.maxHp = 120;
      this.stats.hp = Math.min(120, this.stats.hp + 20);
    }
    this.completedObjectives.add("restore_antique");
    this.world.refreshAntiqueShelf3D();
    if (window.SFX) window.SFX.playPickup();
    this.notify(`Отреставрирована реликвия «${ant.name}»! Бонус: ${ant.buffDesc}`, "good");
    this.checkQuestProgress();
    this.updateHUD();
    this.renderModalContent();
  }

  // ==========================================================================
  // ПРОВЕРКА СЮЖЕТНЫХ ГЛАВ (ГЛАВЫ 1–5)
  // ==========================================================================
  checkQuestProgress() {
    while (this.currentChapter <= window.GAME_DATA.chapters.length) {
      const chap = window.GAME_DATA.chapters[this.currentChapter - 1];
      if (!chap) break;
      const allDone = chap.objectives.every((obj) => this.completedObjectives.has(obj.id));
      if (allDone && this.currentChapter < window.GAME_DATA.chapters.length) {
        this.currentChapter++;
        const nextChap = window.GAME_DATA.chapters[this.currentChapter - 1];
        this.notify(`⭐ НОВАЯ ГЛАВА СЮЖЕТА: ${nextChap.title}`, "good");
      } else {
        break;
      }
    }
  }

  showVictoryScreen() {
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    const vic = document.getElementById("victory-modal");
    if (vic) vic.classList.remove("hidden");
  }

  // ==========================================================================
  // МОДАЛЬНЫЕ ОКНА ТЕРМИНАЛА БУНКЕРА (Инвентарь, Крафт/Старина, НПС, Карта, Кодекс)
  // ==========================================================================
  toggleModal(tabName) {
    if (window.SFX) window.SFX.playClick();
    const modal = document.getElementById("terminal-modal");
    if (this.activeModalTab === tabName && !modal.classList.contains("hidden")) {
      this.closeModal();
      return;
    }
    this.activeModalTab = tabName;
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    modal.classList.remove("hidden");

    document.querySelectorAll(".term-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    this.renderModalContent();
  }

  closeModal() {
    this.activeModalTab = null;
    this.paused = false;
    document.getElementById("terminal-modal").classList.add("hidden");
    this.updateHUD();
  }

  renderModalContent() {
    const body = document.getElementById("terminal-body");
    if (!body) return;

    if (this.activeModalTab === "inventory") {
      body.innerHTML = this.renderInventoryTab();
    } else if (this.activeModalTab === "craft") {
      body.innerHTML = this.renderCraftAndAntiquesTab();
    } else if (this.activeModalTab === "npcs") {
      body.innerHTML = this.renderNPCsAndSystemsTab();
    } else if (this.activeModalTab === "map") {
      body.innerHTML = this.renderFullMapTab();
      setTimeout(() => {
        const c = document.getElementById("full-map-canvas");
        if (c) this.drawMapCanvas(c, true);
      }, 20);
    } else if (this.activeModalTab === "codex") {
      body.innerHTML = this.renderCodexAndStoryTab();
    }
  }

  renderInventoryTab() {
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    const suit = window.GAME_DATA.suits[this.equippedSuit];
    const mask = window.GAME_DATA.masks[this.equippedMask];
    const wpnDur = Math.round(((this.durability[wpn.id] || 0) / wpn.maxDurability) * 100);
    const suitDur = Math.round(((this.durability[suit.id] || 0) / suit.maxDurability) * 100);

    let itemsHtml = "";
    for (const [id, count] of Object.entries(this.inventory)) {
      if (count <= 0) continue;
      const info = this.getItemInfo(id);
      if (!info) continue;

      let statsBadge = "";
      let actionBtn = "";

      if (info.category === "weapon") {
        const durPct = Math.round(((this.durability[id] || info.maxDurability) / info.maxDurability) * 100);
        const cal = info.ammoType ? window.GAME_DATA.ammo[info.ammoType]?.caliber : "Ближний бой";
        statsBadge = `Урон: <b>${info.damage}</b> | Калибр: <b>${cal}</b> | Прочность: <b>${durPct}%</b>`;
        const isEq = this.equippedWeapon === id;
        actionBtn = `<button class="bunker-btn ${isEq ? "active" : ""}" onclick="window.GAME.equipItem('${id}')">${isEq ? "В РУКАХ" : "ВЗЯТЬ В РУКИ"}</button>`;
      } else if (info.category === "suit") {
        const durPct = Math.round(((this.durability[id] || info.maxDurability) / info.maxDurability) * 100);
        statsBadge = `Броня: <b>${info.armor}%</b> | Рад-защита: <b>${info.radResist}%</b> | Холод: <b>${info.coldProtect}%</b> | Жар: <b>${info.heatProtect}%</b> | Прочность: <b>${durPct}%</b>`;
        const isEq = this.equippedSuit === id;
        actionBtn = `<button class="bunker-btn ${isEq ? "active" : ""}" onclick="window.GAME.equipItem('${id}')">${isEq ? "НАДЕТО" : "НАДЕТЬ КОСТЮМ"}</button>`;
      } else if (info.category === "mask") {
        statsBadge = `Фильтрация рад. пыли: <b>${info.radFilter}%</b>`;
        const isEq = this.equippedMask === id;
        actionBtn = `<button class="bunker-btn ${isEq ? "active" : ""}" onclick="window.GAME.equipItem('${id}')">${isEq ? "ВЫБРАН" : "ВЫБРАТЬ"}</button>`;
      } else if (info.category === "ammo") {
        statsBadge = `Калибр: <b>${info.caliber}</b> | Бронебойность: <b>+${info.bonusDmg} урон</b> (${info.penetration})`;
      } else if (window.GAME_DATA.consumables[id]) {
        const parts = [];
        if (info.hunger) parts.push(`Еда: ${info.hunger > 0 ? "+" : ""}${info.hunger}%`);
        if (info.thirst) parts.push(`Вода: ${info.thirst > 0 ? "+" : ""}${info.thirst}%`);
        if (info.hp) parts.push(`ХП: ${info.hp > 0 ? "+" : ""}${info.hp}`);
        if (info.tempDelta) parts.push(`Темп: ${info.tempDelta > 0 ? "+" : ""}${info.tempDelta}°C`);
        if (info.radDelta) parts.push(`Рад: ${info.radDelta > 0 ? "+" : ""}${info.radDelta}`);
        if (info.filterRestore) parts.push(`Фильтр: +100%`);
        if (info.repairAmount) parts.push(`Ремонт: +${info.repairAmount}%`);
        statsBadge = parts.join(" | ");
        actionBtn = `<button class="bunker-btn" onclick="window.GAME.useConsumable('${id}')">ИСПОЛЬЗОВАТЬ</button>`;
      } else {
        statsBadge = `Материал / Сюжетный ресурс`;
      }

      itemsHtml += `
        <div class="inv-card">
          <div class="inv-card-top">
            <span class="inv-icon">${info.icon || "📦"}</span>
            <div class="inv-title-wrap">
              <div class="inv-name">${info.name} <span class="inv-count">×${count}</span></div>
              <div class="inv-stats">${statsBadge}</div>
            </div>
            <div class="inv-actions">${actionBtn}</div>
          </div>
          <div class="inv-desc">${info.desc}</div>
        </div>
      `;
    }

    return `
      <div class="term-grid-2">
        <div class="term-panel">
          <h3>👤 ПРОФИЛЬ БОЙЦА И ТЕКУЩАЯ ЭКИПИРОВКА</h3>
          <div class="hero-card">
            <div><b>Имя:</b> Артём Волков (Мужчина, 28 лет)</div>
            <div><b>Звание:</b> Старший техник-инженер РХБЗ // Объект «Заслон-19»</div>
            <hr class="bunker-hr"/>
            <div><b>Оружие в руках:</b> ${wpn.icon} ${wpn.name} (Урон: <b>${wpn.damage}</b>, Износ: <b>${wpnDur}%</b>)</div>
            <div><b>Защитный костюм:</b> ${suit.icon} ${suit.name} (Броня: <b>${suit.armor}%</b>, Рад: <b>${suit.radResist}%</b>, Холод: <b>${suit.coldProtect}%</b>, Жар: <b>${suit.heatProtect}%</b>, Целостность: <b>${suitDur}%</b>)</div>
            <div><b>Противогаз [G]:</b> ${mask.icon} ${mask.name} (${this.gasMaskOn ? "<span class='txt-good'>НАДЕТ</span>" : "<span class='txt-warn'>СНЯТ</span>"}, Фильтр [F]: <b>${Math.round(this.filterCharge)}%</b>)</div>
          </div>
          <div class="equip-quick-bar">
            <button class="bunker-btn" onclick="window.GAME.toggleGasMask()">[G] ${this.gasMaskOn ? "Снять противогаз" : "Надеть противогаз"}</button>
            <button class="bunker-btn" onclick="window.GAME.replaceGasMaskFilter()">[F] Сменить фильтр (${this.inventory.filter_fgp || 0} шт.)</button>
            <button class="bunker-btn" onclick="window.GAME.repairEquipmentWithKit()">🛠️ Починить ремкомплектом (${this.inventory.repair_kit || 0} шт.)</button>
          </div>
        </div>
        <div class="term-panel">
          <h3>🎒 СКЛАД И ИНВЕНТАРЬ (ОРУЖИЕ, КОСТЮМЫ, ПАТРОНЫ, ПРИПАСЫ)</h3>
          <div class="inv-list-scroll">${itemsHtml}</div>
        </div>
      </div>
    `;
  }

  renderCraftAndAntiquesTab() {
    const formatCost = (costObj) =>
      Object.entries(costObj)
        .map(([k, v]) => {
          const info = this.getItemInfo(k);
          const have = this.inventory[k] || 0;
          const cls = have >= v ? "txt-good" : "txt-danger";
          return `<span class="${cls}">${info ? info.name : k}: ${have}/${v}</span>`;
        })
        .join(" • ");

    const recipesHtml = window.GAME_DATA.recipes
      .map((r) => {
        const ok = this.canAfford(r.cost);
        const resInfo = this.getItemInfo(r.resultId);
        return `
          <div class="inv-card">
            <div class="inv-card-top">
              <span class="inv-icon">${resInfo?.icon || "🛠️"}</span>
              <div class="inv-title-wrap">
                <div class="inv-name">${r.name}</div>
                <div class="inv-stats">Требуется: ${formatCost(r.cost)}</div>
              </div>
              <button class="bunker-btn ${ok ? "" : "disabled"}" onclick="window.GAME.craftRecipe('${r.id}')">СОЗДАТЬ</button>
            </div>
            <div class="inv-desc">${r.desc}</div>
          </div>
        `;
      })
      .join("");

    const antiquesHtml = Object.values(window.GAME_DATA.antiques)
      .map((ant) => {
        let statusHtml = "";
        let btnHtml = "";
        if (!ant.found) {
          statusHtml = `<span class="txt-warn">НЕ НАЙДЕНО (Поиск: ${ant.locationHint})</span>`;
        } else if (!ant.restored) {
          statusHtml = `<span class="txt-info">НАЙДЕНО — ТРЕБУЕТСЯ РЕСТАВРАЦИЯ: ${formatCost(ant.repairCost)}</span>`;
          const ok = this.canAfford(ant.repairCost);
          btnHtml = `<button class="bunker-btn ${ok ? "" : "disabled"}" onclick="window.GAME.restoreAntique('${ant.id}')">ОТРЕСТАВРИРОВАТЬ</button>`;
        } else {
          statusHtml = `<span class="txt-good">★ ОТРЕСТАВРИРОВАНО (Установлено на стенде бункера)</span>`;
        }

        return `
          <div class="inv-card">
            <div class="inv-card-top">
              <span class="inv-icon">${ant.icon}</span>
              <div class="inv-title-wrap">
                <div class="inv-name">${ant.name} <small>(${ant.era})</small></div>
                <div class="inv-stats">${statusHtml}</div>
                <div class="inv-stats"><b>Постоянный бонус:</b> ${ant.buffDesc}</div>
              </div>
              ${btnHtml}
            </div>
            <div class="inv-desc">${ant.lore}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="term-grid-2">
        <div class="term-panel">
          <h3>🔧 ВЕРСТАК: КРАФТ ПАТРОНОВ, ОРУЖИЯ, КОСТЮМОВ И ПРИПАСОВ</h3>
          <div class="inv-list-scroll">${recipesHtml}</div>
        </div>
        <div class="term-panel">
          <h3>🏺 «СТАРИНА» (РЕСТАВРАЦИЯ ДОВОЕННЫХ РЕЛИКВИЙ И ИСТОРИИ)</h3>
          <div class="inv-list-scroll">${antiquesHtml}</div>
        </div>
      </div>
    `;
  }

  renderNPCsAndSystemsTab() {
    const formatCost = (costObj) =>
      Object.entries(costObj)
        .map(([k, v]) => {
          const info = this.getItemInfo(k);
          const have = this.inventory[k] || 0;
          return `<span class="${have >= v ? "txt-good" : "txt-danger"}">${info ? info.name : k}: ${have}/${v}</span>`;
        })
        .join(" • ");

    const sysHtml = window.GAME_DATA.bunkerSystems
      .map((s) => {
        const pct = Math.round((s.hp / s.maxHp) * 100);
        const ok = this.canAfford(s.repairCost);
        return `
          <div class="inv-card">
            <div class="inv-card-top">
              <span class="inv-icon">${s.icon}</span>
              <div class="inv-title-wrap">
                <div class="inv-name">${s.name} — <b>${pct}%</b></div>
                <div class="inv-stats">Ремонт: ${formatCost(s.repairCost)}</div>
              </div>
              <button class="bunker-btn ${ok ? "" : "disabled"}" onclick="window.GAME.repairBunkerSystem('${s.id}')">ПОЧИНИТЬ УЗЕЛ</button>
            </div>
            <div class="inv-desc">${s.effectDesc}</div>
          </div>
        `;
      })
      .join("");

    const npcListHtml = window.GAME_DATA.npcs
      .map((n) => {
        return `
          <div class="inv-card">
            <div class="inv-card-top">
              <span class="inv-icon">${n.gender === "Женщина" ? "👩‍⚕️" : "👨‍✈️"}</span>
              <div class="inv-title-wrap">
                <div class="inv-name">${n.name} (${n.gender}, ${n.age} л.)</div>
                <div class="inv-stats">Должность: <b>${n.role}</b> | Мораль: <b>${n.morale}%</b></div>
              </div>
            </div>
            <div class="inv-desc"><b>Реплика:</b> «${n.greeting}»<br/><i>${n.storyLines.join(" ")}</i></div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="term-grid-2">
        <div class="term-panel">
          <h3>⚙️ РЕМОНТ СИСТЕМ ЖИЗНЕОБЕСПЕЧЕНИЯ БУНКЕРА (ТЕПЛО / ХОЛОД / ЖАР)</h3>
          <div class="inv-list-scroll">${sysHtml}</div>
        </div>
        <div class="term-panel">
          <h3>👥 ЛЮДИ В БУНКЕРЕ (ВЫЖИВШИЕ НПС РАЗНОГО ПОЛА)</h3>
          <div class="inv-list-scroll">${npcListHtml}</div>
        </div>
      </div>
    `;
  }

  renderFullMapTab() {
    return `
      <div class="term-grid-2">
        <div class="term-panel">
          <h3>🗺️ ТАКТИЧЕСКАЯ КАРТА СЕКТОРА-19 (РАЗВЕДКА ТУМАНА ВОЙНЫ: ${this.exploredPercent}%)</h3>
          <div style="display:flex;justify-content:center;padding:8px;">
            <canvas id="full-map-canvas" width="460" height="460" style="border:2px solid #f59e0b;background:#070b08;"></canvas>
          </div>
        </div>
        <div class="term-panel">
          <h3>📍 ОРИЕНТИРЫ И РАЗВЕДДАННЫЕ ПОВЕРХНОСТИ</h3>
          <div class="inv-list-scroll">
            <div class="inv-card"><b>🟢 БУНКЕР «ЗАСЛОН-19» (Центр карты):</b> Входной ствол шахты. Рядом горит бочка с костром (согревает от мороза).</div>
            <div class="inv-card"><b>🔵 СКЛАД РОСРЕЗЕРВА №4 (Северо-Запад):</b> Охраняется мародёрами «Чёрного Ворона» и радио-волками. Здесь лежат автомат АК-74М, бушлат, кварцевый блок связи «Ангара-КВ» и часы «Восток».</div>
            <div class="inv-card"><b>🔴 ГОРОДСКАЯ ПОЛИКЛИНИКА №4 (Восток):</b> Обитают слепые упыри и кислотные плевуны. Внутри спецконтейнер «Регенератор-М» для врача Елены, костюм химзащиты Л-1М и патефон «Молот».</div>
            <div class="inv-card"><b>🟠 ВОЕННЫЙ БЛОКПОСТ ВС РФ (Северо-Восток):</b> Охраняется гигантским медведем-мутантом «Уральский Шатун» (390 ХП). В сейфе — винтовка ВСС «Винторез», бронекостюм «Ратник», Перфокарта кодов и дозиметр ДП-5В.</div>
            <div class="inv-card"><b>🔥 ЖИЛОЙ КВАРТАЛ И РАЗЛОМ «ЖАР-КОТЁЛ» (Юго-Запад):</b> Термальная аномалия (+62°C — вызывает сильный ЖАР/перегрев!). Здесь спрятан старинный Тульский самовар 1912 г.</div>
            <div class="inv-card"><b>🟣 ГЛАВНАЯ ТЕЛЕВЫШКА (Юго-Восток):</b> Логово финального босса «Химера-19» (850 ХП, урон 65) и терминал объединения выживших бункеров России.</div>
          </div>
        </div>
      </div>
    `;
  }

  renderCodexAndStoryTab() {
    const chaptersHtml = window.GAME_DATA.chapters
      .map((ch) => {
        const isCurrent = ch.id === this.currentChapter;
        const isPast = ch.id < this.currentChapter;
        const objs = ch.objectives
          .map((o) => {
            const done = this.completedObjectives.has(o.id);
            return `<div class="${done ? "txt-good" : "txt-warn"}">${done ? "✔" : "◻"} ${o.text}</div>`;
          })
          .join("");
        return `
          <div class="inv-card" style="border-left: 4px solid ${isCurrent ? "#f59e0b" : isPast ? "#4ade80" : "#475569"}">
            <div class="inv-name">${ch.title} ${isPast ? "(ВЫПОЛНЕНО)" : isCurrent ? "(ТЕКУЩАЯ ГЛАВА)" : ""}</div>
            <div class="inv-desc">${ch.desc}</div>
            <div style="margin-top:6px;">${objs}</div>
          </div>
        `;
      })
      .join("");

    const bestiaryHtml = Object.values(window.GAME_DATA.enemies)
      .map((e) => {
        return `
          <div class="inv-card">
            <div class="inv-card-top">
              <span class="inv-icon">${e.icon}</span>
              <div class="inv-title-wrap">
                <div class="inv-name">${e.name} <small>(${e.type})</small></div>
                <div class="inv-stats">Здоровье (ХП): <b class="txt-danger">${e.hp} ед.</b> | Урон: <b class="txt-warn">${e.damage} ед.</b> | Дистанция атаки: <b>${e.attackRange} м</b></div>
              </div>
            </div>
            <div class="inv-desc">${e.desc}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="term-grid-2">
        <div class="term-panel">
          <h3>📖 СЮЖЕТНЫЕ ГЛАВЫ И ЖУРНАЛ ЗАДАНИЙ</h3>
          <div class="inv-list-scroll">${chaptersHtml}</div>
        </div>
        <div class="term-panel">
          <h3>🐺 БЕСТИАРИЙ: МУТАНТЫ, ЗВЕРИ И ВРАГИ (ХП И УРОН)</h3>
          <div class="inv-list-scroll">${bestiaryHtml}</div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // ОБНОВЛЕНИЕ 2D HUD И ТЕЛЕМЕТРИИ
  // ==========================================================================
  updateTargetHUD(target) {
    const promptEl = document.getElementById("crosshair-prompt");
    const enemyScanner = document.getElementById("enemy-scanner-hud");
    if (!promptEl || !enemyScanner) return;

    if (!target) {
      promptEl.classList.add("hidden");
      enemyScanner.classList.add("hidden");
      return;
    }

    if (target.kind === "interact") {
      promptEl.textContent = target.meta.prompt;
      promptEl.classList.remove("hidden");
      enemyScanner.classList.add("hidden");
    } else if (target.kind === "enemy") {
      promptEl.classList.add("hidden");
      const en = target.enemy;
      const pct = Math.max(0, Math.round((en.hp / en.maxHp) * 100));
      enemyScanner.classList.remove("hidden");
      document.getElementById("scan-enemy-name").textContent = `${en.tpl.icon} ${en.tpl.name}`;
      document.getElementById("scan-enemy-stats").textContent =
        `ХП: ${en.hp}/${en.maxHp} | УРОН: ${en.damage} ед. | ${en.tpl.type}`;
      document.getElementById("scan-enemy-bar").style.width = `${pct}%`;
    }
  }

  showHitMarker(dmg, enemyName) {
    const hm = document.getElementById("hit-marker");
    if (!hm) return;
    hm.textContent = `💥 -${dmg} ХП (${enemyName})`;
    hm.classList.remove("hidden");
    clearTimeout(this.hitMarkerTimeout);
    this.hitMarkerTimeout = setTimeout(() => hm.classList.add("hidden"), 650);
  }

  notify(msg, level = "info") {
    const feed = document.getElementById("notification-feed");
    if (!feed) return;
    const item = document.createElement("div");
    item.className = `notif-item notif-${level}`;
    item.textContent = msg;
    feed.prepend(item);
    while (feed.children.length > 4) {
      feed.removeChild(feed.lastChild);
    }
    setTimeout(() => {
      if (item.parentNode) item.remove();
    }, 5500);
  }

  updateHUD() {
    const setBar = (id, val, max = 100) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${Math.max(0, Math.min(100, (val / max) * 100))}%`;
    };
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setBar("bar-hp", this.stats.hp, this.stats.maxHp);
    setText("val-hp", `${Math.round(this.stats.hp)}/${this.stats.maxHp}`);

    setBar("bar-hunger", this.stats.hunger, 100);
    setText("val-hunger", `${Math.round(this.stats.hunger)}%`);

    setBar("bar-thirst", this.stats.thirst, 100);
    setText("val-thirst", `${Math.round(this.stats.thirst)}%`);

    setBar("bar-rad", this.stats.radiation, 100);
    setText("val-rad", `${Math.round(this.stats.radiation)} мЗв`);

    setBar("bar-filter", this.filterCharge, 100);
    setText("val-filter", `${Math.round(this.filterCharge)}% (${this.gasMaskOn ? "ВКЛ" : "ВЫКЛ"})`);

    // Индикация ХОЛОД / НОРМА / ЖАР
    const bt = this.stats.bodyTemp;
    let tempState = "НОРМА";
    if (bt < 35.4) tempState = "❄️ ПЕРЕОХЛАЖДЕНИЕ (ХОЛОД)";
    else if (bt > 38.0) tempState = "🔥 ПЕРЕГРЕВ (ЖАР)";
    setText("val-temp", `${bt.toFixed(1)}°C (${tempState}) | Среда: ${this.stats.envTemp > 0 ? "+" : ""}${Math.round(this.stats.envTemp)}°C`);
    const tempPercent = ((bt - 32.0) / (41.5 - 32.0)) * 100;
    setBar("bar-temp", tempPercent, 100);

    // Оружие и патроны в правом нижнем углу
    const wpn = window.GAME_DATA.weapons[this.equippedWeapon];
    if (wpn) {
      setText("hud-wpn-name", `${wpn.icon} ${wpn.name}`);
      const durPct = Math.round(((this.durability[wpn.id] || 0) / wpn.maxDurability) * 100);
      if (wpn.type === "melee") {
        setText("hud-wpn-ammo", "БЛИЖНИЙ БОЙ [∞]");
      } else {
        const curMag = this.weaponMags[wpn.id] || 0;
        const reserve = this.inventory[wpn.ammoType] || 0;
        const calName = window.GAME_DATA.ammo[wpn.ammoType]?.caliber || "";
        setText("hud-wpn-ammo", `${curMag} / ${reserve} (${calName})`);
      }
      setText("hud-wpn-stats", `Урон: ${wpn.damage} ед. | Состояние: ${durPct}%`);
    }

    // Костюм в HUD
    const suit = window.GAME_DATA.suits[this.equippedSuit];
    if (suit) {
      setText("hud-suit-info", `${suit.icon} ${suit.name} (Броня ${suit.armor}% | Рад ${suit.radResist}% | Холод ${suit.coldProtect}%)`);
    }

    // Текущая глава и задачи
    const chap = window.GAME_DATA.chapters[this.currentChapter - 1];
    if (chap) {
      setText("hud-chapter-title", chap.title);
      const objList = document.getElementById("hud-objectives-list");
      if (objList) {
        objList.innerHTML = chap.objectives
          .map((o) => {
            const done = this.completedObjectives.has(o.id);
            return `<div class="hud-obj-line ${done ? "done" : ""}">${done ? "✔" : "▸"} ${o.text}</div>`;
          })
          .join("");
      }
    }

    // Статус локации в верхней рамке окна
    setText(
      "titlebar-telemetry",
      this.world.zone === "bunker"
        ? `ЛОКАЦИЯ: БУНКЕР «ЗАСЛОН-19» (-64М) // ТЕМП: ${this.stats.envTemp > 0 ? "+" : ""}${Math.round(this.stats.envTemp)}°C // КАРТА: ${this.exploredPercent}%`
        : `ЛОКАЦИЯ: ПУСТОШЬ УРАЛА (ВЫЛАЗКА) // МОРОЗ: ${Math.round(this.stats.envTemp)}°C // КАРТА: ${this.exploredPercent}%`
    );
  }

  // ==========================================================================
  // СОХРАНЕНИЕ И ЗАГРУЗКА ПРОГРЕССА (LocalStorage)
  // ==========================================================================
  saveGame(silent = false) {
    const data = {
      stats: this.stats,
      inventory: this.inventory,
      weaponMags: this.weaponMags,
      durability: this.durability,
      equippedWeapon: this.equippedWeapon,
      equippedSuit: this.equippedSuit,
      equippedMask: this.equippedMask,
      filterCharge: this.filterCharge,
      currentChapter: this.currentChapter,
      completedObjectives: Array.from(this.completedObjectives),
      enemiesKilled: this.enemiesKilled,
      bossKilled: this.bossKilled,
      exploredPercent: this.exploredPercent,
      fogGrid: Array.from(this.fogGrid)
    };
    try {
      localStorage.setItem("zaslon19_save_v1", JSON.stringify(data));
      if (!silent) this.notify("Игра успешно сохранена в энергонезависимую память «Кремний»!", "good");
    } catch (e) {}
  }

  loadGame() {
    try {
      const raw = localStorage.getItem("zaslon19_save_v1");
      if (!raw) {
        this.notify("Сохранений не найдено — начинаем новую игру!", "warn");
        this.startNewGameWithCutscene();
        return;
      }
      const data = JSON.parse(raw);
      Object.assign(this.stats, data.stats || {});
      this.inventory = data.inventory || this.inventory;
      this.weaponMags = data.weaponMags || this.weaponMags;
      this.durability = data.durability || this.durability;
      this.equippedWeapon = data.equippedWeapon || "wpn_pm";
      this.equippedSuit = data.equippedSuit || "suit_jacket";
      this.equippedMask = data.equippedMask || "mask_gp5";
      this.filterCharge = data.filterCharge ?? 100;
      this.currentChapter = data.currentChapter || 1;
      this.completedObjectives = new Set(data.completedObjectives || []);
      this.enemiesKilled = data.enemiesKilled || 0;
      this.bossKilled = !!data.bossKilled;
      this.exploredPercent = data.exploredPercent || 0;
      if (data.fogGrid && data.fogGrid.length === this.fogGrid.length) {
        this.fogGrid.set(data.fogGrid);
      }
      this.world.buildWeaponViewModel(this.equippedWeapon);
      document.getElementById("main-menu").classList.add("hidden");
      this.onCutsceneFinished();
      this.notify("Сохранённый прогресс успешно загружен!", "good");
    } catch (e) {
      this.startNewGameWithCutscene();
    }
  }

  // ==========================================================================
  // ГЛАВНЫЙ ЦИКЛ ИГРЫ (60 FPS)
  // ==========================================================================
  startMainLoop() {
    let last = performance.now();
    let hudTick = 0;
    const minimapCanvas = document.getElementById("minimap-canvas");

    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (this.started && !this.paused) {
        this.world.update(dt, this.keys);
        this.updateSurvival(dt);

        hudTick += dt;
        if (hudTick >= 0.15) {
          hudTick = 0;
          this.updateHUD();
          this.drawMapCanvas(minimapCanvas, false);
        }
      } else if (!this.started) {
        // Плавное вращение камеры в 3D бункере на фоне главного меню
        this.world.yaw += dt * 0.18;
        this.world.renderer.render(this.world.scene, this.world.camera);
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.GAME = new BunkerGame();
});
