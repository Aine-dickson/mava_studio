<section class="h-full min-h-0 w-full pt-3 overflow-hidden flex flex-col">
    {#if $activeRightUtil === 'styles'}
        <StylePanel />
    {:else if $activeRightUtil === 'actions'}
        <ActionsPanel />
    {/if}
</section>

<script lang="ts">
    import { layout } from './stores/layout';
    import StylePanel from './RightPanel/StylePanel.svelte';
    import ActionsPanel from './RightPanel/ActionsPanel.svelte';
    const { activeRightUtil } = layout;
</script>
