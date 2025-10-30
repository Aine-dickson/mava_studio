<script lang="ts" context="module">
  export type ToolbarMode = 'collection' | 'multiselect';
</script>
<script lang="ts">
    import { get } from 'svelte/store';
    import { currentPageId, ungroupCollection, alignCollectionMembers, distributeCollectionMembers, groupSelectedElements, alignSelected, distributeSelected, selectedElementIds, alignSingleToStage } from '../stores/project';
    import { tooltip } from '../lib/actions/tooltip';
    export let mode: ToolbarMode;            // determines scope
    export let singleStageAlign: boolean = false; // when true and only one element selected, align relative to stage instead of selection
    export let targetCollectionId: string | null = null; // required when mode==='collection'
    export let pageScope: string | null = null; // optional explicit page id
    import { icons } from '../lib/iconRegistry';
    /** placement: 'stage' renders floating absolute toolbar near selection.
     *  'panel' renders inline (static) for right side panel usage. */
    export let placement: 'stage' | 'panel' = 'stage';

    const pageId = () => pageScope || get(currentPageId);

    // Action wrappers
    function ungroup(e: MouseEvent) { e.stopPropagation(); if (!targetCollectionId) return; ungroupCollection(targetCollectionId); }
    function groupSelected(e: MouseEvent) { e.stopPropagation(); groupSelectedElements(); }
    function alignMembers(e: MouseEvent, mode: string) { e.stopPropagation(); if (!targetCollectionId) return; alignCollectionMembers(targetCollectionId, mode as any); }
    function distributeMembers(e: MouseEvent, axis: 'horizontal'|'vertical') { e.stopPropagation(); if (!targetCollectionId) return; distributeCollectionMembers(targetCollectionId, axis); }
    function alignSelection(e: MouseEvent, mode: string) { e.stopPropagation(); if (singleStageAlign && $selectedElementIds.size===1) { alignSingleToStage(pageId(), mode as any); } else { alignSelected(pageId(), mode as any); } }
    function distributeSelection(e: MouseEvent, axis: 'horizontal'|'vertical') { e.stopPropagation(); distributeSelected(pageId(), axis); }
</script>

