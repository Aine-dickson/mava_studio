/**
 * project.ts
 * ----------------------------------------------------------------------------
 * Central application state + mutation helpers for the editor.
 * Responsibilities:
 *  - Normalized project hierarchy (course -> modules -> lessons -> pages -> elements)
 *  - Element transform batching (rAF) with history integration (scoped via historyScoped.ts)
 *  - Spatial indexing + visibility culling for performant hit-testing / queries
 *  - Selection model (single + multi + collection isolation)
 *  - Grouping / collections: creation, auto-fit, scaling, isolation enter/exit
 *  - Alignment / distribution utilities (selection + collection members)
 *  - Drag/resize interaction lifecycle hooks (begin/update/end) used by stage
 *  - Alt‑drag duplication, undo-friendly structural mutations with commit helpers
 *  - Adaptive spatial index cell sizing + debug metrics for performance tuning
 *
 * NOTE: Keep pure data shape definitions in lib/schemas/*. This store focuses on
 * runtime mutation semantics and transient indexing structures.
 */
import { writable, derived, get } from 'svelte/store';
import { notifyLockedMultiSelect, notifyHiddenSelection } from './notifications';
import type { ProjectData, Course, Module, Lesson, Page } from '../lib/schemas/project';
import { CURRENT_PROJECT_VERSION } from '../lib/schemas/project';
import { validateAndMigrateProject } from '../lib/validation/projectValidation';
import type { Element, ElementType } from '../lib/schemas/element';
import { commitPageChange, commitLessonChange, commitModuleChange, commitModuleStructure, startPageTransform, endPageTransform, activeTransformPages, pendingTransformPages, startIsolation, endIsolation, type CommitCategory } from './historyScoped';
import { initIdCounters, generateModuleId, generateLessonId, generatePageId, generateElementId } from '../lib/id';
import { spatialSettings } from './settings';
import { visibilitySettings } from './visibility';

// Stage 6 (b) Debug Metrics -------------------------------------------------------
interface SpatialMetrics { builds: number; lastBuildMs: number; totalBuildMs: number; avgBuildMs: number; lastPageId: string | null; lastElements: number; lastCells: number; adaptations: number; lastAdaptReason: string | null; lastAdaptFrom: number | null; lastAdaptTo: number | null; }
interface TransformMetrics { frames: number; lastFlushMs: number; totalFlushMs: number; avgFlushMs: number; lastAppliedCount: number; totalApplied: number; }
interface QueryMetrics { rectCount: number; pointCount: number; hitTestCount: number; lastRectCandidates: number; totalRectCandidates: number; avgRectCandidates: number; lastHitTestCandidates: number; totalHitTestCandidates: number; avgHitTestCandidates: number; }
export interface DebugMetrics { spatial: SpatialMetrics; transforms: TransformMetrics; queries: QueryMetrics; }
function initialMetrics(): DebugMetrics { return { spatial: { builds: 0, lastBuildMs: 0, totalBuildMs: 0, avgBuildMs: 0, lastPageId: null, lastElements: 0, lastCells: 0, adaptations: 0, lastAdaptReason: null, lastAdaptFrom: null, lastAdaptTo: null }, transforms: { frames: 0, lastFlushMs: 0, totalFlushMs: 0, avgFlushMs: 0, lastAppliedCount: 0, totalApplied: 0 }, queries: { rectCount: 0, pointCount: 0, hitTestCount: 0, lastRectCandidates: 0, totalRectCandidates: 0, avgRectCandidates: 0, lastHitTestCandidates: 0, totalHitTestCandidates: 0, avgHitTestCandidates: 0 } }; }
const debugMetrics = writable<DebugMetrics>(initialMetrics());
export const metrics = derived(debugMetrics, m => m);
function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
/** Reset all debug performance counters. */
export function resetDebugMetrics() { debugMetrics.set(initialMetrics()); }
/** Return a shallow snapshot of current debug metrics (no reactive subscription). */
export function snapshotDebugMetrics(): DebugMetrics { return get(debugMetrics); }
function recordSpatialBuild(pageId: string, elapsed: number, elements: number, cells: number) { debugMetrics.update(m => { m.spatial.builds++; m.spatial.lastBuildMs = elapsed; m.spatial.totalBuildMs += elapsed; m.spatial.avgBuildMs = m.spatial.totalBuildMs / m.spatial.builds; m.spatial.lastPageId = pageId; m.spatial.lastElements = elements; m.spatial.lastCells = cells; return m; }); }
function recordSpatialAdaptation(from: number, to: number, reason: string) { debugMetrics.update(m => { m.spatial.adaptations++; m.spatial.lastAdaptFrom = from; m.spatial.lastAdaptTo = to; m.spatial.lastAdaptReason = reason; return m; }); }
function recordTransformFlush(elapsed: number, applied: number) { debugMetrics.update(m => { m.transforms.frames++; m.transforms.lastFlushMs = elapsed; m.transforms.totalFlushMs += elapsed; m.transforms.avgFlushMs = m.transforms.totalFlushMs / m.transforms.frames; m.transforms.lastAppliedCount = applied; m.transforms.totalApplied += applied; return m; }); }
function recordRectQuery(candidateCount: number) { debugMetrics.update(m => { m.queries.rectCount++; m.queries.lastRectCandidates = candidateCount; m.queries.totalRectCandidates += candidateCount; m.queries.avgRectCandidates = m.queries.totalRectCandidates / m.queries.rectCount; return m; }); }
function recordPointQuery() { debugMetrics.update(m => { m.queries.pointCount++; return m; }); }
function recordHitTest(candidateCount: number) { debugMetrics.update(m => { m.queries.hitTestCount++; m.queries.lastHitTestCandidates = candidateCount; m.queries.totalHitTestCandidates += candidateCount; m.queries.avgHitTestCandidates = m.queries.totalHitTestCandidates / m.queries.hitTestCount; return m; }); }

// ---- Helpers ----
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const STORAGE_KEY = 'studioProjectData';

// Legacy random ID generator removed (now using monotonic counters in lib/id.ts)

// Legacy history code removed.

// ---- Initial data + stores ----
function createInitialData(): ProjectData {
    const now = Date.now();
    const course: Course = {
        id: 'course-1',
        modules: [{ id: 'module-1', order: 1 }],
        cfNodeIds: [],
        metadata: {
            title: 'Untitled Course', description: '', duration: 0, version: 1,
            createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }, publishedAt: 'pending'
        }
    };
    const module: Module = {
        id: 'module-1', visible: true, lessons: [{ id: 'lesson-1', order: 1 }], metadata: {
            title: 'Module 1', description: '', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }
        }
    };
    const lesson: Lesson = {
        id: 'lesson-1', type: 'activity', visible: true, pages: [{ id: 'page-1', order: 1 }], metadata: {
            title: 'Lesson 1', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }
        }
    };
    const page: Page = {
        id: 'page-1', visible: true, elements: [], backgroundColor: '#ffffff', layouts: {
            desktop: { stageSize: { width: 1280, height: 720 }, elementProps: {} },
            tablet: { stageSize: { width: 1024, height: 768 }, elementProps: {} },
            mobile: { stageSize: { width: 375, height: 667 }, elementProps: {} }
        }, metadata: { title: 'Page 1', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' } }
    };
    return {
        projectVersion: CURRENT_PROJECT_VERSION,
        course,
        modulesById: { [module.id]: module },
        lessonsById: { [lesson.id]: lesson },
        pagesById: { [page.id]: page }
    };
}

export const projectData = writable<ProjectData>(createInitialData());
export const currentModuleId = writable<string>('module-1');
export const currentLessonId = writable<string>('lesson-1');
export const currentPageId = writable<string>('page-1');
export const currentPage = derived([projectData, currentPageId], ([p, id]) => p.pagesById[id]);
// Global selected element id (single-selection for now)
export const selectedElementId = writable<string | null>(null); // primary (last focused)
export const selectedElementIds = writable<Set<string>>(new Set()); // multi-selection
export const activeCollectionId = writable<string | null>(null); // isolation mode target collection

/** Clear both primary and multi-selection sets. */
export function clearSelection() { selectedElementIds.set(new Set()); selectedElementId.set(null); }
/**
 * Select a single element id.
 * additive=true toggles the id inside multi-selection while updating primary focus.
 */
export function selectElement(elementId: string | null, additive = false, allowHidden = false) {
    if (elementId == null) { clearSelection(); return; }
    const pid = get(currentPageId);
    const pg = get(projectData).pagesById[pid];
    const el: any = pg?.elements.find(e=>e.id===elementId);
    if (el) {
        if (el.visible === false && !allowHidden && get(selectedElementIds).size === 0 && !additive) {
            notifyHiddenSelection();
            return;
        }
        if (additive && el.locked && get(selectedElementIds).size > 0 && !get(selectedElementIds).has(elementId)) {
            notifyLockedMultiSelect();
            return;
        }
    }
    selectedElementId.set(elementId);
    if (additive) {
        selectedElementIds.update(s => { const n = new Set(s); if (n.has(elementId)) n.delete(elementId); else n.add(elementId); if (n.size === 0) selectedElementId.set(null); return n; });
    } else {
        selectedElementIds.set(new Set([elementId]));
    }
}

/** Explicit outline selection bypass for hidden elements (still respects locked multi-select rule). */
export function selectElementFromOutline(id: string) {
    selectElement(id, false, true);
}
/** Replace multi-selection with ordered ids (last becomes primary). */
export function setSelection(ids: string[]) {
    selectedElementIds.set(new Set(ids));
    selectedElementId.set(ids[ids.length-1] ?? null);
}
/** Toggle membership of element id within multi-selection. */
export function toggleElementSelection(id: string) { selectElement(id, true); }

/** Fast membership test for current selection. */
export function isElementSelected(id: string): boolean { let sel = get(selectedElementIds); return sel.has(id); }

/** Return a stable array copy of the current multi-selection set. */
export function getSelectionArray(): string[] { return Array.from(get(selectedElementIds)); }

/** Compute the axis-aligned bounding box of current selection (local coords, no transforms). */
export function selectionBoundingBox(pageId: string): { x:number; y:number; width:number; height:number } | null {
    const sel = get(selectedElementIds); if (!sel.size) return null;
    const p = get(projectData).pagesById[pageId]; if (!p) return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const id of sel) {
        const el:any = p.elements.find(e=>e.id===id); if (!el) continue;
        const x = el.position?.x ?? 0; const y = el.position?.y ?? 0;
        const w = el.size?.dimensions?.width ?? 0; const h = el.size?.dimensions?.height ?? 0;
        if (x < minX) minX = x; if (y < minY) minY = y; if (x+w > maxX) maxX = x+w; if (y+h > maxY) maxY = y+h;
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX-minX, height: maxY-minY };
}

