/// <reference lib="webworker" />
// Sandboxed scripting worker: no DOM, minimal reactive API

import type {
    MavaAPI,
    MavaBuiltinAPI,
    MavaElementsAPI,
    MavaElementSnapshot,
    MavaElementMutations,
    MavaTimelineAPI,
    MavaTimelineSnapshot,
    MavaVariableAPI,
    ReadonlySignal as ReadonlySignalContract,
    Signal as SignalContract,
    Unsubscribe,
} from './mava.types';

type Unsub = Unsubscribe;

class Signal<T> implements SignalContract<T> {
    private _value: T;
    private subs = new Set<(v: T) => void>();
    constructor(v: T) { this._value = v; }
    get value() {
        track(this);
        return this._value;
    }
    set(value: T) {
        if (Object.is(value, this._value)) return;
        this._value = value;
        for (const fn of Array.from(this.subs)) try { fn(this._value); } catch {}
    }
    update(updater: (prev: T) => T) { this.set(updater(this._value)); }
    subscribe(fn: (v: T) => void): Unsub { this.subs.add(fn); return () => this.subs.delete(fn); }
}

type EffectFn = () => void;
const effectStack: EffectFn[] = [];
const depsMap = new WeakMap<object, Set<EffectFn>>();

function track(target: object) {
    const eff = effectStack[effectStack.length - 1];
    if (!eff) return;
    let set = depsMap.get(target);
    if (!set) { set = new Set(); depsMap.set(target, set); }
    set.add(eff);
}

function trigger(target: object) {
    const set = depsMap.get(target);
    if (!set) return;
    for (const eff of Array.from(set)) queueMicrotask(() => { try { eff(); } catch {} });
}

function effect(fn: EffectFn): Unsub {
    const runner = () => { effectStack.push(runner); try { fn(); } finally { effectStack.pop(); } };
    runner();
    return () => { const set = depsMap.get(fn as any); set?.delete(runner); };
}

function computed<T>(calc: () => T): ReadonlySignalContract<T> {
    const out = new Signal<T>(undefined as unknown as T);
    const stop = effect(() => { out.set(calc()); });
    const ro = {
        get value() { return out.value; },
        subscribe: (fn: (v: T) => void) => out.subscribe(fn),
    } as const;
    return ro;
}

// Timers management
const timers = new Set<number>();
const addTimer = (id: number) => { timers.add(id); return () => { clearTimeout(id); clearInterval(id); timers.delete(id); }; };

// Host messaging
function hostLog(level: 'log'|'warn'|'error', args: any[]) {
    (self as any).postMessage({ type: 'log', level, args });
}

function hostCommand(type: string, payload?: any) {
    (self as any).postMessage({ type, payload });
}

// Public API
const time = new Signal<number>(0);
const selection = new Signal<string | null>(null);
const variables = new Map<string, Signal<any>>(); // name -> signal
const builtinProject = new Signal<any>({});
const builtinTimeline = new Signal<any>({});
const builtinPage = new Signal<{ id: string | null; elements: MavaElementSnapshot[] }>({ id: null, elements: [] });
const elementsList = new Signal<MavaElementSnapshot[]>([]);
let elementIndex = new Map<string, MavaElementSnapshot>();
let elementNameIndex = new Map<string, MavaElementSnapshot>();
const tickSubs = new Set<(t: number, dt: number) => void>();

const readonlyProject: ReadonlySignalContract<any> = {
    get value() { return builtinProject.value; },
    subscribe: (fn) => builtinProject.subscribe(fn),
};

const readonlyTimeline: ReadonlySignalContract<MavaTimelineSnapshot> = {
    get value() { return builtinTimeline.value; },
    subscribe: (fn) => builtinTimeline.subscribe(fn),
};

const readonlySelection: ReadonlySignalContract<string | null> = {
    get value() { return selection.value; },
    subscribe: (fn) => selection.subscribe(fn),
};

const readonlyPage: ReadonlySignalContract<{ id: string | null; elements: MavaElementSnapshot[] }> = {
    get value() { return builtinPage.value; },
    subscribe: (fn) => builtinPage.subscribe(fn),
};

