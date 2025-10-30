<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  // Integrations with app stores/runtime
  import { selectedTimelineId, timelineData, type TimelineRecord } from '../../stores/timelineData';
  import { timelines } from '../../stores/timelines';
  import { currentPage } from '../../stores/project';
  import { timelineClips as clipsStore, type Clip as StoreClip } from '../../stores/timelineClips';
  import { animationData, makeKeyframeId, type Keyframe } from '../../stores/animationData';
  import { timelineEditorState } from '../../stores/timelineEditorState';
  import { get } from 'svelte/store';
  import { timelineVM } from '../../stores/timelineViewModel';
  import { registerTrigger } from '../../lib/runtime/triggers';
  import { triggersStore } from '../../stores/triggers';
  import Ruler from './Ruler.svelte';
  import Tracks from './Tracks.svelte';
  // History: commit timeline changes and manage focus scope
  import { commitTimelineChange, setFocusScope, focusScope } from '../../stores/historyScoped';
  import type { FocusScope } from '../../stores/historyScoped';
  // Actions: centralized persistence & history helpers
  import { setTimelineDuration as actionSetDuration, moveOrResizeClip as actionMoveClip, addCue as actionAddCue, renameCue as actionRenameCue, deleteCue as actionDeleteCue, addKeyframe as actionAddKeyframe, moveKeyframe as actionMoveKeyframe } from '../../stores/timelineActions';

  // UX minimums to keep UI grabbable (defined early to avoid TDZ in functions)
  const MIN_TIMELINE_MS = 1000; // 1s minimum timeline length in editor (adjustable)
  const MIN_CLIP_PX = 12; // minimum visible width for a clip so handles are usable

  // ============================
  // Replace placeholders with real stores/runtime
  // ============================
  // Component state used by subscriptions must be declared before they run
  let playheadMs = 0;
  let playing = false;

  let current: TimelineRecord | null = null;
  let layers: { id: string; name: string; type?: string; locked?: boolean }[] = [];
  type UIKey = { id: string; time: number };
  type UITrig = { id: string; time: number };
  type UIClip = { id: string; layerId: string; start: number; end: number; label: string; keyframes: UIKey[]; triggers: UITrig[]; locked?: boolean };
  let clips: UIClip[] = [];
  let detachRuntime: (() => void) | null = null;
  function attachRuntime() {
    if (!current) return;
    const tl = timelines.get(current.id) || timelines.create(current);
    if (detachRuntime) { detachRuntime(); detachRuntime = null; }
    const handler = (e: any) => {
      if (e.type === 'play') playing = true;
      if (e.type === 'pause' || e.type === 'stop') playing = false;
      if (e.type === 'seek' || e.type === 'tick') playheadMs = tl.time;
    };
    tl.on(handler);
    playheadMs = tl.time;
    playing = tl.isPlaying;
    detachRuntime = () => tl.off(handler);
  }
  // Derived view model: subscribe once to update current, layers, clips
  const unsubVM = timelineVM.subscribe(vm => {
    current = vm.timeline;
    layers = vm.layers;
    clips = vm.clips;
    if (current) {
      // Clamp playhead and ensure a minimum timeline duration for immediate correct UI
      playheadMs = Math.min(playheadMs, current.duration);
      if (current.duration < MIN_TIMELINE_MS) {
        actionSetDuration(current.id, MIN_TIMELINE_MS, { commit: false });
      }
    } else {
      playheadMs = 0;
    }
  });
  // runtime proxy used by UI handlers
  const timelineRuntime = {
    get tl() { return current ? (timelines.get(current.id) || timelines.create(current)) : null; },
    get isPlaying() { return !!this.tl?.isPlaying; },
    play() { this.tl?.play(); },
    pause() { this.tl?.pause(); },
    stop() { this.tl?.stop(); },
    seek(ms: number) { this.tl?.seek(ms); },
  };

  // ============= Component state =============

  let containerEl: HTMLDivElement | null = null;
  let rulerEl: HTMLDivElement | null = null;
  let tracksScrollEl: HTMLDivElement | null = null;

  // initial state comes from VM subscription
  attachRuntime();

  // pixels per second (zoom)
  let zoom = 1; // scale factor (UI hook). real pps = basePps * zoom
  const basePps = 300;

  // runtime binding declared above

  // viewport & scroll
  let viewportPx = 0;
  let hScroll = 0;
  const rowHeight = 36;

  // context menu
  let ctxOpen = false;
  let ctxX = 0;
  let ctxY = 0;
  let ctxTime = 0;

  // Actions (Triggers) panel state
  let actionsOpen = false;
  let actionsTime: number | null = null;
  type ActionType = 'log' | 'playTimeline' | 'pauseTimeline' | 'stopTimeline';
  let selectedAction: ActionType = 'log';
  let actionLogMessage = 'Hello from trigger';
  let alsoAddCue = true;
  // Cue naming UX state
  let pendingCueName: string = '';
  // Floating Cue Card state (replaces window.prompt)
  type CueCardState = { open: boolean; mode: 'add'|'rename'; cueId?: string; time: number; value: string; x: number; y: number; error?: string };
  let cueCard: CueCardState = { open: false, mode: 'add', time: 0, value: '', x: 0, y: 0 };
  function openCueCard(opts: Omit<CueCardState, 'open'>) { cueCard = { open: true, ...opts }; }
  function closeCueCard() { cueCard.open = false; cueCard.error = undefined; }
  function submitCueCard() {
    if (!current) return;
    const name = (cueCard.value || '').trim();
    try {
      if (cueCard.mode === 'add') {
        // centralized action handles persistence + history + runtime recreation
        actionAddCue(current.id, { time: cueCard.time, name: name || undefined }, { commit: true, recreateRuntime: true });
      } else if (cueCard.mode === 'rename' && cueCard.cueId) {
        if (!name) { cueCard.error = 'Name cannot be empty'; return; }
        actionRenameCue(current.id, cueCard.cueId, name, { commit: true, recreateRuntime: true });
      }
    } catch (e:any) {
      cueCard.error = e?.message || 'Failed to save cue';
      return;
    }
  const rec = timelineData.getById(current.id)!;
  timelines.delete(rec.id); timelines.create(rec);
  current = rec; attachRuntime();
    pendingCueName = name; // remember last used
    closeCueCard();
  }

  // dragging playhead
  let draggingPlayhead = false;

  // derived helpers
  function ppsEffective() { return basePps * zoom; }
  function msToPx(ms: number) { return (ms / 1000) * ppsEffective(); }
  function pxToMs(px: number) { return Math.round((px / ppsEffective()) * 1000); }
  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const ms3 = Math.floor(ms % 1000).toString().padStart(3, '0');
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}.${ms3}`;
  }
  function pct(ms: number) {
    const d = current?.duration || 1;
    return Math.round((ms / d) * 100);
  }

  // Tick helpers: seconds range + adaptive minor ticks and non-overlapping labels
  function secondsRange() {
    const pps = ppsEffective();
    const startSec = Math.max(0, Math.floor(hScroll / pps));
    const endSec = Math.max(Math.ceil((hScroll + viewportPx) / pps), Math.ceil((current?.duration ?? 0) / 1000));
    return { startSec, endSec };
  }
  function secondsList(): number[] {
    const { startSec, endSec } = secondsRange();
    const arr: number[] = [];
    for (let s = startSec; s <= endSec; s++) arr.push(s);
    return arr;
  }
  function labeledSeconds(): number[] {
    const { startSec, endSec } = secondsRange();
    const minSpace = 60; // px between labels
    const out: number[] = [];
    let lastX = -Infinity;
    for (let s = startSec; s <= endSec; s++) {
      const x = msToPx(s * 1000);
      if (x - lastX >= minSpace) { out.push(s); lastX = x; }
    }
    return out;
  }
  function showHalf() { return ppsEffective() >= 150; }
  function showQuarter() { return ppsEffective() >= 400; }
  function showTenth() { return ppsEffective() >= 800; }

  // ===========================
  // UI interactions
  // ===========================
  // refreshDerived implemented above

  // runtime uses internal rAF; we subscribe via attachRuntime()

  function togglePlayPause() {
    if (timelineRuntime.isPlaying) { timelineRuntime.pause(); playing = false; }
    else { timelineRuntime.play(); playing = true; }
  }
  function stopTimeline() {
    timelineRuntime.stop();
    playing = false;
  const tl = timelineRuntime.tl; playheadMs = tl ? tl.time : 0;
  }
  function stepForwardFrame() {
    const fps = 30; // or pull from editor state
    const delta = Math.round(1000 / fps);
    timelineRuntime.seek(playheadMs + delta);
  const tl = timelineRuntime.tl; playheadMs = tl ? tl.time : playheadMs;
  }
  function stepBackwardFrame() {
    const fps = 30;
    const delta = Math.round(1000 / fps);
    timelineRuntime.seek(Math.max(0, playheadMs - delta));
  const tl = timelineRuntime.tl; playheadMs = tl ? tl.time : playheadMs;
  }

  // handle ruler pointer down (seek)
  function onRulerPointerDown(e: PointerEvent) {
    if (!rulerEl || !tracksScrollEl) return;
    draggingPlayhead = true;
    (e.target as Element).setPointerCapture?.((e as any).pointerId);
    onRulerPointerMove(e);
    window.addEventListener('pointermove', onRulerPointerMove);
    window.addEventListener('pointerup', onRulerPointerUp, { once: true });
  }
  function onRulerPointerMove(e: PointerEvent) {
    if (!draggingPlayhead || !rulerEl || !tracksScrollEl) return;
    const rect = rulerEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left)) + tracksScrollEl.scrollLeft;
    const ms = pxToMs(x);
  timelineRuntime.seek(ms);
  const tl = timelineRuntime.tl; playheadMs = tl ? tl.time : playheadMs;
  }
  function onRulerPointerUp() {
    draggingPlayhead = false;
    window.removeEventListener('pointermove', onRulerPointerMove);
  }

  // context menu on right click -> compute time and open existing triggers panel
  function onRulerContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!rulerEl || !tracksScrollEl) return;
    const rect = rulerEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left)) + tracksScrollEl.scrollLeft;
    const ms = pxToMs(x);
    ctxOpen = true;
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxTime = ms;
  }

  function onCueRename(e: MouseEvent, cue: { id: string; time: number; name?: string }) {
    if (!current) return;
    openCueCard({ mode: 'rename', cueId: cue.id, time: cue.time, value: cue.name || '', x: e.clientX, y: e.clientY });
  }

  function onCueDelete(cue: { id: string; time: number; name?: string }) {
    if (!current) return;
    const label = cue.name || cue.id;
    if (!confirm(`Delete cue ${label}?`)) return;
    actionDeleteCue(current.id, cue.id, { commit: true, recreateRuntime: true });
  const rec = timelineData.getById(current.id)!;
  timelines.delete(rec.id); timelines.create(rec);
  current = rec; attachRuntime();
  }

  // context menu actions -> wire to app stores
  function ctxAddKeyframe() {
    ctxOpen = false;
    if (!current) return;
    const sel = get(timelineEditorState).selectedElementId ?? layers[0]?.id;
    if (!sel) return;
    const kf: Keyframe = { id: makeKeyframeId(), elementId: sel, property: 'opacity', time: ctxTime, value: 1, easing: 'linear' };
    // Use centralized action to add keyframe, ensure clip coverage, and commit once
  actionAddKeyframe(current.id, kf, { ensureClipCovers: true, commit: true });
    // Visual cue: briefly highlight the new keyframe marker
    lastCreatedKeyframeId = kf.id;
    setTimeout(() => { if (lastCreatedKeyframeId === kf.id) lastCreatedKeyframeId = null; }, 1200);
  }
let lastCreatedKeyframeId: string | null = null;
  function ctxAddTrigger() {
    ctxOpen = false;
    // Open actions panel (preset trigger authoring)
    actionsOpen = true;
    actionsTime = ctxTime;
    selectedAction = 'log';
    actionLogMessage = `Cue fired at ${formatTime(ctxTime)}`;
    alsoAddCue = true;
  }
  function ctxAddCue() {
    ctxOpen = false;
    if (!current) return;
    openCueCard({ mode: 'add', time: ctxTime, value: pendingCueName || '', x: ctxX, y: ctxY });
  }

  // track clip drag/resize skeleton (provide integration hooks)
  // Clip drag/resize handled in Tracks component

  // watch container and scroll to compute viewportPx/hScroll
  let ro: ResizeObserver | null = null;
  function updateViewport() {
    if (!tracksScrollEl) return;
    viewportPx = tracksScrollEl.clientWidth;
    hScroll = tracksScrollEl.scrollLeft;
  }

  onMount(() => {
  // While the timeline editor is active, direct undo/redo to the unified stage scope
    let prevScope: FocusScope = get(focusScope);
  setFocusScope('stage');
  // initial runtime attach
  attachRuntime();
  // Capture baseline snapshot for current stage so first change is undoable
  if (current) commitTimelineChange(current.id, 'timeline');
    // subscribe to selectedTimelineId to (re)attach runtime when timeline changes
  const unsubA = selectedTimelineId.subscribe(() => { attachRuntime(); if (current) commitTimelineChange(current.id, 'timeline'); });
    if (tracksScrollEl) {
      tracksScrollEl.addEventListener('scroll', updateViewport);
      ro = new ResizeObserver(updateViewport);
      ro.observe(tracksScrollEl);
      updateViewport();
    }
    // If you have a real timeline runtime, subscribe here to its time/playing changes
    const t = setInterval(() => {
      if (timelineRuntime.isPlaying) {
        const tl = timelineRuntime.tl; if (tl) playheadMs = tl.time;
      }
    }, 50);
    return () => {
      clearInterval(t);
      if (tracksScrollEl) tracksScrollEl.removeEventListener('scroll', updateViewport);
      ro?.disconnect();
  unsubA(); unsubVM();
      if (detachRuntime) { detachRuntime(); detachRuntime = null; }
      // Restore previous focus scope when leaving the editor
      setFocusScope(prevScope);
    };
  });

  onDestroy(() => {
    // noop
  });

  // zoom binding (slider)
  function onZoomChange(val: number) {
    // Clamp value and apply
    zoom = Math.max(0.25, Math.min(2, val));
    // Anchor zoom around playhead and refresh viewport/scroll
    if (tracksScrollEl) {
      const ppsNow = basePps * zoom;
      const contentWidth = (current ? (current.duration / 1000) * ppsNow : 0);
      const targetCenter = (playheadMs / 1000) * ppsNow;
      const desiredLeft = targetCenter - (tracksScrollEl.clientWidth / 2);
      const maxLeft = Math.max(0, contentWidth - tracksScrollEl.clientWidth);
      tracksScrollEl.scrollLeft = Math.max(0, Math.min(maxLeft, desiredLeft));
      updateViewport();
    }
    // optional: persist zoom to editor settings store
  }

  // small keyboard helpers
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === ' ' ) { e.preventDefault(); togglePlayPause(); }
    if (e.key === 'ArrowRight') stepForwardFrame();
    if (e.key === 'ArrowLeft') stepBackwardFrame();
  }

  function confirmTrigger() {
    if (!current) { actionsOpen = false; return; }
    // Optionally add a cue at selected time (to make 'cue' triggers time-addressable)
    let createdCue: { id: string; name?: string; time: number } | null = null;
    if (alsoAddCue && actionsTime != null) {
      const name = (pendingCueName || '').trim();
      try { actionAddCue(current.id, { time: actionsTime, name: name || undefined }, { commit: true, recreateRuntime: true }); }
      catch (e:any) { alert(e?.message || 'Failed to add cue'); return; }
      const rec = timelineData.getById(current.id)!;
      const last = [...(rec.cuePoints ?? [])].filter(c=>c.time===actionsTime).sort((a,b)=>a.id.localeCompare(b.id)).pop();
  if (last) createdCue = { id: last.id, name: last.name, time: last.time };
  current = rec;
    }
    // Build action list
    const actions: any[] = [];
    switch (selectedAction) {
      case 'log': actions.push({ type: 'log', message: actionLogMessage || 'Trigger fired' }); break;
      case 'playTimeline': actions.push({ type: 'playTimeline', timelineId: current.id }); break;
      case 'pauseTimeline': actions.push({ type: 'pauseTimeline', timelineId: current.id }); break;
      case 'stopTimeline': actions.push({ type: 'stopTimeline', timelineId: current.id }); break;
    }
    const source: any = { kind: 'timeline.event', timelineId: current.id, event: 'cue' };
    if (createdCue) { source.cueId = createdCue.id; if (createdCue.name) source.cueName = createdCue.name; source.cueTime = createdCue.time; }
    const def = { id: 'trig-' + Math.random().toString(36).slice(2), source, actions, enabled: true } as any;
    // Register + persist
    registerTrigger(def);
    if ((triggersStore as any).add) (triggersStore as any).add(def);
    actionsOpen = false;
  }
  function cancelTrigger() { actionsOpen = false; }

  // End-of-timeline handle now lives in Ruler; no duplicate here
</script>

<!-- =========================
   UI Markup (Tailwind)
   ========================= -->
<svelte:window on:keydown={onKeyDown} />
<div class="w-full h-[420px] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded shadow-sm"
  bind:this={containerEl}
  role="application" aria-label="Timeline Editor">

  <!-- top toolbar (play controls & zoom) -->
  <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700">
    <div class="flex items-center gap-2">
      <!-- Play / Pause -->
      <button class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" on:click={togglePlayPause} aria-label="Play/Pause">
        {#if !timelineRuntime.isPlaying}
          <!-- play icon -->
          <svg class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        {:else}
          <!-- pause icon -->
          <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        {/if}
      </button>

      <button class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" on:click={stopTimeline} aria-label="Stop">
        <svg class="w-5 h-5 text-rose-600" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
      </button>

      <div class="text-xs font-mono ml-2">{formatTime(playheadMs)} / {formatTime(current.duration)}</div>
    </div>

    <div class="flex items-center gap-3">
      <button class="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" on:click={() => onZoomChange(Math.max(0.25, zoom - 0.25))}>-</button>
      <input type="range" min="0.25" max="2" step="0.05" bind:value={zoom} on:input={(e) => onZoomChange(Number((e.target as HTMLInputElement).value))} class="w-44" />
      <button class="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" on:click={() => onZoomChange(Math.min(2, zoom + 0.25))}>+</button>
  <button class="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" on:click={() => onZoomChange(1)}>Fit</button>
    </div>
  </div>

  <div class="flex flex-1 min-h-0">
    <!-- LEFT PANEL: Layers(elements on stage by name) -->
    <aside class="w-56 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
      <div class="text-xs font-semibold px-3 py-2 border-b border-slate-200 dark:border-slate-700">Layers</div>
      <ul class="text-sm overflow-auto h-full">
        {#each layers as layer, idx}
          <li class="px-3 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <div class="w-6 text-xs font-mono opacity-60">{idx+1}</div>
            <div class="flex-1">{layer.name}</div>
            <!-- trigger indicator if any trigger exists on layer's clips -->
            {#if clips.find(c => c.layerId === layer.id && (c.triggers?.length ?? 0) > 0)}
              <div class="text-rose-500">⚡</div>
            {/if}
          </li>
        {/each}
      </ul>
    </aside>

    <!-- CENTER: Ruler + Tracks -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- RULER -->
      <Ruler
        {playheadMs}
        duration={current.duration}
        {zoom}
        {basePps}
        {hScroll}
        {viewportPx}
        timelineId={current.id}
        cues={current.cuePoints ?? []}
        onCueRename={(cue, e)=> onCueRename(e, cue)}
        onCueDelete={(cue)=> onCueDelete(cue)}
        onSeek={(ms) => { timelineRuntime.seek(ms); const tl = timelineRuntime.tl; playheadMs = tl ? tl.time : playheadMs; }}
        onContextMenuAt={(ms, clientX, clientY) => { ctxOpen = true; ctxX = clientX; ctxY = clientY; ctxTime = ms; }}
        onDurationLive={(unclamped) => { if (current) actionSetDuration(current.id, unclamped, { commit: false }); current = timelineData.getById(current.id)!; }}
        onDurationCommit={() => { if (current) actionSetDuration(current.id, current.duration, { commit: true }); }}
      />

      <!-- TRACKS: horizontally scrollable -->
      <div class="flex-1 overflow-auto" bind:this={tracksScrollEl}>
        <Tracks
          {layers}
          {clips}
          duration={current.duration}
          {basePps}
          {zoom}
          {rowHeight}
          minClipPx={MIN_CLIP_PX}
          {hScroll}
          {viewportPx}
          highlightKeyframeId={lastCreatedKeyframeId}
          onClipLive={(c)=>{ if (current) actionMoveClip(current.id, { id: c.id, elementId: c.layerId, start: c.start, end: c.end }, { commit: false }); }}
          onClipCommit={(c)=>{ if (current) actionMoveClip(current.id, { id: c.id, elementId: c.layerId, start: c.start, end: c.end }, { commit: true }); }}
          onKeyframeLive={(kfId, t)=>{ if (current) actionMoveKeyframe(current.id, kfId, t, { commit: false }); }}
          onKeyframeCommit={(kfId, t)=>{ if (current) actionMoveKeyframe(current.id, kfId, t, { commit: true }); }}
        />
      </div>
    </div>
  </div>

  <!-- Context menu -->
  {#if ctxOpen}
    <div class="fixed z-50 shadow-lg rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
         style={`left:${ctxX}px; top:${ctxY}px; min-width: 180px;`}>
      <button class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={ctxAddKeyframe}>Add Keyframe…</button>
      <button class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={ctxAddTrigger}>Add Trigger…</button>
      <button class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={ctxAddCue}>Add Cue Point…</button>
      <div class="px-3 py-2 text-xs text-slate-500">Esc to close</div>
    </div>
    <!-- backdrop to close -->
    <button class="fixed inset-0 z-40" on:click={() => (ctxOpen = false)} aria-label="Close context menu"></button>
  {/if}
  {#if actionsOpen}
    <div class="fixed z-50 right-4 top-20 w-80 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 shadow p-3 text-xs space-y-2">
      <div class="flex items-center justify-between">
        <div class="font-semibold">Add Trigger</div>
        <button class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700" on:click={cancelTrigger}>Close</button>
      </div>
      <div class="opacity-70">At {actionsTime !== null ? formatTime(actionsTime) : '--:--.---'}</div>
      <label class="block">Action
  <select class="w-full mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800" value={selectedAction} on:change={(e)=>{ selectedAction = (e.target as HTMLSelectElement).value as any; }}>
          <option value="log">Log message</option>
          <option value="playTimeline">Play this timeline</option>
          <option value="pauseTimeline">Pause this timeline</option>
          <option value="stopTimeline">Stop this timeline</option>
        </select>
      </label>
      {#if selectedAction === 'log'}
        <label class="block">Message
          <input class="w-full mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800" value={actionLogMessage} on:input={(e)=>{ actionLogMessage = (e.target as HTMLInputElement).value; }}>
        </label>
      {/if}
  <label class="inline-flex items-center gap-2"><input type="checkbox" checked={alsoAddCue} on:change={(e)=>{ alsoAddCue = (e.target as HTMLInputElement).checked; }}> Also add a cue at time</label>
      <div class="flex gap-2 justify-end">
        <button class="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700" on:click={cancelTrigger}>Cancel</button>
        <button class="px-3 py-1 rounded bg-emerald-600 text-white" on:click={confirmTrigger}>Add Trigger</button>
      </div>
    </div>
    <button class="fixed inset-0 z-40" on:click={cancelTrigger} aria-label="Close trigger panel"></button>
  {/if}
  {#if cueCard.open}
    <div class="fixed z-50" style={`left:${cueCard.x}px; top:${cueCard.y}px`}>
      <div class="w-72 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 shadow p-3 text-xs space-y-2">
        <div class="font-semibold">{cueCard.mode === 'add' ? 'Add Cue Point' : 'Rename Cue Point'}</div>
        <div class="opacity-70">At {formatTime(cueCard.time)}</div>
        <label class="block">Name (optional, unique)
          <input class="w-full mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800" bind:value={cueCard.value} placeholder="Cue name" />
        </label>
        {#if cueCard.error}
          <div class="text-rose-500">{cueCard.error}</div>
        {/if}
        <div class="flex gap-2 justify-end">
          <button class="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700" on:click={closeCueCard}>Cancel</button>
          <button class="px-3 py-1 rounded bg-emerald-600 text-white" on:click={submitCueCard}>{cueCard.mode === 'add' ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>
    <button class="fixed inset-0 z-40" on:click={closeCueCard} aria-label="Close cue card"></button>
  {/if}
</div>