// Stage 7: Indexing (element -> page) + page generation counters + element fingerprints
const elementToPage = new Map<string, string>();
const pageGeneration: Record<string, number> = {};
const elementFingerprint = new Map<string, string>(); // JSON stable fingerprint for transform/style quick diff

// Stage 6: Spatial Index & rAF Transform Batching ------------------------------------
// Replaced static constants with settings-driven values (see settings.ts)
let currentSpatial = { enabled: true, threshold: 80, cellSize: 128 };
spatialSettings.subscribe(v => { currentSpatial = v; });

// Stage 6 (c): Visibility Culling -----------------------------------------------------
// Maintain a viewport rect per page (single active viewport) and a derived set of
// element IDs considered visible (with margin). When enabled, query helpers can
// optionally filter to visible elements first to reduce candidate set.
interface ViewportRect { x: number; y: number; width: number; height: number; }
// Declare storage objects before subscription callback references them
const pageViewport: Record<string, ViewportRect> = {}; // logical scroll-space viewport for each page
const visibleElementsByPage: Record<string, Set<string>> = {}; // cached visibility sets
let currentVisibility = { enabled: true, margin: 120 };
visibilitySettings.subscribe(v => { currentVisibility = v; recomputeVisibleCacheForCurrentPage(); });

function getViewport(pageId: string): ViewportRect | null { return pageViewport[pageId] ?? null; }

export function updatePageViewport(pageId: string, rect: ViewportRect) {
    pageViewport[pageId] = rect; recomputeVisibleCache(pageId);
}

function recomputeVisibleCache(pageId: string) {
    if (!currentVisibility.enabled) { delete visibleElementsByPage[pageId]; return; }
    const rect = getViewport(pageId); if (!rect) { delete visibleElementsByPage[pageId]; return; }
    const page = get(projectData).pagesById[pageId]; if (!page) return;
    const m = currentVisibility.margin;
    const rx = rect.x - m, ry = rect.y - m, rw = rect.width + m*2, rh = rect.height + m*2;
    const set = visibleElementsByPage[pageId] ?? (visibleElementsByPage[pageId] = new Set());
    set.clear();
    for (const el of page.elements) {
        const ex = (el as any).position?.x ?? 0; const ey = (el as any).position?.y ?? 0;
        const ew = (el as any).size?.dimensions?.width ?? 0; const eh = (el as any).size?.dimensions?.height ?? 0;
        if (!(ex+ew < rx || ex > rx+rw || ey+eh < ry || ey > ry+rh)) set.add(el.id);
    }
}

function recomputeVisibleCacheForCurrentPage() { const pid = get(currentPageId); if (pid) recomputeVisibleCache(pid); }
export function getVisibleElementIds(pageId: string): Set<string> | null { return visibleElementsByPage[pageId] ?? null; }
export function isElementVisible(pageId: string, id: string): boolean { const set = visibleElementsByPage[pageId]; if (!set) return true; return set.has(id); }
// Incremental visibility helpers (added for Stage 6c incremental updates)

function elementWithinExtendedViewport(pageId: string, el: any): boolean { if (!currentVisibility.enabled) return true; const rect = getViewport(pageId); if (!rect) return true; const m = currentVisibility.margin; const rx = rect.x - m, ry = rect.y - m, rw = rect.width + m*2, rh = rect.height + m*2; const ex = el.position?.x ?? 0; const ey = el.position?.y ?? 0; const ew = el.size?.dimensions?.width ?? 0; const eh = el.size?.dimensions?.height ?? 0; return !(ex+ew < rx || ex > rx+rw || ey+eh < ry || ey > ry+rh); }
function updateVisibilityForElement(pageId: string, el: any) { if (!currentVisibility.enabled) return; const set = visibleElementsByPage[pageId]; if (!set) return; if (elementWithinExtendedViewport(pageId, el)) set.add(el.id); else set.delete(el.id); }
type CellKey = string; // "cx,cy"

interface PageSpatialIndex {
    cells: Map<CellKey, Set<string>>;      // cell -> elementIds
    elementCells: Map<string, CellKey[]>;  // elementId -> list of cells it occupies
    cellSize: number;                      // adaptive cell size used
}
const pageSpatial: Record<string, PageSpatialIndex> = {};
const pagesWithIndex = new Set<string>();
const pageCellSize: Record<string, number> = {}; // overrides per page

function getCellSize(pageId: string) { return pageCellSize[pageId] ?? currentSpatial.cellSize; }

function cellKey(cx: number, cy: number): CellKey { return cx+','+cy; }

function getOrCreatePageIndex(pageId: string): PageSpatialIndex {
    return pageSpatial[pageId] ?? (pageSpatial[pageId] = { cells: new Map(), elementCells: new Map(), cellSize: getCellSize(pageId) });
}

function pageEligibleForIndex(page: Page) { return currentSpatial.enabled && page.elements.length >= currentSpatial.threshold; }

function addElementToSpatial(pageId: string, el: Element) {
    const page = get(projectData).pagesById[pageId];
    if (!page || !pagesWithIndex.has(pageId)) return;
    const idx = getOrCreatePageIndex(pageId);
    const w = (el as any).size?.dimensions?.width ?? 0;
    const h = (el as any).size?.dimensions?.height ?? 0;
    const x = (el as any).position?.x ?? 0; const y = (el as any).position?.y ?? 0;
    const cs = idx.cellSize;
    const minCX = Math.floor(x / cs);
    const maxCX = Math.floor((x + w) / cs);
    const minCY = Math.floor(y / cs);
    const maxCY = Math.floor((y + h) / cs);
    const cells: CellKey[] = [];
    for (let cx=minCX; cx<=maxCX; cx++) {
        for (let cy=minCY; cy<=maxCY; cy++) {
            const key = cellKey(cx,cy);
            let set = idx.cells.get(key);
            if (!set) { set = new Set(); idx.cells.set(key, set); }
            set.add(el.id);
            cells.push(key);
        }
    }
    idx.elementCells.set(el.id, cells);
}

function removeElementFromSpatial(pageId: string, elementId: string) {
    const idx = pageSpatial[pageId]; if (!idx) return;
    const cells = idx.elementCells.get(elementId); if (!cells) return;
    for (const key of cells) { const set = idx.cells.get(key); if (set) { set.delete(elementId); if (!set.size) idx.cells.delete(key); } }
    idx.elementCells.delete(elementId);
}

function updateElementSpatial(pageId: string, el: Element) {
    if (!pagesWithIndex.has(pageId)) return;
    removeElementFromSpatial(pageId, el.id);
    addElementToSpatial(pageId, el);
}

function rebuildSpatialIndex(pageId: string) {
    const page = get(projectData).pagesById[pageId]; if (!page) return;
    if (!pageEligibleForIndex(page)) { pagesWithIndex.delete(pageId); delete pageSpatial[pageId]; delete pageCellSize[pageId]; return; }
    pagesWithIndex.add(pageId);
    let adapted = false;
    const attempt = () => {
        const idx = getOrCreatePageIndex(pageId); idx.cellSize = getCellSize(pageId); idx.cells.clear(); idx.elementCells.clear();
        const start = nowMs();
        for (const el of page.elements) addElementToSpatial(pageId, el as any);
        const elapsed = nowMs() - start;
        recordSpatialBuild(pageId, elapsed, page.elements.length, idx.cells.size);
        const cellCount = idx.cells.size || 1;
        const avg = page.elements.length / cellCount;
        const current = idx.cellSize;
        const MIN = 32, MAX = 256;
        let next = current;
        let reason: string | null = null;
        if (avg > 25 && current > MIN) { next = Math.max(MIN, Math.floor(current / 2)); reason = 'densely-populated-split'; }
        else if (avg < 4 && current < MAX && current < currentSpatial.cellSize) { next = Math.min(MAX, current * 2); reason = 'sparse-coarsen'; }
        if (!reason && idx.cells.size > page.elements.length * 4 && current < MAX) { next = Math.min(MAX, current * 2); reason = 'oversharding-coarsen'; }
        if (next !== current && !adapted) { pageCellSize[pageId] = next; adapted = true; if (reason) recordSpatialAdaptation(current, next, reason); attempt(); }
    };
    attempt();
}

// Adaptive info helper
export function getPageCellSize(pageId: string): number | null { return pagesWithIndex.has(pageId) ? (pageSpatial[pageId]?.cellSize ?? getCellSize(pageId)) : null; }

export function queryElementsInRect(pageId: string, x: number, y: number, w: number, h: number, _skipMetrics = false): string[] {
    const page = get(projectData).pagesById[pageId]; if (!page) return [];
    const vis = visibleElementsByPage[pageId];
    if (!pagesWithIndex.has(pageId)) {
        let base = page.elements;
        if (vis) base = base.filter(e => vis.has(e.id));
        const res = base.filter(e => overlaps(e as any,x,y,w,h)).map(e=>e.id);
        if (!_skipMetrics) recordRectQuery(page.elements.length);
        return res;
    }
    const idx = pageSpatial[pageId]; if (!idx) return [];
    const cs = idx.cellSize;
    const minCX = Math.floor(x / cs);
    const maxCX = Math.floor((x + w) / cs);
    const minCY = Math.floor(y / cs);
    const maxCY = Math.floor((y + h) / cs);
    const candidate = new Set<string>();
    for (let cx=minCX; cx<=maxCX; cx++) for (let cy=minCY; cy<=maxCY; cy++) {
        const set = idx.cells.get(cellKey(cx,cy)); if (set) for (const id of set) candidate.add(id);
    }
    const res: string[] = [];
    for (const id of candidate) { if (vis && !vis.has(id)) continue; const el = page.elements.find(e=>e.id===id) as any; if (el && overlaps(el,x,y,w,h)) res.push(id); }
    if (!_skipMetrics) recordRectQuery(candidate.size);
    return res;
}
export function queryElementsAtPoint(pageId: string, x: number, y: number): string[] {
    const results = queryElementsInRect(pageId, x, y, 1, 1, true);
    recordPointQuery();
    return results;
}
function overlaps(el: any, x: number, y: number, w: number, h: number) {
    const ex = el.position?.x ?? 0; const ey = el.position?.y ?? 0;
    const ew = el.size?.dimensions?.width ?? 0; const eh = el.size?.dimensions?.height ?? 0;
    return !(ex+ew < x || ex > x+w || ey+eh < y || ey > y+h);
}

