// Autosave Web Worker (Stage 3)
// Receives partial updates (pages / lessons / modules) and merges into a shadow copy.
// Debounced flush writes full snapshot to localStorage (offline-first durability).

interface PageUpdate { [id: string]: any }
interface LessonUpdate { [id: string]: any }
interface ModuleUpdate { [id: string]: any }

interface ShadowProject {
    projectVersion: number;
    course: any;
    modulesById: Record<string, any>;
    lessonsById: Record<string, any>;
    pagesById: Record<string, any>;
}

interface InitMessage { type: 'init'; key: string; full: ShadowProject }
interface ChangeMessage { type: 'change'; scope: 'page' | 'lesson' | 'module' | 'course'; pages?: PageUpdate; lessons?: LessonUpdate; modules?: ModuleUpdate; course?: any; ts: number; }
interface FlushMessage { type: 'flush' }
interface LoadMessage { type: 'load'; key: string }

// Minimal ambient type (if lib.dom not included for worker build)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface DedicatedWorkerGlobalScope {}
const ctx: any = self as any;

let shadow: ShadowProject | null = null;
let storageKey = 'studioProjectData';
let debounceTimer: any = null;
const DELAY = 800;

function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DELAY);
}

function flush() {
    if (!shadow) return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const compact = shadow; // could strip transient fields here
        (self as any).localStorage?.setItem(storageKey, JSON.stringify(compact));
    } catch (e) {
        // localStorage not accessible inside worker in some environments.
        // Fallback: post back so main thread can persist.
        ctx.postMessage({ type: 'persist-request', data: shadow, key: storageKey });
    }
}

ctx.onmessage = (ev: MessageEvent<InitMessage | ChangeMessage | FlushMessage | LoadMessage>) => {
    const msg = ev.data;
    switch (msg.type) {
        case 'init': {
            storageKey = msg.key;
            shadow = structuredClone(msg.full);
            scheduleFlush();
            break;
        }
        case 'change': {
            if (!shadow) return;
            if (msg.pages) Object.assign(shadow.pagesById, msg.pages);
            if (msg.lessons) Object.assign(shadow.lessonsById, msg.lessons);
            if (msg.modules) Object.assign(shadow.modulesById, msg.modules);
            if (msg.course) shadow.course = msg.course;
            scheduleFlush();
            break;
        }
        case 'flush': {
            flush();
            break;
        }
        case 'load': {
            try {
                const raw = (self as any).localStorage?.getItem(msg.key);
                if (raw) ctx.postMessage({ type: 'loaded', raw });
            } catch {}
            break;
        }
    }
};
