import { get } from 'svelte/store';
import { projectData } from '../../stores/project';
import type { ProjectData } from '../schemas/project';
import { validateAndMigrateProject } from '../validation/projectValidation';

let worker: Worker | null = null;
const STORAGE_KEY = 'studioProjectData';
let workerSupported = typeof Worker !== 'undefined';

interface PendingChange {
  scope: 'page' | 'lesson' | 'module' | 'course';
  pages?: Record<string, any>;
  lessons?: Record<string, any>;
  modules?: Record<string, any>;
  course?: any;
  ts: number;
}

function initWorkerOnce() {
  if (!workerSupported || worker) return;
  try {
    // Assume bundler handles ?worker or direct path (adjust if needed later)
    worker = new Worker(new URL('../../workers/autosave.worker.ts', import.meta.url), { type: 'module' });
    const full: ProjectData = get(projectData);
    worker.postMessage({ type: 'init', key: STORAGE_KEY, full });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'persist-request') {
        try { localStorage.setItem(msg.key, JSON.stringify(msg.data)); } catch {}
      } else if (msg.type === 'loaded') {
        try {
          const parsed = JSON.parse(msg.raw);
          const res = validateAndMigrateProject(parsed);
          if (res.ok && res.data) projectData.set(res.data);
        } catch {}
      }
    };
  } catch (e) {
    workerSupported = false;
  }
}

export function queueSave(change: PendingChange) {
  initWorkerOnce();
  if (worker) {
    worker.postMessage({ type: 'change', ...change });
  } else {
    // Fallback: merge and write directly
    try {
      const current = get(projectData);
      if (change.pages) Object.assign(current.pagesById, change.pages);
      if (change.lessons) Object.assign(current.lessonsById, change.lessons);
      if (change.modules) Object.assign(current.modulesById, change.modules);
      if (change.course) current.course = change.course;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {}
  }
}

export function flushSaves() {
  if (worker) worker.postMessage({ type: 'flush' });
}

export function loadFromStorage() {
  initWorkerOnce();
  if (worker) worker.postMessage({ type: 'load', key: STORAGE_KEY });
  else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const res = validateAndMigrateProject(parsed);
      if (res.ok && res.data) projectData.set(res.data);
    } catch {}
  }
}

// Attach lifecycle flush safeguards (desktop/offline-first)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSaves();
  });
  window.addEventListener('beforeunload', () => {
    try { flushSaves(); } catch {}
  });
}