// Hover hit-test utility ---------------------------------------------------------
export interface HitTestOptions { all?: boolean; includeHidden?: boolean; margin?: number; }
export function hitTestPoint(pageId: string, x: number, y: number, opts: HitTestOptions = {}): string[] | string | null {
    const { all = false, includeHidden = false, margin = 0 } = opts;
    const page = get(projectData).pagesById[pageId]; if (!page) return null;
    const candidateIds = pagesWithIndex.has(pageId) ? queryElementsAtPoint(pageId, x, y) : page.elements.map(e=>e.id);
    const vis = visibleElementsByPage[pageId];
    const filteredCandidates = vis ? candidateIds.filter(id => vis.has(id)) : candidateIds;
    if (!filteredCandidates.length) { recordHitTest(0); return null; }
    const hits: { id: string; z: number }[] = [];
    for (const id of filteredCandidates) {
        const el = page.elements.find(e=>e.id===id) as any; if (!el) continue;
        if (!includeHidden && el.visible === false) continue;
        if (pointInBox(el, x, y, margin)) hits.push({ id, z: el.zIndex ?? 0 });
    }
    if (!hits.length) { recordHitTest(filteredCandidates.length); return null; }
    hits.sort((a,b) => a.z - b.z);
    recordHitTest(filteredCandidates.length);
    // Topmost is last
    if (!all) return hits[hits.length-1].id;
    return hits.map(h => h.id);
}
function pointInBox(el: any, x: number, y: number, m: number) {
    const ex = el.position?.x ?? 0; const ey = el.position?.y ?? 0;
    const ew = el.size?.dimensions?.width ?? 0; const eh = el.size?.dimensions?.height ?? 0;
    return x >= ex - m && x <= ex + ew + m && y >= ey - m && y <= ey + eh + m;
}

// rAF transform batching ----------------------------------------------------------
interface PendingTransform { x?: number; y?: number; width?: number; height?: number; rotation?: number; }
const pendingTransforms = new Map<string, PendingTransform>();
let rafScheduled = false;
function applyPendingTransforms() {
    if (!pendingTransforms.size) return;
    const start = nowMs();
    let applied = 0;
    const parentsNeedingFit = new Set<string>();
    const changedPerPage = new Map<string, any[]>();
    projectData.update(p => {
        for (const [elId, change] of pendingTransforms) {
            const pageId = elementToPage.get(elId); if (!pageId) continue;
            const page = p.pagesById[pageId]; if (!page) continue;
            const el = page.elements.find(e=>e.id===elId) as any; if (!el) continue;
            if (change.x !== undefined || change.y !== undefined) {
                if (el.parentId) {
                    const parent:any = page.elements.find(e=>e.id===el.parentId);
                    if (parent) {
                            // If change.x/y provided they are already relative when setElementPositionDirect was called for children.
                            // Avoid reinterpreting relative as absolute; only recalc when both parent and explicit absolute flag present.
                            if (change.x !== undefined || change.y !== undefined) {
                                el.position = { x: change.x !== undefined ? change.x : el.position.x, y: change.y !== undefined ? change.y : el.position.y };
                            }
                        parentsNeedingFit.add(parent.id);
                    } else {
                        el.position = { x: change.x ?? el.position.x, y: change.y ?? el.position.y };
                    }
                } else {
                    el.position = { x: change.x ?? el.position.x, y: change.y ?? el.position.y };
                }
            }
            if (change.width !== undefined || change.height !== undefined) {
                const locked = el.size.locked ?? false;
                el.size = { dimensions: { width: change.width ?? el.size.dimensions.width, height: change.height ?? el.size.dimensions.height }, locked };
                if (el.parentId) parentsNeedingFit.add(el.parentId);
            }
            if (change.rotation !== undefined) {
                const norm = ((change.rotation % 360) + 360) % 360;
                el.rotation = norm;
            }
            if (pagesWithIndex.has(pageId)) updateElementSpatial(pageId, el);
            if (visibleElementsByPage[pageId]) { let arr = changedPerPage.get(pageId); if (!arr) { arr = []; changedPerPage.set(pageId, arr); } arr.push(el); }
            applied++;
            // Mark generation bump so commitPageChange sees difference
            incrementPageGeneration(pageId);
            // If not in an active transform session, commit immediately as a transform snapshot (squash window will coalesce rapid changes)
            if (!activeTransformPages.has(pageId)) {
                commitPageChange(pageId, 'transform');
            } else {
                pendingTransformPages.add(pageId);
            }
        }
        pendingTransforms.clear();
        // Auto-fit parents after all child changes
        for (const pid of parentsNeedingFit) {
            const parentPageId = elementToPage.get(pid); if (!parentPageId) continue;
            const page = p.pagesById[parentPageId]; if (!page) continue;
            const col:any = page.elements.find(e=>e.id===pid); if (!col || col.type!=='collection') continue;
            const members = col.memberIds.map((id:string)=> page.elements.find(e=>e.id===id)).filter(Boolean) as any[];
            if (members.length < 2) { // auto ungroup
                // reuse ungroup logic
                // Defer: simple inline ungroup
                const idx = page.elements.findIndex(e=>e.id===pid);
                if (idx !== -1) {
                    // Promote children to absolute
                    for (const m of members) {
                        m.position.x = col.position.x + m.position.x;
                        m.position.y = col.position.y + m.position.y;
                        delete m.parentId;
                    }
                    page.elements.splice(idx,1);
                }
                continue;
            }
            let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            for (const m of members) {
                const absX = col.position.x + m.position.x;
                const absY = col.position.y + m.position.y;
                const w = m.size.dimensions.width; const h = m.size.dimensions.height;
                if (absX < minX) minX = absX; if (absY < minY) minY = absY; if (absX+w>maxX) maxX = absX+w; if (absY+h>maxY) maxY = absY+h;
            }
            if (minX===Infinity) continue;
            const shiftX = minX - col.position.x;
            const shiftY = minY - col.position.y;
            if (shiftX || shiftY) {
                for (const m of members) { m.position.x -= shiftX; m.position.y -= shiftY; }
                col.position.x = minX; col.position.y = minY;
            }
            col.size.dimensions.width = maxX - minX;
            col.size.dimensions.height = maxY - minY;
        }
        return p;
    });
    const elapsed = nowMs() - start;
    recordTransformFlush(elapsed, applied);
    for (const [pageId, els] of changedPerPage) {
        const set = visibleElementsByPage[pageId]; if (!set) continue;
        const threshold = Math.max(50, set.size * 0.4);
        if (els.length > threshold) recomputeVisibleCache(pageId);
        else for (const el of els) updateVisibilityForElement(pageId, el);
    }
}

/** Schedule a single rAF to apply all pending element transform deltas. */
function scheduleTransformFlush() {
    if (rafScheduled) return; rafScheduled = true;
    requestAnimationFrame(() => { rafScheduled = false; applyPendingTransforms(); });
}

/** Force immediate application of pending transform deltas (used before history commit). */
export function flushPendingTransformsNow() { applyPendingTransforms(); }

/** Rebuild element->page and fingerprint caches (called after bulk loads). */
function rebuildIndexes(p: ProjectData) {
    elementToPage.clear();
    for (const [pid, raw] of Object.entries(p.pagesById)) {
        const page = raw as Page;
        if (!(pid in pageGeneration)) pageGeneration[pid] = 0;
        for (const el of page.elements) {
            elementToPage.set(el.id, pid);
            elementFingerprint.set(el.id, fingerprintElement(el));
        }
    }
}

function incrementPageGeneration(pid: string) { pageGeneration[pid] = (pageGeneration[pid] ?? 0) + 1; }

export function getPageGeneration(pid: string) { return pageGeneration[pid] ?? 0; }

/** Lightweight JSON signature for change detection (avoids deep diff on history). */
function fingerprintElement(el: Element): string {
    // Only include lightweight fields for transform/style detection
    const sig = {
        id: el.id,
        t: el.type,
        p: el.position,
        s: el.size?.dimensions,
        r: el.rotation,
        o: el.opacity,
        v: el.visible,
        l: el.locked,
        z: el.zIndex,
        st: el.style ? Object.keys(el.style).length : 0
    };
    return JSON.stringify(sig);
}

// Legacy historyManager removed in favor of scoped history (historyScoped.ts)

// ---- Editor operations ----
/** Ensure root project has at least one module/lesson/page scaffold. */
export function ensureDefaultStructure() {
    projectData.update((p) => {
        if (!p.course.modules.length) {
            p.course.modules.push({ id: 'module-1', order: 1 });
            p.modulesById['module-1'] = {
                id: 'module-1', visible: true, lessons: [{ id: 'lesson-1', order: 1 }], metadata: {
                    title: 'Module 1', description: '', duration: 0, version: 1, createdAt: Date.now(), updatedAt: Date.now(), lastEditedBy: { userId: 'system', name: 'System' }
                }
            } as Module;
        }
        const mod = p.modulesById[p.course.modules[0].id];
        if (!mod.lessons.length) {
            mod.lessons.push({ id: 'lesson-1', order: 1 });
            p.lessonsById['lesson-1'] = {
                id: 'lesson-1', type: 'activity', visible: true, pages: [{ id: 'page-1', order: 1 }], metadata: {
                    title: 'Lesson 1', duration: 0, version: 1, createdAt: Date.now(), updatedAt: Date.now(), lastEditedBy: { userId: 'system', name: 'System' }
                }
            } as Lesson;
        }
        const les = p.lessonsById[mod.lessons[0].id];
        if (!les.pages.length) {
            les.pages.push({ id: 'page-1', order: 1 });
            p.pagesById['page-1'] = {
                id: 'page-1', visible: true, elements: [], backgroundColor: '#ffffff',
                layouts: {
                    desktop: { stageSize: { width: 1280, height: 720 }, elementProps: {} },
                    tablet: { stageSize: { width: 1024, height: 768 }, elementProps: {} },
                    mobile: { stageSize: { width: 375, height: 667 }, elementProps: {} },
                },
                metadata: { title: 'Page 1', duration: 0, version: 1, createdAt: Date.now(), updatedAt: Date.now(), lastEditedBy: { userId: 'system', name: 'System' } }
            } as Page;
        }
    rebuildIndexes(p);
        return p;
    });
}

/** Set rotation (0-359). Normal interaction path should batch via transforms, but this direct helper is used by rotation handle & numeric input. */
export function setElementRotation(pageId: string, id: string, deg: number) {
    const norm = ((deg % 360) + 360) % 360;
    projectData.update(p => {
        const pg = p.pagesById[pageId]; if (!pg) return p;
        const el: any = pg.elements.find(e=>e.id===id); if(!el || el.locked) return p;
        if (el.rotation === norm) return p;
        el.rotation = norm;
        incrementPageGeneration(pageId);
        commitPageChange(pageId,'transform');
        return p;
    });
}

