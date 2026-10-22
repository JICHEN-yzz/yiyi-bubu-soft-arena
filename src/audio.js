export class SoundCandy {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.music = null;
    this.musicPlaying = false;
    this.lastVoiceAt = 0;
    this.voicesPreloaded = false;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.26;
      this.master.connect(this.ctx.destination);
    }
    if (!this.music) {
      this.music = new Audio("./assets/bgm.mp3");
      this.music.loop = true;
      this.music.preload = "none";
      this.music.volume = 0.24;
      this.music.muted = this.muted;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(value) {
    this.muted = value;
    if (this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.26, this.ctx.currentTime, 0.02);
    }
    if (this.music) this.music.muted = value;
  }

  startMusic() {
    this.unlock();
    if (!this.music || this.musicPlaying) return;
    this.musicPlaying = true;
    this.music.play().catch(() => {
      this.musicPlaying = false;
    });
  }

  stopMusic() {
    this.musicPlaying = false;
    this.music?.pause();
  }

  duckMusic(value = 0.06) {
    if (this.music) this.music.volume = value;
  }

  restoreMusicVolume() {
    if (this.music) this.music.volume = 0.24;
  }

  preloadVoices() {
    if (this.voicesPreloaded) return;
    this.voicesPreloaded = true;
    for (const character of ["yiyi", "bubu"]) {
      for (const kind of ["attack", "heavy", "hurt", "super"]) {
        const clip = new Audio(`./assets/voices/${character}_${kind}.wav`);
        clip.preload = "auto";
        clip.load();
      }
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

  noise(duration = 0.08, volume = 0.2, frequency = 420) {
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
    filter.frequency.value = frequency;
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  ui() {
    this.tone(620, 0.07, "sine", 0.16, 180);
    this.tone(940, 0.04, "sine", 0.08, 120);
  }

  whiff() {
    this.noise(0.07, 0.07, 980);
    this.tone(180, 0.07, "triangle", 0.09, -70);
  }

  step() {
    this.tone(100, 0.035, "sine", 0.07, -18);
    this.noise(0.025, 0.035, 260);
  }

  voice(character = "yiyi", kind = "attack") {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastVoiceAt < 0.1) return;
    this.lastVoiceAt = now;
    const category = kind === "hurt"
      ? "hurt"
      : kind === "super"
        ? "super"
        : ["heavy", "special", "slam", "bodySlam", "throw", "spin"].includes(kind)
          ? "heavy"
          : "attack";
    const source = `./assets/voices/${character}_${category}.wav`;
    const clip = new Audio(source);
    clip.preload = "auto";
    clip.volume = character === "bubu" ? 0.82 : 0.9;
    clip.playbackRate = character === "bubu" ? 0.8 : 1.08;
    clip.play().catch(() => this.synthVoice(character, category));
  }

  synthVoice(character = "yiyi", kind = "attack") {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const isYiyi = character === "yiyi";
    const isHeavy = kind === "heavy" || kind === "special" || kind === "super";
    const hurt = kind === "hurt";
    const start = isYiyi ? (isHeavy ? 720 : 610) : (isHeavy ? 330 : 285);
    const end = isYiyi ? (hurt ? 260 : isHeavy ? 390 : 450) : (hurt ? 120 : isHeavy ? 175 : 210);
    const duration = isYiyi ? (hurt ? 0.2 : 0.13) : (hurt ? 0.25 : 0.18);
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    filter.type = "bandpass";
    filter.frequency.value = isYiyi ? 1380 : 720;
    filter.Q.value = 2.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isYiyi ? 0.2 : 0.24, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    for (const [detune, level] of [[0, 1], [isYiyi ? 90 : -55, 0.58]]) {
      const oscillator = this.ctx.createOscillator();
      const levelGain = this.ctx.createGain();
      oscillator.type = isYiyi ? "sawtooth" : "triangle";
      oscillator.detune.value = detune;
      oscillator.frequency.setValueAtTime(start + detune * 0.08, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, end), now + duration);
      levelGain.gain.value = level;
      oscillator.connect(levelGain).connect(filter);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    }
    filter.connect(gain).connect(this.master);
  }

  hurt(character = "yiyi", damage = 6) {
    this.voice(character, "hurt");
    if (damage >= 12) this.noise(0.08, 0.1, character === "yiyi" ? 1450 : 680);
  }

  light() {
    this.tone(260, 0.06, "triangle", 0.3, 100);
    this.tone(520, 0.035, "square", 0.08, -80);
    this.noise(0.055, 0.12, 720);
  }

  heavy() {
    this.tone(88, 0.2, "sine", 0.62, -32);
    this.tone(155, 0.12, "triangle", 0.18, -55);
    this.noise(0.15, 0.28, 310);
  }

  block() {
    this.tone(760, 0.055, "square", 0.14, 110);
    this.tone(290, 0.07, "sine", 0.12, -40);
    this.noise(0.045, 0.07, 1750);
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
    this.noise(0.35, 0.18, 520);
    window.setTimeout(() => this.noise(0.28, 0.16, 1300), 260);
  }

  ko() {
    this.tone(170, 0.34, "triangle", 0.36, -95);
    window.setTimeout(() => this.tone(130, 0.5, "sine", 0.26, -65), 110);
    this.noise(0.42, 0.2, 210);
  }

  round() {
    this.tone(420, 0.13, "sine", 0.2, 150);
    window.setTimeout(() => this.tone(640, 0.22, "sine", 0.2, 220), 120);
  }

  pause() {
    this.tone(520, 0.08, "sine", 0.12, -150);
    this.tone(390, 0.12, "triangle", 0.1, -100);
  }
}
