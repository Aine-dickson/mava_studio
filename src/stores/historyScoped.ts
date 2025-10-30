import { get, writable } from 'svelte/store';
import { projectData, currentPageId, currentLessonId, currentModuleId, getPageGeneration } from './project';
import { queueSave } from '../lib/persistence';
import type { Page, Lesson, Module } from '../lib/schemas/project';
import { deepClone } from '../lib/schemas/project';
import { addNotification } from './notifications';
import { timelineData, type TimelineRecord } from './timelineData';
import { timelineClips } from './timelineClips';
import { selectedTimelineId } from './timelineData';

// Focus scope determines which stack undo/redo targets
export type FocusScope = 'page' | 'lesson' | 'module' | 'timeline' | 'stage';
export const focusScope = writable<FocusScope>('page');

// Ring buffer stack implementation ------------------------------------------------
export type CommitCategory = 'transform' | 'structure' | 'style' | 'meta' | 'timeline';
interface Snapshot<T> { data: T; category: CommitCategory; ts: number; }
interface Stack<T> { past: Snapshot<T>[]; future: Snapshot<T>[]; limit: number; }
function createStack<T>(limit = 100): Stack<T> { return { past: [], future: [], limit }; }
const SQUASH_WINDOW_MS = 300; // temporal merge window

// Active transform sessions (page-level). While active, transform commits are suppressed until end.
export const activeTransformPages = new Set<string>();
export const pendingTransformPages = new Set<string>();

export function startPageTransform(pageId: string) {
  // If already active, ignore (nested gesture)
  if (activeTransformPages.has(pageId)) return;
  // Capture baseline snapshot BEFORE any transform mutations so first undo works
  commitPageChange(pageId, 'transform');
  activeTransformPages.add(pageId);
}

export function endPageTransform(pageId: string) {
  if (!activeTransformPages.has(pageId)) return; // nothing to finalize
  activeTransformPages.delete(pageId);
  // Force a single transform commit if there were suppressed changes.
  if (pendingTransformPages.has(pageId)) {
    pendingTransformPages.delete(pageId);
    commitPageChange(pageId, 'transform', { forceTransform: true });
  }
}

// Separate history per entity id for fine granularity
const pageStacks: Record<string, Stack<Page>> = {};
const lessonStacks: Record<string, Stack<Lesson>> = {};
const moduleStacks: Record<string, Stack<Module>> = {};
const timelineStacks: Record<string, Stack<TimelineRecord>> = {};
// Combined Stage history (page + timeline)
type StageSnapshot = { pageId: string; timelineId: string; page: Page; timeline: TimelineRecord; clips: ReturnType<typeof timelineClips.getForTimeline> };
const stageStacks: Record<string, Stack<StageSnapshot>> = {};
// Structure stack captures course.modules ordering and modulesById shallow snapshot
interface ModuleStructureSnapshot { modulesOrder: { id: string; order: number }[]; modulesById: Record<string, Module>; }
const moduleStructureStack: Stack<ModuleStructureSnapshot> = createStack<ModuleStructureSnapshot>(30);

// Autosave now delegated to persistence worker via queueSave (partial payloads)
function scheduleAutosave(scope: 'page' | 'lesson' | 'module' | 'course', payload: any) {
  queueSave({ scope, ...payload, ts: Date.now() });
}

// Generation / hash tracking to skip redundant commits
const lastPageGen: Record<string, number> = {};
const lastPageHash: Record<string, string> = {};
const lastLessonHash: Record<string, string> = {};
const lastModuleHash: Record<string, string> = {};
const lastTimelineHash: Record<string, string> = {};
const lastStageHash: Record<string, string> = {};