function cloneValue<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch {}
    }
    try { return JSON.parse(JSON.stringify(value)) as T; } catch {
        return value;
    }
}

function applyElementMutations(target: any, patch: Record<string, any>) {
    if (!patch || typeof patch !== 'object') return;
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
            }
            applyElementMutations(target[key], value as Record<string, any>);
        } else if (Array.isArray(value)) {
            target[key] = cloneValue(value);
        } else {
            target[key] = value;
        }
    }
}

export function patchElement(elementId: string, changes: Record<string, any>, opts?: { pageId?: string | null; reason?: CommitCategory }) {
    if (!changes || typeof changes !== 'object') return;
    const resolvedPageId = opts?.pageId ?? elementToPage.get(elementId) ?? get(currentPageId);
    if (!resolvedPageId) return;
    const reason: CommitCategory = opts?.reason ?? 'style';
    commitPageChange(resolvedPageId, reason);
    projectData.update((p) => {
        const page = p.pagesById[resolvedPageId]; if (!page) return p;
        const el: any = page.elements.find(e => e.id === elementId); if (!el || el.locked) return p;
        applyElementMutations(el, changes);
        incrementPageGeneration(resolvedPageId);
        elementFingerprint.set(elementId, fingerprintElement(el));
        if (pagesWithIndex.has(resolvedPageId)) updateElementSpatial(resolvedPageId, el);
        if (visibleElementsByPage[resolvedPageId]) updateVisibilityForElement(resolvedPageId, el);
        return p;
    });
}

// ---- Hierarchy creation helpers ----
export function createModule(): string {
    commitModuleStructure();
    let createdId = '';
    projectData.update((p) => {
    const id = generateModuleId(); createdId = id;
        const order = (p.course.modules[p.course.modules.length - 1]?.order ?? 0) + 1;
        const mod: Module = {
            id,
            visible: true,
            lessons: [],
            metadata: {
                title: '', // start empty for inline naming
                description: '',
                duration: 0,
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastEditedBy: { userId: 'system', name: 'System' }
            }
        };
        p.course.modules.push({ id, order });
        p.modulesById[id] = mod;
        // focus selection on the new module
        currentModuleId.set(id);
        return p;
    });
    return createdId;
}

export function createLesson(moduleId: string): string | null {
    commitModuleChange(moduleId);
    let createdId: string | null = null;
    projectData.update((p) => {
        const mod = p.modulesById[moduleId];
        if (!mod) return p;
    const id = generateLessonId(); createdId = id;
        const order = (mod.lessons[mod.lessons.length - 1]?.order ?? 0) + 1;
        const lesson: Lesson = {
            id,
            type: 'activity',
            visible: true,
            pages: [],
            metadata: {
                title: '', // start empty for inline naming
                duration: 0,
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastEditedBy: { userId: 'system', name: 'System' }
            }
        };
        mod.lessons.push({ id, order });
        p.lessonsById[id] = lesson;
        currentModuleId.set(moduleId);
        currentLessonId.set(id);
        return p;
    });
    return createdId;
}

export function createPage(lessonId: string): string | null {
    commitLessonChange(lessonId);
    let createdId: string | null = null;
    projectData.update((p) => {
        const les = p.lessonsById[lessonId];
        if (!les) return p;
    const id = generatePageId(); createdId = id;
        const order = (les.pages[les.pages.length - 1]?.order ?? 0) + 1;
        const page: Page = {
            id,
            visible: true,
            elements: [],
            backgroundColor: '#ffffff',
            layouts: {
                desktop: { stageSize: { width: 1280, height: 720 }, elementProps: {} },
                tablet: { stageSize: { width: 1024, height: 768 }, elementProps: {} },
                mobile: { stageSize: { width: 375, height: 667 }, elementProps: {} },
            },
            metadata: {
                title: '', // start empty for inline naming
                duration: 0,
                version: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastEditedBy: { userId: 'system', name: 'System' }
            }
        };
        les.pages.push({ id, order });
        p.pagesById[id] = page;
        currentLessonId.set(lessonId);
        currentPageId.set(id);
    pageGeneration[id] = 0;
        return p;
    });
    return createdId;
}

// --- Rename operations (VS Code style inline rename) ---------------------------
export function renameModule(moduleId: string, title: string) {
    commitModuleChange(moduleId);
    projectData.update(p => { const mod = p.modulesById[moduleId]; if (mod) { mod.metadata.title = title || mod.metadata.title; mod.metadata.updatedAt = Date.now(); } return p; });
}
export function renameLesson(lessonId: string, title: string) {
    const lesson = get(projectData).lessonsById[lessonId]; if (!lesson) return;
    commitLessonChange(lessonId);
    projectData.update(p => { const les = p.lessonsById[lessonId]; if (les) { les.metadata.title = title || les.metadata.title; les.metadata.updatedAt = Date.now(); } return p; });
}
export function renamePage(pageId: string, title: string) {
    commitPageChange(pageId, 'structure');
    projectData.update(p => { const pg = p.pagesById[pageId]; if (pg) { pg.metadata.title = title || pg.metadata.title; pg.metadata.updatedAt = Date.now(); } return p; });
}

// --- Reorder operations ---------------------------------------------------------
export function reorderModules(srcId: string, destId: string, before: boolean) {
    if (srcId === destId) return;
    commitModuleStructure();
    projectData.update(p => {
        const arr = p.course.modules;
        const si = arr.findIndex(r => r.id === srcId);
        const di = arr.findIndex(r => r.id === destId);
        if (si === -1 || di === -1) return p;
        const [item] = arr.splice(si,1);
        let insertIndex = di + (before ? 0 : 1);
        if (si < di) insertIndex--; // adjust after removal
        if (insertIndex < 0) insertIndex = 0; if (insertIndex > arr.length) insertIndex = arr.length;
        arr.splice(insertIndex,0,item);
        arr.forEach((r,i)=> r.order = i+1);
        return p;
    });
}

export function reorderLessons(moduleId: string, srcLessonId: string, destLessonId: string, before: boolean) {
    if (srcLessonId === destLessonId) return;
    commitModuleChange(moduleId);
    projectData.update(p => {
        const mod = p.modulesById[moduleId]; if (!mod) return p;
        const arr = mod.lessons;
        const si = arr.findIndex(r => r.id === srcLessonId);
        const di = arr.findIndex(r => r.id === destLessonId);
        if (si === -1 || di === -1) return p;
        const [item] = arr.splice(si,1);
        let insertIndex = di + (before ? 0 : 1);
        if (si < di) insertIndex--;
        if (insertIndex < 0) insertIndex = 0; if (insertIndex > arr.length) insertIndex = arr.length;
        arr.splice(insertIndex,0,item);
        arr.forEach((r,i)=> r.order = i+1);
        return p;
    });
}
export function reorderPages(lessonId: string, srcPageId: string, destPageId: string, before: boolean) {
    if (srcPageId === destPageId) return;
    commitLessonChange(lessonId);
    projectData.update(p => {
        const les = p.lessonsById[lessonId]; if (!les) return p;
        const arr = les.pages;
        const si = arr.findIndex(r => r.id === srcPageId);
        const di = arr.findIndex(r => r.id === destPageId);
        if (si === -1 || di === -1) return p;
        const [item] = arr.splice(si,1);
        let insertIndex = di + (before ? 0 : 1);
        if (si < di) insertIndex--;
        if (insertIndex < 0) insertIndex = 0; if (insertIndex > arr.length) insertIndex = arr.length;
        arr.splice(insertIndex,0,item);
        arr.forEach((r,i)=> r.order = i+1);
        return p;
    });
}

// Cross-parent moves -------------------------------------------------------------
export function moveLesson(lessonId: string, targetModuleId: string, destLessonId: string | null, before: boolean) {
    projectData.update(p => {
        // locate source module
        let sourceModuleId: string | null = null;
        for (const mRef of p.course.modules) {
            const mod = p.modulesById[mRef.id];
            if (mod.lessons.some(l => l.id === lessonId)) { sourceModuleId = mod.id; break; }
        }
        if (!sourceModuleId) return p;
        const sourceMod = p.modulesById[sourceModuleId]; const targetMod = p.modulesById[targetModuleId];
        if (!sourceMod || !targetMod) return p;
        if (sourceModuleId === targetModuleId && destLessonId) {
            // same parent case already handled by reorderLessons externally
            return p;
        }
        commitModuleChange(sourceModuleId); if (sourceModuleId !== targetModuleId) commitModuleChange(targetModuleId);
        // remove from source
        const idx = sourceMod.lessons.findIndex(l => l.id === lessonId);
        if (idx === -1) return p;
        const [ref] = sourceMod.lessons.splice(idx,1);
        sourceMod.lessons.forEach((r,i)=> r.order = i+1);
        // insert into target
        if (destLessonId) {
            const ti = targetMod.lessons.findIndex(l => l.id === destLessonId);
            let insertIndex = ti === -1 ? targetMod.lessons.length : ti + (before ? 0 : 1);
            if (insertIndex < 0) insertIndex = 0; if (insertIndex > targetMod.lessons.length) insertIndex = targetMod.lessons.length;
            targetMod.lessons.splice(insertIndex,0,ref);
        } else {
            targetMod.lessons.push(ref);
        }
        targetMod.lessons.forEach((r,i)=> r.order = i+1);
        // adjust current selections if needed
        if (get(currentLessonId) === lessonId) currentModuleId.set(targetModuleId);
        return p;
    });
}
export function movePage(pageId: string, targetLessonId: string, destPageId: string | null, before: boolean) {
    projectData.update(p => {
        // locate source lesson
        let sourceLessonId: string | null = null;
        for (const [lId, les] of Object.entries(p.lessonsById)) {
            if (les.pages.some(pr => pr.id === pageId)) { sourceLessonId = lId; break; }
        }
        if (!sourceLessonId) return p;
        const sourceLes = p.lessonsById[sourceLessonId]; const targetLes = p.lessonsById[targetLessonId];
        if (!sourceLes || !targetLes) return p;
        if (sourceLessonId === targetLessonId && destPageId) {
            return p; // same parent handled elsewhere
        }
        commitLessonChange(sourceLessonId); if (sourceLessonId !== targetLessonId) commitLessonChange(targetLessonId);
        const idx = sourceLes.pages.findIndex(pr => pr.id === pageId);
        if (idx === -1) return p;
        const [ref] = sourceLes.pages.splice(idx,1);
        sourceLes.pages.forEach((r,i)=> r.order = i+1);
        if (destPageId) {
            const ti = targetLes.pages.findIndex(pr => pr.id === destPageId);
            let insertIndex = ti === -1 ? targetLes.pages.length : ti + (before ? 0 : 1);
            if (insertIndex < 0) insertIndex = 0; if (insertIndex > targetLes.pages.length) insertIndex = targetLes.pages.length;
            targetLes.pages.splice(insertIndex,0,ref);
        } else {
            targetLes.pages.push(ref);
        }
        targetLes.pages.forEach((r,i)=> r.order = i+1);
        if (get(currentPageId) === pageId) currentLessonId.set(targetLessonId);
        return p;
    });
}

