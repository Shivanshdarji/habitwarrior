/* ==========================================================
 * Habit Warrior — WebAudio SFX
 *
 * Procedurally synthesized sounds so the project ships with
 * zero external audio assets.
 * ========================================================== */

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    // Lazily create context on first user gesture (browser autoplay policy).
    const unlock = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'hit':      return this._hit();
      case 'crit':     return this._crit();
      case 'kill':     return this._kill();
      case 'levelup':  return this._levelUp();
      case 'spawn':    return this._spawn();
      case 'cancel':   return this._click(180, 0.05);
      case 'day':      return this._day();
      case 'achieve':  return this._achieve();
    }
  }

  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, attack = 0.005, decay = 0.1, freqEnd = null, delay = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + attack + decay + 0.05);
  }

  _noise({ dur = 0.15, gain = 0.2, filterFreq = 2000, delay = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  _hit() {
    this._tone({ freq: 200, freqEnd: 80, type: 'square', dur: 0.12, gain: 0.18, decay: 0.12 });
    this._noise({ dur: 0.12, gain: 0.12, filterFreq: 1400 });
  }
  _crit() {
    this._tone({ freq: 600, freqEnd: 220, type: 'sawtooth', dur: 0.18, gain: 0.22, decay: 0.18 });
    this._tone({ freq: 900, freqEnd: 320, type: 'square', dur: 0.18, gain: 0.12, decay: 0.18, delay: 0.02 });
    this._noise({ dur: 0.2, gain: 0.18, filterFreq: 3200 });
  }
  _kill() {
    this._tone({ freq: 500, freqEnd: 80, type: 'sawtooth', dur: 0.35, gain: 0.25, decay: 0.35 });
    this._noise({ dur: 0.35, gain: 0.2, filterFreq: 1200 });
    this._tone({ freq: 70, freqEnd: 40, type: 'sine', dur: 0.35, gain: 0.4, decay: 0.4, delay: 0.05 });
  }
  _levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.18, decay: 0.22, delay: i * 0.09 });
    });
  }
  _spawn() {
    this._tone({ freq: 120, freqEnd: 400, type: 'sine', dur: 0.35, gain: 0.18, decay: 0.35 });
  }
  _click(freq = 440, gain = 0.1) {
    this._tone({ freq, type: 'square', dur: 0.04, gain, decay: 0.05 });
  }
  _day() {
    [392, 523.25, 659.25].forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 0.25, gain: 0.16, decay: 0.3, delay: i * 0.08 });
    });
  }
  _achieve() {
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.16, decay: 0.22, delay: i * 0.07 });
    });
  }
}