function pageHash(p: Page): string {
  const parts: any[] = [p.metadata.updatedAt, p.backgroundColor, p.elements.length];
  for (const el of p.elements) {
    // Style fingerprint kept lightweight: stringify only shallow style or length-limited slice
    let styleSig = '';
    try { styleSig = el.style ? JSON.stringify(el.style) : ''; } catch { styleSig=''; }
    parts.push(el.id, el.position.x, el.position.y, el.size?.dimensions?.width, el.size?.dimensions?.height, el.rotation, el.opacity, el.visible ? 1 : 0, el.zIndex, styleSig);
  }
  return parts.join('|');
}

function lessonHash(l: Lesson): string {
  return l.pages.map(r => r.id+':'+r.order).join(',') + '|' + l.metadata.updatedAt;
}
function moduleHash(m: Module): string {
  return m.lessons.map(r => r.id+':'+r.order).join(',') + '|' + m.metadata.updatedAt;
}
function timelineHash(t: TimelineRecord): string {
  const clips = timelineClips.getForTimeline(t.id)
    .map(c => `${c.id}:${Math.floor(c.start)}-${Math.floor(c.end)}`)
    .sort()
    .join('|');
  const cues = (t.cuePoints ?? [])
    .map(c=>c.id+':'+Math.floor(c.time)+':' + (c.name||''))
    .sort()
    .join(',');
  return [t.id, Math.floor(t.duration), t.loop ? 1 : 0, cues, clips].join('|');
}

function stageHash(page: Page, timeline: TimelineRecord): string {
  return pageHash(page) + '||' + timelineHash(timeline);
}

// Stage (page + timeline) ------------------------------------------------------
function getCurrentStageSnapshot(timelineIdOverride?: string): StageSnapshot | null {
  const pid = get(currentPageId); const tid = timelineIdOverride ?? get(selectedTimelineId);
  if (!pid || !tid) return null;
  const pd = get(projectData);
  const page = pd.pagesById[pid]; if (!page) return null;
  const tl = timelineData.getById(tid); if (!tl) return null;
  const clips = timelineClips.getForTimeline(tid).map(c => ({ ...c }));
  return { pageId: pid, timelineId: tid, page: deepClone(page), timeline: deepClone(tl), clips };
}

export function commitStageChange(source: 'page' | 'timeline', category: CommitCategory, timelineIdOverride?: string) {
  const snap = getCurrentStageSnapshot(timelineIdOverride);
  if (!snap) return;
  const h = stageHash(snap.page, snap.timeline);
  if (lastStageHash[snap.pageId] === h) return;
  const stack = stageStacks[snap.pageId] ?? (stageStacks[snap.pageId] = createStack<StageSnapshot>());
  pushSnapshot(stack, snap, category);
  lastStageHash[snap.pageId] = h;
}

// Commit helpers -----------------------------------------------------------------
function pushSnapshot<T>(stack: Stack<T>, snap: T, category: CommitCategory) {
  const now = Date.now();
  const last = stack.past[stack.past.length - 1];
  const allowSquash = category !== 'transform' && category !== 'style';
  if (allowSquash && last && last.category === category && (now - last.ts) < SQUASH_WINDOW_MS) {
    // Squash: replace last snapshot for non-transform categories
    last.data = snap;
    last.ts = now;
  } else {
    stack.past.push({ data: snap, category, ts: now });
    if (stack.past.length > stack.limit) stack.past.splice(0, stack.past.length - stack.limit);
  }
  stack.future = []; // clear redo on new divergent commit
}

function shallowEqualKeys(a: Record<string, any>, b: Record<string, any>, keys: string[]): boolean {
  for (const k of keys) if (a[k] !== b[k]) return false; return true;
}

