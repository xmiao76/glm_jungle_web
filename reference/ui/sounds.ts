/**
 * WebAudio-synthesized sound effects (no audio assets shipped).
 *
 * The AudioContext is created lazily on the first play attempt — browsers
 * require a user gesture before audio can start, and every play call
 * originates from a user action or its consequence (move, capture, game
 * end). Mute preference persists in localStorage. Everything is guarded so
 * the module never throws (it is imported by Node-run unit tests).
 */
export type SoundEvent = "move" | "capture" | "win" | "draw";

const MUTE_KEY = "jungle-muted";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      /* localStorage unavailable (Node tests, privacy mode) */
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  /** Fire a sound effect; silently no-ops when muted or audio is unavailable. */
  play(event: SoundEvent): void {
    if (this.muted) return;
    try {
      const ctx = this.context();
      if (!ctx) return;
      switch (event) {
        case "move":
          this.tone(ctx, 540, 0.06, 0.05, 0, "sine");
          break;
        case "capture":
          this.tone(ctx, 190, 0.14, 0.09, 0, "triangle", 110);
          break;
        case "win":
          this.tone(ctx, 523, 0.12, 0.07, 0, "sine");
          this.tone(ctx, 659, 0.12, 0.07, 0.11, "sine");
          this.tone(ctx, 784, 0.2, 0.07, 0.22, "sine");
          break;
        case "draw":
          this.tone(ctx, 233, 0.16, 0.06, 0, "sine");
          this.tone(ctx, 185, 0.24, 0.06, 0.15, "sine");
          break;
      }
    } catch {
      /* audio not available — visuals are unaffected */
    }
  }

  private context(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx === null) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    dur: number,
    gain: number,
    delay: number,
    type: OscillatorType,
    glideTo?: number,
  ): void {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    }
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const sounds = new SoundEngine();