<div class="unified-toolbar {placement}" style:transform={ placement==='stage' ? `translateY(calc(-100% - 10px))` : undefined }>
    {#if mode === 'collection'}
        <button use:tooltip={"Ungroup"} aria-label="Ungroup collection" on:click={ungroup} class="icon-btn">{@html icons.ungroup}</button>

        {#if placement==='stage'}
        <span class="sep"></span>
        {/if}

        <button use:tooltip={"Align left"} aria-label="Align members left" on:click={(e)=>alignMembers(e,'left')} class="icon-btn">{@html icons.left}</button>
        <button use:tooltip={"Align horizontal center"} aria-label="Align members horizontal center" on:click={(e)=>alignMembers(e,'hcenter')} class="icon-btn">{@html icons.hcenter}</button>
        <button use:tooltip={"Align right"} aria-label="Align members right" on:click={(e)=>alignMembers(e,'right')} class="icon-btn">{@html icons.right}</button>

        {#if placement==='stage'}
        <span class="sep"></span>
        {/if}

        <button use:tooltip={"Align top"} aria-label="Align members top" on:click={(e)=>alignMembers(e,'top')} class="icon-btn">{@html icons.top}</button>
        <button use:tooltip={"Align vertical center"} aria-label="Align members vertical center" on:click={(e)=>alignMembers(e,'vcenter')} class="icon-btn">{@html icons.vcenter}</button>
        <button use:tooltip={"Align bottom"} aria-label="Align members bottom" on:click={(e)=>alignMembers(e,'bottom')} class="icon-btn">{@html icons.bottom}</button>

        {#if placement==='stage'}
        <span class="sep"></span>
        {/if}

        <button use:tooltip={"Distribute horizontally"} aria-label="Distribute members horizontally" on:click={(e)=>distributeMembers(e,'horizontal')} class="icon-btn">{@html icons.distributeh}</button>
        <button use:tooltip={"Distribute vertically"} aria-label="Distribute members vertically" on:click={(e)=>distributeMembers(e,'vertical')} class="icon-btn">{@html icons.distributev}</button>
    {:else}
    {#if placement === 'stage'}
      <button use:tooltip={"Group (Ctrl+G)"} aria-label="Group selection" on:click={groupSelected} class="icon-btn">{@html icons.group}</button>
    {/if}
        <button use:tooltip={"Align left"} aria-label="Align left" on:click={(e)=>alignSelection(e,'left')} class="icon-btn">{@html icons.left}</button>
        <button use:tooltip={"Align horizontal center"} aria-label="Align horizontal center" on:click={(e)=>alignSelection(e,'hcenter')} class="icon-btn">{@html icons.hcenter}</button>
        <button use:tooltip={"Align right"} aria-label="Align right" on:click={(e)=>alignSelection(e,'right')} class="icon-btn">{@html icons.right}</button>

        {#if placement==='stage'}
        <span class="sep"></span>
        {/if}

        <button use:tooltip={"Align top"} aria-label="Align top" on:click={(e)=>alignSelection(e,'top')} class="icon-btn">{@html icons.top}</button>
        <button use:tooltip={"Align vertical center"} aria-label="Align vertical center" on:click={(e)=>alignSelection(e,'vcenter')} class="icon-btn">{@html icons.vcenter}</button>
        <button use:tooltip={"Align bottom"} aria-label="Align bottom" on:click={(e)=>alignSelection(e,'bottom')} class="icon-btn">{@html icons.bottom}</button>

        {#if placement==='stage'}
        <span class="sep"></span>
        {/if}

        <button use:tooltip={"Distribute horizontally"} aria-label="Distribute horizontally" on:click={(e)=>distributeSelection(e,'horizontal')} class="icon-btn">{@html icons.distributeh}</button>
        <button use:tooltip={"Distribute vertically"} aria-label="Distribute vertically" on:click={(e)=>distributeSelection(e,'vertical')} class="icon-btn">{@html icons.distributev}</button>
    {/if}
</div>

<style>
    /* .unified-toolbar { position:absolute; top:-6px; left:32px; display:flex; gap:4px; background:rgba(17,24,39,0.9); padding:4px 6px; border-radius:6px; backdrop-filter:blur(4px); box-shadow:0 4px 12px rgba(0,0,0,0.25); } */
    .unified-toolbar { display:flex; gap:4px; }
    .unified-toolbar.stage { position:absolute; top:-6px; left:32px; background:rgba(17,24,39,0.9); padding:4px 6px; border-radius:6px; backdrop-filter:blur(4px); box-shadow:0 4px 12px rgba(0,0,0,0.25); }
    .unified-toolbar.panel { position:relative; padding:0 0 6px 0; background:transparent; box-shadow:none; border-radius:0; }
    .unified-toolbar.panel .sep { height:20px; align-self:center; }
  /* Icon sizing: reduced to 20px per request */
  .unified-toolbar { --toolbar-icon-color:#f1f5f9; --toolbar-icon-size:1.2rem; }
  .unified-toolbar button { font-size:11px; line-height:1; padding:2px 4px; border:1px solid #334155; background:#1e293b; color:var(--toolbar-icon-color); border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; min-width: calc(var(--toolbar-icon-size) + 4px); height: calc(var(--toolbar-icon-size) + 2px); }
  .unified-toolbar button:hover { background:#334155; --toolbar-icon-color:#ffffff; }
  /* Ensure imported raw SVGs inherit currentColor */
  .unified-toolbar button :global(svg) { width:var(--toolbar-icon-size); height:var(--toolbar-icon-size); display:block; fill:currentColor; }
  .unified-toolbar button :global(svg [stroke]) { stroke: currentColor; }
  .unified-toolbar button:focus-visible { outline:2px solid #3b82f6; outline-offset:2px; }
  .unified-toolbar .sep { width:1px; background:#475569; margin:0 2px; }
</style>