function inferPageCategory(prev: Page | undefined, next: Page): CommitCategory {
  if (!prev) return 'structure';
  // Structure changes: element count/order/id set differences
  if (prev.elements.length !== next.elements.length) return 'structure';
  for (let i = 0; i < prev.elements.length; i++) {
    if (prev.elements[i].id !== next.elements[i].id) return 'structure';
  }
  // Check per-element differences
  let sawTransform = false; let sawStyle = false; let sawMeta = false;
  for (let i = 0; i < next.elements.length; i++) {
    const a = prev.elements[i]; const b = next.elements[i];
    if (a === b) continue;
    if (a.id !== b.id || a.type !== b.type) return 'structure';
    // Transform-related fields
    const transformKeys = ['position','size','rotation','opacity','visible','zIndex'] as const;
    let transformChanged = false;
    for (const tk of transformKeys) {
      // @ts-ignore
      if (JSON.stringify(a[tk]) !== JSON.stringify(b[tk])) { transformChanged = true; break; }
    }
    if (transformChanged) sawTransform = true;
    // Style differences (style object deep inequality)
    if (JSON.stringify(a.style) !== JSON.stringify(b.style)) sawStyle = true;
    // Behavior (triggers / animations / methods) treat as structure for now
    if (JSON.stringify(a.triggers) !== JSON.stringify(b.triggers) || JSON.stringify(a.animations) !== JSON.stringify(b.animations)) return 'structure';
  }
  // Page-level meta vs style: metadata vs backgroundColor/layouts
  const metaChanged = JSON.stringify(prev.metadata) !== JSON.stringify(next.metadata);
  const bgChanged = prev.backgroundColor !== next.backgroundColor;
  const layoutsChanged = JSON.stringify(prev.layouts) !== JSON.stringify(next.layouts);
  if (metaChanged && !sawStyle && !sawTransform && !bgChanged && !layoutsChanged) return 'meta';
  if ((bgChanged || layoutsChanged || sawStyle) && !sawTransform) return 'style';
  if (sawTransform && !sawStyle && !metaChanged) return 'transform';
  if (sawTransform && sawStyle) return 'transform';
  if (metaChanged) return 'meta';
  return 'structure';
}

function inferLessonCategory(prev: Lesson | undefined, next: Lesson): CommitCategory {
  if (!prev) return 'structure';
  if (prev.pages.length !== next.pages.length) return 'structure';
  for (let i=0;i<prev.pages.length;i++) if (prev.pages[i].id !== next.pages[i].id || prev.pages[i].order !== next.pages[i].order) return 'structure';
  if (JSON.stringify(prev.metadata) !== JSON.stringify(next.metadata)) return 'meta';
  return 'structure';
}

function inferModuleCategory(prev: Module | undefined, next: Module): CommitCategory {
  if (!prev) return 'structure';
  if (prev.lessons.length !== next.lessons.length) return 'structure';
  for (let i=0;i<prev.lessons.length;i++) if (prev.lessons[i].id !== next.lessons[i].id || prev.lessons[i].order !== next.lessons[i].order) return 'structure';
  if (JSON.stringify(prev.metadata) !== JSON.stringify(next.metadata)) return 'meta';
  return 'structure';
}

interface CommitOptions { forceTransform?: boolean; forceIsolation?: boolean }
// Isolation mode (collection edit) defers commits similar to transform sessions
export const isolationPages = new Set<string>();
export const pendingIsolationPages = new Set<string>();
const isolationBaseline: Record<string, Page> = {};