// ---- Hierarchy deletion helpers ----
export function deletePage(pageId: string) {
    // commit lesson before deletion for undo
    const lessonId = get(currentLessonId);
    if (lessonId) commitLessonChange(lessonId);
    projectData.update((p) => {
        // find lesson containing the page
        let parentLessonId: string | null = null;
        for (const [lId, rawLes] of Object.entries(p.lessonsById)) {
            const les = rawLes as Lesson;
            const idx = les.pages.findIndex((r: any) => r.id === pageId);
            if (idx !== -1) {
                parentLessonId = lId;
                les.pages.splice(idx, 1);
                break;
            }
        }
        const page = p.pagesById[pageId];
        if (page) {
            // remove element indexes
            for (const el of page.elements) elementToPage.delete(el.id);
            delete p.pagesById[pageId];
            delete pageGeneration[pageId];
        }
        if (get(currentPageId) === pageId) {
            // select first page of that lesson if exists
            if (parentLessonId) {
                const les = p.lessonsById[parentLessonId];
                const next = les.pages[0]?.id;
                if (next) currentPageId.set(next);
            }
        }
        return p;
    });
}

export function deleteLesson(lessonId: string) {
    // capture module before change
    const parentModuleId = get(currentModuleId);
    if (parentModuleId) commitModuleChange(parentModuleId);
    projectData.update((p) => {
        // find module containing the lesson
        let parentModuleId: string | null = null;
        for (const [mId, rawMod] of Object.entries(p.modulesById)) {
            const mod = rawMod as Module;
            const idx = mod.lessons.findIndex((r: any) => r.id === lessonId);
            if (idx !== -1) {
                parentModuleId = mId;
                mod.lessons.splice(idx, 1);
                break;
            }
        }
        const lesson = p.lessonsById[lessonId];
        if (lesson) {
            // delete pages under lesson
            for (const pr of lesson.pages) {
                const pg = p.pagesById[pr.id];
                if (pg) {
                    for (const el of pg.elements) elementToPage.delete(el.id);
                    delete p.pagesById[pr.id];
                    delete pageGeneration[pr.id];
                }
            }
            delete p.lessonsById[lessonId];
        }
        if (get(currentLessonId) === lessonId) {
            if (parentModuleId) {
                const mod = p.modulesById[parentModuleId];
                const next = mod.lessons[0]?.id;
                if (next) currentLessonId.set(next);
                const nextPage = next ? p.lessonsById[next]?.pages[0]?.id : undefined;
                if (nextPage) currentPageId.set(nextPage);
            }
        }
        return p;
    });
}

export function deleteModule(moduleId: string) {
    commitModuleStructure();
    projectData.update((p) => {
        // remove from course.modules
        const idx = p.course.modules.findIndex((r) => r.id === moduleId);
        if (idx !== -1) p.course.modules.splice(idx, 1);

        const mod = p.modulesById[moduleId];
        if (mod) {
            // delete lessons under module
            for (const lr of mod.lessons) {
                const lesson = p.lessonsById[lr.id];
                if (lesson) {
                    for (const pr of lesson.pages) {
                        const pg = p.pagesById[pr.id];
                        if (pg) {
                            for (const el of pg.elements) elementToPage.delete(el.id);
                            delete p.pagesById[pr.id];
                            delete pageGeneration[pr.id];
                        }
                    }
                    delete p.lessonsById[lr.id];
                }
            }
            delete p.modulesById[moduleId];
        }
        if (get(currentModuleId) === moduleId) {
            const next = p.course.modules[0]?.id;
            if (next) currentModuleId.set(next);
            const nextLesson = next ? p.modulesById[next]?.lessons[0]?.id : undefined;
            if (nextLesson) currentLessonId.set(nextLesson);
            const nextPage = nextLesson ? p.lessonsById[nextLesson]?.pages[0]?.id : undefined;
            if (nextPage) currentPageId.set(nextPage);
        }
        return p;
    });
}

// ---- Selection helpers ----
export function selectPage(pageId: string) {
    projectData.update((p) => {
        // find lesson and module containing this page
        let foundLessonId: string | null = null;
        let foundModuleId: string | null = null;
        for (const [lId, rawLes] of Object.entries(p.lessonsById)) {
            const les = rawLes as Lesson;
            if (les.pages.some((r: any) => r.id === pageId)) {
                foundLessonId = lId;
                break;
            }
        }
        if (foundLessonId) {
            for (const [mId, rawMod] of Object.entries(p.modulesById)) {
                const mod = rawMod as Module;
                if (mod.lessons.some((r: any) => r.id === foundLessonId)) {
                    foundModuleId = mId;
                    break;
                }
            }
        }
        if (foundModuleId) currentModuleId.set(foundModuleId);
        if (foundLessonId) currentLessonId.set(foundLessonId);
        currentPageId.set(pageId);
        return p;
    });
}

/** Insert a fully constructed element into a page (structure mutation + indexes). */
export function createElementOnPage(pageId: string, element: Element) {
    commitPageChange(pageId, 'structure');
    projectData.update((p) => {
        const page = p.pagesById[pageId];
        if (page) {
            page.elements.push(element);
            elementToPage.set(element.id, pageId);
            elementFingerprint.set(element.id, fingerprintElement(element));
            incrementPageGeneration(pageId);
            // Spatial index: if threshold crossed, build
            if (pageEligibleForIndex(page) && !pagesWithIndex.has(pageId)) rebuildSpatialIndex(pageId);
            else if (pagesWithIndex.has(pageId)) addElementToSpatial(pageId, element);
            if (visibleElementsByPage[pageId]) updateVisibilityForElement(pageId, element as any);
        }
        return p;
    });
}

// --- Elements Panel Helpers ------------------------------------------------------
let placementCounter = 0;
function nextPlacement() {
    const baseX = 40, baseY = 40, step = 32, rowWidth = 14;
    const x = baseX + (placementCounter % rowWidth) * step;
    const y = baseY + Math.floor(placementCounter / rowWidth) * step;
    placementCounter++;
    return { x, y };
}

/** Factory for default element payload per type (used by palette insertions). */
function defaultElementByType(type: ElementType): Omit<Element, 'id'> {
    const pos = nextPlacement();
    const common: any = {
        name: type.charAt(0).toUpperCase() + type.slice(1),
        type,
        position: pos,
        size: { dimensions: { width: 120, height: 80 }, locked: false },
        shadow: { color: 'rgba(0,0,0,0.15)', offsetX: 0, offsetY: 2, blur: 6 },
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 1
    };
    switch (type) {
        case 'rectangle':
            common.size.dimensions = { width: 160, height: 100 };
            common.style = { strokeColor: '#1f2937', fillColor: '#3b82f6', strokeWidth: 1, strokeStyle: 'solid', padding: { top:0,right:0,bottom:0,left:0 }, borderRadius: { dimensions: { topLeft:4, topRight:4, bottomRight:4, bottomLeft:4 }, locked: true } };
            break;
        case 'ellipse':
            common.size.dimensions = { width: 100, height: 100 };
            common.style = { strokeColor: '#1f2937', fillColor: '#f59e0b', strokeWidth: 1, strokeStyle: 'solid', padding: { top:0,right:0,bottom:0,left:0 }, borderRadius: { dimensions: { topLeft:50, topRight:50, bottomRight:50, bottomLeft:50 }, locked: true } };
            break;
        case 'line':
            common.size.dimensions = { width: 180, height: 4 };
            common.style = { strokeColor: '#1f2937', strokeWidth: 2, strokeStyle: 'solid' };
            break;
        case 'text':
            common.size.dimensions = { width: 220, height: 60 };
            common.style = { fontSize: 18, fontFamily: 'Inter, system-ui, sans-serif', color: '#111827', textAlign: 'left', fontWeight: 'normal', placement: 'top', highlight: { color: '#ffff00', start: 0, end: 0 }, content: 'New Text' };
            break;
        case 'image':
            common.size.dimensions = { width: 200, height: 140 };
            common.style = { src: '', alt: 'Image', fit: 'cover', borderRadius: 4, opacity: 1, filters: { brightness:100, contrast:100, grayscale:0, blur:0 } };
            break;
        case 'hotspot':
            common.size.dimensions = { width: 120, height: 80 };
            common.style = { strokeColor: '#dc2626', fillColor: 'rgba(220,38,38,0.15)', strokeWidth: 1, strokeStyle: 'dashed', padding: { top:0,right:0,bottom:0,left:0 }, borderRadius: { dimensions: { topLeft:4, topRight:4, bottomRight:4, bottomLeft:4 }, locked: true } };
            break;
        case 'collection':
            common.size.dimensions = { width: 240, height: 160 };
            common.style = { strokeColor: '#0f172a', fillColor: '#e2e8f0', strokeWidth: 2, strokeStyle: 'solid', padding: { top:4,right:4,bottom:4,left:4 }, borderRadius: { dimensions: { topLeft:6, topRight:6, bottomRight:6, bottomLeft:6 }, locked: true } };
            common.elements = [];
            break;
        default:
            break;
    }
    return common;
}

/** Create + insert a new element of given type (with optional overrides) returning new id. */
export function createElementOfType(type: ElementType, pageId: string, overrides: Partial<Element> = {}) {
    const base = defaultElementByType(type) as Element;
    const element: Element = { id: generateElementId(), ...(base as any), ...overrides };
    createElementOnPage(pageId, element);
    return element.id;
}

