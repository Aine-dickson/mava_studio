import { writable } from 'svelte/store';

export interface SpatialSettings {
    enabled: boolean;
    cellSize: number;    // px size per grid cell
    threshold: number;   // element count to enable spatial index
}

const STORAGE_KEY = 'studioSpatialSettings';
const defaults: SpatialSettings = { enabled: true, cellSize: 128, threshold: 80 };

function load(): SpatialSettings {
    if (typeof window === 'undefined') return defaults;
    try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return defaults; const parsed = JSON.parse(raw); return { ...defaults, ...parsed }; } catch { return defaults; }
}

export const spatialSettings = writable<SpatialSettings>(load());
if (typeof window !== 'undefined') {
    spatialSettings.subscribe(v => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {} });
}

export function updateSpatialSettings(patch: Partial<SpatialSettings>) {
    spatialSettings.update(s => ({ ...s, ...patch }));
}