export function startIsolation(pageId: string) {
  if (isolationPages.has(pageId)) return;
  // Capture baseline snapshot (structure) if not already current
  commitPageChange(pageId, 'structure');
  const pd = get(projectData); const pg = pd.pagesById[pageId]; if (pg) isolationBaseline[pageId] = deepClone(pg);
  isolationPages.add(pageId);
}
export function endIsolation(pageId: string) {
  if (!isolationPages.has(pageId)) return;
  isolationPages.delete(pageId);
  if (pendingIsolationPages.has(pageId)) {
    pendingIsolationPages.delete(pageId);
    // Determine category between transform-only vs structure.
    const pd = get(projectData); const current = pd.pagesById[pageId];
    const base = isolationBaseline[pageId];
    let cat: CommitCategory = 'structure';
    if (base && current) {
      const sameCount = base.elements.length === current.elements.length;
      let orderSame = sameCount;
      if (orderSame) {
        for (let i=0;i<base.elements.length;i++) if (base.elements[i].id !== current.elements[i].id) { orderSame = false; break; }
      }
      if (orderSame) {
        let onlyTransform = true;
        const tKeys = ['position','size','rotation','opacity','visible','zIndex'];
        for (let i=0;i<base.elements.length && onlyTransform;i++) {
          const a:any = base.elements[i]; const b:any = current.elements[i];
          if (a.id !== b.id) { onlyTransform = false; break; }
          // Compare style, triggers, animations
          if (JSON.stringify(a.style) !== JSON.stringify(b.style)) { onlyTransform = false; break; }
          if (JSON.stringify(a.triggers) !== JSON.stringify(b.triggers) || JSON.stringify(a.animations) !== JSON.stringify(b.animations)) { onlyTransform = false; break; }
          // Meta fields (not present here) skipped.
          for (const k of tKeys) {
            if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { /* transform diff allowed */ }
          }
        }
        if (onlyTransform) cat = 'transform';
      }
    }
    delete isolationBaseline[pageId];
    commitPageChange(pageId, cat, { forceIsolation: true });
  }
}
export function commitPageChange(pageId: string, category?: CommitCategory, opts?: CommitOptions) {
  const pd = get(projectData);
  const page = pd.pagesById[pageId];
  if (!page) return;
  const gen = getPageGeneration(pageId);
  const h = pageHash(page);
  // Suppress mid-drag transform commits unless forced at end
  if (category === 'transform' && activeTransformPages.has(pageId) && !opts?.forceTransform) {
    // Mark that something changed so endPageTransform will commit
    if (lastPageHash[pageId] !== h) pendingTransformPages.add(pageId);
    return;
  }
  // Isolation deferral (any category) until forced end
  if (isolationPages.has(pageId) && !opts?.forceIsolation) {
    if (lastPageHash[pageId] !== h) pendingIsolationPages.add(pageId);
    return;
  }
  if (lastPageGen[pageId] === gen && lastPageHash[pageId] === h) return; // skip unchanged (including forced if identical)
  // If merged stage scope is active, commit into stage stack
  if (get(focusScope) === 'stage') {
    commitStageChange('page', category ?? 'structure');
    lastPageGen[pageId] = gen; lastPageHash[pageId] = h;
    return;
  }
  const stack = pageStacks[pageId] ?? (pageStacks[pageId] = createStack<Page>());
  const prev = stack.past[stack.past.length - 1]?.data;
  const inferred = category ?? inferPageCategory(prev, page);
  console.log(`Committing page change for ${pageId} with category: ${inferred}`);
  pushSnapshot(stack, deepClone(page), inferred);
  console.log(`Snapshot pushed for ${pageId}. Current stack length: ${stack.past.length}`);
  lastPageGen[pageId] = gen; lastPageHash[pageId] = h;
  scheduleAutosave('page', { pages: { [pageId]: page } });
}

export function commitLessonChange(lessonId: string, category?: CommitCategory) {
  const pd = get(projectData);
  const lesson = pd.lessonsById[lessonId];
  if (!lesson) return;
  const h = lessonHash(lesson);
  if (lastLessonHash[lessonId] === h) return;
  const stack = lessonStacks[lessonId] ?? (lessonStacks[lessonId] = createStack<Lesson>());
  const prev = stack.past[stack.past.length - 1]?.data;
  const inferred = category ?? inferLessonCategory(prev, lesson);
  pushSnapshot(stack, deepClone(lesson), inferred);
  lastLessonHash[lessonId] = h;
  scheduleAutosave('lesson', { lessons: { [lessonId]: lesson } });
}

