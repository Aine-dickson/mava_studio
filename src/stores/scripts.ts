import { writable, derived, get } from 'svelte/store';

export type ScriptScope = 'global' | 'page';

export interface ScriptDef {
  id: string;
  name: string;
  scope: ScriptScope;
  pageId?: string | null;
  code: string;
  createdAt: number;
  updatedAt: number;
}

function uid(prefix = 'script') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export const scripts = writable<ScriptDef[]>([]);
export const selectedScriptId = writable<string | null>(null);
export const currentPageId = writable<string | null>(null);

export const visibleScripts = derived([scripts, currentPageId], ([arr, pid]) =>
  arr.filter((s) => s.scope === 'global' || (s.scope === 'page' && s.pageId === pid))
);

export const selectedScript = derived([scripts, selectedScriptId], ([arr, id]) =>
  id ? arr.find((s) => s.id === id) ?? null : null
);

interface ScriptCommand {
  id: number;
  scriptId: string;
  type: 'insert-text';
  payload: { text: string };
}

const scriptCommand = writable<ScriptCommand | null>(null);
export const scriptCommands = scriptCommand;

export function requestInsertIntoSelectedScript(text: string, opts?: { pageId?: string | null }) {
  const script = get(selectedScript);
  if (!script) {
    return { ok: false as const, reason: 'no-script' as const };
  }
  if (script.scope === 'page') {
    const currentPage = script.pageId ?? null;
    const targetPage = opts?.pageId ?? null;
    if (!targetPage || currentPage !== targetPage) {
      return { ok: false as const, reason: 'scope-mismatch' as const, script, targetPage };
    }
  }
  const command: ScriptCommand = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    scriptId: script.id,
    type: 'insert-text',
    payload: { text },
  };
  scriptCommand.set(command);
  return { ok: true as const, command };
}

export function acknowledgeScriptCommand(commandId: number) {
  scriptCommand.update((cmd) => (cmd && cmd.id === commandId ? null : cmd));
}

export function setCurrentPage(pageId: string | null) {
  currentPageId.set(pageId);
}

export function selectScript(id: string | null) {
  selectedScriptId.set(id);
}

export function addScript(opts?: { scope?: ScriptScope; pageId?: string | null; name?: string }) {
  const now = Date.now();
  const scope = opts?.scope ?? 'global';
  const pageId = scope === 'page' ? (opts?.pageId ?? get(currentPageId)) ?? null : null;
  const name = opts?.name ?? (scope === 'global' ? 'New Script' : 'New Page Script');
  const s: ScriptDef = {
    id: uid(),
    name,
    scope,
    pageId,
    code: '// start typing...\n',
    createdAt: now,
    updatedAt: now,
  };
  scripts.update((arr) => [...arr, s]);
  selectedScriptId.set(s.id);
  return s.id;
}

export function deleteSelectedScript() {
  const id = get(selectedScriptId);
  if (!id) return;
  scripts.update((arr) => {
    const idx = arr.findIndex((x) => x.id === id);
    if (idx === -1) return arr;
    const next = arr.slice();
    next.splice(idx, 1);
    // choose neighbor for selection
    const newIdx = Math.min(idx, next.length - 1);
    selectedScriptId.set(newIdx >= 0 ? next[newIdx].id : null);
    return next;
  });
}

export function updateScriptCode(id: string, code: string) {
  scripts.update((arr) => arr.map((s) => (s.id === id ? { ...s, code, updatedAt: Date.now() } : s)));
}

export function renameScript(id: string, name: string) {
  scripts.update((arr) => arr.map((s) => (s.id === id ? { ...s, name, updatedAt: Date.now() } : s)));
}

export function toggleScriptScope(id: string) {
  scripts.update((arr) =>
    arr.map((s) => {
      if (s.id !== id) return s;
      const newScope = s.scope === 'global' ? 'page' : 'global';
      const newPageId = newScope === 'page' ? get(currentPageId) ?? null : null;
      return { ...s, scope: newScope, pageId: newPageId, updatedAt: Date.now() };
    })
  );
}
