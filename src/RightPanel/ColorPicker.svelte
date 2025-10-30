<script lang="ts">
    import { palette } from '../stores/palette';
    export let value: string | undefined;
    export let label: string = '';
    export let onPreview: (color:string)=>void = ()=>{};
    export let onCommit: (color:string)=>void = ()=>{};
    export let chipWidth: number;
    export let chipHeight: number;

    function openPicker() {
        palette.openPalette({
            value,
            label,
            onPreview: (c) => { onPreview(c); },
            onCommit: (c) => { onCommit(c); },
        });
    }
</script>

<button class="color-chip" style="width: {chipWidth}%; height: {chipHeight}rem; background: {value || '#334155'}" aria-label={label} on:click={openPicker}></button>

<style>
  .color-chip { border-radius:4px; border:1px solid #334155; cursor:pointer; position:relative; box-shadow:0 0 0 1px rgba(255,255,255,0.05) inset; width:100%; }
</style>