export function commitModuleChange(moduleId: string, category?: CommitCategory) {
  const pd = get(projectData);
  const mod = pd.modulesById[moduleId];
  if (!mod) return;
  const h = moduleHash(mod);
  if (lastModuleHash[moduleId] === h) return;
  const stack = moduleStacks[moduleId] ?? (moduleStacks[moduleId] = createStack<Module>());
  const prev = stack.past[stack.past.length - 1]?.data;
  const inferred = category ?? inferModuleCategory(prev, mod);
  pushSnapshot(stack, deepClone(mod), inferred);
  lastModuleHash[moduleId] = h;
  scheduleAutosave('module', { modules: { [moduleId]: mod } });
}

export function commitModuleStructure() {
  const pd = get(projectData);
  const snap: ModuleStructureSnapshot = {
    modulesOrder: deepClone(pd.course.modules),
    modulesById: deepClone(pd.modulesById)
  };
  pushSnapshot(moduleStructureStack, snap, 'structure');
  scheduleAutosave('module', { modules: snap.modulesById, course: { modules: snap.modulesOrder } });
}

// Undo/Redo ----------------------------------------------------------------------
export function canUndo(): boolean {
  const scope = get(focusScope);
  if (scope === 'page') {
    const id = get(currentPageId); if (!id) return false; const s = pageStacks[id]; return !!s && s.past.length > 1; // need previous state
  } else if (scope === 'lesson') {
    const id = get(currentLessonId); if (!id) return false; const s = lessonStacks[id]; return !!s && s.past.length > 1;
  } else if (scope === 'module') {
    const id = get(currentModuleId); if (!id) return false; const s = moduleStacks[id]; return !!s && s.past.length > 1;
  } else if (scope === 'timeline') {
    const id = get(selectedTimelineId); if (!id) return false; const s = timelineStacks[id]; return !!s && s.past.length > 1;
  } else { // stage
    const pid = get(currentPageId); if (!pid) return false; const s = stageStacks[pid]; return !!s && s.past.length > 1;
  }
}

export function canRedo(): boolean {
  const scope = get(focusScope);
  if (scope === 'page') {
    const id = get(currentPageId); if (!id) return false; const s = pageStacks[id]; return !!s && s.future.length > 0;
  } else if (scope === 'lesson') {
    const id = get(currentLessonId); if (!id) return false; const s = lessonStacks[id]; return !!s && s.future.length > 0;
  } else if (scope === 'module') {
    const id = get(currentModuleId); if (!id) return false; const s = moduleStacks[id]; return !!s && s.future.length > 0;
  } else if (scope === 'timeline') {
    const id = get(selectedTimelineId); if (!id) return false; const s = timelineStacks[id]; return !!s && s.future.length > 0;
  } else { // stage
    const pid = get(currentPageId); if (!pid) return false; const s = stageStacks[pid]; return !!s && s.future.length > 0;
  }
}

export function undo() {
  const scope = get(focusScope);
  if (scope === 'page') return undoPage();
  if (scope === 'lesson') return undoLesson();
  if (scope === 'module') return undoModule();
  if (scope === 'timeline') return undoTimeline();
  return undoStage();
}

export function redo() {
  const scope = get(focusScope);
  if (scope === 'page') return redoPage();
  if (scope === 'lesson') return redoLesson();
  if (scope === 'module') return redoModule();
  if (scope === 'timeline') return redoTimeline();
  return redoStage();
}

function undoPage() {
  const id = get(currentPageId); if (!id) return;
  const stack = pageStacks[id]; if (!stack || stack.past.length < 2) return; // need at least current + previous
  const currentSnap = stack.past.pop(); // remove current state
  if (currentSnap) stack.future.push(currentSnap); // move to future
  const target = stack.past[stack.past.length - 1];
  if (!target) return;
  projectData.update(p => { p.pagesById[id] = deepClone(target.data); return p; });
  scheduleAutosave('page', { pages: { [id]: target.data } });
}
function redoPage() {
  const id = get(currentPageId); if (!id) return;
  const stack = pageStacks[id]; if (!stack || stack.future.length === 0) return;
  const nextSnap = stack.future.pop()!;
  projectData.update(p => { p.pagesById[id] = deepClone(nextSnap.data); return p; });
  stack.past.push(nextSnap); // now this becomes current
  scheduleAutosave('page', { pages: { [id]: nextSnap.data } });
}

