<!-- DebugPanel disabled -->
<script lang="ts">
  import { metrics, resetDebugMetrics, snapshotDebugMetrics } from '../stores/project';
  import { spatialSettings, updateSpatialSettings } from '../stores/settings';
  import { visibilitySettings, updateVisibilitySettings } from '../stores/visibility';
  import { currentPageId } from '../stores/project';
  import { getVisibleElementIds } from '../stores/project';
  import { get, derived } from 'svelte/store';
  import { timelines } from '../stores/timelines';

  let open = $state(true);

  const stats = derived([metrics, currentPageId], ([$m, $pid]) => {
    const visible = $pid ? getVisibleElementIds($pid) : null;
    return {
      spatial: $m.spatial,
      transforms: $m.transforms,
      queries: $m.queries,
      visibleCount: visible ? visible.size : null,
      pageId: $pid
    };
  });

  function toggle() { open = !open; }
  function reset() { resetDebugMetrics(); }

  function applySpatialPatch(patch: Partial<typeof $spatialSettings>) {
    updateSpatialSettings(patch);
  }
  function applyVisibilityPatch(patch: Partial<typeof $visibilitySettings>) {
    updateVisibilitySettings(patch);
  }

  let lastSnapshot = $state<any | null>(null);
  function takeSnapshot() { lastSnapshot = snapshotDebugMetrics(); }

  // Demo timeline wiring
  let demoId = 'debug-demo';
  let created = false;
  let lastEvent: any = null;

  function ensureDemo() {
    if (created) return;
    const tl = timelines.create({ id: demoId, duration: 3000, loop: true, cuePoints: [
      { id: 'one', time: 500, label: '0.5s' },
      { id: 'two', time: 1500, label: '1.5s' }
    ]});
    tl.on((e)=>{ lastEvent = e; });
    created = true;
  }
  function play() { ensureDemo(); timelines.get(demoId)?.play(); }
  function pause() { timelines.get(demoId)?.pause(); }
  function stop() { timelines.get(demoId)?.stop(); }
  function seek(ms: number) { ensureDemo(); timelines.get(demoId)?.seek(ms); }
</script>

 <style></style>

