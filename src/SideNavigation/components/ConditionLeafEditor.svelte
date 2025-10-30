<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ConditionLeaf, VariableOption } from '../../lib/schemas/triggers';
  const dispatch = createEventDispatcher();
  export let value: ConditionLeaf;
  export let variables: VariableOption[] = [];

  function set(k: keyof ConditionLeaf, v: any) {
    const next = { ...value } as ConditionLeaf;
    if (k === 'left' || k === 'right') Object.assign(next[k], v); else (next as any)[k] = v;
    dispatch('update', next);
  }
</script>

<style>
  .row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .select, .input { padding:6px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; }
  .icon-btn { border:1px solid #e2e8f0; color:#475569; border-radius:6px; padding:4px 6px; font-size:12px; cursor:pointer; }
</style>

<div class="row">
  <select class="select" on:change={(e:any)=>set('left',{ type:'variable', name:e.target.value })}>
    {#each variables as v}
      <option value={v.name} selected={value.left.type==='variable' && value.left.name===v.name}>{v.name}</option>
    {/each}
  </select>
  <select class="select" on:change={(e:any)=>set('op', e.target.value)}>
    {#each ['==','!=','>','<','>=','<=','includes'] as op}
      <option value={op} selected={value.op===op}>{op}</option>
    {/each}
  </select>
  <select class="select" on:change={(e:any)=>set('right',{ type: e.target.value==='variable'?'variable':'value', name: undefined, value: undefined })}>
    <option value="value" selected={value.right.type==='value'}>value</option>
    <option value="variable" selected={value.right.type==='variable'}>variable</option>
  </select>
  {#if value.right.type==='variable'}
    <select class="select" on:change={(e:any)=>set('right',{ type:'variable', name:e.target.value })}>
      {#each variables as v}
        <option value={v.name} selected={(value.right as any).name===v.name}>{v.name}</option>
      {/each}
    </select>
  {:else}
    <input class="input" placeholder="value" value={(value.right as any).value ?? ''} on:input={(e:any)=>set('right',{ type:'value', value:e.target.value })} />
  {/if}
  <button class="icon-btn" on:click={() => dispatch('delete')}>Del</button>
</div>
