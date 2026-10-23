// ============================================================================
// БУНКЕР «ЗАСЛОН-19» — ПРОЦЕДУРНЫЙ АУДИО-СИНТЕЗАТОР (WebAudio API)
// ============================================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.lastGeiger = 0;
    this.lastBreath = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.45;
    this.masterGain.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.45;
    }
    return this.muted;
  }

  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.045);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playGeigerTick() {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(2200 + Math.random() * 1400, now);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.008);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.01);
  }

  playRadarBeep(freq = 1050, dur = 0.12) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playSiren(duration = 3.2) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.linearRampToValueAtTime(680, now + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(310, now + duration);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.4);
    g.gain.linearRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  playNukeBlast() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 2.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.9));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 2.6);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.65, now);
    g.gain.exponentialRampToValueAtTime(0.005, now + 2.7);

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
  }

  playDoorHydraulics() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Heavy metallic clunk + steam hiss
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.55);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  playGunshot(weaponId) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (weaponId === "wpn_crowbar") {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.16);
      return;
    }

    if (weaponId === "wpn_plasma") {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.32);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.35);
      return;
    }

    // Ballistic noise burst
    const dur = weaponId === "wpn_toz" ? 0.32 : weaponId === "wpn_vss" ? 0.11 : 0.19;
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.28));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value =
      weaponId === "wpn_toz" ? 450 : weaponId === "wpn_vss" ? 1600 : 880;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(weaponId === "wpn_vss" ? 0.22 : 0.45, now);
    g.gain.exponentialRampToValueAtTime(0.005, now + dur);

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    noise.start(now);
  }

  playReload() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.25, 0.55].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(420 + idx * 240, now + offset);
      g.gain.setValueAtTime(0.15, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  playPickup() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playMutantGrowl() {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.linearRampToValueAtTime(68, now + 0.28);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }
}

window.SFX = new SoundEngine();