const readonlyElements: ReadonlySignalContract<MavaElementSnapshot[]> = {
    get value() { return elementsList.value; },
    subscribe: (fn) => elementsList.subscribe(fn),
};

const variablesCore = {
    readonly: (name: string) => ({ get value() { return getVar(name); }, subscribe: (fn: (v:any)=>void) => getVarSignal(name).subscribe(fn) }),
    mutable: (name: string) => getVarSignal(name),
    get: (name: string) => getVar(name),
    set: (name: string, value: any) => setVar(name, value),
} satisfies MavaVariableAPI;

const variablesProxy: MavaVariableAPI = new Proxy(variablesCore as MavaVariableAPI, {
    get(target, prop, receiver) {
        if (typeof prop === 'string') {
            if (prop in target) return Reflect.get(target, prop, receiver);
            return getVar(prop);
        }
        return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
        if (typeof prop === 'string') {
            if (prop in target) return false;
            setVar(prop, value);
            return true;
        }
        return false;
    },
    has(target, prop) {
        if (typeof prop === 'string' && !(prop in target)) {
            return variables.has(prop);
        }
        return prop in target;
    },
    ownKeys(target) {
        const keys = new Set<string | symbol>(Reflect.ownKeys(target) as Array<string | symbol>);
        for (const name of variables.keys()) keys.add(name);
        return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && !(prop in target)) {
            return {
                configurable: true,
                enumerable: true,
                value: getVar(prop),
                writable: true,
            };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
    },
});

const timelineCore = {
    get value(): MavaTimelineSnapshot { return builtinTimeline.value; },
    get signal(): ReadonlySignalContract<MavaTimelineSnapshot> { return readonlyTimeline; },
    onChange(fn: (snapshot: MavaTimelineSnapshot) => void) { return builtinTimeline.subscribe(fn); },
    play() { hostCommand('timelineCommand', { action: 'play' }); },
    pause() { hostCommand('timelineCommand', { action: 'pause' }); },
    seek(time: number) { hostCommand('timelineCommand', { action: 'seek', time }); },
} as Partial<MavaTimelineAPI>;

const timelineProxy: MavaTimelineAPI = new Proxy(timelineCore as MavaTimelineAPI, {
    get(target, prop, receiver) {
        if (typeof prop === 'string' && !(prop in target)) {
            const snap = builtinTimeline.value ?? {};
            return (snap as Record<string, any>)[prop];
        }
        return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
        if (typeof prop === 'string' && !(prop in target)) {
            hostLog('warn', [`Mava.timeline.${prop} is read-only. Use play/pause/seek instead.`]);
            return false;
        }
        return Reflect.set(target, prop, value);
    },
});

function setElementSnapshots(list: MavaElementSnapshot[], pageId: string | null) {
    elementsList.set(list);
    elementIndex = new Map(list.map((el) => [el.id, el]));
    elementNameIndex = new Map(list.map((el) => [el.name ?? el.id, el]));
    builtinPage.set({ id: pageId, elements: list });
}

const elementsAPI: MavaElementsAPI = {
    list() {
        return elementsList.value.slice();
    },
    get(id: string) {
        return elementIndex.get(id);
    },
    byName(name: string) {
        return elementNameIndex.get(name);
    },
    signal: readonlyElements,
    onChange(fn: (snapshot: MavaElementSnapshot[]) => void) {
        return elementsList.subscribe(fn);
    },
    patch(id: string, changes: MavaElementMutations, opts?: { pageId?: string }) {
        hostCommand('elementPatch', { id, changes, pageId: opts?.pageId ?? builtinPage.value.id });
    },
    set(id: string, next: MavaElementMutations, opts?: { pageId?: string }) {
        hostCommand('elementPatch', { id, changes: next, pageId: opts?.pageId ?? builtinPage.value.id });
    },
};

