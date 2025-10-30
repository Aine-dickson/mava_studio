<section class="h-full w-full">
    {#if $activeSideNav === 'structure'}
        <Structure/>
    {:else if $activeSideNav === 'elements'}
        <ElementsPanel />
    {:else if $activeSideNav === 'components'}
        <div class="p-4">Components panel</div>
    {:else if $activeSideNav === 'cf_map'}
        <div class="p-4">CF Map panel</div>
    {:else if $activeSideNav === 'assets'}
        <div class="p-4">Assets panel</div>
    {:else if $activeSideNav === 'inspector'}
        <div class="p-4">Inspector panel</div>
    {:else if $activeSideNav === 'animations'}
        <div class="p-4">Animations panel</div>
    {:else}
        <div class="p-4 text-sm text-gray-500 dark:text-gray-300">No panel selected</div>
    {/if}
</section>

<script lang="ts">
    import { layout } from '../stores/layout';
    const { activeSideNav } = layout;
    import Structure from './structure.svelte';
    import ElementsPanel from './elementsPanel.svelte';
</script>
