import { writable, get } from 'svelte/store';

export interface Clip {
  id: string;
  elementId: string;
  start: number; // ms
  end: number;   // ms (exclusive)
  label?: string;
}

export type TimelineClips = Record<string, Clip[]>; // timelineId -> clips

const STORAGE_KEY = 'timelineClips';

function load(): TimelineClips {
  if (typeof localStorage === 'undefined') return {};
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as TimelineClips : {}; } catch { return {}; }
}
function save(obj: TimelineClips) { if (typeof localStorage === 'undefined') return; localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }

const _map = writable<TimelineClips>(load());
_map.subscribe(save);

export const timelineClips = {
  subscribe: _map.subscribe,
  getForTimeline(timelineId: string): Clip[] { return (get(_map)[timelineId] ?? []); },
  setForTimeline(timelineId: string, clips: Clip[]) {
    _map.update((m) => { m[timelineId] = clips.map(c => ({ ...c })); return m; });
  },
  getMaxEnd(timelineId: string): number {
    const arr = (get(_map)[timelineId] ?? []);
    return arr.reduce((max, c) => Math.max(max, c.end), 0);
  },
  ensureClip(timelineId: string, elementId: string, duration: number): Clip {
    let clip = this.getForTimeline(timelineId).find(c => c.elementId === elementId);
    if (clip) {
      // If an existing clip appears to be an auto-created placeholder (0..0),
      // expand it to cover the current timeline duration for initial usability.
      if ((clip.start === 0) && (clip.end === 0) && duration > 0) {
        const updated: Clip = { ...clip, end: Math.max(0, duration) };
        _map.update((m) => {
          const arr = (m[timelineId] ?? (m[timelineId] = []));
          const i = arr.findIndex(c=>c.id===updated.id); if (i>=0) arr[i]=updated;
          return m;
        });
        clip = updated;
      }
      return clip;
    }
    clip = { id: 'clip-' + Math.random().toString(36).slice(2), elementId, start: 0, end: Math.max(0, duration) };
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); arr.push(clip!); return m; });
    return clip;
  },
  upsert(timelineId: string, clip: Clip) {
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); const i = arr.findIndex(c=>c.id===clip.id); if (i>=0) arr[i]=clip; else arr.push(clip); return m; });
  },
  remove(timelineId: string, clipId: string) {
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); const i = arr.findIndex(c=>c.id===clipId); if (i>=0) arr.splice(i,1); return m; });
  },
};
