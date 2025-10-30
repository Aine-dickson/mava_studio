import type { TimelineConfig, CuePoint } from '../schemas/timeline';

export type TimelineEvent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'seek'; time: number }
  | { type: 'loop'; count: number }
  | { type: 'tick'; time: number; dt: number }
  | { type: 'cue'; cue: CuePoint };

export type EasingName = 'linear' | 'easeInOutQuad';

function getEasing(name: EasingName) {
  switch (name) {
    case 'easeInOutQuad':
      return (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    case 'linear':
    default:
      return (t: number) => t;
  }
}

export class TimelineRuntime {
  readonly id: string;
  private duration: number;
  private loopEnabled: boolean;
  private cuePoints: CuePoint[];

  private rafId: number | null = null;
  private playing = false;
  private startTime = 0; // performance.now() when play started (minus offset)
  private current = 0; // ms
  private lastTick = 0; // ms timestamp
  private loopCount = 0;

  private listeners = new Set<(e: TimelineEvent) => void>();

  constructor(cfg: TimelineConfig) {
    this.id = cfg.id;
    this.duration = Math.max(0, cfg.duration);
    this.loopEnabled = !!cfg.loop;
    this.cuePoints = [...(cfg.cuePoints ?? [])].sort((a, b) => a.time - b.time);
  }

  on(fn: (e: TimelineEvent) => void) { this.listeners.add(fn); }
  off(fn: (e: TimelineEvent) => void) { this.listeners.delete(fn); }
  private emit(e: TimelineEvent) { for (const fn of this.listeners) fn(e); }

  get time() { return this.current; }
  get durationMs() { return this.duration; }
  get isPlaying() { return this.playing; }
  get isLooping() { return this.loopEnabled; }
  setLoop(loop: boolean) { this.loopEnabled = loop; }
  setDuration(ms: number) {
    const prev = this.duration;
    this.duration = Math.max(0, Math.floor(ms));
    // If current time is beyond new duration, clamp and emit a seek so listeners update.
    if (this.current > this.duration) {
      this.seek(this.duration);
    } else if (this.playing) {
      // Keep playing seamlessly: adjust startTime so now - startTime == current
      const now = performance.now();
      this.startTime = now - this.current;
    }
    // No need to emit a separate event; seek/play tick will cover UI updates.
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    const now = performance.now();
    // resume from current offset
    this.startTime = now - this.current;
    this.lastTick = now;
    this.emit({ type: 'play' });
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.emit({ type: 'pause' });
  }

  stop() {
    const wasPlaying = this.playing;
    this.playing = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.current = 0;
    this.loopCount = 0;
    if (wasPlaying) this.emit({ type: 'stop' });
  }

  seek(time: number) {
    const clamped = Math.max(0, Math.min(this.duration, Math.floor(time)));
    this.current = clamped;
    if (this.playing) {
      const now = performance.now();
      this.startTime = now - this.current;
      this.lastTick = now;
    }
    this.emit({ type: 'seek', time: this.current });
  }

  private tick = () => {
    if (!this.playing) return;
    const now = performance.now();
    const prev = this.current;
    const next = now - this.startTime;
    let newTime = next;
    let wrapped = false;

    if (next >= this.duration) {
      if (this.loopEnabled && this.duration > 0) {
        const over = next % this.duration;
        newTime = over;
        wrapped = true;
      } else {
        newTime = this.duration;
        this.current = newTime;
        const dt = now - this.lastTick;
        this.emit({ type: 'tick', time: this.current, dt });
        this.emitCues(prev, newTime, wrapped);
        this.pause();
        return;
      }
    }

    this.current = newTime;
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.emit({ type: 'tick', time: this.current, dt });
    this.emitCues(prev, newTime, wrapped);

    if (wrapped) this.emit({ type: 'loop', count: ++this.loopCount });

    this.rafId = requestAnimationFrame(this.tick);
  };

  private emitCues(prev: number, curr: number, wrapped: boolean) {
    if (this.cuePoints.length === 0) return;
    if (!wrapped) {
      for (const cue of this.cuePoints) {
        if (cue.time > prev && cue.time <= curr) this.emit({ type: 'cue', cue });
      }
    } else {
      // range prev..duration and 0..curr
      for (const cue of this.cuePoints) {
        if (cue.time > prev && cue.time <= this.duration) this.emit({ type: 'cue', cue });
        if (cue.time >= 0 && cue.time <= curr) this.emit({ type: 'cue', cue });
      }
    }
  }
}