/** Delete a single element and update parent collection fit / selection. */
export function deleteElementById(elementId: string) {
    const pageId = elementToPage.get(elementId);
    if (!pageId) return;
    commitPageChange(pageId, 'structure');
    let parentCollectionId: string | null = null;
    projectData.update((p) => {
        const page = p.pagesById[pageId];
        if (!page) return p;
        const el:any = page.elements.find(e=>e.id===elementId);
        if (el?.parentId) parentCollectionId = el.parentId;
        const i = page.elements.findIndex((e) => e.id === elementId);
        if (i !== -1) page.elements.splice(i, 1);
	elementToPage.delete(elementId);
	elementFingerprint.delete(elementId);
        if (parentCollectionId) {
            const parent:any = page.elements.find(e=>e.id===parentCollectionId);
            if (parent && parent.type==='collection') parent.memberIds = parent.memberIds.filter((cid:string)=> cid !== elementId);
        }
        incrementPageGeneration(pageId);
        if (pagesWithIndex.has(pageId)) {
            removeElementFromSpatial(pageId, elementId);
            const page2 = p.pagesById[pageId];
            if (page2 && !pageEligibleForIndex(page2)) { pagesWithIndex.delete(pageId); delete pageSpatial[pageId]; }
        }
        if (visibleElementsByPage[pageId]) visibleElementsByPage[pageId].delete(elementId);
	// Update selection sets
	selectedElementIds.update(s => { if (!s.has(elementId)) return s; const n = new Set(s); n.delete(elementId); if (!n.size) selectedElementId.set(null); else if (!n.has(get(selectedElementId) || '')) selectedElementId.set(Array.from(n)[n.size-1]); return n; });
        return p;
    });
    if (parentCollectionId) {
        const pg = get(projectData).pagesById[pageId];
        const parent:any = pg?.elements.find(e=>e.id===parentCollectionId);
        if (parent && parent.type==='collection') {
            if (parent.memberIds.length < 2) ungroupCollection(parent.id); else refitCollection(parent.id);
        }
    }
}

// Batch delete (single history entry). Assumes all selected elements belong to the same page.
/** Batch delete (single history commit) for a selection array. */
export function deleteElements(ids: string[]) {
    if (!ids.length) return;
    const firstPage = elementToPage.get(ids[0]);
    if (!firstPage) return;
    // Verify all from same page; if not, filter to those that are.
    const filtered = ids.filter(id => elementToPage.get(id) === firstPage);
    if (!filtered.length) return;
    const affectedParents = new Set<string>();
    projectData.update(p => {
        const page = p.pagesById[firstPage]; if (!page) return p;
        let changed = false;
        for (const id of filtered) {
            const el:any = page.elements.find(e=>e.id===id);
            if (el?.parentId) affectedParents.add(el.parentId);
            const idx = page.elements.findIndex(e=>e.id===id);
            if (idx !== -1) { page.elements.splice(idx,1); changed = true; }
            elementToPage.delete(id);
            elementFingerprint.delete(id);
            if (pagesWithIndex.has(firstPage)) removeElementFromSpatial(firstPage, id);
            if (visibleElementsByPage[firstPage]) visibleElementsByPage[firstPage].delete(id);
        }
        for (const pid of affectedParents) {
            const parent:any = page.elements.find(e=>e.id===pid);
            if (parent && parent.type==='collection') parent.memberIds = parent.memberIds.filter((cid:string)=> !filtered.includes(cid));
        }
        if (changed) {
            incrementPageGeneration(firstPage);
        }
        return p;
    });
    // Clear selection and commit once
    clearSelection();
    commitPageChange(firstPage, 'structure');
    const pg = get(projectData).pagesById[firstPage];
    if (pg) {
        for (const pid of affectedParents) {
            const parent:any = pg.elements.find(e=>e.id===pid);
            if (parent && parent.type==='collection') {
                if (parent.memberIds.length < 2) ungroupCollection(parent.id); else refitCollection(parent.id);
            }
        }
    }
}

// Direct updates for drag/resize (no history); call commit via updateElementAfterInteraction when releasing pointer
/** Queue a position delta (used during interactive drag – no immediate history commit). */
export function setElementPositionDirect(elementId: string, x: number, y: number) {
    const pageId = elementToPage.get(elementId);
    if (!pageId) return;
    const pending = pendingTransforms.get(elementId) ?? {};
    pending.x = x; pending.y = y;
    pendingTransforms.set(elementId, pending);
    scheduleTransformFlush();
}

/** Queue a size delta (used during interactive resize). */
export function setElementSizeDirect(elementId: string, width: number, height: number) {
    const pageId = elementToPage.get(elementId);
    if (!pageId) return;
    const pending = pendingTransforms.get(elementId) ?? {};
    pending.width = width; pending.height = height;
    pendingTransforms.set(elementId, pending);
    scheduleTransformFlush();
}

/** Queue a rotation change (used during interactive rotation – no immediate history commit). */
export function setElementRotationDirect(elementId: string, deg: number) {
    const pageId = elementToPage.get(elementId);
    if (!pageId) return;
    const pending = pendingTransforms.get(elementId) ?? {};
    pending.rotation = deg;
    pendingTransforms.set(elementId, pending);
    scheduleTransformFlush();
}

/** toggleLocked
 * Flips locked state.
 * Performs an immutable update on page.elements so Svelte sees a change.
 * Commits a 'structure' history snapshot.
 */
export function toggleLocked() {
    if (!selectedElementId) return;
    const pid = get(currentPageId);
    projectData.update(p => {
        const page = p.pagesById[pid];
        // Replace the element entry immutably
        page.elements = page.elements.map(el =>
            
            el.id === get(selectedElementId) ? { ...el, locked: !el.locked } : el
        );
        return { ...p };
    });
    // No history commit for lock toggle (per requirement)
}

/** toggleVisibility
 * Flips visible state.
 * Performs an immutable update on page.elements so Svelte sees a change.
 * Commits a 'structure' history snapshot.
 */
export function toggleVisibility() {
    if (!selectedElementId) return;
    const pid = get(currentPageId);
    projectData.update(p => {
        const page = p.pagesById[pid];
        // Replace the element entry immutably
        page.elements = page.elements.map(el =>
            
            el.id === get(selectedElementId) ? { ...el, visible: !el.visible } : el
        );
        return { ...p };
    });
    // No history commit for visibility toggle
}

// Begin a drag/resize session (call on pointerdown)
/** Mark start of interactive element transform session (opens history scope). */
export function beginElementInteraction(elementId: string) {
    const pageId = elementToPage.get(elementId); if (!pageId) return;
    startPageTransform(pageId);
}
// Finish drag/resize session (call on pointerup) -> single history commit
/** Flush pending transform & close history scope for element interaction. */
export function updateElementAfterInteraction(elementId: string) {
    const pageId = elementToPage.get(elementId); if (!pageId) return;
    // Ensure final batched transforms are applied before committing history
    flushPendingTransformsNow();
    endPageTransform(pageId);
}

// --- Multi-select group transforms ---------------------------------------------
/** Begin a grouped transform session for current multi-selection. */
export function beginGroupInteraction() {
    const ids = Array.from(get(selectedElementIds));
    if (!ids.length) return;
    // Start transform session for the page of the first element (assumes single page selection)
    const pid = elementToPage.get(ids[0]); if (!pid) return;
    startPageTransform(pid);
}
/** Apply delta to every selected element (queued via transform batching). */
export function updateGroupPositions(deltaX: number, deltaY: number) {
    const ids = Array.from(get(selectedElementIds));
    for (const id of ids) {
        const pid = elementToPage.get(id); if (!pid) continue; // skip if missing
        const page = get(projectData).pagesById[pid]; if (!page) continue;
        const el: any = page.elements.find(e=>e.id===id); if (!el) continue;
        setElementPositionDirect(id, (el.position?.x ?? 0) + deltaX, (el.position?.y ?? 0) + deltaY);
    }
}
/** End grouped transform session committing a single history entry. */
export function endGroupInteraction() {
    const ids = Array.from(get(selectedElementIds));
    if (!ids.length) return;
    const pid = elementToPage.get(ids[0]); if (!pid) return;
    flushPendingTransformsNow();
    endPageTransform(pid);
}

// Marquee selection (returns selected IDs)
/** Marquee selection – returns element ids fully enclosed by drag rectangle. */
export function marqueeSelect(pageId: string, x1: number, y1: number, x2: number, y2: number, additive = false) {
    const minX = Math.min(x1,x2), minY = Math.min(y1,y2), maxX = Math.max(x1,x2), maxY = Math.max(y1,y2);
    const page = get(projectData).pagesById[pageId]; if (!page) return [];
    const hits: string[] = [];
    for (const el of page.elements) {
    if (el.visible === false) continue; // never pick hidden via marquee
    if (el.locked) continue; // always exclude locked from multi-selection
        const ex = el.position?.x ?? 0; const ey = el.position?.y ?? 0;
        const ew = el.size?.dimensions?.width ?? 0; const eh = el.size?.dimensions?.height ?? 0;
        if (ex >= minX && ey >= minY && (ex+ew) <= maxX && (ey+eh) <= maxY) hits.push(el.id);
    }
    if (additive) {
        selectedElementIds.update(s => { const n = new Set(s); for (const id of hits) { if (n.has(id)) n.delete(id); else n.add(id); } selectedElementId.set(hits[hits.length-1] ?? get(selectedElementId)); if (!n.size) selectedElementId.set(null); return n; });
    } else {
        setSelection(hits);
    }
    return hits;
}

