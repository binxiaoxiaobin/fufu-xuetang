/**
 * Procedural sound: every sound is synthesised with WebAudio, so the game
 * ships zero audio files. Starts only after a user gesture (browser policy).
 */

type Ctx = AudioContext;

const NOTES = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — one per coin metal

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private muted = false;
  private lastEat = 0;
  private lastFeed = 0;
  private moanTimer = 25;

  get ready(): boolean {
    return this.ctx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp).connect(ctx.destination);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.2, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      this.sfx.connect(this.reverb);
      this.ambience();
      this.engine();
    } catch (err) {
      console.error('[fishslop] E_AUDIO_INIT', (err as Error).name);
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.08);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private noiseBuffer(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  /** Deep-water bed: brown noise swell + a quiet two-note drone. */
  private ambience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.32;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    for (const [f, v] of [[55, 0.035], [82.41, 0.025], [110.3, 0.012]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(this.master!);
      o.connect(og).connect(this.reverb!);
      o.start();
    }
  }

  private engine(): void {
    const ctx = this.ctx!;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 160;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master!);
    this.engineOsc.start();
  }

  /** Called every frame with sub speed so the motor hum follows the throttle. */
  tick(dt: number, speed: number, boosting: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const t = ctx.currentTime;
    const s = Math.min(1, speed / 14);
    this.engineOsc.frequency.setTargetAtTime(38 + s * 38 + (boosting ? 18 : 0), t, 0.2);
    this.engineFilter.frequency.setTargetAtTime(140 + s * 420, t, 0.2);
    this.engineGain.gain.setTargetAtTime(0.02 + s * 0.09, t, 0.25);
    this.moanTimer -= dt;
    if (this.moanTimer <= 0) {
      this.moanTimer = 40 + Math.random() * 40;
      this.whale();
    }
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; glide?: number; delay?: number; attack?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whale(): void {
    const ctx = this.ctx;
    if (!ctx || !this.reverb) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(240, t + 1.6);
    o.frequency.linearRampToValueAtTime(130, t + 4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    o.connect(g).connect(this.reverb);
    o.start(t);
    o.stop(t + 4.4);
  }

  feed(): void {
    const now = performance.now();
    if (now - this.lastFeed < 90) return;
    this.lastFeed = now;
    this.tone(420 + Math.random() * 120, 0.12, { glide: 160, gain: 0.08 });
  }

  eat(): void {
    const now = performance.now();
    if (now - this.lastEat < 70) return;
    this.lastEat = now;
    this.tone(900 + Math.random() * 400, 0.07, { glide: 1500, gain: 0.05, type: 'triangle' });
  }

  coin(tier: number): void {
    const f = NOTES[Math.min(tier, NOTES.length - 1)];
    this.tone(f, 0.35, { gain: 0.12, type: 'triangle' });
    this.tone(f * 1.5, 0.45, { gain: 0.07, delay: 0.05 });
    if (tier >= 3) for (let i = 0; i < 4; i++) this.tone(f * [1, 1.25, 1.5, 2][i], 0.5, { gain: 0.08, delay: 0.08 * i + 0.1 });
  }

  sonar(): void {
    this.tone(1250, 1.4, { glide: 1150, gain: 0.22 });
    this.tone(1250, 1.2, { glide: 1150, gain: 0.08, delay: 0.42 });
    this.tone(1250, 1.0, { glide: 1150, gain: 0.035, delay: 0.84 });
  }

  purchase(legendary: boolean): void {
    const base = legendary ? 392 : 523.25;
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.4, { gain: 0.1, delay: i * 0.07, type: 'triangle' }));
    if (legendary) [1, 1.26, 1.5, 1.89, 2.52].forEach((m, i) => this.tone(base * m * 2, 1.2, { gain: 0.06, delay: 0.35 + i * 0.09 }));
  }

  tierUp(): void {
    [261.63, 329.63, 392, 523.25].forEach((f) => this.tone(f, 2.2, { gain: 0.07, attack: 0.4 }));
  }

  veilfin(): void {
    this.tone(1800, 2.5, { glide: 900, gain: 0.05, attack: 0.6 });
    this.tone(2400, 2.2, { glide: 1300, gain: 0.03, attack: 0.8, delay: 0.3 });
  }

  empty(): void {
    this.tone(110, 0.25, { glide: 70, gain: 0.18, type: 'square' });
  }

  click(): void {
    this.tone(1400, 0.05, { gain: 0.05, type: 'triangle' });
  }
}
