import { derived, get, writable } from 'svelte/store';
import { currentPageId } from './project';
import type { VarScope as SchemaScope } from '../lib/schemas/variables';

export type VarScope = Extract<SchemaScope, 'global'|'page'>;
export type VarType = 'string' | 'number' | 'boolean' | 'json' | 'object' | 'array';

export interface VariableDef {
    id: string;
    name: string; // unique within scope+page
    scope: VarScope;
    pageId?: string; // when scope==='page'
    type: VarType;
    readOnly?: boolean;
}

const STORAGE_KEY = 'studioVariables.v1';

function makeId() { return Math.random().toString(36).slice(2); }

// State
const _defs = writable<VariableDef[]>([]);
const _values = writable<Record<string, any>>({}); // id -> value

// Load/save
if (typeof window !== 'undefined') {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.defs)) _defs.set(data.defs);
            if (data.values && typeof data.values === 'object') _values.set(data.values);
        }
    } catch {}

    const persist = () => {
        try {
            const out = JSON.stringify({ defs: get(_defs), values: get(_values) });
            localStorage.setItem(STORAGE_KEY, out);
        } catch {}
    };
    _defs.subscribe(persist);
    _values.subscribe(persist);
}

export const variableDefs = derived(_defs, x => x);
export const variableValues = derived(_values, x => x);

export const variablesByPage = derived([_defs, currentPageId], ([$defs, $pid]) => {
    return $defs.filter(d => d.scope === 'global' || (d.scope === 'page' && d.pageId === $pid));
});

export function listAll(): VariableDef[] { return get(_defs); }
export function listForPage(pageId: string): VariableDef[] { return get(_defs).filter(d => d.scope === 'global' || (d.scope === 'page' && d.pageId === pageId)); }

export function createVariable(input: { name: string; scope: VarScope; type: VarType; pageId?: string; initial?: any; readOnly?: boolean }): VariableDef {
    const id = makeId();
    const pageId = input.scope === 'page' ? (input.pageId || get(currentPageId)) : undefined;
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Variable name is required');
    // Enforce uniqueness (case-insensitive) within same scope+page
    const exists = get(_defs).some(d =>
        d.name.toLowerCase() === name.toLowerCase() &&
        d.scope === input.scope &&
        (d.scope === 'global' || d.pageId === pageId)
    );
    if (exists) throw new Error(`Variable "${name}" already exists in this scope`);
    const def: VariableDef = { id, name, scope: input.scope, pageId, type: input.type, readOnly: !!input.readOnly };
    _defs.update(arr => [...arr, def]);
    if (input.initial !== undefined) setValueById(id, coerce(input.type, input.initial));
    return def;
}

export function renameVariable(id: string, newName: string) {
    const name = String(newName || '').trim();
    if (!name) return;
    const current = get(_defs).find(d => d.id === id);
    if (!current) return;
    const pageId = current.scope === 'page' ? current.pageId : undefined;
    const exists = get(_defs).some(d => d.id !== id && d.name.toLowerCase() === name.toLowerCase() && d.scope === current.scope && (d.scope === 'global' || d.pageId === pageId));
    if (exists) throw new Error(`Variable "${name}" already exists in this scope`);
    _defs.update(arr => arr.map(d => d.id === id ? { ...d, name } : d));
}

export function deleteVariable(id: string) {
    _defs.update(arr => arr.filter(d => d.id !== id));
    _values.update(map => { const n = { ...map }; delete n[id]; return n; });
}

export function setValueById(id: string, value: any) {
    _values.update(map => ({ ...map, [id]: value }));
}

export function setValueByName(name: string, value: any, pageId?: string) {
    const def = resolveByName(name, pageId);
    if (!def) return;
    if (def.readOnly) return; // ignore writes to readOnly
    setValueById(def.id, coerce(def.type, value));
}

export function getValueByName(name: string, pageId?: string): any {
    const def = resolveByName(name, pageId);
    if (!def) return undefined;
    return get(_values)[def.id];
}

export function resolveByName(name: string, pageId?: string): VariableDef | null {
    const pid = pageId ?? get(currentPageId);
    const defs = get(_defs);
    // prefer page var over global if same name
    const pageVar = defs.find(d => d.name === name && d.scope === 'page' && d.pageId === pid);
    if (pageVar) return pageVar;
    const globalVar = defs.find(d => d.name === name && d.scope === 'global');
    return globalVar || null;
}

export function subscribeValueByName(name: string, pageId: string | undefined, cb: (v: any) => void): () => void {
    // Subscribe to both defs and values; call cb whenever the resolved value changes
    let last: any = Symbol('init');
    const unsubDefs = _defs.subscribe(() => {
        const v = getValueByName(name, pageId);
        if (v !== last) { last = v; cb(v); }
    });
    const unsubVals = _values.subscribe(() => {
        const v = getValueByName(name, pageId);
        if (v !== last) { last = v; cb(v); }
    });
    // emit initial
    queueMicrotask(() => { const v = getValueByName(name, pageId); last = v; cb(v); });
    return () => { unsubDefs(); unsubVals(); };
}

function coerce(type: VarType, v: any) {
    try {
        switch (type) {
            case 'number': return typeof v === 'number' ? v : Number(v);
            case 'boolean': return typeof v === 'boolean' ? v : (String(v).toLowerCase() === 'true');
            case 'json': return typeof v === 'string' ? JSON.parse(v) : v;
            case 'object': {
                if (v != null && typeof v === 'object' && !Array.isArray(v)) return v;
                if (typeof v === 'string') { const parsed = JSON.parse(v); return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}; }
                return {};
            }
            case 'array': {
                if (Array.isArray(v)) return v;
                if (typeof v === 'string') { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
                return [];
            }
            default: return v != null ? String(v) : '';
        }
    } catch { return v; }
}

export const variablesApi = {
    createVariable,
    renameVariable,
    deleteVariable,
    setValueById,
    setValueByName,
    getValueByName,
    resolveByName,
    subscribeValueByName,
    listAll,
    listForPage,
    variableDefs,
    variableValues,
    variablesByPage,
};

// (type already exported above)

// Compatibility layer for existing trigger runtime usage ----------------------
// Older code expects a single variablesStore (Record<id,value>) and helpers setVar/adjustVar
import type { VariableMap } from '../lib/schemas/variables';
import { writable as _writable, get as _get } from 'svelte/store';

// Mirror of id->value derived from _values
export const variablesStore = derived(_values, (vals) => vals) as unknown as import('svelte/store').Writable<VariableMap>;

export function setVar(id: string, value: any) {
    // set by id directly
    setValueById(id, value);
}

export function adjustVar(id: string, by: number) {
    const curr = _get(_values)[id];
    const next = (Number(curr) || 0) + (Number(by) || 0);
    setValueById(id, next);
}