const MavaRuntime: MavaAPI = {
    time: { get value() { return time.value; }, subscribe: (fn: (v: number) => void) => time.subscribe(fn) },
    onTick(fn: (t: number, dt: number) => void): Unsub { tickSubs.add(fn); return () => tickSubs.delete(fn); },
    //selection: { get value() { return selection.value; }, subscribe: (fn: (v: string | null) => void) => selection.subscribe(fn) },
    //signal<T>(initial: T) { return new Signal<T>(initial); },
    //computed<T>(calc: () => T) { return computed(calc); },
    //effect(fn: () => void) { return effect(fn); },
    variables: variablesProxy as MavaVariableAPI,
    timeline: timelineProxy,
    //elements: elementsAPI,
    builtin: {
        project: readonlyProject,
        //timeline: readonlyTimeline,
        //selection: readonlySelection,
        page: readonlyPage,
    } satisfies MavaBuiltinAPI,
    log: (...args: any[]) => hostLog('log', args),
    warn: (...args: any[]) => hostLog('warn', args),
    error: (...args: any[]) => hostLog('error', args),
    setTimeout(fn: () => void, ms: number): Unsub { const id = setTimeout(fn, ms) as unknown as number; return addTimer(id); },
    setInterval(fn: () => void, ms: number): Unsub { const id = setInterval(fn, ms) as unknown as number; return addTimer(id); },
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
};

function getVarSignal(name: string): Signal<any> {
    let s = variables.get(name);
    if (!s) { s = new Signal<any>(undefined); variables.set(name, s); }
    return s;
}
function getVar(name: string) { return getVarSignal(name).value; }
function setVar(name: string, value: any) { getVarSignal(name).set(value); }

let userStopFns: Unsub[] = [];
function runUser(code: string) {
    // Clear previous
    for (const u of userStopFns.splice(0)) try { u(); } catch {}
    for (const id of Array.from(timers)) { clearTimeout(id); clearInterval(id); timers.delete(id); }

    try {
        // eslint-disable-next-line no-new-func
    const fn = new Function('Mava', '"use strict";\n' + code);
        // Provide a limited console forwarding
        const prevConsole = (self as any).console;
        (self as any).console = {
        log: (...a: any[]) => hostLog('log', a),
        warn: (...a: any[]) => hostLog('warn', a),
        error: (...a: any[]) => hostLog('error', a),
        } as any;
        try {
            const ret = fn(MavaRuntime as any);
            if (typeof ret === 'function') userStopFns.push(ret as Unsub);
        } finally {
            (self as any).console = prevConsole;
        }
        (self as any).postMessage({ type: 'ran' });
    } catch (e: any) {
        (self as any).postMessage({ type: 'runtimeError', message: String(e?.message ?? e), stack: String(e?.stack ?? '') });
    }
}

onmessage = (ev: MessageEvent) => {
    const { type, payload } = ev.data || {};
    switch (type) {
        case 'run': return runUser(String(payload?.code ?? ''));
        case 'stop': {
            for (const u of userStopFns.splice(0)) try { u(); } catch {}
            for (const id of Array.from(timers)) { clearTimeout(id); clearInterval(id); timers.delete(id); }
            return (self as any).postMessage({ type: 'stopped' });
        }
        case 'setTime': {
            const { t, dt } = payload || { t: 0, dt: 0 };
            time.set(Number(t) || 0);
            for (const fn of Array.from(tickSubs)) try { fn(time.value, Number(dt) || 0); } catch {}
            return;
        }
        case 'setSelection': {
            selection.set(payload?.id ?? null);
            return;
        }
        case 'setVar': {
            const { name, value } = payload || {};
            setVar(String(name), value);
            return;
        }
        case 'setBuiltin': {
            const { project, timeline, page } = payload || {};
            if (project !== undefined) builtinProject.set(project);
            if (timeline !== undefined) builtinTimeline.set(timeline);
            if (page !== undefined) {
                const pid = page?.id ?? null;
                const list = Array.isArray(page?.elements) ? page.elements : [];
                setElementSnapshots(list, pid);
            }
            return;
        }
        default: return;
    }
};
