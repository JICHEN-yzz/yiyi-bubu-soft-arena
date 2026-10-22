export class SoundCandy {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(value) {
    this.muted = value;
    if (this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.18, this.ctx.currentTime, 0.02);
    }
  }

  tone(frequency, duration, type = "sine", volume = 0.35, slide = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noise(duration = 0.08, volume = 0.2) {
    if (!this.ctx || this.muted) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  ui() {
    this.tone(620, 0.07, "sine", 0.16, 180);
  }

  whiff() {
    this.tone(180, 0.07, "triangle", 0.1, -70);
  }

  light() {
    this.tone(250, 0.055, "triangle", 0.28, 90);
    this.noise(0.04, 0.08);
  }

  heavy() {
    this.tone(105, 0.15, "sine", 0.5, -35);
    this.noise(0.11, 0.24);
  }

  block() {
    this.tone(760, 0.045, "square", 0.13, 110);
    this.tone(290, 0.07, "sine", 0.12, -40);
  }

  perfect() {
    this.tone(880, 0.12, "sine", 0.3, 520);
    this.tone(1320, 0.18, "sine", 0.2, 420);
  }

  heart() {
    this.tone(740, 0.14, "sine", 0.12, 300);
  }

  super() {
    [220, 330, 440, 660].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.32, "triangle", 0.26, 120), index * 90);
    });
    this.noise(0.35, 0.15);
  }

  ko() {
    this.tone(170, 0.34, "triangle", 0.36, -95);
    window.setTimeout(() => this.tone(130, 0.5, "sine", 0.26, -65), 110);
  }

  round() {
    this.tone(420, 0.13, "sine", 0.2, 150);
    window.setTimeout(() => this.tone(640, 0.22, "sine", 0.2, 220), 120);
  }
}
