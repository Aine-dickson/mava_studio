<script lang="ts">
  // Presentation component for timeline tracks (rows, clips, keyframes, triggers)
  // Emits live/commit callbacks so parent can persist & record history.
  export let layers: Array<{ id: string; name: string; locked?: boolean }> = [];
  export let clips: Array<{ id: string; layerId: string; start: number; end: number; label: string; keyframes?: Array<{ id: string; time: number }>; triggers?: Array<{ id: string; time: number }>; locked?: boolean }> = [];
  export let duration: number;
  export let basePps: number;
  export let zoom: number;
  export let rowHeight = 36;
  export let minClipPx = 12;
  export let hScroll = 0;
  export let viewportPx = 0;
  export let highlightKeyframeId: string | null = null;

  // Callbacks provided by parent
  export let onClipLive: (clip: { id: string; layerId: string; start: number; end: number }) => void;
  export let onClipCommit: (clip: { id: string; layerId: string; start: number; end: number }) => void;
  export let onKeyframeLive: (kfId: string, newTime: number) => void;
  export let onKeyframeCommit: (kfId: string, newTime: number) => void;

  function ppsEffective() { return basePps * zoom; }
  function msToPx(ms: number) { return (ms / 1000) * ppsEffective(); }
  // reactive pps for template expressions
  $: pps = basePps * zoom;
  function pxToMs(px: number) { return Math.round((px / ppsEffective()) * 1000); }

  function onClipPointerDown(e: PointerEvent, clip: any, mode: 'move' | 'resize-start' | 'resize-end') {
    e.stopPropagation();
    if (clip?.locked) { (e.currentTarget as HTMLElement | null)?.blur?.(); return; }
    if (mode === 'move') {
      const el = e.currentTarget as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const edgeThreshold = 8;
        if (localX <= edgeThreshold) mode = 'resize-start';
        else if (rect.width - localX <= edgeThreshold) mode = 'resize-end';
      }
    }
    const startX = e.clientX;
    const startStart = clip.start;
    const startEnd = clip.end;
    function onMove(ev: PointerEvent) {
      if (clip?.locked) return;
      const dx = ev.clientX - startX; const dt = pxToMs(dx);
      let ns = startStart, ne = startEnd;
      if (mode === 'move') {
        const width = startEnd - startStart;
        ns = Math.max(0, Math.min(duration - width, startStart + dt));
        ne = ns + width;
      } else if (mode === 'resize-start') {
        ns = Math.max(0, Math.min(startEnd, startStart + dt));
        if (ns > ne) ns = ne;
      } else if (mode === 'resize-end') {
        ne = Math.max(startStart, Math.min(duration, startEnd + dt));
        if (ne < ns) ne = ns;
      }
      clip.start = ns; clip.end = ne;
      onClipLive?.({ id: clip.id, layerId: clip.layerId, start: ns, end: ne });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onClipCommit?.({ id: clip.id, layerId: clip.layerId, start: clip.start, end: clip.end });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }
</script>

<div class="relative" style={`height:${layers.length * rowHeight}px; width:${Math.max((duration/1000)*pps, hScroll + viewportPx, viewportPx)}px`}>
  <!-- row backgrounds -->
  {#each layers as layer, i}
    <div class={`absolute left-0 right-0 ${i % 2 === 0 ? 'bg-white/0 dark:bg-slate-900/20' : ''}`} style={`top:${i*rowHeight}px; height:${rowHeight}px`}></div>
  {/each}

  <!-- clips -->
  {#each clips as clip (clip.id)}
    {#key clip.id}
      {#if layers.findIndex(l=>l.id === clip.layerId) !== -1}
        {@const rowIndex = layers.findIndex(l=>l.id === clip.layerId)}
        <div
          class="absolute rounded-sm shadow-sm flex items-center overflow-hidden select-none"
          style={`left:${(clip.start/1000)*pps}px; top:${rowIndex*rowHeight + 6}px; width:${Math.max(minClipPx, ((clip.end - clip.start)/1000)*pps)}px; height:${rowHeight - 12}px; background: linear-gradient(90deg, rgba(59,130,246,0.9), rgba(37,99,235,0.75))`}
          aria-disabled={clip.locked ? 'true' : 'false'}
          class:opacity-60={clip.locked}
          class:cursor-not-allowed={clip.locked}
          on:pointerdown={(e) => onClipPointerDown(e, clip, 'move')}>
          <!-- resize handle (start) -->
          <div class="w-6 h-full bg-white/10 hover:bg-white/25" class:cursor-ew-resize={!clip.locked} class:cursor-not-allowed={clip.locked} on:pointerdown={(e) => onClipPointerDown(e, clip, 'resize-start')}></div>

          <div class="flex-1 px-2 text-xs font-medium text-white truncate">{clip.label}{#if clip.locked}<span class="ml-1 align-middle" title="Locked">🔒</span>{/if}</div>

          <!-- resize handle (end) -->
          <div class="w-6 h-full bg-white/10 hover:bg-white/25" class:cursor-ew-resize={!clip.locked} class:cursor-not-allowed={clip.locked} on:pointerdown={(e) => onClipPointerDown(e, clip, 'resize-end')}></div>

          <!-- keyframes inside clip -->
          {#each clip.keyframes ?? [] as kf}
            <div class="absolute -translate-y-1/2 cursor-ew-resize" style={`left:${((kf.time - clip.start)/1000)*pps}px; top:50%; transform: translate(-50%,-50%);`}
                 title={`Keyframe @ ${((kf.time||0)/1000).toFixed(3)}s`}
                 on:pointerdown={(e)=>{
                   e.stopPropagation();
                   const startX = e.clientX; const startTime = kf.time;
                   function onMove(ev: PointerEvent){
                     const dx = ev.clientX - startX; const dt = pxToMs(dx);
                     const newTime = Math.max(clip.start, Math.min(clip.end, startTime + dt));
                     onKeyframeLive?.(kf.id, newTime);
                     kf.time = newTime;
                   }
                   function onUp(){
                     window.removeEventListener('pointermove', onMove);
                     window.removeEventListener('pointerup', onUp);
                     onKeyframeCommit?.(kf.id, kf.time);
                   }
                   window.addEventListener('pointermove', onMove);
                   window.addEventListener('pointerup', onUp, { once: true });
                 }}>
              <div class={`w-3 h-3 rotate-45 ${highlightKeyframeId === kf.id ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`}></div>
            </div>
          {/each}

          <!-- triggers inside clip -->
          {#each clip.triggers ?? [] as trig}
            <div title="Trigger" class="absolute -translate-y-full" style={`left:${((trig.time - clip.start)/1000)*pps}px; top:0; transform: translateX(-50%);`}>
              <div class="w-3 h-3 bg-rose-500 rounded-sm"></div>
            </div>
          {/each}
        </div>
      {/if}
    {/key}
  {/each}

  <!-- row labels ghost for alignment (no-op) -->
  {#each layers as layer, i}
    <div class="absolute left-0 pointer-events-none opacity-0" style={`top:${i*rowHeight}px; height:${rowHeight}px; width:100%`}></div>
  {/each}
</div>

<style>
  /* no extra styles */
  :global(.cursor-ew-resize) { cursor: ew-resize; }
</style>
