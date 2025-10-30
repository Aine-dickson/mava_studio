<script lang="ts">
/**
 * CreateStage.svelte
 * ---------------------------------------------------------------------------
 * Core interactive canvas for the editor. Responsibilities:
 *  - Rendering root elements & collections (nesting supported via parentId)
 *  - Pointer & keyboard interaction: selection, multi-select drag, snapping,
 *    resize (single + group + collection), duplication (Alt-drag), isolation
 *    mode (double-click collection) which lets you edit its descendants with
 *    absolute positioning relative to the stage while preserving relative
 *    storage coordinates.
 *  - Visual affordances: selection overlays, resize handles, snapping guides,
 *    group bounding box + toolbar, collection toolbars & frame.
 *  - Delegates all persistent mutation & history to project store helpers to
 *    keep this component focused on ephemeral UI state + geometry math.
 *
 * Important coordinate model notes:
 *  - Root elements store absolute (stage) coordinates.
 *  - Nested elements store position relative to their immediate parent
 *    collection.
 *  - In isolation mode we treat children as if they were absolutely positioned
 *    (we temporarily add parent absolute offset during interaction) to make
 *    snapping and drag math consistent. On commit the parent offset is removed.
 *
 * Snapping strategy:
 *  - computeSnapsForBox returns the potentially adjusted top-left (x,y) and a
 *    small set of guide lines (v/h) capturing where alignment occurred.
 *  - Movement & resize interactions maintain a hysteresis lock: once the delta
 *    between raw and snapped position is within threshold we lock until the
 *    pointer exceeds threshold + SNAP_RELEASE_EXTRA (prevents jitter when near
 *    a guide).
 *
 * Group resizing:
 *  - Applies proportional scaling and translation of each element relative to
 *    the original group bounding box. Each element's new position/size are
 *    recalculated every frame; final values are committed via flush + endGroupInteraction.
 *
 * Collections:
 *  - Have their own drag/resize pipeline outside isolation (they behave as a
 *    single element). In isolation their members are directly manipulated.
 *  - Double-click detection uses time + movement tolerance to avoid accidental
 *    isolation while initiating drags.
 *
 * Keyboard shortcuts:
 *  - Ctrl/Cmd + A: select all elements.
 *  - Ctrl/Cmd + G: group current multi-selection.
 *  - Arrow keys (with Shift = 10x, Ctrl/Cmd = 2x multiplier) nudge selection.
 *  - Escape: exit collection isolation.
 *  - Delete / Backspace: delete selected elements.
 */

	import { get } from 'svelte/store';
	import { currentAlive } from '../stores/timelineAlive';
	import { onDestroy } from 'svelte';
	import { projectData, currentPageId, ensureDefaultStructure, setElementPositionDirect, setElementSizeDirect, updateElementAfterInteraction, selectedElementId, selectElement, deleteElementById, beginElementInteraction, selectedElementIds, toggleElementSelection, marqueeSelect, beginGroupInteraction, updateGroupPositions, endGroupInteraction, selectionBoundingBox, getSelectionArray, flushPendingTransformsNow, setSelection, activeCollectionId, enterCollectionIsolation, exitCollectionIsolation, moveCollection, scaleCollection, groupSelectedElements, setElementRotationDirect } from '../stores/project';
	import { setElementRotation } from '../stores/project';
	import UnifiedToolbar from './UnifiedToolbar.svelte';
	import { interactable } from '../lib/actions/interactable';
	import type { Element } from '../lib/schemas/element';

	const uid = () => Math.random().toString(36).slice(2, 9);

	let container: HTMLDivElement;

	/** Convenience accessor for the active page object. */
	function page() { return get(projectData).pagesById[get(currentPageId)]; }

	let selectedId = $state<string | null>(null);

	$effect(() => { selectedId = $selectedElementId; });

	/**
	 * Handle background stage clicks:
	 *  - Exit isolation if click occurs outside active collection bounds.
	 *  - Clear selection when clicking empty space.
	 */
	function handleStageClick(e: MouseEvent) {
		const stageRect = container.getBoundingClientRect();
		const relX = e.clientX - stageRect.left;
		const relY = e.clientY - stageRect.top;
		let exited = false;
		if ($activeCollectionId) {
			const pg = page();
			const col:any = pg?.elements.find(el=>el.id===$activeCollectionId);
			if (col) {
				if (!(relX >= col.position.x && relX <= col.position.x + col.size.dimensions.width && relY >= col.position.y && relY <= col.position.y + col.size.dimensions.height)) {
					exitCollectionIsolation();
					exited = true;
				}
			}
		}
		if (e.target === container || exited) {
			selectElement(null);
		}
	}

	// --- Group Drag State (multi-selection movement) ---
	let groupDrag = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, origBox: null as null | { x:number;y:number;width:number;height:number } };
	// snapGuides hold gap (range omitted where dragged selection sits)
	// Active snapping guides displayed on the canvas.
	let snapGuides = $state<{ type:'v'|'h'; pos:number; gap:[number,number]; from:number; to:number }[]>([]);
	// Angle HUD shown while rotating (single: absolute, group: delta)
	let angleHUD = $state<{ show:boolean; text:string; x:number; y:number }>({ show:false, text:'', x:0, y:0 });
	// Hysteresis settings
	const SNAP_RELEASE_EXTRA = 4; // extra px beyond threshold to release lock
	interface SnapLock { x:boolean; y:boolean; tx:number; ty:number; }
	let groupSnapLock: SnapLock = { x:false, y:false, tx:0, ty:0 };

	// Collection dragging state (outside isolation when a collection is selected)
	// Collection dragging (outside isolation – treat collection as a single element)
	let collectionDrag: { id:string; startX:number; startY:number; origX:number; origY:number; snap:SnapLock; } | null = null;

	// Group resize state
	// Group resize (multi-selection bounding box scaling)
	let groupResize: {
		dir: string;
		startX: number; startY: number;
		origBox: { x:number;y:number;width:number;height:number };
		elems: { id:string; x:number; y:number; w:number; h:number }[];
	} | null = null;

	// Group rotation state
	let groupRotate: { center:{x:number;y:number}; startAngle:number; initial: Record<string, number>; ids: string[] } | null = null;

	/**
	 * Compute potential snap adjustments for a rectangular box.
	 * Considers:
	 *  - Edges & centers of all non-selected elements.
	 *  - Stage edges (0, mid, max) as fallback when no element alignment occurs.
	 * Returns adjusted x/y (if snapped) plus guide line descriptors for painting.
	 */
	function computeSnapsForBox(pageId: string, x: number, y: number, w: number, h: number) {
		const p = get(projectData).pagesById[pageId]; if (!p) return { x, y, guides: [] as any[] };
		const sel = new Set(Array.from($selectedElementIds));
		const threshold = 6;
		let bestVX: { target:number; adjust:number; from:number; to:number } | null = null;
		let bestHY: { target:number; adjust:number; from:number; to:number } | null = null;
		const left = x, right = x + w, midX = x + w/2;
		const top = y, bottom = y + h, midY = y + h/2;
		// Stage bounds fallback (treat as lines at 0 and a large extent)
		const stageWidth = container?.clientWidth ?? 0;
		const stageHeight = container?.clientHeight ?? 0;
		function considerV(target:number, adjust:number, spanFrom:number, spanTo:number) {
			if (Math.abs(adjust) <= threshold && (!bestVX || Math.abs(adjust) < Math.abs(bestVX.adjust))) {
				bestVX = { target, adjust, from: spanFrom, to: spanTo };
			}
		}
		function considerH(target:number, adjust:number, spanFrom:number, spanTo:number) {
			if (Math.abs(adjust) <= threshold && (!bestHY || Math.abs(adjust) < Math.abs(bestHY.adjust))) {
				bestHY = { target, adjust, from: spanFrom, to: spanTo };
			}
		}
		for (const el of p.elements) {
			if (sel.has(el.id)) continue;
			const ex = el.position.x, ey = el.position.y, ew = el.size.dimensions.width, eh = el.size.dimensions.height;
			const cx = [ex, ex + ew/2, ex + ew];
			for (const c of cx) {
				considerV(c, c - left, ey, ey + eh);
				considerV(c, c - midX, ey, ey + eh);
				considerV(c, c - right, ey, ey + eh);
			}
			const cy = [ey, ey + eh/2, ey + eh];
			for (const c of cy) {
				considerH(c, c - top, ex, ex + ew);
				considerH(c, c - midY, ex, ex + ew);
				considerH(c, c - bottom, ex, ex + ew);
			}
		}
		// Fallback to stage edges if no element alignment found
		if (!bestVX && stageWidth) {
			considerV(0, 0 - left, 0, stageHeight);
			considerV(stageWidth/2, stageWidth/2 - midX, 0, stageHeight);
			considerV(stageWidth, stageWidth - right, 0, stageHeight);
		}
		if (!bestHY && stageHeight) {
			considerH(0, 0 - top, 0, stageWidth);
			considerH(stageHeight/2, stageHeight/2 - midY, 0, stageWidth);
			considerH(stageHeight, stageHeight - bottom, 0, stageWidth);
		}
		if (bestVX) x += bestVX.adjust;
		if (bestHY) y += bestHY.adjust;
		const guides: { type:'v'|'h'; pos:number; gap:[number,number]; from:number; to:number }[] = [];
		if (bestVX) guides.push({ type:'v', pos: bestVX.target, gap:[y, y + h], from: bestVX.from, to: bestVX.to });
		if (bestHY) guides.push({ type:'h', pos: bestHY.target, gap:[x, x + w], from: bestHY.from, to: bestHY.to });
		return { x, y, guides };
	}

	/** Begin multi-selection drag interaction. */
	function onGroupPointerDown(e: PointerEvent) {
		if ($selectedElementIds.size < 2) return;
		// Prevent group drag if any locked element is part of multi-selection (locked elements cannot move)
		const pid = get(currentPageId);
		const pg = get(projectData).pagesById[pid];
		if (Array.from($selectedElementIds).some(id => { const el:any = pg.elements.find(e=>e.id===id); return el?.locked; })) {
			return; // silently ignore drag start
		}
		if (e.altKey) {
			import('../stores/project').then(m => { const pid = get(currentPageId); m.duplicateSelectionForDrag(pid); });
		}
		groupDrag.active = true;
		groupDrag.startX = e.clientX;
		groupDrag.startY = e.clientY;
		groupDrag.lastX = e.clientX;
		groupDrag.lastY = e.clientY;
		groupDrag.origBox = selectionBox && { ...selectionBox };
		groupSnapLock = { x:false, y:false, tx:0, ty:0 };
		beginGroupInteraction();
		window.addEventListener('pointermove', onGroupPointerMove);
		window.addEventListener('pointerup', onGroupPointerUp, { once: true });
	}
	/** Update positions of all selected elements while dragging group box. */
	function onGroupPointerMove(e: PointerEvent) {
		if (!groupDrag.active || !selectionBox || !groupDrag.origBox) return;
		const totalDx = e.clientX - groupDrag.startX;
		const totalDy = e.clientY - groupDrag.startY;
		const proposedXRaw = groupDrag.origBox.x + totalDx;
		const proposedYRaw = groupDrag.origBox.y + totalDy;
		const snap = computeSnapsForBox(get(currentPageId), proposedXRaw, proposedYRaw, groupDrag.origBox.width, groupDrag.origBox.height);
		let finalX = proposedXRaw;
		let finalY = proposedYRaw;
		const threshold = 6;
		const gx = snap.guides.find(g=>g.type==='v');
		const gy = snap.guides.find(g=>g.type==='h');
		// Vertical axis (x)
		if (gx) {
			const diff = snap.x - proposedXRaw;
			if (!groupSnapLock.x && Math.abs(diff) <= threshold) { groupSnapLock.x = true; groupSnapLock.tx = snap.x; }
		}
		if (groupSnapLock.x) {
			if (Math.abs(proposedXRaw - groupSnapLock.tx) > threshold + SNAP_RELEASE_EXTRA) {
				groupSnapLock.x = false;
			} else finalX = groupSnapLock.tx;
		}
		// Horizontal axis (y)
		if (gy) {
			const diffY = snap.y - proposedYRaw;
			if (!groupSnapLock.y && Math.abs(diffY) <= threshold) { groupSnapLock.y = true; groupSnapLock.ty = snap.y; }
		}
		if (groupSnapLock.y) {
			if (Math.abs(proposedYRaw - groupSnapLock.ty) > threshold + SNAP_RELEASE_EXTRA) {
				groupSnapLock.y = false;
			} else finalY = groupSnapLock.ty;
		}
		// Build guides only for locked axes
		const guidesOut: typeof snap.guides = [];
		if (groupSnapLock.x && gx) guidesOut.push(gx);
		if (groupSnapLock.y && gy) guidesOut.push(gy);
		const dxApplied = finalX - selectionBox.x;
		const dyApplied = finalY - selectionBox.y;
		if (dxApplied || dyApplied) updateGroupPositions(dxApplied, dyApplied);
		selectionBox = { ...selectionBox, x: finalX, y: finalY };
		snapGuides = guidesOut;
	}
	/** Finalize group drag, clearing guides + interaction state. */
	function onGroupPointerUp() {
		if (!groupDrag.active) return;
		groupDrag.active = false;
		snapGuides = [];
		endGroupInteraction();
		window.removeEventListener('pointermove', onGroupPointerMove);
	}

	/** Start collection drag (non-isolated). */
	function beginCollectionDrag(e:PointerEvent, col:any) {
		// Only when selected and not in isolation
		if ($activeCollectionId) return;
		collectionDrag = { id: col.id, startX: e.clientX, startY: e.clientY, origX: col.position.x, origY: col.position.y, snap: { x:false,y:false,tx:0,ty:0 } };
		window.addEventListener('pointermove', onCollectionDragMove);
		window.addEventListener('pointerup', onCollectionDragEnd, { once:true });
		beginElementInteraction(col.id);
	}
	/** Drag update loop for a collection – applies snapping + hysteresis. */
	function onCollectionDragMove(e:PointerEvent) {
		if (!collectionDrag) return;
		const pageId = get(currentPageId);
		const pidata = get(projectData).pagesById[pageId]; if (!pidata) return;
		const col:any = pidata.elements.find(el=>el.id===collectionDrag.id); if (!col) return;
		const rawX = collectionDrag.origX + (e.clientX - collectionDrag.startX);
		const rawY = collectionDrag.origY + (e.clientY - collectionDrag.startY);
		// Use existing computeSnapsForBox against collection bounds
		const snap = computeSnapsForBox(pageId, rawX, rawY, col.size.dimensions.width, col.size.dimensions.height);
		const threshold = 6;
		const gv = snap.guides.find(g=>g.type==='v');
		const gh = snap.guides.find(g=>g.type==='h');
		let finalX = rawX; let finalY = rawY;
		if (gv) {
			const diff = snap.x - rawX;
			if (!collectionDrag.snap.x && Math.abs(diff) <= threshold) { collectionDrag.snap.x = true; collectionDrag.snap.tx = snap.x; }
		}
		if (collectionDrag.snap.x) {
			if (Math.abs(rawX - collectionDrag.snap.tx) > threshold + SNAP_RELEASE_EXTRA) collectionDrag.snap.x = false; else finalX = collectionDrag.snap.tx;
		}
		if (gh) {
			const diffY = snap.y - rawY;
			if (!collectionDrag.snap.y && Math.abs(diffY) <= threshold) { collectionDrag.snap.y = true; collectionDrag.snap.ty = snap.y; }
		}
		if (collectionDrag.snap.y) {
			if (Math.abs(rawY - collectionDrag.snap.ty) > threshold + SNAP_RELEASE_EXTRA) collectionDrag.snap.y = false; else finalY = collectionDrag.snap.ty;
		}
		const guidesOut: typeof snap.guides = [];
		if (collectionDrag.snap.x && gv) guidesOut.push(gv);
		if (collectionDrag.snap.y && gh) guidesOut.push(gh);
		snapGuides = guidesOut;
		// Directly update element position (pending transform flush groups updates)
		setElementPositionDirect(col.id, finalX, finalY);
	}
	/** Commit collection drag transform. */
	function onCollectionDragEnd() {
		if (!collectionDrag) return;
		updateElementAfterInteraction(collectionDrag.id);
		collectionDrag = null;
		snapGuides = [];
		window.removeEventListener('pointermove', onCollectionDragMove);
	}

	// ---------------- Group Resize -----------------
	/** Initialize proportional group resize. */
	function onGroupResizeStart(e: PointerEvent, dir: string) {
		if ($selectedElementIds.size < 2 || !selectionBox) return;
		e.stopPropagation();
		// End any drag state
		groupDrag.active = false;
		beginGroupInteraction();
		const pid = get(currentPageId);
		const page = get(projectData).pagesById[pid]; if (!page) return;
		const ids = Array.from($selectedElementIds);
		const elems = ids.map(id => {
			const el: any = page.elements.find(e => e.id === id); if (!el) return null;
			return { id, x: el.position.x, y: el.position.y, w: el.size.dimensions.width, h: el.size.dimensions.height };
		}).filter(Boolean) as {id:string;x:number;y:number;w:number;h:number}[];
		groupResize = { dir, startX: e.clientX, startY: e.clientY, origBox: { ...selectionBox }, elems };
		window.addEventListener('pointermove', onGroupResizeMove);
		window.addEventListener('pointerup', onGroupResizeEnd, { once: true });
	}

	/** Apply proportional resize across selection; handles edge snapping. */
	function onGroupResizeMove(e: PointerEvent) {
		if (!groupResize) return;
		const { dir, startX, startY, origBox } = groupResize;
		let dx = e.clientX - startX;
		let dy = e.clientY - startY;
		let newX = origBox.x;
		let newY = origBox.y;
		let newW = origBox.width;
		let newH = origBox.height;
		const MIN = 10;
		if (dir.includes('l')) { newX = origBox.x + dx; newW = origBox.width - dx; }
		if (dir.includes('r')) { newW = origBox.width + dx; }
		if (dir.includes('t')) { newY = origBox.y + dy; newH = origBox.height - dy; }
		if (dir.includes('b')) { newH = origBox.height + dy; }
		if (newW < MIN) { const diff = MIN - newW; newW = MIN; if (dir.includes('l')) newX -= diff; }
		if (newH < MIN) { const diff = MIN - newH; newH = MIN; if (dir.includes('t')) newY -= diff; }
		// --- Snapping for group resize edges ---
		const pid = get(currentPageId);
		const pageSnap = get(projectData).pagesById[pid];
		const threshold = 6;
		let guides: { type:'v'|'h'; pos:number; gap:[number,number]; from:number; to:number }[] = [];
		if (pageSnap) {
			const sel = new Set(Array.from($selectedElementIds));
			const candidates = pageSnap.elements.filter(el=>!sel.has(el.id));
			if (dir.includes('l') || dir.includes('r')) {
				let best: { edge:'l'|'r'; target:number; delta:number } | null = null;
				const movingLeft = dir.includes('l');
				const currentLeft = newX;
				const currentRight = newX + newW;
				for (const el of candidates) {
					const ex = el.position.x, ew = el.size.dimensions.width;
					for (const c of [ex, ex + ew/2, ex + ew]) {
						if (movingLeft) { const d = Math.abs(c - currentLeft); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'l', target:c, delta:c-currentLeft }; }
						else { const d = Math.abs(c - currentRight); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'r', target:c, delta:c-currentRight }; }
					}
				}
				if (best) {
					if (best.edge==='l') { const rightFixed = newX + newW; newX = best.target; newW = rightFixed - newX; }
					else { newW = best.target - newX; }
					guides.push({ type:'v', pos: best.target, gap:[newY, newY + newH], from:0, to: (container?.clientHeight ?? (newY+newH)) });
				}
			}
			if (dir.includes('t') || dir.includes('b')) {
				let best: { edge:'t'|'b'; target:number; delta:number } | null = null;
				const movingTop = dir.includes('t');
				const currentTop = newY;
				const currentBottom = newY + newH;
				for (const el of candidates) {
					const ey = el.position.y, eh = el.size.dimensions.height;
					for (const c of [ey, ey + eh/2, ey + eh]) {
						if (movingTop) { const d = Math.abs(c - currentTop); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'t', target:c, delta:c-currentTop }; }
						else { const d = Math.abs(c - currentBottom); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'b', target:c, delta:c-currentBottom }; }
					}
				}
				if (best) {
					if (best.edge==='t') { const bottomFixed = newY + newH; newY = best.target; newH = bottomFixed - newY; }
					else { newH = best.target - newY; }
					guides.push({ type:'h', pos: best.target, gap:[newX, newX + newW], from:0, to:(container?.clientWidth ?? (newX+newW)) });
				}
			}
		}
		snapGuides = guides;
		// Update selection box
		selectionBox = { x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) };
		const scaleX = origBox.width === 0 ? 1 : newW / origBox.width;
		const scaleY = origBox.height === 0 ? 1 : newH / origBox.height;
		const moveLeft = dir.includes('l');
		const moveTop = dir.includes('t');
		for (const el of groupResize.elems) {
			// Relative position within original box
			const relX = (el.x - origBox.x) / (origBox.width || 1);
			const relY = (el.y - origBox.y) / (origBox.height || 1);
			// New position depends on which sides move; linear scaling around opposite anchored sides.
			let nx = newX + relX * newW;
			let ny = newY + relY * newH;
			const nw = Math.max(2, Math.round(el.w * scaleX));
			const nh = Math.max(2, Math.round(el.h * scaleY));
			setElementPositionDirect(el.id, Math.round(nx), Math.round(ny));
			setElementSizeDirect(el.id, nw, nh);
		}
	}

	/** Flush + end group resize interaction. */
	function onGroupResizeEnd() {
		if (!groupResize) return;
		flushPendingTransformsNow();
		const pid = get(currentPageId);
		endGroupInteraction();
		groupResize = null;
		snapGuides = [];
		window.removeEventListener('pointermove', onGroupResizeMove);
	}

	// Derived values
	let selectionBox = $state<{ x:number;y:number;width:number;height:number } | null>(null);
	$effect(() => { $projectData; if ($selectedElementIds.size > 1) selectionBox = selectionBoundingBox(get(currentPageId)); else selectionBox = null; });

	/** Global key handler (registered on window). */
	function handleKey(e: KeyboardEvent) {
		const p = page();
		if (!p) return;
		// Ctrl/Cmd + A -> select all elements on page (if focus context here)
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
			const eligible = p.elements.filter(el=>!el.locked).map(el=>el.id); // include hidden, exclude locked
			if (eligible.length) {
				setSelection(eligible);
				selectedElementId.set(eligible[eligible.length-1]);
				selectionBox = selectionBoundingBox(get(currentPageId));
			}
			e.preventDefault(); e.stopPropagation(); return;
		}
		// Escape exits isolation
		if (e.key === 'Escape' && $activeCollectionId) { exitCollectionIsolation(); e.preventDefault(); return; }
		// Ctrl/Cmd + G context-aware grouping (inside or outside isolation)
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
			if ($selectedElementIds.size > 1) groupSelectedElements();
			e.preventDefault(); e.stopPropagation(); return;
		}
		// Movement keys apply only when there is at least one selection
		if ($selectedElementIds.size === 0) return;
		const ids = Array.from($selectedElementIds);
		const primary = $selectedElementId; // last focused
		// Base movement step: 1px, Shift increases to 10px, Ctrl/Cmd doubles the resulting step
		let delta = (e.shiftKey ? 10 : 1) * ((e.ctrlKey || e.metaKey) ? 2 : 1);
		let used = false;
		const moveAll = (dx:number, dy:number) => {
			if (!dx && !dy) return;
			// Batch as a single transform session
			beginGroupInteraction();
			for (const id of ids) {
				const el:any = p.elements.find(e2=>e2.id===id); if (!el) continue;
				setElementPositionDirect(id, el.position.x + dx, el.position.y + dy);
			}
			flushPendingTransformsNow();
			endGroupInteraction();
			used = true;
		};
		switch (e.key) {
			case 'ArrowLeft': moveAll(-delta,0); break;
			case 'ArrowRight': moveAll(delta,0); break;
			case 'ArrowUp': moveAll(0,-delta); break;
			case 'ArrowDown': moveAll(0,delta); break;
			case 'Delete': case 'Backspace':
				import('../stores/project').then(m => { m.deleteElements(ids); });
				used = true; break;
		}
		if (used) { e.preventDefault(); e.stopPropagation(); }
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('keydown', handleKey);
		onDestroy(() => window.removeEventListener('keydown', handleKey));
	}
	// Legacy shared vars kept only for fallback key nudge; drag/resize now use per-handler closures
	let startPos = { x: 0, y: 0 };
	let startSize = { w: 0, h: 0 };

	// InteractJS handlers
	/**
	 * Factory producing drag callbacks for a single element (root or nested).
	 * Supports:
	 *  - Alt-drag duplication (duplicates selection before first move).
	 *  - Isolation mode: convert relative coords to absolute during interaction,
	 *    then convert back before persistence.
	 *  - Snapping with hysteresis lock (same semantics as group / collection).
	 */
	const dragHandlers = (id: string) => {
		let localPos = { x: 0, y: 0 }; // working (absolute during drag for isolated child)
		let rawPos = { x: 0, y: 0 };   // unsnapped cumulative (absolute when isolated child)
		let localSize = { w: 0, h: 0 };
		let snapLock: SnapLock = { x:false, y:false, tx:0, ty:0 };
		let started = false;
		let duplicated = false;
		let isolatedParentAbs: { x:number; y:number } | null = null; // absolute position of active collection for conversion back to relative
		function captureStart() {
			const p = page();
			const el = p?.elements.find(e => e.id === id) as any;
			if (!el) return false;
			selectElement(id);
			// If in isolation and element is descendant of active collection, drag using absolute coords
			if ($activeCollectionId) {
				let curr:any = el;
				let inside = false;
				while (curr.parentId) { if (curr.parentId === $activeCollectionId) { inside = true; break; } const parent = p?.elements.find(e=>e.id===curr.parentId); if (!parent) break; curr = parent; }
				if (inside) {
					const parent:any = p?.elements.find(e=>e.id===$activeCollectionId);
					isolatedParentAbs = { x: parent.position.x, y: parent.position.y };
					const absX = parent.position.x + el.position.x;
					const absY = parent.position.y + el.position.y;
					localPos = { x: absX, y: absY };
					rawPos = { x: absX, y: absY };
				} else {
					const ex = Number(el.position?.x) || 0; const ey = Number(el.position?.y) || 0; localPos = { x: ex, y: ey }; rawPos = { x: ex, y: ey };
				}
			} else {
				const ex = Number(el.position?.x) || 0; const ey = Number(el.position?.y) || 0; localPos = { x: ex, y: ey }; rawPos = { x: ex, y: ey };
			}
			localSize = { w: el.size.dimensions.width, h: el.size.dimensions.height };
			started = true;
			return true;
		}
		return {
			onStart: (e:any) => { if (captureStart()) { if (e?.altKey) { // duplicate before move
					import('../stores/project').then(m => { const pid = get(currentPageId); const map = m.duplicateSelectionForDrag(pid); /* selection now clones */ });
					duplicated = true;
				}
				const p = page(); const el:any = p?.elements.find(e2=>e2.id===id); if (el?.locked) return; beginElementInteraction(id);
			}},
			onMove: (e: any) => {
				if (!started) captureStart(); const p = page(); const el:any = p?.elements.find(e2=>e2.id===id); if (el?.locked) return;
				rawPos = { x: rawPos.x + (e.dx ?? 0), y: rawPos.y + (e.dy ?? 0) };
				const snap = computeSnapsForBox(get(currentPageId), rawPos.x, rawPos.y, localSize.w, localSize.h);
				const threshold = 6;
				const gv = snap.guides.find(g=>g.type==='v');
				const gh = snap.guides.find(g=>g.type==='h');
				let finalX = rawPos.x;
				let finalY = rawPos.y;
				if (gv) {
					const diff = snap.x - rawPos.x;
					if (!snapLock.x && Math.abs(diff) <= threshold) { snapLock.x = true; snapLock.tx = snap.x; }
				}
				if (snapLock.x) {
					if (Math.abs(rawPos.x - snapLock.tx) > threshold + SNAP_RELEASE_EXTRA) snapLock.x = false; else finalX = snapLock.tx;
				}
				if (gh) {
					const diffY = snap.y - rawPos.y;
					if (!snapLock.y && Math.abs(diffY) <= threshold) { snapLock.y = true; snapLock.ty = snap.y; }
				}
				if (snapLock.y) {
					if (Math.abs(rawPos.y - snapLock.ty) > threshold + SNAP_RELEASE_EXTRA) snapLock.y = false; else finalY = snapLock.ty;
				}
				const guidesOut: typeof snap.guides = [];
				if (snapLock.x && gv) guidesOut.push(gv);
				if (snapLock.y && gh) guidesOut.push(gh);
				localPos = { x: finalX, y: finalY };
				snapGuides = guidesOut;
				if (isolatedParentAbs) {
					setElementPositionDirect(id, finalX - isolatedParentAbs.x, finalY - isolatedParentAbs.y);
				} else {
					setElementPositionDirect(id, finalX, finalY);
				}
			},
			onEnd: () => { updateElementAfterInteraction(id); snapGuides = []; }
		};
	};

	// Manual single-element resize (mirrors group logic to avoid drag interference)
	/** Compute absolute stage position accounting for ancestor collections. */
	function absPosition(el:any) {
		if (!el) return { x:0, y:0 };
		let x = el.position.x; let y = el.position.y; let current = el;
		const pg = page();
		let guard = 0;
		while (current.parentId && guard < 10) { // simple ancestor accumulation (max depth 10)
			const parent = pg?.elements.find(e=>e.id===current.parentId) as any;
			if (!parent) break;
			x += parent.position.x;
			y += parent.position.y;
			current = parent;
			guard++;
		}
		return { x, y };
	}