// --- Alignment & Distribution ----------------------------------------------------
function withSelected(pageId: string, fn: (els: any[]) => void) {
    const sel = Array.from(get(selectedElementIds)); if (!sel.length) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const elements = page.elements.filter(e => sel.includes(e.id));
        if (elements.length < 2) return p;
        fn(elements);
        incrementPageGeneration(pageId);
        commitPageChange(pageId, 'transform');
        return p;
    });
}
/** Align currently selected elements to aggregate bounds along given axis. */
export function alignSelected(pageId: string, mode: 'left'|'right'|'top'|'bottom'|'hcenter'|'vcenter') {
    withSelected(pageId, (els) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const el of els) {
            const x = el.position?.x ?? 0; const y = el.position?.y ?? 0; const w = el.size?.dimensions?.width ?? 0; const h = el.size?.dimensions?.height ?? 0;
            if (x < minX) minX = x; if (y < minY) minY = y; if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
        }
        const midX = (minX + maxX) / 2; const midY = (minY + maxY) / 2;
    for (const el of els) {
            const w = el.size?.dimensions?.width ?? 0; const h = el.size?.dimensions?.height ?? 0;
            switch (mode) {
                case 'left': el.position.x = minX; break;
                case 'right': el.position.x = maxX - w; break;
                case 'top': el.position.y = minY; break;
                case 'bottom': el.position.y = maxY - h; break;
                case 'hcenter': el.position.x = Math.round(midX - w/2); break;
                case 'vcenter': el.position.y = Math.round(midY - h/2); break;
            }
        }
    });
}
/** Evenly distribute selected elements along axis (first & last fixed). */
export function distributeSelected(pageId: string, axis: 'horizontal'|'vertical') {
    withSelected(pageId, (els) => {
        if (els.length < 3) return; // need at least 3 to distribute
        // Sort by position primary axis
        els.sort((a:any,b:any) => axis==='horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y);
        const first = els[0]; const last = els[els.length-1];
        if (axis === 'horizontal') {
            const totalSpan = (last.position.x + last.size.dimensions.width) - first.position.x;
            const occupied = els.reduce((sum:any,el:any) => sum + el.size.dimensions.width, 0);
            const gap = (totalSpan - occupied) / (els.length - 1);
            let cursor = first.position.x + first.size.dimensions.width + gap;
            for (let i=1;i<els.length-1;i++) { const el:any = els[i]; el.position.x = Math.round(cursor); cursor += el.size.dimensions.width + gap; }
        } else {
            const totalSpan = (last.position.y + last.size.dimensions.height) - first.position.y;
            const occupied = els.reduce((sum:any,el:any) => sum + el.size.dimensions.height, 0);
            const gap = (totalSpan - occupied) / (els.length - 1);
            let cursor = first.position.y + first.size.dimensions.height + gap;
            for (let i=1;i<els.length-1;i++) { const el:any = els[i]; el.position.y = Math.round(cursor); cursor += el.size.dimensions.height + gap; }
        }
    });
}

// Stage-relative alignment for a single selected element (not multi). Used by RightPanel toolbar.
export function alignSingleToStage(pageId: string, mode: 'left'|'right'|'top'|'bottom'|'hcenter'|'vcenter') {
    const sel = Array.from(get(selectedElementIds));
    if (sel.length !== 1) return; // only when exactly one element selected
    const elId = sel[0];
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const el: any = page.elements.find(e=>e.id===elId); if (!el || el.locked) return p;
        const layout = page.layouts?.desktop?.stageSize || { width: 1280, height: 720 };
        const w = el.size?.dimensions?.width ?? 0; const h = el.size?.dimensions?.height ?? 0;
        switch(mode){
            case 'left': el.position.x = 0; break;
            case 'right': el.position.x = Math.max(0, layout.width - w); break;
            case 'top': el.position.y = 0; break;
            case 'bottom': el.position.y = Math.max(0, layout.height - h); break;
            case 'hcenter': el.position.x = Math.round((layout.width - w)/2); break;
            case 'vcenter': el.position.y = Math.round((layout.height - h)/2); break;
        }
        incrementPageGeneration(pageId);
        commitPageChange(pageId,'transform');
        return p;
    });
}

// Stage-relative distribution with a single element is a no-op; keep function for API symmetry.
export function nudgeSingleToStageDistribution(_pageId: string, _axis: 'horizontal'|'vertical') { /* intentional no-op */ }

// --- Collection member alignment/distribution (when a single collection is selected) ---
/** Align direct members of a collection (selection toolbar action). */
export function alignCollectionMembers(collectionId: string, mode: 'left'|'right'|'top'|'bottom'|'hcenter'|'vcenter') {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const collection: any = page.elements.find(e=>e.id===collectionId && e.type==='collection'); if (!collection) return p;
        const memberIds: string[] = collection.memberIds || [];
        if (memberIds.length < 2) return p; // nothing to align
        const members = page.elements.filter(e=>memberIds.includes(e.id));
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
        for (const m of members) {
            const x = m.position?.x ?? 0; const y = m.position?.y ?? 0; const w = m.size?.dimensions?.width ?? 0; const h = m.size?.dimensions?.height ?? 0;
            if (x < minX) minX = x; if (y < minY) minY = y; if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
        }
        const midX = (minX + maxX)/2; const midY = (minY + maxY)/2;
        for (const m of members) {
            const w = m.size?.dimensions?.width ?? 0; const h = m.size?.dimensions?.height ?? 0;
            switch (mode) {
                case 'left': m.position.x = minX; break;
                case 'right': m.position.x = maxX - w; break;
                case 'top': m.position.y = minY; break;
                case 'bottom': m.position.y = maxY - h; break;
                case 'hcenter': m.position.x = Math.round(midX - w/2); break;
                case 'vcenter': m.position.y = Math.round(midY - h/2); break;
            }
        }
        // Refit collection bounds after member realignment
        let cminX=Infinity,cminY=Infinity,cmaxX=-Infinity,cmaxY=-Infinity;
        for (const m of members) {
            const x = m.position.x; const y = m.position.y; const w = m.size.dimensions.width; const h = m.size.dimensions.height;
            if (x < cminX) cminX = x; if (y < cminY) cminY = y; if (x+w>cmaxX) cmaxX = x+w; if (y+h>cmaxY) cmaxY = y+h;
        }
        if (cminX!==Infinity) {
            collection.size.dimensions.width = cmaxX - cminX;
            collection.size.dimensions.height = cmaxY - cminY;
            // Shift collection position and normalize member coords
            collection.position.x += cminX;
            collection.position.y += cminY;
            for (const m of members) { m.position.x -= cminX; m.position.y -= cminY; }
        }
        incrementPageGeneration(pageId);
        commitPageChange(pageId, 'transform');
        return p;
    });
}

/** Distribute direct members of a collection along axis (requires >=3). */
export function distributeCollectionMembers(collectionId: string, axis: 'horizontal'|'vertical') {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const collection: any = page.elements.find(e=>e.id===collectionId && e.type==='collection'); if (!collection) return p;
        const memberIds: string[] = collection.memberIds || [];
        if (memberIds.length < 3) return p; // need at least 3
        const members = page.elements.filter(e=>memberIds.includes(e.id));
        if (members.length < 3) return p;
        if (axis==='horizontal') members.sort((a:any,b:any)=>a.position.x-b.position.x); else members.sort((a:any,b:any)=>a.position.y-b.position.y);
        const first = members[0]; const last = members[members.length-1];
        if (axis==='horizontal') {
            const totalSpan = (last.position.x + last.size.dimensions.width) - first.position.x;
            const occupied = members.reduce((s:any,m:any)=>s+m.size.dimensions.width,0);
            const gap = (totalSpan - occupied)/(members.length-1);
            let cursor = first.position.x + first.size.dimensions.width + gap;
            for (let i=1;i<members.length-1;i++){ const m:any = members[i]; m.position.x = Math.round(cursor); cursor += m.size.dimensions.width + gap; }
        } else {
            const totalSpan = (last.position.y + last.size.dimensions.height) - first.position.y;
            const occupied = members.reduce((s:any,m:any)=>s+m.size.dimensions.height,0);
            const gap = (totalSpan - occupied)/(members.length-1);
            let cursor = first.position.y + first.size.dimensions.height + gap;
            for (let i=1;i<members.length-1;i++){ const m:any = members[i]; m.position.y = Math.round(cursor); cursor += m.size.dimensions.height + gap; }
        }
        // Refit collection after distribution
        let cminX=Infinity,cminY=Infinity,cmaxX=-Infinity,cmaxY=-Infinity;
        for (const m of members) {
            const x = m.position.x; const y = m.position.y; const w = m.size.dimensions.width; const h = m.size.dimensions.height;
            if (x < cminX) cminX = x; if (y < cminY) cminY = y; if (x+w>cmaxX) cmaxX = x+w; if (y+h>cmaxY) cmaxY = y+h;
        }
        if (cminX!==Infinity) {
            collection.size.dimensions.width = cmaxX - cminX;
            collection.size.dimensions.height = cmaxY - cminY;
            collection.position.x += cminX;
            collection.position.y += cminY;
            for (const m of members) { m.position.x -= cminX; m.position.y -= cminY; }
        }
        incrementPageGeneration(pageId);
        commitPageChange(pageId, 'transform');
        return p;
    });
}

// --- Alt-drag duplication --------------------------------------------------------
/** Clone current selection (Alt-drag) – new ids become the active selection. */
export function duplicateSelectionForDrag(pageId: string): Record<string,string> {
    const sel = Array.from(get(selectedElementIds)); if (!sel.length) return {};
    const mapping: Record<string,string> = {};
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const clones: Element[] = [];
        for (const id of sel) {
            const src:any = page.elements.find(e=>e.id===id); if (!src) continue;
            const clone: any = JSON.parse(JSON.stringify(src));
            const newId = generateElementId();
            clone.id = newId;
            clones.push(clone);
            mapping[id] = newId;
        }
        // Append clones (could consider inserting after each original for z-order fidelity later)
        for (const c of clones) {
            page.elements.push(c);
            elementToPage.set(c.id, pageId);
            elementFingerprint.set(c.id, fingerprintElement(c));
        }
        incrementPageGeneration(pageId);
        // Select clones instead of originals
        selectedElementIds.set(new Set(Object.values(mapping)));
        selectedElementId.set(clones[clones.length-1]?.id ?? null);
        return p;
    });
    return mapping;
}