<!-- Debug Panel temporarily disabled from preview -->
<!--
<div class="absolute top-2 right-2 z-50 text-xs panel">
  <button class="px-2 py-1 rounded bg-slate-800 text-white shadow hover:bg-slate-700" onclick={toggle}>{open ? 'Hide' : 'Show'} Debug</button>
  {#if open}
    <div class="mt-2 w-[380px] max-h-[70vh] overflow-auto p-3 rounded bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow border border-slate-300 dark:border-slate-600 space-y-4">
      <div class="flex justify-between items-center">
        <h2 class="text-sm font-bold">Debug Panel</h2>
        <div class="space-x-2">
          <button class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600" onclick={reset}>Reset</button>
          <button class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600" onclick={takeSnapshot}>Snapshot</button>
        </div>
      </div>

      <section>
        <div class="section-title mb-1">Spatial Settings</div>
        <div class="grid-cols-2-auto mb-2">
          <label for="spatial-enabled">Enabled</label>
          <input id="spatial-enabled" type="checkbox" bind:checked={$spatialSettings.enabled} onchange={(e)=>applySpatialPatch({ enabled: (e.target as HTMLInputElement).checked })}>
          <label for="spatial-threshold">Threshold</label>
          <input id="spatial-threshold" type="number" class="w-20" bind:value={$spatialSettings.threshold} min={0} onchange={(e)=>applySpatialPatch({ threshold: Number((e.target as HTMLInputElement).value) })}>
          <label for="spatial-cellsize">Cell Size</label>
          <input id="spatial-cellsize" type="number" class="w-20" bind:value={$spatialSettings.cellSize} min={8} step={8} onchange={(e)=>applySpatialPatch({ cellSize: Number((e.target as HTMLInputElement).value) })}>
        </div>
      </section>

      <section>
        <div class="section-title mb-1">Visibility Culling</div>
        <div class="grid-cols-2-auto mb-2">
          <label for="vis-enabled">Enabled</label>
          <input id="vis-enabled" type="checkbox" bind:checked={$visibilitySettings.enabled} onchange={(e)=>applyVisibilityPatch({ enabled: (e.target as HTMLInputElement).checked })}>
          <label for="vis-margin">Margin (px)</label>
          <input id="vis-margin" type="number" class="w-20" bind:value={$visibilitySettings.margin} min={0} onchange={(e)=>applyVisibilityPatch({ margin: Number((e.target as HTMLInputElement).value) })}>
        </div>
      </section>

      <section>
        <div class="section-title mb-1">Spatial Metrics</div>
        <div class="grid-cols-2-auto">
          <div>Builds</div><div>{$metrics.spatial.builds}</div>
          <div>Last Build (ms)</div><div>{$metrics.spatial.lastBuildMs.toFixed(2)}</div>
          <div>Avg Build (ms)</div><div>{$metrics.spatial.avgBuildMs.toFixed(2)}</div>
          <div>Last Elements</div><div>{$metrics.spatial.lastElements}</div>
          <div>Last Cells</div><div>{$metrics.spatial.lastCells}</div>
          <div>Adaptations</div><div>{$metrics.spatial.adaptations}</div>
          <div>Last Adapt</div><div>{#if $metrics.spatial.lastAdaptFrom !== null}{$metrics.spatial.lastAdaptFrom}→{$metrics.spatial.lastAdaptTo} ({$metrics.spatial.lastAdaptReason}){:else}-{/if}</div>
        </div>
      </section>

      <section>
        <div class="section-title mb-1">Transform Metrics</div>
        <div class="grid-cols-2-auto">
          <div>Frames</div><div>{$metrics.transforms.frames}</div>
          <div>Last Flush (ms)</div><div>{$metrics.transforms.lastFlushMs.toFixed(2)}</div>
          <div>Avg Flush (ms)</div><div>{$metrics.transforms.avgFlushMs.toFixed(2)}</div>
          <div>Last Applied</div><div>{$metrics.transforms.lastAppliedCount}</div>
          <div>Total Applied</div><div>{$metrics.transforms.totalApplied}</div>
        </div>
      </section>

      <section>
        <div class="section-title mb-1">Query / HitTest Metrics</div>
        <div class="grid-cols-2-auto">
          <div>Rect Queries</div><div>{$metrics.queries.rectCount}</div>
          <div>Avg Rect Candidates</div><div>{$metrics.queries.avgRectCandidates.toFixed(2)}</div>
          <div>Point Queries</div><div>{$metrics.queries.pointCount}</div>
          <div>Hit Tests</div><div>{$metrics.queries.hitTestCount}</div>
          <div>Avg Hit Candidates</div><div>{$metrics.queries.avgHitTestCandidates.toFixed(2)}</div>
        </div>
      </section>

      <section>
        <div class="section-title mb-1">Visibility Stats</div>
        <div class="grid-cols-2-auto">
          <div>Page</div><div>{$stats.pageId}</div>
          <div>Visible Count</div><div>{#if $stats.visibleCount !== null}{$stats.visibleCount}{:else}-{/if}</div>
        </div>
      </section>

      {#if lastSnapshot}
      <section>
        <div class="section-title mb-1">Snapshot</div>
        <pre class="text-[10px] leading-tight max-h-40 overflow-auto bg-slate-100 dark:bg-slate-800 p-2 rounded">{JSON.stringify(lastSnapshot, null, 2)}</pre>
      </section>
      {/if}

      <section>
        <div class="section-title mb-1">Timeline Demo</div>
        <div class="flex items-center gap-2">
          <button class="px-2 py-0.5 rounded bg-emerald-600 text-white" onclick={play}>Play</button>
          <button class="px-2 py-0.5 rounded bg-amber-600 text-white" onclick={pause}>Pause</button>
          <button class="px-2 py-0.5 rounded bg-rose-600 text-white" onclick={stop}>Stop</button>
          <button class="px-2 py-0.5 rounded bg-slate-200" onclick={() => seek(0)}>Seek 0</button>
          <button class="px-2 py-0.5 rounded bg-slate-200" onclick={() => seek(1500)}>Seek 1.5s</button>
        </div>
        <div class="mt-1 text-[10px]">Last: {JSON.stringify(lastEvent)}</div>
      </section>

    </div>
  {/if}
</div>
-->
