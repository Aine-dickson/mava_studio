<script lang="ts">
  import type { ActionDef, ConditionNode, TimelineOption } from '../../lib/schemas/triggers';
  import ConditionBuilder from './ConditionBuilder.svelte';

  export let action: ActionDef;
  export let timelines: TimelineOption[] = [];
  export let variables: { name: string; type: 'string'|'number'|'boolean' }[] = [];
  export let index: number = 0;

  // Events: update, delete, move
  function emit(type: string, detail?: any) {
    const e = new CustomEvent(type, { detail });
    dispatchEvent(e);
  }

  function setAction(next: ActionDef) {
    emit('update', { index, action: next });
  }

  function setCondition(node: ConditionNode | null) {
    setAction({ ...(action as any), condition: node ?? null });
  }
</script>

<style>
  .card { border:1px solid #e2e8f0; border-radius:10px; padding:8px; min-width: 220px; box-shadow: 0 1px 2px rgba(2,6,23,0.06); display:flex; flex-direction:column; gap:6px; }
  .top { display:flex; align-items:center; justify-content: space-between; }
  .drag { cursor:grab; color:#64748b; }
  .label { font-weight:600; font-size:12px; }
  .controls { display:flex; gap:6px; }
  .icon-btn { border:1px solid #e2e8f0; color:#475569; border-radius:6px; padding:4px 6px; font-size:12px; cursor:pointer; }
  .select, .input { padding:6px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; }
  label { font-size:11px; color:#475569; }
</style>

<div class="card">
  <div class="top">
    <span class="drag">≡</span>
    <span class="label">
      {#if action.kind === 'log'}Log{:else if action.kind==='timeline.play'}Play Timeline{:else if action.kind==='timeline.pause'}Pause Timeline{:else if action.kind==='timeline.stop'}Stop Timeline{:else if action.kind==='timeline.seek'}Seek Timeline{/if}
    </span>
    <div class="controls">
      <button class="icon-btn" on:click={() => emit('move', { index, dir: -1 })}>◀</button>
      <button class="icon-btn" on:click={() => emit('move', { index, dir: 1 })}>▶</button>
      <button class="icon-btn" on:click={() => emit('delete', { index })}>Del</button>
    </div>
  </div>

  {#if action.kind === 'log'}
    {#key index}
      {#await Promise.resolve(index) then _}
        <label for={`msg-${index}`}>Message</label>
        <input id={`msg-${index}`} class="input" value={action.message} on:input={(e:any)=>setAction({ ...action, message: e.target.value })} />
      {/await}
    {/key}
  {:else if action.kind === 'timeline.seek'}
    <label for={`tl-${index}`}>Timeline</label>
    <select id={`tl-${index}`} class="select" on:change={(e:any)=>setAction({ ...action, timelineId: e.target.value })}>
      <option value="" selected={!action.timelineId}>Current</option>
      {#each timelines as t}
        <option value={t.id} selected={action.timelineId===t.id}>{t.label ?? t.id}</option>
      {/each}
    </select>
    <label for={`ms-${index}`}>Time (ms)</label>
    <input id={`ms-${index}`} class="input" type="number" value={action.ms} on:input={(e:any)=>setAction({ ...action, ms: +e.target.value })} />
  {:else}
    <label for={`tl-${index}`}>Timeline</label>
    <select id={`tl-${index}`} class="select" on:change={(e:any)=>setAction({ ...action, timelineId: e.target.value })}>
      <option value="" selected={!('timelineId' in action) || !(action as any).timelineId}>Current</option>
      {#each timelines as t}
        <option value={t.id} selected={(action as any).timelineId===t.id}>{t.label ?? t.id}</option>
      {/each}
    </select>
  {/if}

  <details>
    <summary style="font-size:12px; color:#475569;">Optional condition</summary>
    <ConditionBuilder value={action.condition ?? null} on:change={(e:any)=>setCondition(e.detail)} variables={variables} />
  </details>
</div>