// Collection resize state
let collectionResize: { id:string; dir:string; startX:number; startY:number; orig:{ x:number;y:number;w:number;h:number } } | null = null;
// Double-click isolation tolerance
let lastCollectionClick: { id:string; time:number; x:number; y:number } | null = null;
const DBL_CLICK_MS = 320; // window for double click
const DRAG_TOLERANCE = 6; // px movement allowed between clicks
let pendingIsolationTimeout: any = null;
let pendingIsolationChild: string | null = null;

/**
 * Handle pointer down on a collection (non-isolated):
 *  - Single click selects.
 *  - Double click (within time + movement tolerance) enters isolation.
 *  - Drag initiation deferred until pointer moves beyond tolerance to avoid
 *    competing with double-click detection.
 */
function onCollectionPointerDown(e:PointerEvent, col:any) {
	if ($activeCollectionId) return; // isolation has own interactions
	// If collection locked: allow selection but disallow isolation mode entry
	selectElement(col.id);
	const now = performance.now();
	if (pendingIsolationTimeout) { clearTimeout(pendingIsolationTimeout); pendingIsolationTimeout = null; }
	if (lastCollectionClick && lastCollectionClick.id === col.id && (now - lastCollectionClick.time) < DBL_CLICK_MS) {
		const dx = e.clientX - lastCollectionClick.x;
		const dy = e.clientY - lastCollectionClick.y;
		if (Math.hypot(dx,dy) <= DRAG_TOLERANCE) {
			// treat as double click -> isolate (skip if locked)
			if (col.locked) { return; }
			pendingIsolationTimeout = setTimeout(()=> { enterCollectionIsolation(col.id); pendingIsolationTimeout = null; }, 0);
		} else {
			// movement exceeded tolerance; treat this as new first click and allow drag
			lastCollectionClick = { id: col.id, time: now, x: e.clientX, y: e.clientY };
			beginCollectionDrag(e, col);
		}
	} else {
		lastCollectionClick = { id: col.id, time: now, x: e.clientX, y: e.clientY };
		// Start drag after slight delay if pointer moves beyond tolerance
		let dragStarted = false;
		const moveHandler = (mv:PointerEvent) => {
			if (dragStarted) return;
			if (Math.abs(mv.clientX - e.clientX) > DRAG_TOLERANCE || Math.abs(mv.clientY - e.clientY) > DRAG_TOLERANCE) {
				// If locked, suppress drag but still allow potential double click isolation later
				if (col.locked) { dragStarted = true; return; }
				dragStarted = true;
				beginCollectionDrag(mv, col);
			}
		};
		const upHandler = () => { window.removeEventListener('pointermove', moveHandler); window.removeEventListener('pointerup', upHandler); };
		window.addEventListener('pointermove', moveHandler);
		window.addEventListener('pointerup', upHandler, { once:true });
	}
}
/** Start interactive resize for a collection (non-isolated). */
function onCollectionResizeStart(e:PointerEvent, col:any, dir:string) {
	e.stopPropagation();
	collectionResize = { id: col.id, dir, startX: e.clientX, startY: e.clientY, orig: { x: col.position.x, y: col.position.y, w: col.size.dimensions.width, h: col.size.dimensions.height } };
	window.addEventListener('pointermove', onCollectionResizeMove);
	window.addEventListener('pointerup', onCollectionResizeEnd, { once:true });
}
/** Update loop during collection resize; applies edge snapping translation. */
function onCollectionResizeMove(e:PointerEvent) {
	if (!collectionResize) return;
	const { id, dir, startX, startY, orig } = collectionResize;
	let dx = e.clientX - startX;
	let dy = e.clientY - startY;
	let newX = orig.x; let newY = orig.y; let newW = orig.w; let newH = orig.h;
	const MIN = 20;
	if (dir.includes('l')) { newX = orig.x + dx; newW = orig.w - dx; }
	if (dir.includes('r')) { newW = orig.w + dx; }
	if (dir.includes('t')) { newY = orig.y + dy; newH = orig.h - dy; }
	if (dir.includes('b')) { newH = orig.h + dy; }
	if (newW < MIN) { const diff = MIN - newW; newW = MIN; if (dir.includes('l')) newX -= diff; }
	if (newH < MIN) { const diff = MIN - newH; newH = MIN; if (dir.includes('t')) newY -= diff; }
	// Snapping for moved edges (treat box like moving+resizing)
	const pageId = get(currentPageId);
	const snapResult = computeSnapsForBox(pageId, newX, newY, newW, newH);
	// Only snap translation (top-left) so edges align; width/height unchanged except shift to preserve opposite edge when appropriate
	const threshold = 6;
	const gv = snapResult.guides.find(g=>g.type==='v');
	const gh = snapResult.guides.find(g=>g.type==='h');
	let sxLock = false, syLock = false;
	if (gv && Math.abs(snapResult.x - newX) <= threshold) { sxLock = true; }
	if (gh && Math.abs(snapResult.y - newY) <= threshold) { syLock = true; }
	if (sxLock) {
		if (dir.includes('l')) { // left edge locked -> shift newX to snapped x, adjust width
			const rightEdge = newX + newW; newX = snapResult.x; newW = rightEdge - newX;
		} else if (!dir.includes('r')) {
			// width anchor center scenario not used; if only vertical resize, allow snapping move horizontally
			newX = snapResult.x;
		}
	}
	if (syLock) {
		if (dir.includes('t')) { const bottomEdge = newY + newH; newY = snapResult.y; newH = bottomEdge - newY; }
		else if (!dir.includes('b')) { newY = snapResult.y; }
	}
	const guidesOut: typeof snapResult.guides = [];
	if (sxLock && gv) guidesOut.push(gv);
	if (syLock && gh) guidesOut.push(gh);
	snapGuides = guidesOut;
	// Apply scaling via store helper (no immediate commit for interactive feedback)
	import('../stores/project').then(m => { m.scaleCollection(id, newW, newH, newX, newY, false); });
}
/** Finalize collection resize (commit via history). */
function onCollectionResizeEnd() {
	collectionResize = null;
	// Commit transform via history
	if ($selectedElementId) updateElementAfterInteraction($selectedElementId);
	window.removeEventListener('pointermove', onCollectionResizeMove);
	snapGuides = [];
}
	let singleResize: { id:string; dir:string; startX:number; startY:number; orig:{ x:number; y:number; w:number; h:number } } | null = null;
	/** Initialize single element resize (not in multi-select). */
	function onSingleResizeStart(e:PointerEvent, id:string, dir:string) {
		if ($selectedElementIds.size > 1) return; // group handled elsewhere
		e.stopPropagation();
		const p = page();
		const el:any = p?.elements.find(el=>el.id===id);
		if (!el) return;
		selectElement(id);
		let origX = el.position.x; let origY = el.position.y; let parentAbs: {x:number;y:number}|null = null;
		if ($activeCollectionId) {
			// If child of isolated collection, operate in absolute coords during drag
			let curr:any = el; while (curr.parentId) { if (curr.parentId===$activeCollectionId) break; const parent = p?.elements.find(e=>e.id===curr.parentId); if (!parent) break; curr = parent; }
			if (curr.parentId===$activeCollectionId) {
				const parent:any = p?.elements.find(e=>e.id===$activeCollectionId);
				parentAbs = { x: parent.position.x, y: parent.position.y };
				origX = parent.position.x + el.position.x;
				origY = parent.position.y + el.position.y;
			}
		}
		singleResize = { id, dir, startX: e.clientX, startY: e.clientY, orig: { x:origX, y:origY, w:el.size.dimensions.width, h:el.size.dimensions.height } } as any;
		(singleResize as any).parentAbs = parentAbs;
		snapGuides = [];
		beginElementInteraction(id);
		window.addEventListener('pointermove', onSingleResizeMove);
		window.addEventListener('pointerup', onSingleResizeEnd, { once:true });
	}
	/** Resize loop for a single element (with snapping + isolation handling). */
	function onSingleResizeMove(e:PointerEvent) {
		if (!singleResize) return;
		const { dir, startX, startY, orig, id } = singleResize as any;
		let dx = e.clientX - startX;
		let dy = e.clientY - startY;
		let newX = orig.x;
		let newY = orig.y;
		let newW = orig.w;
		let newH = orig.h;
		const MIN = 20;
		if (dir.includes('l')) { newX = orig.x + dx; newW = orig.w - dx; }
		if (dir.includes('r')) { newW = orig.w + dx; }
		if (dir.includes('t')) { newY = orig.y + dy; newH = orig.h - dy; }
		if (dir.includes('b')) { newH = orig.h + dy; }
		if (newW < MIN) { const diff = MIN - newW; newW = MIN; if (dir.includes('l')) newX -= diff; }
		if (newH < MIN) { const diff = MIN - newH; newH = MIN; if (dir.includes('t')) newY -= diff; }
		// --- Snapping (single resize) --- similar to group logic but only for active edges
		const pid = get(currentPageId);
		const pData = get(projectData).pagesById[pid];
		const threshold = 6;
		let guides: { type:'v'|'h'; pos:number; gap:[number,number]; from:number; to:number }[] = [];
		if (pData) {
			const candidates = pData.elements.filter(el => el.id !== id);
			if (dir.includes('l') || dir.includes('r')) {
				let best: { edge:'l'|'r'; target:number; delta:number } | null = null;
				const movingLeft = dir.includes('l');
				const currentLeft = newX;
				const currentRight = newX + newW;
				for (const el of candidates) {
					const ex = el.position.x, ew = el.size.dimensions.width;
					for (const c of [ex, ex + ew/2, ex + ew]) {
						if (movingLeft) {
							const d = Math.abs(c - currentLeft); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'l', target:c, delta:c-currentLeft };
						} else {
							const d = Math.abs(c - currentRight); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'r', target:c, delta:c-currentRight };
						}
					}
				}
				if (best) {
					if (best.edge==='l') { const fixedRight = newX + newW; newX = best.target; newW = fixedRight - newX; }
					else { newW = best.target - newX; }
					guides.push({ type:'v', pos: best.target, gap:[newY, newY + newH], from:0, to:(container?.clientHeight ?? (newY+newH)) });
				}
			}
			if (dir.includes('t') || dir.includes('b')) {
				let best: { edge:'t'|'b'; target:number; delta:number } | null = null;
				const movingTop = dir.includes('t');
				const currentTop = newY;
				const currentBottom = newY + newH;
				for (const el of candidates) {
					const ey = el.position.y, eh = el.size.dimensions.height;
					for (const c of [ey, ey + eh/2, ey + eh]) {
						if (movingTop) {
							const d = Math.abs(c - currentTop); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'t', target:c, delta:c-currentTop };
						} else {
							const d = Math.abs(c - currentBottom); if (d <= threshold && (!best || d < Math.abs(best.delta))) best = { edge:'b', target:c, delta:c-currentBottom };
						}
					}
				}
				if (best) {
					if (best.edge==='t') { const fixedBottom = newY + newH; newY = best.target; newH = fixedBottom - newY; }
					else { newH = best.target - newY; }
					guides.push({ type:'h', pos: best.target, gap:[newX, newX + newW], from:0, to:(container?.clientWidth ?? (newX+newW)) });
				}
			}
		}
		// Re-clamp after snapping
		if (newW < MIN) { const diff = MIN - newW; if (dir.includes('l')) newX -= diff; newW = MIN; }
		if (newH < MIN) { const diff = MIN - newH; if (dir.includes('t')) newY -= diff; newH = MIN; }
		snapGuides = guides;
		const parentAbs = (singleResize as any).parentAbs as {x:number;y:number}|null;
		if (parentAbs) {
			setElementPositionDirect(id, Math.round(newX - parentAbs.x), Math.round(newY - parentAbs.y));
		} else {
			setElementPositionDirect(id, Math.round(newX), Math.round(newY));
		}
		setElementSizeDirect(id, Math.round(newW), Math.round(newH));
	}
	/** Commit single element resize. */
	function onSingleResizeEnd() {
		if (!singleResize) return;
		updateElementAfterInteraction(singleResize.id);
		singleResize = null;
		snapGuides = [];
		window.removeEventListener('pointermove', onSingleResizeMove);
	}

	// Ensure there is always a minimal page / structure for an empty project
	$effect(() => { ensureDefaultStructure(); });

