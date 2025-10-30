<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { triggersStore } from '../../stores/triggers';

  export let duration: number;
  export let playheadMs: number;
  export let zoom: number;
  export let basePps: number;
  export let hScroll: number;
  export let viewportPx: number;
  export let cues: Array<{ id: string; time: number; name?: string }>; // from current.cuePoints
  export let timelineId: string;

  // callbacks provided by parent
  export let onSeek: (ms: number) => void;
  export let onContextMenuAt: (ms: number, clientX: number, clientY: number) => void;
  export let onDurationLive: (unclamped: number) => void;
  export let onDurationCommit: () => void;
  export let onCueRename: (cue: { id: string; time: number; name?: string }, ev: MouseEvent) => void;
  export let onCueDelete: (cue: { id: string; time: number; name?: string }) => void;

  const MINOR_LABEL_SPACE = 60;

  function ppsEffective() { return basePps * zoom; }
  function msToPx(ms: number) { return (ms / 1000) * ppsEffective(); }
  function pxToMs(px: number) { return Math.round((px / ppsEffective()) * 1000); }
  // reactive pps used in template to ensure zoom is tracked
  $: pps = basePps * zoom;

  function secondsRange() {
    const pps = ppsEffective();
    const startSec = Math.max(0, Math.floor(hScroll / pps));
    const endSec = Math.max(Math.ceil((hScroll + viewportPx) / pps), Math.ceil((duration ?? 0) / 1000));
    return { startSec, endSec };
  }
  function secondsList(): number[] {
    const { startSec, endSec } = secondsRange();
    const arr: number[] = []; for (let s = startSec; s <= endSec; s++) arr.push(s); return arr;
  }
  function labeledSeconds(): number[] {
    const { startSec, endSec } = secondsRange();
    const out: number[] = []; let lastX = -Infinity;
    for (let s = startSec; s <= endSec; s++) {
      const x = msToPx(s * 1000);
      if (x - lastX >= MINOR_LABEL_SPACE) { out.push(s); lastX = x; }
    }
    return out;
  }
  function showHalf() { return ppsEffective() >= 150; }
  function showQuarter() { return ppsEffective() >= 400; }
  function showTenth() { return ppsEffective() >= 800; }

  let rootEl: HTMLDivElement | null = null;
  function onPointerDown(e: PointerEvent) {
    if (!rootEl) return;
    (e.target as Element).setPointerCapture?.((e as any).pointerId);
    onPointerMove(e);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }
  function onPointerMove(e: PointerEvent) {
    if (!rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left)) + hScroll;
    const ms = pxToMs(x);
    onSeek?.(ms);
  }
  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
  }

  function onCtxMenu(e: MouseEvent) {
    e.preventDefault(); if (!rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left)) + hScroll;
    const ms = pxToMs(x);
    onContextMenuAt?.(ms, e.clientX, e.clientY);
  }

  // End-of-timeline handle drag
  function onEndHandleDown(e: PointerEvent) {
    if (!rootEl) return;
    e.stopPropagation();
    const startX = e.clientX; const startDuration = duration;
    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX; const dt = pxToMs(dx);
      const unclamped = startDuration + dt;
      onDurationLive?.(unclamped);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDurationCommit?.();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function formatTimeLabel(s: number) { return `${s}s`; }
</script>

<div class="h-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 relative select-none"
     bind:this={rootEl}
     role="application" aria-label="Timeline ruler"
     on:pointerdown={onPointerDown}
     on:contextmenu={onCtxMenu}>

  <div class="absolute left-0 top-0 bottom-0" style={`width: ${Math.max((duration/1000)*pps, hScroll + viewportPx, viewportPx)}px`}>
    {#each secondsList() as s}
      <div class="absolute top-0" style={`left:${s*pps}px;`} title={`${s}s`}>
        <div class="h-6 border-l border-slate-300 dark:border-slate-600"></div>
      </div>
    {/each}
    {#each labeledSeconds() as s}
      <div class="absolute top-0" style={`left:${s*pps}px;`}>
        <div class="text-[11px] mt-0.5 -translate-x-1/2 text-slate-700 dark:text-slate-300" style="transform: translateX(-50%); white-space: nowrap;">{formatTimeLabel(s)}</div>
      </div>
    {/each}
    {#if showHalf()}
      {#each secondsList() as s}
  <div class="absolute top-0" style={`left:${(s + 0.5)*pps}px;`} title={`${s}.5s`}><div class="h-4 border-l border-slate-200 dark:border-slate-700 opacity-50"></div></div>
      {/each}
    {/if}
    {#if showQuarter()}
      {#each secondsList() as s}
  <div class="absolute top-0" style={`left:${(s + 0.25)*pps}px;`} title={`${s}.25s`}><div class="h-3 border-l border-slate-200 dark:border-slate-700 opacity-40"></div></div>
  <div class="absolute top-0" style={`left:${(s + 0.75)*pps}px;`} title={`${s}.75s`}><div class="h-3 border-l border-slate-200 dark:border-slate-700 opacity-40"></div></div>
      {/each}
    {/if}
    {#if showTenth()}
      {#each secondsList() as s}
        {#each Array.from({ length: 9 }, (_, i) => i+1) as n}
          <div class="absolute top-0" style={`left:${(s + n/10)*pps}px;`} title={`${s}.${n}s`}><div class="h-2 border-l border-slate-200 dark:border-slate-800 opacity-30"></div></div>
        {/each}
      {/each}
    {/if}

    <!-- cue points -->
    {#each cues ?? [] as cue}
  <div class="absolute top-0 group" style={`left:${(cue.time/1000)*pps}px;`}>
        <div
          title={(cue.name || cue.id)}
          class="w-0 h-0 border-l-6 border-l-transparent border-r-6 border-r-transparent border-b-8 border-b-rose-500 -translate-y-1"
          role="button" tabindex="0"
          on:dblclick={(e)=>{ e.stopPropagation(); onCueRename?.(cue, e); }}
        ></div>
        <button
          class="absolute -top-3 left-2 opacity-0 group-hover:opacity-100 transition text-[10px] px-1 py-0.5 bg-rose-600 text-white rounded"
          title="Delete cue"
          on:click={(e)=>{ e.stopPropagation(); onCueDelete?.(cue); }}
        >×</button>
      </div>
    {/each}

    <!-- trigger badges on ruler -->
    {#each (triggersStore.getForTimeline?.(timelineId) ?? []) as t}
      {#if (t.source?.kind === 'timeline' && t.source.event === 'cue')}
        {#if t.source.cueId}
          {#each (cues ?? []) as cue_}
            {#if cue_.id === t.source.cueId}
              <div class="absolute top-0" style={`left:${((cue_.time)/1000)*pps}px;`} title={`Trigger on cue: ${cue_.name || cue_.id}`}>
                <div class="w-2 h-2 bg-rose-600 rounded-full translate-x-[-50%] translate-y-[2px]"></div>
              </div>
            {/if}
          {/each}
        {/if}
      {/if}
    {/each}

    <!-- End-of-timeline handle in ruler -->
  <div class="absolute top-0 bottom-0 w-1 bg-slate-500 cursor-ew-resize z-20" style={`left:${(duration/1000)*pps}px`} title="Drag to adjust timeline length" on:pointerdown={onEndHandleDown}></div>
  <div class="absolute -top-2 -translate-x-1/2 z-20" style={`left:${(duration/1000)*pps}px`}><div class="w-0 h-0 border-l-5 border-l-transparent border-r-5 border-r-transparent border-b-6 border-b-slate-500"></div></div>
  </div>

  <!-- playhead -->
  <div class="absolute top-0 bottom-0 w-0 pointer-events-none" style={`left:${(playheadMs/1000)*pps}px`}>
    <div class="absolute top-0 bottom-0 -ml-[1px] w-[2px] bg-red-500 border-dashed border-red-300"></div>
    <div class="absolute -top-3 -translate-x-1/2" style={`left:0px`}>
      <div class="w-0 h-0 border-l-6 border-l-transparent border-r-6 border-r-transparent border-b-8 border-b-red-500"></div>
    </div>
  </div>
</div>
