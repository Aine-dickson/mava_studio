<script lang="ts">
    import { currentPageId } from '../stores/project';
    import { createElementOfType } from '../stores/project';
    import { get } from 'svelte/store';
    import type { ElementType } from '../lib/schemas/element';

    const elementTypes: { type: ElementType; label: string }[] = [
        { type: 'rectangle', label: 'Rectangle' },
        { type: 'ellipse', label: 'Circle' },
        { type: 'line', label: 'Line' },
        { type: 'text', label: 'Text' },
        { type: 'image', label: 'Image' },
        { type: 'hotspot', label: 'Hotspot' },
        { type: 'collection', label: 'Collection' }
    ];

    function add(t: ElementType) {
        const pid = get(currentPageId);
        if (!pid) return;
        createElementOfType(t, pid);
    }
</script>

<div class="p-3 space-y-3 text-sm">
    <h3 class="font-semibold text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Add Elements</h3>
    <div class="grid grid-cols-2 gap-2">
        {#each elementTypes as e}
        <button type="button" class="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-left text-xs" on:click={() => add(e.type)}>{e.label}</button>
        {/each}
    </div>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Elements are placed with an automatic staggered layout near the origin. You can drag & resize immediately.</p>
</div>

<style>
  button { transition: background-color 120ms; }
</style>