// ---------------- Rotation (single element) -----------------
let rotating: { id:string; center:{x:number;y:number}; startRotation:number; } | null = null;

function angleFromCenter(cx:number, cy:number, px:number, py:number) {
	const ang = Math.atan2(py - cy, px - cx) * 180 / Math.PI; // -180..180
	return (ang + 360) % 360; // normalize 0..360
}

function snapAngle(raw:number, e:PointerEvent) {
	const step = e.shiftKey ? 15 : (e.altKey ? 5 : 1);
	return Math.round(raw / step) * step;
}

function onRotationPointerDown(e:PointerEvent, el:any) {
	e.stopPropagation();
	if (el.locked) return;
	const abs = absPosition(el);
	const center = { x: abs.x + el.size.dimensions.width / 2, y: abs.y + el.size.dimensions.height / 2 };
	rotating = { id: el.id, center, startRotation: el.rotation || 0 };
	beginElementInteraction(el.id);
	window.addEventListener('pointermove', onRotationPointerMove);
	window.addEventListener('pointerup', onRotationPointerUp, { once:true });
}

function onRotationPointerMove(e:PointerEvent) {
	if (!rotating) return;
	const elId = rotating.id;
	const pageId = get(currentPageId);
	const p = get(projectData).pagesById[pageId]; if (!p) return;
	const el:any = p.elements.find(e=>e.id===elId); if(!el) return;
	const raw = angleFromCenter(rotating.center.x, rotating.center.y, e.clientX, e.clientY);
	const snapped = snapAngle(raw, e);
	setElementRotation(pageId, elId, snapped);
	angleHUD = { show:true, text: `${snapped}\u00B0`, x: e.clientX + 12, y: e.clientY - 28 };
}

