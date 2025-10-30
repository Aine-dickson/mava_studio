<script lang="ts">
  import ActionCard from './ActionCard.svelte';
  import type { ActionDef, TimelineOption } from '../../lib/schemas/triggers';

  export let actions: ActionDef[] = [];
  export let timelines: TimelineOption[] = [];
  export let variables: { name: string; type: 'string'|'number'|'boolean' }[] = [];

  // Events: change (with full array)
  const emit = (detail: any) => dispatchEvent(new CustomEvent('change', { detail }));

  function updateAt(index: number, action: ActionDef) {
    const next = actions.slice();
    next[index] = action;
    emit(next);
  }
  function deleteAt(index: number) {
    const next = actions.slice();
    next.splice(index,1);
    emit(next);
  }
  function move(index: number, dir: number) {
    const next = actions.slice();
    const to = Math.max(0, Math.min(next.length-1, index + dir));
    const [item] = next.splice(index,1);
    next.splice(to,0,item);
    emit(next);
  }
</script>

<style>
  .flow { display:flex; align-items:stretch; gap:8px; overflow-x:auto; padding:8px; border:1px solid #e2e8f0; border-radius:10px; }
</style>

<div class="flow">
  {#each actions as action, i}
    <ActionCard {action} index={i} {timelines} {variables}
      on:update={(e:any)=>updateAt(e.detail.index, e.detail.action)}
      on:delete={(e:any)=>deleteAt(e.detail.index)}
      on:move={(e:any)=>move(e.detail.index, e.detail.dir)}
    />
  {/each}
</div>
