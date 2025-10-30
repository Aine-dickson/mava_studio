import { writable, get } from 'svelte/store';
import type { TimelineConfig } from '../lib/schemas/timeline';

export interface TimelineRecord extends TimelineConfig { name: string; }

const STORAGE_KEY = 'timelineData';

function load(): TimelineRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimelineRecord[]) : [];
  } catch {
    return [];
  }
}
function save(list: TimelineRecord[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const _list = writable<TimelineRecord[]>(load());
_list.subscribe(save);

export const timelineData = {
  subscribe: _list.subscribe,
  add(rec: TimelineRecord) {
    _list.update((arr) => {
      if (arr.some((t) => t.id === rec.id)) return arr;
      return [...arr, rec];
    });
  },
  update(rec: TimelineRecord) {
    _list.update((arr) => arr.map((t) => (t.id === rec.id ? rec : t)));
  },
  getById(id: string): TimelineRecord | undefined { return get(_list).find(t=>t.id===id); },
  remove(id: string) {
    _list.update((arr) => arr.filter((t) => t.id !== id));
  },
  getAll(): TimelineRecord[] { return get(_list); },
  addCue(timelineId: string, cue: { id?: string; time: number; name?: string }) {
    const rec = get(_list).find(t=>t.id===timelineId); if (!rec) return;
    const id = cue.id ?? ('cue-' + Math.random().toString(36).slice(2));
    const name = cue.name?.trim() || undefined;
    if (name) {
      const exists = (rec.cuePoints ?? []).some(c=> (c.name?.toLowerCase?.() || '').trim() === name.toLowerCase());
      if (exists) throw new Error(`Cue name "${name}" already exists in timeline.`);
    }
    const next: TimelineRecord = { ...rec, cuePoints: [...(rec.cuePoints ?? []), { id, time: cue.time, name }].sort((a,b)=>a.time-b.time) };
    this.update(next);
  },
  renameCue(timelineId: string, cueId: string, newName: string) {
    const rec = get(_list).find(t=>t.id===timelineId); if (!rec) return;
    const name = (newName || '').trim(); if (!name) return;
    const exists = (rec.cuePoints ?? []).some(c=> c.id !== cueId && (c.name?.toLowerCase?.() || '').trim() === name.toLowerCase());
    if (exists) throw new Error(`Cue name "${name}" already exists in timeline.`);
    const next: TimelineRecord = { ...rec, cuePoints: (rec.cuePoints ?? []).map(c=> c.id===cueId ? { ...c, name } : c) };
    this.update(next);
  },
  deleteCue(timelineId: string, cueId: string) {
    const rec = get(_list).find(t=>t.id===timelineId); if (!rec) return;
    const next: TimelineRecord = { ...rec, cuePoints: (rec.cuePoints ?? []).filter(c=> c.id !== cueId) };
    this.update(next);
  }
};

export const selectedTimelineId = writable<string | null>(null);
