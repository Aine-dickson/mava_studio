import { writable, get } from 'svelte/store';

export type OutputLevel = 'info' | 'warn' | 'error';
export interface OutputEntry {
  id: string;
  time: number;
  level: OutputLevel;
  message: string;
  meta?: any;
}

function makeId() { return Math.random().toString(36).slice(2); }

const _entries = writable<OutputEntry[]>([]);

export const devOutput = {
  subscribe: _entries.subscribe,
  append(level: OutputLevel, message: string, meta?: any) {
    _entries.update((arr) => [...arr, { id: makeId(), time: Date.now(), level, message, meta }]);
  },
  clear() { _entries.set([]); },
};

// Global listeners for runtime errors in preview/dev
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    devOutput.append('error', e.message || 'Uncaught error', { source: 'window.error', error: e.error?.stack || String(e.error) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    devOutput.append('error', (e.reason && (e.reason.message || String(e.reason))) || 'Unhandled rejection', { source: 'unhandledrejection', reason: e.reason });
  });
}
