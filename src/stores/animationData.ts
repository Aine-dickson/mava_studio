import { writable, get } from 'svelte/store';

export type EasingName = 'linear' | 'easeInOutQuad';
export type AnimProperty = 'opacity'; // extend later: 'x'|'y'|'scale'|'rotation' etc.

export interface Keyframe {
  id: string;
  elementId: string;
  property: AnimProperty;
  time: number; // ms
  value: number; // for now numeric
  easing: EasingName;
}

export type TimelineKeyframes = Record<string, Keyframe[]>; // timelineId -> keyframes

const STORAGE_KEY = 'animationData';

function load(): TimelineKeyframes {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimelineKeyframes) : {};
  } catch {
    return {};
  }
}
function save(obj: TimelineKeyframes) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

const _map = writable<TimelineKeyframes>(load());
_map.subscribe(save);

export const animationData = {
  subscribe: _map.subscribe,
  getForTimeline(timelineId: string): Keyframe[] { return (get(_map)[timelineId] ?? []).slice().sort((a,b)=>a.time-b.time); },
  addKeyframe(timelineId: string, kf: Keyframe) {
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); arr.push(kf); return m; });
  },
  updateKeyframe(timelineId: string, kf: Keyframe) {
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); const i = arr.findIndex(x=>x.id===kf.id); if (i>=0) arr[i]=kf; return m; });
  },
  removeKeyframe(timelineId: string, id: string) {
    _map.update((m) => { const arr = (m[timelineId] ?? (m[timelineId] = [])); const i = arr.findIndex(x=>x.id===id); if (i>=0) arr.splice(i,1); return m; });
  },
};

export function makeKeyframeId() { return 'kf-' + Math.random().toString(36).slice(2); }
