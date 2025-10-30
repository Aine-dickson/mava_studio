import { TimelineRuntime } from '../lib/runtime/timeline';

const registry = new Map<string, TimelineRuntime>();

export const timelines = {
  get(id: string) { return registry.get(id); },
  create(cfg: { id: string; duration: number; loop?: boolean; cuePoints?: { id: string; time: number; label?: string }[] }) {
    let tl = registry.get(cfg.id);
    if (tl) return tl;
    tl = new TimelineRuntime({ ...cfg });
    registry.set(cfg.id, tl);
    return tl;
  },
  delete(id: string) {
    const tl = registry.get(id);
    if (tl) {
      tl.stop();
      registry.delete(id);
    }
  },
  all() { return Array.from(registry.values()); }
};
