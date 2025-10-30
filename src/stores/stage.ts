import { writable } from 'svelte/store';

export type StageKey = 'create' | 'template' | 'animate';

const initial: StageKey = 'create';
export const stage = writable<StageKey>(initial);
export function setStage(s: StageKey) { stage.set(s); }