// Group currently selected elements into a single collection element (structure change)
/** Wrap current selection in a new collection (group) adjusting member coords. */
export function groupSelectedElements() {
    const sel = Array.from(get(selectedElementIds));
    if (sel.length < 2) return;
    const firstPage = sel.map(id=>elementToPage.get(id)).find(Boolean);
    if (!firstPage) return;
    const page = get(projectData).pagesById[firstPage]; if (!page) return;
    // Determine common parent (null root). All selected must share same parent.
    let parentRef: string | null = null;
    for (const id of sel) {
        const el:any = page.elements.find(e=>e.id===id); if (!el) return;
        const pid = el.parentId || null;
        if (parentRef === null) parentRef = pid; else if (parentRef !== pid) return; // mixed parents => abort
    }
    // Disallow selecting a collection itself
    if (sel.some(id => { const el:any = page.elements.find(e=>e.id===id); return el?.type==='collection'; })) return;
    // If inside a collection, disallow grouping all its direct children (redundant)
    if (parentRef) {
        const parent:any = page.elements.find(e=>e.id===parentRef);
        if (parent?.type==='collection') {
            const direct = parent.memberIds || [];
            const all = direct.length && direct.length === sel.length && sel.every(id=>direct.includes(id));
            if (all) return;
        }
    }
    // Compute bounding box
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const id of sel) {
        const el:any = page.elements.find(e=>e.id===id); if (!el) continue;
        const x = el.position?.x ?? 0; const y = el.position?.y ?? 0;
        const w = el.size?.dimensions?.width ?? 0; const h = el.size?.dimensions?.height ?? 0;
        if (x < minX) minX = x; if (y < minY) minY = y; if (x+w > maxX) maxX = x+w; if (y+h > maxY) maxY = y+h;
    }
    if (minX === Infinity) return;
    const id = generateElementId();
    const collection: any = {
        id,
        name: 'Group',
        type: 'collection',
        memberIds: sel,
        position: { x: minX, y: minY },
        size: { dimensions: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }, locked: false },
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 0,
        style: { strokeColor: '#334155', fillColor: 'rgba(226,232,240,0.35)', strokeWidth: 1, strokeStyle: 'dashed', padding: { top:4,right:4,bottom:4,left:4 }, borderRadius: { dimensions: { topLeft:4, topRight:4, bottomRight:4, bottomLeft:4 }, locked: true } }
    };
    projectData.update(p => {
        const pg = p.pagesById[firstPage]; if (!pg) return p;
        // If nested inside an existing collection, update that parent's member list
        if (parentRef) {
            const parent:any = pg.elements.find(e=>e.id===parentRef);
            if (parent?.type==='collection') {
                parent.memberIds = parent.memberIds.filter((cid:string)=> !sel.includes(cid));
                parent.memberIds.push(id);
                collection.parentId = parent.id;
            }
        }
        // Rebase children to new group's coordinate system
        for (const cid of sel) {
            const child:any = pg.elements.find(e=>e.id===cid); if (!child) continue;
            child.position.x = (child.position.x ?? 0) - minX;
            child.position.y = (child.position.y ?? 0) - minY;
            child.parentId = id;
        }
        pg.elements.push(collection);
        elementToPage.set(id, firstPage);
        elementFingerprint.set(id, fingerprintElement(collection));
        incrementPageGeneration(firstPage);
        commitPageChange(firstPage, 'structure');
        selectedElementIds.set(new Set([id]));
        selectedElementId.set(id);
        return p;
    });
}

/** Ungroup a collection, promoting members to root (or parent collection) space. */
export function ungroupCollection(collectionId: string) {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const idx = page.elements.findIndex(e=>e.id===collectionId);
        if (idx === -1) return p;
        const collection:any = page.elements[idx];
        if (collection?.type !== 'collection') return p;
        const memberIds: string[] = collection.memberIds || [];
        page.elements.splice(idx,1);
        // Promote children: convert positions to absolute and clear parentId
        for (const cid of memberIds) {
            const child:any = page.elements.find(e=>e.id===cid); if (!child) continue;
            child.position.x = collection.position.x + child.position.x;
            child.position.y = collection.position.y + child.position.y;
            delete child.parentId;
        }
        elementToPage.delete(collectionId);
        elementFingerprint.delete(collectionId);
        incrementPageGeneration(pageId);
        commitPageChange(pageId, 'structure');
        if (memberIds.length) { selectedElementIds.set(new Set(memberIds)); selectedElementId.set(memberIds[memberIds.length-1]); }
        else clearSelection();
        return p;
    });
}

// Enter / exit collection isolation (double-click logic handled in component)
/** Enter isolation mode for a collection (editing its descendants directly). */
export function enterCollectionIsolation(collectionId: string, initialChildId?: string) {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    activeCollectionId.set(collectionId);
    startIsolation(pageId);
    // Inside isolation, select children of collection
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const col:any = page.elements.find(e=>e.id===collectionId);
        if (col?.type==='collection') {
            if (initialChildId) {
                // Accept deep descendant (not only direct member)
                const memberSet = new Set<string>();
                const stack = [...(col.memberIds||[])];
                while (stack.length) {
                    const cid = stack.pop()!; memberSet.add(cid);
                    const child:any = page.elements.find(e=>e.id===cid);
                    if (child?.type==='collection' && Array.isArray(child.memberIds)) {
                        for (const mid of child.memberIds) if (!memberSet.has(mid)) stack.push(mid);
                    }
                }
                if (memberSet.has(initialChildId)) {
                    selectedElementIds.set(new Set([initialChildId]));
                    selectedElementId.set(initialChildId);
                } else {
                    clearSelection();
                }
            } else {
                clearSelection();
            }
        }
        return p;
    });
}
/** Exit isolation mode restoring selection to the collection container. */
export function exitCollectionIsolation() {
    const colId = get(activeCollectionId); if (!colId) return;
    const pageId = elementToPage.get(colId); if (pageId) endIsolation(pageId);
    activeCollectionId.set(null);
    // Restore selection to collection itself
    if (colId) { selectedElementIds.set(new Set([colId])); selectedElementId.set(colId); }
}

// Move collection (updates only collection position; children remain relative)
/** Translate a collection as a single unit (children remain relative). */
export function moveCollection(collectionId: string, dx: number, dy: number) {
    if (!dx && !dy) return;
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const col:any = page.elements.find(e=>e.id===collectionId); if (!col) return p;
        col.position.x += dx; col.position.y += dy;
        incrementPageGeneration(pageId); commitPageChange(pageId, 'transform');
        return p;
    });
}

// After child movement inside isolation, recompute collection auto-fit
/** Auto-fit collection bounds to tightly wrap current members (may ungroup). */
export function refitCollection(collectionId: string) {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const col:any = page.elements.find(e=>e.id===collectionId); if (!col) return p;
        if (col.type !== 'collection') return p;
        const members = col.memberIds.map((id:string)=> page.elements.find(e=>e.id===id)).filter(Boolean) as any[];
        if (members.length < 2) { // auto-ungroup condition
            ungroupCollection(collectionId);
            return p;
        }
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for (const m of members) {
            const ax = col.position.x + m.position.x;
            const ay = col.position.y + m.position.y;
            const w = m.size.dimensions.width; const h = m.size.dimensions.height;
            if (ax < minX) minX = ax; if (ay < minY) minY = ay; if (ax+w>maxX) maxX = ax+w; if (ay+h>maxY) maxY = ay+h;
        }
        if (minX===Infinity) return p;
        // Normalize: shift collection to new min, adjust member relative positions
        const shiftX = minX - col.position.x;
        const shiftY = minY - col.position.y;
        if (shiftX || shiftY) {
            for (const m of members) { m.position.x -= shiftX; m.position.y -= shiftY; }
            col.position.x = minX; col.position.y = minY;
        }
        col.size.dimensions.width = maxX - minX; col.size.dimensions.height = maxY - minY;
        incrementPageGeneration(pageId);
        commitPageChange(pageId, 'transform');
        return p;
    });
}

// Resize (scale) collection and its children
/** Scale a collection and proportionally scale + reposition its members. */
export function scaleCollection(collectionId: string, newW: number, newH: number, newX?: number, newY?: number, commit = true) {
    const pageId = elementToPage.get(collectionId); if (!pageId) return;
    projectData.update(p => {
        const page = p.pagesById[pageId]; if (!page) return p;
        const col:any = page.elements.find(e=>e.id===collectionId); if (!col) return p;
        const oldW = col.size.dimensions.width || 1;
        const oldH = col.size.dimensions.height || 1;
        if (newX !== undefined) col.position.x = Math.round(newX);
        if (newY !== undefined) col.position.y = Math.round(newY);
        const sx = newW / oldW; const sy = newH / oldH;
        const members = col.memberIds.map((id:string)=> page.elements.find(e=>e.id===id)).filter(Boolean) as any[];
        for (const m of members) {
            m.position.x = Math.round(m.position.x * sx);
            m.position.y = Math.round(m.position.y * sy);
            m.size.dimensions.width = Math.max(1, Math.round(m.size.dimensions.width * sx));
            m.size.dimensions.height = Math.max(1, Math.round(m.size.dimensions.height * sy));
        }
        col.size.dimensions.width = Math.round(newW);
        col.size.dimensions.height = Math.round(newH);
        incrementPageGeneration(pageId);
        if (commit) commitPageChange(pageId, 'transform');
        return p;
    });
}

// Load saved project if available (was inside legacy history manager)
// Re-run validation load path manually
if (typeof window !== 'undefined') {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const result = validateAndMigrateProject(parsed);
            if (result.ok && result.data) {
                const pd = result.data;
                normalizeLegacyIds(pd);
                projectData.set(pd);
                rebuildIndexes(pd);
                initIdCounters(pd);
            }
        }
    } catch (e) { console.warn('Initial load failed', e); }
}
if (typeof window !== 'undefined') {
    const pd = get(projectData);
    normalizeLegacyIds(pd);
    projectData.set(pd);
    rebuildIndexes(pd);
    initIdCounters(pd);
}

// Lazy legacy ID migration (runs on access / startup) ---------------------------------
function normalizeLegacyIds(p: ProjectData) {
    const modIdMap: Record<string,string> = {};
    const lessonIdMap: Record<string,string> = {};
    const pageIdMap: Record<string,string> = {};
    const isNew = (id: string, prefix: string) => id.startsWith(prefix);

    // Modules
    for (const entry of p.course.modules) {
        const oldId = entry.id;
        if (!isNew(oldId,'m_')) {
            const newId = generateModuleId();
            entry.id = newId;
            const modObj = p.modulesById[oldId];
            if (modObj) {
                modObj.id = newId;
                p.modulesById[newId] = modObj;
                delete p.modulesById[oldId];
            }
            modIdMap[oldId] = newId;
        }
    }
    // Lessons
    for (const mod of Object.values(p.modulesById)) {
        for (const lRef of mod.lessons) {
            const oldL = lRef.id;
            if (!isNew(oldL,'l_')) {
                const newL = generateLessonId();
                lRef.id = newL;
                const lessonObj = p.lessonsById[oldL];
                if (lessonObj) {
                    lessonObj.id = newL;
                    p.lessonsById[newL] = lessonObj;
                    delete p.lessonsById[oldL];
                }
                lessonIdMap[oldL] = newL;
            }
        }
    }
    // Pages
    for (const lesson of Object.values(p.lessonsById)) {
        for (const pRef of lesson.pages) {
            const oldP = pRef.id;
            if (!isNew(oldP,'p_')) {
                const newP = generatePageId();
                pRef.id = newP;
                const pageObj = p.pagesById[oldP];
                if (pageObj) {
                    pageObj.id = newP;
                    p.pagesById[newP] = pageObj;
                    delete p.pagesById[oldP];
                }
                pageIdMap[oldP] = newP;
            }
        }
    }
    if (modIdMap[get(currentModuleId)]) currentModuleId.set(modIdMap[get(currentModuleId)]);
    if (lessonIdMap[get(currentLessonId)]) currentLessonId.set(lessonIdMap[get(currentLessonId)]);
    if (pageIdMap[get(currentPageId)]) currentPageId.set(pageIdMap[get(currentPageId)]);
}
