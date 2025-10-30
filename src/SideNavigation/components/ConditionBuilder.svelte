<script lang="ts">
  import type { ConditionNode, ConditionGroup, ConditionLeaf, VariableOption } from '../../lib/schemas/triggers';
  import ConditionLeafEditor from './ConditionLeafEditor.svelte';

  export let value: ConditionNode | null = null;
  export let variables: VariableOption[] = [];

  // Events: change
  const dispatch = (node: ConditionNode | null) => {
    const e = new CustomEvent('change', { detail: node });
    dispatchEvent(e);
  };

  function addLeaf() {
    const fallbackVar = variables[0]?.name ?? 'var';
    const leaf: ConditionLeaf = {
      kind: 'leaf',
      left: { type: 'variable', name: fallbackVar },
      op: '==',
      right: { type: 'value', value: '' }
    };
    if (!value) {
      value = leaf;
    } else if (value.kind === 'group') {
      value.items = [...value.items, leaf];
    } else {
      value = { kind: 'group', logic: 'AND', items: [value, leaf] } as ConditionGroup;
    }
    dispatch(value);
  }

  function clearAll() {
    value = null;
    dispatch(value);
  }

  function removeAt(idx: number) {
    if (!value) return;
    if (value.kind === 'leaf') {
      value = null;
    } else {
      const items = value.items.slice();
      items.splice(idx, 1);
      if (items.length === 1) value = items[0]; else value.items = items;
    }
    dispatch(value);
  }

  function updateLeaf(idx: number, next: ConditionLeaf) {
    if (!value) return;
    if (value.kind === 'leaf') {
      value = next;
    } else {
      const items = value.items.slice();
      items[idx] = next;
      value = { ...value, items };
    }
    dispatch(value);
  }
</script>

<style>
  .wrap { border:1px dashed #cbd5e1; border-radius:10px; padding:8px; }
  .row { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
  /* input/select styles are provided by parent components */
  .icon-btn { border:1px solid #e2e8f0; color:#475569; border-radius:6px; padding:4px 6px; font-size:12px; cursor:pointer; }
  .chip { font-size:10px; padding:2px 6px; border-radius:999px; color:#3730a3; border:1px solid #c7d2fe; }
</style>

<div style="display:flex; align-items:center; justify-content: space-between; margin-bottom:6px;">
  <h4 style="margin:0; font-size:13px; color:#475569;">Conditions (optional)</h4>
  <div style="display:flex; gap:6px;">
    <button class="icon-btn" on:click|preventDefault={addLeaf}>+ Add</button>
    <button class="icon-btn" on:click|preventDefault={clearAll}>Clear</button>
  </div>
  
</div>

<div class="wrap">
  {#if !value}
    <div class="row" style="color:#64748b; font-size:12px;">No conditions. Add one to get started.</div>
  {:else if value.kind === 'leaf'}
    <ConditionLeafEditor value={value} on:update={(e:any)=>updateLeaf(0,e.detail)} on:delete={()=>clearAll()} {variables} />
  {:else}
    {#each value.items as item, i}
      <div class="row">
        <ConditionLeafEditor value={item as ConditionLeaf} on:update={(e:any)=>updateLeaf(i,e.detail)} on:delete={()=>removeAt(i)} {variables} />
        {#if i < value.items.length - 1}
          <span class="chip">{value.logic}</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>
 