function onRotationPointerUp() {
	if (!rotating) return;
	updateElementAfterInteraction(rotating.id);
	rotating = null;
	window.removeEventListener('pointermove', onRotationPointerMove);
	angleHUD = { ...angleHUD, show:false };
}

// --- Group rotation (multi-select) ---
function onGroupRotateStart(e:PointerEvent) {
	if ($selectedElementIds.size < 2 || !selectionBox) return;
	e.stopPropagation();
	const center = { x: selectionBox.x + selectionBox.width/2, y: selectionBox.y + selectionBox.height/2 };
	const ids = Array.from($selectedElementIds);
	const pg = page(); if (!pg) return;
	const initial: Record<string,number> = {};
	for (const id of ids) {
		const el:any = pg.elements.find(e=>e.id===id); if (!el || el.locked) return; // abort if any locked
		initial[id] = el.rotation || 0;
	}
	groupRotate = { center, startAngle: angleFromCenter(center.x, center.y, e.clientX, e.clientY), initial, ids };
	beginGroupInteraction();
	window.addEventListener('pointermove', onGroupRotateMove);
	window.addEventListener('pointerup', onGroupRotateEnd, { once:true });
}

function onGroupRotateMove(e:PointerEvent) {
	if (!groupRotate) return;
	const raw = angleFromCenter(groupRotate.center.x, groupRotate.center.y, e.clientX, e.clientY);
	let delta = raw - groupRotate.startAngle;
	// Normalize to -180..180 to avoid large jumps across wrap
	delta = ((delta + 540) % 360) - 180;
	const snappedDelta = snapAngle(delta, e);
	for (const id of groupRotate.ids) {
		const base = groupRotate.initial[id] || 0;
		setElementRotationDirect(id, base + snappedDelta);
	}
	const sign = snappedDelta>0?'+':'';
	angleHUD = { show:true, text: `\u0394 ${sign}${snappedDelta}\u00B0`, x: e.clientX + 12, y: e.clientY - 28 };
}