function undoLesson() {
  const id = get(currentLessonId); if (!id) return;
  const stack = lessonStacks[id]; if (!stack || stack.past.length < 2) return;
  const currentSnap = stack.past.pop();
  if (currentSnap) stack.future.push(currentSnap);
  const target = stack.past[stack.past.length - 1]; if (!target) return;
  projectData.update(p => { p.lessonsById[id] = deepClone(target.data); return p; });
  scheduleAutosave('lesson', { lessons: { [id]: target.data } });
}
function redoLesson() {
  const id = get(currentLessonId); if (!id) return;
  const stack = lessonStacks[id]; if (!stack || stack.future.length === 0) return;
  const nextSnap = stack.future.pop()!;
  projectData.update(p => { p.lessonsById[id] = deepClone(nextSnap.data); return p; });
  stack.past.push(nextSnap);
  scheduleAutosave('lesson', { lessons: { [id]: nextSnap.data } });
}

function undoModule() {
  // Module structure stack first
  if (moduleStructureStack.past.length > 1) {
    const currentPD = get(projectData);
    const currentSnap = moduleStructureStack.past.pop();
    if (currentSnap) moduleStructureStack.future.push(currentSnap);
    const target = moduleStructureStack.past[moduleStructureStack.past.length - 1];
    if (!target) return;

    projectData.update(p => { p.course.modules = deepClone(target.data.modulesOrder); p.modulesById = deepClone(target.data.modulesById); return p; });
    scheduleAutosave('module', { modules: target.data.modulesById, course: { modules: target.data.modulesOrder } });
    return;
  }
  const id = get(currentModuleId); if (!id) return;
  const stack = moduleStacks[id]; if (!stack || stack.past.length < 2) return;
  const currentSnap = stack.past.pop(); if (currentSnap) stack.future.push(currentSnap);
  const target = stack.past[stack.past.length - 1]; if (!target) return;
  projectData.update(p => { p.modulesById[id] = deepClone(target.data); return p; });
  scheduleAutosave('module', { modules: { [id]: target.data } });
}
function redoModule() {
  if (moduleStructureStack.future.length > 0) {
    const nextSnap = moduleStructureStack.future.pop()!;
    projectData.update(p => { p.course.modules = deepClone(nextSnap.data.modulesOrder); p.modulesById = deepClone(nextSnap.data.modulesById); return p; });
    moduleStructureStack.past.push(nextSnap);
    scheduleAutosave('module', { modules: nextSnap.data.modulesById, course: { modules: nextSnap.data.modulesOrder } });
    return;
  }
  const id = get(currentModuleId); if (!id) return;
  const stack = moduleStacks[id]; if (!stack || stack.future.length === 0) return;
  const nextSnap = stack.future.pop()!;
  projectData.update(p => { p.modulesById[id] = deepClone(nextSnap.data); return p; });
  stack.past.push(nextSnap);
  scheduleAutosave('module', { modules: { [id]: nextSnap.data } });
}

// Timeline history --------------------------------------------------------------
export function commitTimelineChange(timelineId: string, category: CommitCategory = 'timeline') {
  const rec = timelineData.getById(timelineId);
  if (!rec) return;
  const h = timelineHash(rec);
  if (lastTimelineHash[timelineId] === h) return;
  // If merged stage scope is active, commit to stage instead
  if (get(focusScope) === 'stage') {
    commitStageChange('timeline', category, timelineId);
    lastTimelineHash[timelineId] = h;
    return;
  }
  const stack = timelineStacks[timelineId] ?? (timelineStacks[timelineId] = createStack<TimelineRecord>());
  // Snapshot consists of timeline record and its clips
  const snap: any = { ...rec, __clips: timelineClips.getForTimeline(timelineId).map(c => ({ ...c })) };
  pushSnapshot(stack, snap, category);
  lastTimelineHash[timelineId] = h;
}

