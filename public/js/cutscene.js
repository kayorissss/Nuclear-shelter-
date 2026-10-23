// ============================================================================
// БУНКЕР «ЗАСЛОН-19» — НАЧАЛЬНАЯ КИНЕМАТОГРАФИЧЕСКАЯ КАТ-СЦЕНА
// (Что произошло, кто ударил, сколько выжило, боеголовка летит на главного
// героя — мужчину 28 лет Артёма Волкова)
// ============================================================================

class IntroCutscene {
  constructor(onComplete) {
    this.onComplete = onComplete;
    this.active = false;
    this.slideIndex = 0;
    this.slideTimer = 0;
    this.totalTime = 0;
    this.animFrame = null;
    this.canvas = document.getElementById("cutscene-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

    this.slides = [
      {
        duration: 8.5,
        code: "СВОДКА СПРН «ВОРОНЕЖ-ДМ» // 14 ОКТЯБРЯ, 04:17 МСК",
        title: "ЧТО ПРОИЗОШЛО: ДЕНЬ, КОГДА ПОГАСЛО СОЛНЦЕ",
        subtitle:
          "После затяжного глобального энергетического и военного кризиса автоматизированные станции предупреждения о ракетном нападении (СПРН) под Орском и Енисейском зафиксировали одновременный выход сотен баллистических целей на суборбитальные траектории. Дипломатические линии связи замолчали навсегда.",
        stats: [
          "СТАТУС ПЕРИМЕТРА: БОЕВАЯ ТРЕВОГА «АТОМ»",
          "ОБНАРУЖЕНО ЦЕЛЕЙ: 1 840 БОЕВЫХ БЛОКОВ",
          "ВРЕМЯ ПОДЛЁТА ДО УРАЛА: 14 МИНУТ 20 СЕКУНД"
        ]
      },
      {
        duration: 9.0,
        code: "СТРАТЕГИЧЕСКИЙ ПЕРЕХВАТ // КТО НАНЁС УДАР",
        title: "КТО УДАРИЛ: ОПЕРАЦИЯ «ПЕПЕЛЬНЫЙ РАССВЕТ» И ОТВЕТ «ПЕРИМЕТРА»",
        subtitle:
          "Первый массированный обезглавливающий удар нанесли объединённые стратегические силы западной коалиции (командование NORAD / НАТО): пуски МБР Minuteman-III из шахт Северной Дакоты и залпы ракет Trident-II D5 с атомных подлодок в Баренцевом и Норвежском морях. Через 180 секунд система «Периметр» и РВСН РФ подняли в небо ответный залп «Ярсов» и «Сарматов».",
        stats: [
          "АТАКУЮЩАЯ СТОРОНА: СТРАТЕГИЧЕСКОЕ КОМАНДОВАНИЕ БЛОКА НАТО / NORAD",
          "ТИП ЗАРЯДОВ: РАЗДЕЛЯЮЩИЕСЯ БЛОКИ W88 (475 КТ) И B83 (1.2 МТ)",
          "ОТВЕТНЫЙ УДАР РФ: АВТОМАТИЧЕСКАЯ СИСТЕМА «ПЕРИМЕТР» (МЁРТВАЯ РУКА)"
        ]
      },
      {
        duration: 9.5,
        code: "ДЕМОГРАФИЧЕСКИЙ МОНИТОРИНГ ГО И ЧС // ПОДСЧЁТ ВЫЖИВШИХ",
        title: "СКОЛЬКО ВЫЖИЛО: КРУШЕНИЕ ЧЕЛОВЕЧЕСКОЙ ЦИВИЛИЗАЦИИ",
        subtitle:
          "За первые 45 минут огненных торнадо и ударных волн погибло почти 7 миллиардов человек. В России из 146 миллионов граждан до герметизации подземных комплексов («Ямантау», спецметро и сети бункеров «Заслон») успели укрыться лишь 142 380 человек. В наш уральский бункер «Заслон-19» до блокировки ствола спустились всего 34 человека.",
        stats: [
          "МИР ДО УДАРА: 8 124 000 000 ЧЕЛ. ➔ ПОГИБЛО В 1-Й ЧАС: ~6.98 МЛРД",
          "СПАСЛОСЬ В БУНКЕРАХ ПО ВСЕЙ РОССИИ: ~142 380 ЧЕЛОВЕК",
          "ВЫЖИВШИХ В БУНКЕРЕ «ЗАСЛОН-19» (УРАЛ): 34 ЧЕЛОВЕКА"
        ]
      },
      {
        duration: 9.5,
        code: "БАЛЛИСТИЧЕСКАЯ УГРОЗА // ПРЯМОЕ НАВЕДЕНИЕ НА СЕКТОР-19",
        title: "БОЕГОЛОВКА ЛЕТИТ ПРЯМО СЮДА: АРТЁМ ВОЛКОВ (28 ЛЕТ)",
        subtitle:
          "Прямо сейчас отделившийся термоядерный блок МБР W88 мощностью 475 килотонн входит в плотные слои атмосферы со скоростью 7.2 км/с точно над координатами вашей шахты. Главный герой — Артём Волков, мужчина, 28 лет, инженер РХБЗ — бежит через бетонный двор к закрывающемуся 40-тонному гермозатвору «Заслона-19»!",
        stats: [
          "ГЛАВНЫЙ ГЕРОЙ: АРТЁМ ВОЛКОВ | ПОЛ: МУЖСКОЙ | ВОЗРАСТ: 28 ЛЕТ",
          "ЦЕЛЬ БОЕГОЛОВКИ W88: ВХОДНОЙ СТВОЛ БУНКЕРА «ЗАСЛОН-19»",
          "ДО ДЕТОНАЦИИ НАД ГОЛОВОЙ: СЧИТАННЫЕ СЕКУНДЫ..."
        ]
      },
      {
        duration: 6.5,
        code: "ЭПИЦЕНТР ВЗРЫВА // ГЕРМЕТИЗАЦИЯ ОТСЕКА №1",
        title: "ВСПЫШКА СВЕРХНОВОЙ — ЖИЗНЬ ПОД ЗЕМЛЁЙ НАЧИНАЕТСЯ",
        subtitle:
          "Ослепительный купол ядерного взрыва выжигает поверхность Урала до стекловидного шлака. За 4 секунды до прихода ударной волны 28-летний Артём Волков успевает нырнуть в тамбур-шлюз. Стальные клинья гермодвери запираются намертво. Снаружи воет ядерная зима...",
        stats: [
          "ГЕРМОЗАТВОР №1: ЗАБЛОКИРОВАН НАМЕРТВО (ГЛУБИНА -64 МЕТРА)",
          "ТЕМПЕРАТУРА НА ПОВЕРХНОСТИ: ПАДАЕТ ДО -28°C (ЯДЕРНАЯ ЗИМА)",
          "ЗАДАЧА: ВЫЖИТЬ И СПАСТИ ОСТАТКИ ЧЕЛОВЕЧЕСТВА"
        ]
      }
    ];
  }

  start() {
    this.active = true;
    this.slideIndex = 0;
    this.slideTimer = 0;
    this.totalTime = 0;
    const modal = document.getElementById("cutscene-screen");
    if (modal) modal.classList.remove("hidden");
    this.resize();
    this.updateSlideDOM();
    if (window.SFX) window.SFX.playSiren(3.5);

    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.render();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  nextSlide() {
    if (!this.active) return;
    if (window.SFX) window.SFX.playClick();
    this.slideIndex++;
    this.slideTimer = 0;
    if (this.slideIndex >= this.slides.length) {
      this.finish();
      return;
    }
    if (this.slideIndex === 3 && window.SFX) {
      window.SFX.playRadarBeep(1320, 0.25);
    }
    if (this.slideIndex === 4 && window.SFX) {
      window.SFX.playNukeBlast();
    }
    this.updateSlideDOM();
  }

  finish() {
    this.active = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const modal = document.getElementById("cutscene-screen");
    if (modal) modal.classList.add("hidden");
    if (this.onComplete) this.onComplete();
  }

  updateSlideDOM() {
    const s = this.slides[this.slideIndex];
    if (!s) return;
    document.getElementById("cs-code").textContent = s.code;
    document.getElementById("cs-title").textContent = s.title;
    document.getElementById("cs-subtitle").textContent = s.subtitle;
    const statsEl = document.getElementById("cs-stats");
    statsEl.innerHTML = s.stats
      .map((line) => `<div class="cs-stat-pill">☢ ${line}</div>`)
      .join("");
    document.getElementById("cs-step-indicator").textContent =
      `ЭПИЗОД ${this.slideIndex + 1} ИЗ ${this.slides.length}`;
  }

  update(dt) {
    this.slideTimer += dt;
    this.totalTime += dt;
    const currentSlide = this.slides[this.slideIndex];
    if (!currentSlide) return;

    const progress = Math.min(100, (this.slideTimer / currentSlide.duration) * 100);
    const bar = document.getElementById("cs-progress-fill");
    if (bar) bar.style.width = `${progress}%`;

    // Periodic radar beep during warhead descent
    if (this.slideIndex === 3 && Math.floor(this.slideTimer * 2) !== Math.floor((this.slideTimer - dt) * 2)) {
      if (window.SFX) window.SFX.playRadarBeep(950 + this.slideTimer * 80, 0.08);
    }

    if (this.slideTimer >= currentSlide.duration) {
      this.nextSlide();
    }
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Dark bunker CRT background
    ctx.fillStyle = "#070b08";
    ctx.fillRect(0, 0, w, h);

    // Tactical grid lines
    ctx.strokeStyle = "rgba(74, 222, 128, 0.08)";
    ctx.lineWidth = 1;
    const gridStep = 48;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const cx = w * 0.5;
    const cy = h * 0.37;
    const t = this.slideTimer;

    if (this.slideIndex === 0 || this.slideIndex === 1) {
      // Radar & Global ICBM strike visualization
      const rMax = Math.min(w, h) * 0.27;
      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = "rgba(74, 222, 128, 0.22)";
        ctx.beginPath();
        ctx.arc(cx, cy, (rMax * i) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Rotating radar sweep
      const sweepAngle = this.totalTime * 2.1;
      const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, rMax);
      grad.addColorStop(0, "rgba(74, 222, 128, 0.25)");
      grad.addColorStop(1, "rgba(74, 222, 128, 0.0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rMax, sweepAngle - 0.5, sweepAngle);
      ctx.closePath();
      ctx.fill();

      // Stylized Russia / Eurasia contour polygon
      ctx.strokeStyle = "rgba(74, 222, 128, 0.55)";
      ctx.fillStyle = "rgba(22, 101, 52, 0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const mapPts = [
        [-0.55, -0.05], [-0.42, -0.22], [-0.15, -0.28], [0.15, -0.32],
        [0.52, -0.24], [0.68, -0.08], [0.55, 0.12], [0.22, 0.18],
        [-0.08, 0.16], [-0.38, 0.12]
      ];
      mapPts.forEach(([mx, my], idx) => {
        const px = cx + mx * rMax * 1.4;
        const py = cy + my * rMax * 1.1;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Incoming NATO/NORAD missile arcs (Red)
      const trajectories = [
        { sx: cx - rMax * 1.3, sy: cy - rMax * 0.7, tx: cx - rMax * 0.35, ty: cy - rMax * 0.05, label: "МОСКВА" },
        { sx: cx - rMax * 1.1, sy: cy - rMax * 0.85, tx: cx - rMax * 0.45, ty: cy - rMax * 0.18, label: "С.-ПЕТЕРБУРГ" },
        { sx: cx - rMax * 0.9, sy: cy - rMax * 0.95, tx: cx + rMax * 0.02, ty: cy + rMax * 0.02, label: "УРАЛ / ЗАСЛОН-19" },
        { sx: cx + rMax * 1.25, sy: cy - rMax * 0.6, tx: cx + rMax * 0.35, ty: cy + rMax * 0.05, label: "НОВОСИБИРСК" }
      ];
      trajectories.forEach((tr, i) => {
        const prog = Math.min(1, (t * 0.35 + i * 0.12) % 1.15);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tr.sx, tr.sy);
        const ctrlX = (tr.sx + tr.tx) / 2;
        const ctrlY = Math.min(tr.sy, tr.ty) - 90;
        const curX =
          (1 - prog) * (1 - prog) * tr.sx +
          2 * (1 - prog) * prog * ctrlX +
          prog * prog * tr.tx;
        const curY =
          (1 - prog) * (1 - prog) * tr.sy +
          2 * (1 - prog) * prog * ctrlY +
          prog * prog * tr.ty;
        ctx.quadraticCurveTo(ctrlX, ctrlY, tr.tx, tr.ty);
        ctx.stroke();

        // Warhead blip
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(curX, curY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Target label
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 12px monospace";
        ctx.fillText(tr.label, tr.tx + 8, tr.ty + 4);
      });
    } else if (this.slideIndex === 2) {
      // Population & Survivors Counter Screen
      const ratio = Math.min(1, t / 6.5);
      const worldPop = Math.floor(8124000000 - ratio * 6984000000);
      const ruSurvivors = Math.floor(146150000 - ratio * (146150000 - 142380));

      ctx.fillStyle = "rgba(17, 24, 19, 0.9)";
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      const boxW = Math.min(760, w * 0.86);
      const boxH = 230;
      ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
      ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

      ctx.textAlign = "center";
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 16px monospace";
      ctx.fillText("ГЛОБАЛЬНЫЙ СЧЁТЧИК ВЫЖИВШЕГО НАСЕЛЕНИЯ (РЕАЛЬНОЕ ВРЕМЯ)", cx, cy - 75);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`ЗЕМЛЯ: ${worldPop.toLocaleString("ru-RU")} ЧЕЛ.`, cx, cy - 32);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 24px monospace";
      ctx.fillText(`УКРЫЛОСЬ В БУНКЕРАХ РФ: ${ruSurvivors.toLocaleString("ru-RU")} ЧЕЛ.`, cx, cy + 16);

      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 22px monospace";
      ctx.fillText("ОБЪЕКТ «ЗАСЛОН-19» (УРАЛ): 34 ВЫЖИВШИХ [ГЕРМЕТИЗАЦИЯ]", cx, cy + 68);
      ctx.textAlign = "left";
    } else if (this.slideIndex === 3) {
      // Warhead W88 descending directly onto 28-year-old Artyom Volkov at Bunker Zaslon-19!
      const prog = Math.min(1, t / 8.5);
      const groundY = cy + 105;

      // Bunker Entrance Structure on surface
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(cx - 140, groundY - 45, 280, 50);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 140, groundY - 45, 280, 50);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("ВХОДНОЙ СТВОЛ БУНКЕРА «ЗАСЛОН-19» (ГЛУБИНА -64М)", cx, groundY + 24);

      // Running Protagonist: Artyom Volkov (Male, 28 years old)
      const heroX = cx - 95 + prog * 85;
      const heroY = groundY - 20;
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.arc(heroX, heroY - 18, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(heroX, heroY - 11);
      ctx.lineTo(heroX, heroY + 6);
      ctx.stroke();

      // Target Reticle around Protagonist
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(heroX - 24, heroY - 34, 48, 48);
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 12px monospace";
      ctx.fillText("АРТЁМ ВОЛКОВ (МУЖЧИНА, 28 ЛЕТ)", heroX, heroY - 42);

      // Descending MIRV Warhead W88 from sky
      const whX = cx + (1 - prog) * 140;
      const whY = cy - 150 + prog * 210;

      // Fiery plasma trail
      const trailGrad = ctx.createLinearGradient(whX, whY, whX + 70, whY - 110);
      trailGrad.addColorStop(0, "#ef4444");
      trailGrad.addColorStop(0.5, "#f59e0b");
      trailGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(whX, whY);
      ctx.lineTo(whX + 75, whY - 115);
      ctx.stroke();

      // Warhead cone
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(whX, whY, 7, 0, Math.PI * 2);
      ctx.fill();

      const secLeft = Math.max(0.4, (8.8 - t)).toFixed(1);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`⚠️ БОЕГОЛОВКА W88 (475 КТ) ➔ ДО ВЗРЫВА: ${secLeft} СЕК`, cx, cy - 130);
      ctx.textAlign = "left";
    } else if (this.slideIndex === 4) {
      // Blinding Nuclear Detonation & Blast Door Slamming Shut
      const flashAlpha = Math.max(0, 1 - t / 3.5);
      const rad = 40 + t * 140;
      const blastGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);
      blastGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      blastGrad.addColorStop(0.35, "rgba(251, 146, 60, 0.85)");
      blastGrad.addColorStop(0.75, "rgba(220, 38, 38, 0.45)");
      blastGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = blastGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();

      // Closing Blast Doors animation
      const doorClose = Math.min(1, t / 2.2);
      const doorW = (w * 0.5) * doorClose;
      ctx.fillStyle = "#141c16";
      ctx.fillRect(0, 0, doorW, h);
      ctx.fillRect(w - doorW, 0, doorW, h);

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(doorW, 0);
      ctx.lineTo(doorW, h);
      ctx.moveTo(w - doorW, 0);
      ctx.lineTo(w - doorW, h);
      ctx.stroke();

      if (flashAlpha > 0.1) {
        ctx.fillStyle = `rgba(255, 245, 220, ${flashAlpha * 0.65})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
}

window.IntroCutscene = IntroCutscene;