function onGroupRotateEnd() {
	if (!groupRotate) return;
	flushPendingTransformsNow();
	endGroupInteraction();
	groupRotate = null;
	window.removeEventListener('pointermove', onGroupRotateMove);
	angleHUD = { ...angleHUD, show:false };
}
	// When we just entered isolation with a target child, ensure it becomes selection
	$effect(() => {
		if ($activeCollectionId && pendingIsolationChild) {
			// If selection not yet applied, apply now
			if ($selectedElementId !== pendingIsolationChild) {
				selectElement(pendingIsolationChild);
			}
			// Clear once applied
			if ($selectedElementId === pendingIsolationChild) pendingIsolationChild = null;
		} else if (!$activeCollectionId) {
			pendingIsolationChild = null;
		}
	});
</script>

<style>
	.grid-bg {
		background-image: linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
											linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px);
		background-size: 16px 16px;
	}
	.selected { outline: 2px solid #2563eb; outline-offset: 0; }
	.selection-overlay { position: absolute; inset: 0; border: 1px solid #2563eb; box-sizing: border-box; }
	.selection-overlay .handle { position: absolute; width: 8px; height: 8px; background: #fff; border: 2px solid #2563eb; border-radius: 2px; box-sizing: border-box; }
	.selection-overlay .handle.tl { cursor: nwse-resize; }
	.selection-overlay .handle.tr { cursor: nesw-resize; }
	.selection-overlay .handle.bl { cursor: nesw-resize; }
	.selection-overlay .handle.br { cursor: nwse-resize; }
	.selection-overlay .handle.tm { cursor: ns-resize; }
	.selection-overlay .handle.bm { cursor: ns-resize; }
	.selection-overlay .handle.ml { cursor: ew-resize; }
	.selection-overlay .handle.mr { cursor: ew-resize; }
	.rotation-handle { position:absolute; top:-22px; left:50%; transform:translateX(-50%); width:18px; height:18px; background:#fff; border:2px solid #2563eb; border-radius:50%; cursor:grab; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 2px rgba(0,0,0,0.25); }
	.rotation-handle:active { cursor:grabbing; }
	.rotation-line { position:absolute; top:-10px; left:50%; width:2px; height:14px; background:#2563eb; transform:translateX(-50%); }
	.group-box { position:absolute; pointer-events:auto; }
	.group-outline { position:absolute; inset:0; border:1px dashed #2563eb; background:rgba(37,99,235,0.08); }
	.group-handle.move { position:absolute; top:-12px; left:0; width:24px; height:10px; background:#2563eb; border-radius:4px; cursor:move; opacity:0.85; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff; }
    .group-box .handle { position:absolute; width:10px; height:10px; background:#fff; border:2px solid #2563eb; border-radius:2px; box-sizing:border-box; cursor:pointer; }
    .group-box .handle.tl { top:-6px; left:-6px; cursor:nwse-resize; }
    .group-box .handle.tr { top:-6px; right:-6px; cursor:nesw-resize; }
    .group-box .handle.bl { bottom:-6px; left:-6px; cursor:nesw-resize; }
    .group-box .handle.br { bottom:-6px; right:-6px; cursor:nwse-resize; }
    .group-box .handle.tm { top:-6px; left:50%; transform:translateX(-50%); cursor:ns-resize; }
    .group-box .handle.bm { bottom:-6px; left:50%; transform:translateX(-50%); cursor:ns-resize; }
    .group-box .handle.ml { left:-6px; top:50%; transform:translateY(-50%); cursor:ew-resize; }
    .group-box .handle.mr { right:-6px; top:50%; transform:translateY(-50%); cursor:ew-resize; }
	.snap-guide { position:absolute; background:#f59e0b; z-index:60; pointer-events:none; }
	.snap-guide.v { width:1px; top:0; bottom:0; }
	.snap-guide.h { height:1px; left:0; right:0; }
	.snap-icon { position:absolute; color:#f59e0b; opacity:0.9; pointer-events:none; }
	.snap-icon.up, .snap-icon.down { filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
	.snap-icon.left, .snap-icon.right { filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
	.angle-hud { position: fixed; z-index: 1000; background: rgba(15,23,42,0.9); color:#e2e8f0; border:1px solid #334155; border-radius:6px; padding:2px 6px; font-size:11px; pointer-events:none; box-shadow:0 4px 14px rgba(0,0,0,0.35); }
	.handle.tl { top: -5px; left: -5px; }
	.handle.tr { top: -5px; right: -5px; }
	.handle.bl { bottom: -5px; left: -5px; }
	.handle.br { bottom: -5px; right: -5px; }
	.handle.tm { top: -5px; left: 50%; transform: translateX(-50%); }
	.handle.bm { bottom: -5px; left: 50%; transform: translateX(-50%); }
	.handle.ml { left: -5px; top: 50%; transform: translateY(-50%); }
	.handle.mr { right: -5px; top: 50%; transform: translateY(-50%); }
	.collection-container { pointer-events:none; /* let children receive interaction in isolation */ }
	.collection-frame { position:absolute; inset:0; border:1px solid rgba(148,163,184,0.35); border-radius:4px; pointer-events:none; }
	.isolation-mode .dim-outside { opacity:0.25; filter:saturate(0.3); transition:opacity .12s; }
 	.isolation-mode .collection-frame.active { border-color:#2563eb; }
	@keyframes hiddenPulse { 0% { box-shadow:0 0 0 2px rgba(59,130,246,0.4), 0 0 0 6px rgba(59,130,246,0.0); } 60% { box-shadow:0 0 0 2px rgba(59,130,246,0.4), 0 0 0 10px rgba(59,130,246,0.18); } 100% { box-shadow:0 0 0 2px rgba(59,130,246,0.4), 0 0 0 14px rgba(59,130,246,0); } }
	.hidden-pulse { animation:hiddenPulse 1.6s ease-in-out infinite; }
</style>

<div bind:this={container}
    class="relative w-full h-full grid-bg outline-none text-left { $activeCollectionId ? 'isolation-mode' : '' }"
    role="button"
    aria-label="Design stage"
    tabindex="0"
	onclick={handleStageClick}
    onkeydown={(e:KeyboardEvent)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); handleStageClick(e as any); } if(e.key==='Escape') selectElement(null); }}>
	{#if $projectData.pagesById[$currentPageId]}
			{#each $projectData.pagesById[$currentPageId].elements as el}
				{#if el.visible !== false && ($currentAlive === null || $currentAlive.has(el.id))}
				{#if el.type === 'collection'}
					<div class="absolute collection-container { $activeCollectionId && $activeCollectionId!==el.id ? 'dim-outside' : '' }" role="group" style:pointer-events={ $activeCollectionId===el.id ? 'none':'auto' }
					 style:transform={`translate(${el.position.x}px, ${el.position.y}px)`}
					 style:width={`${el.size.dimensions.width}px`}
					 style:height={`${el.size.dimensions.height}px`}
					 onpointerdown={(e)=>{ e.stopPropagation(); onCollectionPointerDown(e, el); }}>
						<!-- Frame only if a descendant is selected and we're not actively selecting the collection itself -->
						{#if (!$activeCollectionId && $selectedElementId === el.id) || ($activeCollectionId===el.id)}
							<div class="collection-frame { $activeCollectionId===el.id && $selectedElementId && $selectedElementId!==el.id ? 'active' : '' }"></div>
						{/if}
						{#if $selectedElementId === el.id && !$activeCollectionId}
							{#if el.locked}
								<div class="selection-overlay" style="pointer-events:none;">
									<div class="absolute -top-5 left-2 flex items-center gap-1 text-xs bg-red-600/90 text-white px-2 py-1 rounded shadow">
										<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
										<span>Locked</span>
									</div>
								</div>
							{:else}
								<div class="selection-overlay">
									<span class="rotation-line"></span>
									<span class="rotation-handle" title="Rotate collection (Shift=15°, Alt=5°, default 1°)" onpointerdown={(e)=>onRotationPointerDown(e, el)}>
										<svg viewBox="0 0 24 24" width="12" height="12" stroke="#2563eb" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10a7.5 7.5 0 0 1 13.5-4.546"/><path d="M19.5 4v5h-5"/><path d="M19.5 14a7.5 7.5 0 0 1-13.5 4.546"/><path d="M9.5 19h-5v-5"/></svg>
									</span>
									<UnifiedToolbar mode="collection" targetCollectionId={$selectedElementId!} />
									<span class="handle tl" onpointerdown={(e)=>onCollectionResizeStart(e, el,'tl')}></span>
									<span class="handle tr" onpointerdown={(e)=>onCollectionResizeStart(e, el,'tr')}></span>
									<span class="handle bl" onpointerdown={(e)=>onCollectionResizeStart(e, el,'bl')}></span>
									<span class="handle br" onpointerdown={(e)=>onCollectionResizeStart(e, el,'br')}></span>
									<span class="handle tm" onpointerdown={(e)=>onCollectionResizeStart(e, el,'t')}></span>
									<span class="handle bm" onpointerdown={(e)=>onCollectionResizeStart(e, el,'b')}></span>
									<span class="handle ml" onpointerdown={(e)=>onCollectionResizeStart(e, el,'l')}></span>
									<span class="handle mr" onpointerdown={(e)=>onCollectionResizeStart(e, el,'r')}></span>
								</div>
							{/if}
					{/if}
					</div>
				{:else}
					{#key el.id}
					<div class="absolute cursor-move { $selectedElementId===el.id && !el.visible ? 'hidden-pulse' : '' }"
                        style:transform={`translate(${absPosition(el).x}px, ${absPosition(el).y}px)`}
                        style:width={`${el.size.dimensions.width}px`}
                        style:height={`${el.size.dimensions.height}px`}
					
						style:cursor={el.locked ? 'default' : 'move'}
                        style:outline={ $selectedElementId===el.id ? (el.locked ? '2px solid #dc2626' : (!el.visible ? '2px dashed rgba(59,130,246,0.55)' : undefined)) : undefined }
                        style:box-shadow={ $selectedElementId===el.id && !el.visible ? '0 0 0 2px rgba(59,130,246,0.2), 0 0 0 4px rgba(59,130,246,0.12)' : undefined }
                        style:background-color={ $selectedElementId===el.id && !el.visible ? 'rgba(59,130,246,0.08)' : undefined }
                        role="button"
                        tabindex="0"
						onclick={(e)=>{ 
						 e.stopPropagation();
						 if (!$activeCollectionId && el.parentId) {
							// Outside isolation clicking child selects its top-most collection
							let top:any = el; const pageData = $projectData.pagesById[$currentPageId]; while (top.parentId) { const parent = pageData.elements.find(p=>p.id===top.parentId); if (!parent) break; top = parent; }
							selectElement(top.id); return;
						 }
						 const multi = e.shiftKey;
						 if (multi) { toggleElementSelection(el.id); }
						 else { selectElement(el.id); }
					 }}
						 ondblclick={(e)=>{ e.stopPropagation(); if (el.parentId && !$activeCollectionId) { // enter isolation focusing this child
							let top:any = el; const pageData = $projectData.pagesById[$currentPageId]; while (top.parentId) { const parent = pageData.elements.find(p=>p.id===top.parentId); if (!parent) break; top = parent; }
							if (top.locked) return; // disallow isolation if ancestor collection locked
							pendingIsolationChild = el.id;
							enterCollectionIsolation(top.id, el.id); // should select child
						} }}
					 onkeydown={(e:KeyboardEvent)=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); e.stopPropagation(); selectElement(el.id);} }}
							use:interactable={{
								drag: { enabled: true, ...dragHandlers(el.id) }
							}}
				>
							<div class="w-full h-full relative border rounded shadow-sm {el.appliedClasses ?? ''} { $selectedElementIds.has(el.id) ? 'ring-2 ring-blue-500/90 ring-offset-1 ring-offset-transparent' : '' }" style:background={String((el as any).style?.fillColor ?? '#60a5fa')} style:transform={`rotate(${el.rotation || 0}deg)`} style:transform-origin="center center">
							{#if $selectedElementId === el.id && el.locked}
								<div class="absolute top-1 right-1 text-red-600 bg-white/70 rounded p-[2px] leading-none" style="font-size:10px;">🔒</div>
							{/if}
							{#if $selectedElementId === el.id && !el.locked}
									<div class="selection-overlay">
										<!-- Rotation handle (single element only) -->
										<span class="rotation-line"></span>
										<span class="rotation-handle" title="Rotate (Shift=15°, Alt=5°, default 1°)" onpointerdown={(e)=>onRotationPointerDown(e, el)}>
											<svg viewBox="0 0 24 24" width="12" height="12" stroke="#2563eb" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10a7.5 7.5 0 0 1 13.5-4.546"/><path d="M19.5 4v5h-5"/><path d="M19.5 14a7.5 7.5 0 0 1-13.5 4.546"/><path d="M9.5 19h-5v-5"/></svg>
										</span>
										<span class="handle tl" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'tl')}></span>
										<span class="handle tr" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'tr')}></span>
										<span class="handle bl" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'bl')}></span>
										<span class="handle br" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'br')}></span>
										<span class="handle tm" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'t')}></span>
										<span class="handle bm" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'b')}></span>
										<span class="handle ml" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'l')}></span>
										<span class="handle mr" onpointerdown={(e)=>onSingleResizeStart(e, el.id,'r')}></span>
									</div>
								{/if}
					</div>
				</div>
				{/key}
				{/if} <!-- end non-collection else branch -->
				{/if} <!-- end visibility guard -->
			{/each}
		{#if selectionBox}
			<div class="group-box" style:transform={`translate(${selectionBox.x}px, ${selectionBox.y}px)`} style:width={`${selectionBox.width}px`} style:height={`${selectionBox.height}px`} onpointerdown={onGroupPointerDown}>
				<div class="group-outline"></div>
				<div class="group-handle move" title="Drag group"></div>
				<!-- Group rotation handle -->
				<span class="rotation-line" style="top:-18px"></span>
				<span class="rotation-handle" title="Rotate selection (Shift=15°, Alt=5°, default 1°)" onpointerdown={onGroupRotateStart}>
					<svg viewBox="0 0 24 24" width="12" height="12" stroke="#2563eb" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10a7.5 7.5 0 0 1 13.5-4.546"/><path d="M19.5 4v5h-5"/><path d="M19.5 14a7.5 7.5 0 0 1-13.5 4.546"/><path d="M9.5 19h-5v-5"/></svg>
				</span>
				<UnifiedToolbar mode={ $selectedElementId && ($projectData.pagesById[$currentPageId].elements.find(e=>e.id===$selectedElementId)?.type === 'collection') ? 'collection' : 'multiselect' } targetCollectionId={ $selectedElementId && ($projectData.pagesById[$currentPageId].elements.find(e=>e.id===$selectedElementId)?.type === 'collection') ? $selectedElementId : null } />
				<!-- Resize handles -->
				<span class="handle tl" onpointerdown={(e)=>onGroupResizeStart(e,'tl')}></span>
				<span class="handle tr" onpointerdown={(e)=>onGroupResizeStart(e,'tr')}></span>
				<span class="handle bl" onpointerdown={(e)=>onGroupResizeStart(e,'bl')}></span>
				<span class="handle br" onpointerdown={(e)=>onGroupResizeStart(e,'br')}></span>
				<span class="handle tm" onpointerdown={(e)=>onGroupResizeStart(e,'t')}></span>
				<span class="handle bm" onpointerdown={(e)=>onGroupResizeStart(e,'b')}></span>
				<span class="handle ml" onpointerdown={(e)=>onGroupResizeStart(e,'l')}></span>
				<span class="handle mr" onpointerdown={(e)=>onGroupResizeStart(e,'r')}></span>
			</div>
		{/if}
		{#each snapGuides as g}
			{#if g.type==='v'}
				<div class="snap-guide v" style={`left:${g.pos}px; top:0; height:${Math.max(0, g.gap[0])}px`}></div>
				<div class="snap-guide v" style={`left:${g.pos}px; top:${g.gap[1]}px; bottom:0`}></div>
				<!-- Corrected: top should point DOWN toward element gap -->
				<svg class="snap-icon down" width="15" height="15" viewBox="0 0 24 24" style={`left:${g.pos-7.5}px; top:${g.gap[0]-14}px`} stroke="currentColor" fill="none" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
				</svg>
				<!-- Bottom should point UP -->
				<svg class="snap-icon up" width="15" height="15" viewBox="0 0 24 24" style={`left:${g.pos-7.5}px; top:${g.gap[1]-3}px`} stroke="currentColor" fill="none" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="m5 15 7-7 7 7" />
				</svg>
			{/if}
			{#if g.type==='h'}
				<div class="snap-guide h" style={`top:${g.pos}px; left:0; width:${Math.max(0, g.gap[0])}px`}></div>
				<div class="snap-guide h" style={`top:${g.pos}px; left:${g.gap[1]}px; right:0`}></div>
				<!-- Left side should point RIGHT toward gap -->
				<svg class="snap-icon right" width="15" height="15" viewBox="0 0 24 24" style={`top:${g.pos-7.5}px; left:${g.gap[0]-14}px`} stroke="currentColor" fill="none" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7" />
				</svg>
				<!-- Right side should point LEFT -->
				<svg class="snap-icon left" width="15" height="15" viewBox="0 0 24 24" style={`top:${g.pos-7.5}px; left:${g.gap[1]-3}px`} stroke="currentColor" fill="none" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="m15 19-7-7 7-7" />
				</svg>
			{/if}
		{/each}
		{#if angleHUD.show}
			<div class="angle-hud" style={`left:${angleHUD.x}px; top:${angleHUD.y}px;`}>{angleHUD.text}</div>
		{/if}
	{/if}
</div>