function undoTimeline() {
  const id = get(selectedTimelineId); if (!id) return;
  const stack = timelineStacks[id]; if (!stack || stack.past.length < 2) return;
  const currentSnap = stack.past.pop(); if (currentSnap) stack.future.push(currentSnap);
  const target = stack.past[stack.past.length - 1]; if (!target) return;
  timelineData.update(target.data as TimelineRecord);
  const clips = (target.data as any).__clips as any[] | undefined;
  if (clips) timelineClips.setForTimeline(id, clips as any);
}
function redoTimeline() {
  const id = get(selectedTimelineId); if (!id) return;
  const stack = timelineStacks[id]; if (!stack || stack.future.length === 0) return;
  const nextSnap = stack.future.pop()!;
  timelineData.update(nextSnap.data as TimelineRecord);
  const clips = (nextSnap.data as any).__clips as any[] | undefined;
  if (clips) timelineClips.setForTimeline(id, clips as any);
  stack.past.push(nextSnap);
}

// Stage undo/redo --------------------------------------------------------------
function undoStage() {
  const pid = get(currentPageId); if (!pid) return;
  const stack = stageStacks[pid]; if (!stack || stack.past.length < 2) return;
  const currentSnap = stack.past.pop(); if (currentSnap) stack.future.push(currentSnap);
  const target = stack.past[stack.past.length - 1]; if (!target) return;
  // Restore page
  projectData.update(p => { p.pagesById[target.data.pageId] = deepClone(target.data.page); return p; });
  // Restore timeline
  timelineData.update(deepClone(target.data.timeline));
  // Restore clips
  timelineClips.setForTimeline(target.data.timelineId, deepClone(target.data.clips) as any);
}
function redoStage() {
  const pid = get(currentPageId); if (!pid) return;
  const stack = stageStacks[pid]; if (!stack || stack.future.length === 0) return;
  const nextSnap = stack.future.pop()!;
  // Apply page
  projectData.update(p => { p.pagesById[nextSnap.data.pageId] = deepClone(nextSnap.data.page); return p; });
  // Apply timeline
  timelineData.update(deepClone(nextSnap.data.timeline));
  // Apply clips
  timelineClips.setForTimeline(nextSnap.data.timelineId, deepClone(nextSnap.data.clips) as any);
  stack.past.push(nextSnap);
}

// Convenience for external components
export function setFocusScope(scope: FocusScope) { focusScope.set(scope); }

// Debug helper
export function debugHistory() {
  return {
    focus: get(focusScope),
    pageStacks: Object.fromEntries(Object.entries(pageStacks).map(([k,v]) => [k,{past:v.past.length,future:v.future.length,lastCat:v.past[v.past.length-1]?.category}])),
    lessonStacks: Object.fromEntries(Object.entries(lessonStacks).map(([k,v]) => [k,{past:v.past.length,future:v.future.length,lastCat:v.past[v.past.length-1]?.category}])),
    moduleStacks: Object.fromEntries(Object.entries(moduleStacks).map(([k,v]) => [k,{past:v.past.length,future:v.future.length,lastCat:v.past[v.past.length-1]?.category}])),
    moduleStructure: { past: moduleStructureStack.past.length, future: moduleStructureStack.future.length },
    stageStacks: Object.fromEntries(Object.entries(stageStacks).map(([k,v]) => [k,{past:v.past.length,future:v.future.length,lastCat:v.past[v.past.length-1]?.category}]))
  };
}

// Initial notification
// addNotification({ type: 'info', message: 'Scoped history active (Stage 2)', ttl: 4000 });
