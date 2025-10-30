import { writable } from 'svelte/store';

export interface VisibilitySettings {
    enabled: boolean;      // master toggle
    margin: number;        // extra px around viewport when culling
}

const STORAGE_KEY = 'studioVisibilitySettings';
const defaults: VisibilitySettings = { enabled: true, margin: 120 };

function load(): VisibilitySettings {
    if (typeof window === 'undefined') return defaults;
    try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return defaults; const parsed = JSON.parse(raw); return { ...defaults, ...parsed }; } catch { return defaults; }
}

export const visibilitySettings = writable<VisibilitySettings>(load());
if (typeof window !== 'undefined') {
    visibilitySettings.subscribe(v => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {} });
}

export function updateVisibilitySettings(patch: Partial<VisibilitySettings>) {
    visibilitySettings.update(s => ({ ...s, ...patch }));
}
