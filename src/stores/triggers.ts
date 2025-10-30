import { writable, get } from 'svelte/store';
import type { TriggerDef } from '../lib/schemas/triggers';

const STORAGE_KEY = 'triggers';

function load(): TriggerDef[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TriggerDef[]) : [];
  } catch {
    return [];
  }
}
function save(list: TriggerDef[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const _list = writable<TriggerDef[]>(load());
_list.subscribe(save);

export const triggersStore = {
  subscribe: _list.subscribe,
  add(def: TriggerDef) {
    _list.update((arr) => [...arr, def]);
  },
  remove(id: string) {
    _list.update((arr) => arr.filter((t) => t.id !== id));
  },
  all(): TriggerDef[] { return get(_list); },
  getForTimeline(timelineId: string): TriggerDef[] {
    return get(_list).filter((t) => t.source?.kind === 'timeline' && t.source.timelineId === timelineId);
  },
};
