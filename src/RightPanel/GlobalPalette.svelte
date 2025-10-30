<script lang="ts">
  import { onMount } from 'svelte';
  import { palette } from '../stores/palette';

  let tab: 'solid' | 'linear' | 'radial' = 'solid';

  const palettes: { name:string; shades:string[] }[] = [
    { name:'Slate', shades:['#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#334155'] },
    { name:'Blue', shades:['#eff6ff','#bfdbfe','#60a5fa','#3b82f6','#2563eb','#1e3a8a'] },
    { name:'Emerald', shades:['#ecfdf5','#a7f3d0','#6ee7b7','#34d399','#059669','#065f46'] },
    { name:'Amber', shades:['#fffbeb','#fde68a','#fbbf24','#f59e0b','#d97706','#92400e'] },
    { name:'Rose', shades:['#fff1f2','#fecdd3','#fb7185','#f43f5e','#e11d48','#881337'] }
  ];

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      palette.closePalette(false);
    }
  }

  function onOutside(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const container = document.getElementById('global-palette');
    if ($palette.open && container && !container.contains(el)) {
      palette.closePalette(true);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKey, { capture: true } as any);
    window.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey as any);
      window.removeEventListener('mousedown', onOutside);
    };
  });
</script>

{#if $palette.open}
<div id="global-palette" class="fixed top-2 right-2 z-50 w-[280px] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2 flex flex-col gap-2">
    <div class="flex items-center justify-between">
        <div class="text-xs text-slate-300">{$palette.label || 'Color'}</div>
        <button class="text-slate-300 hover:text-white text-xs" on:click={() => palette.closePalette(true)}>Close</button>
    </div>
    <div class="tabs">
        <button class:active={tab==='solid'} on:click={()=>tab='solid'}>Solid</button>
        <button class:active={tab==='linear'} on:click={()=>tab='linear'}>Linear</button>
        <button class:active={tab==='radial'} on:click={()=>tab='radial'}>Radial</button>
    </div>
    {#if tab==='solid'}
        <div class="palettes no-scroll">
            {#each palettes as p}
                <div class="group">
                    <!-- <div class="gname">{p.name}</div> -->
                    <div class="swatches">
                        {#each p.shades as col}
                        <button class="sw" aria-label={col} style={`background:${col}`} title={col}
                            class:selected={col===($palette.value || '')}
                            on:mouseenter={() => palette.preview(col)}
                            on:click={() => palette.commit(col)}></button>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
        <div class="custom-row">
            <input type="text" bind:value={$palette.value} placeholder="#hex or rgb(...)" on:input={(e) => palette.preview((e.target as HTMLInputElement).value)} />
            <button class="apply" on:click={() => $palette.value && palette.commit($palette.value)}>Apply</button>
        </div>
    {:else}
        <div class="coming">Gradient editor coming soon.</div>
    {/if}
</div>
{/if}

<style>
  .tabs { display:flex; gap:4px; }
  .tabs button { flex:1; background:#1e293b; border:1px solid #334155; color:#cbd5e1; font-size:11px; padding:4px 0; border-radius:4px; cursor:pointer; }
  .tabs button.active { background:#334155; color:#f1f5f9; }
  .palettes { display:flex; flex-direction:column; gap:0px; max-height:220px; overflow:auto; }
  .group { display:flex; flex-direction:column; gap:2px; }
  /* .gname { font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:#64748b; } */
  .swatches { display:flex; gap:0px; flex-wrap:wrap; }
  .sw { width:24px; height:24px; cursor:pointer; position:relative; }
  .sw.selected::after { content:''; position:absolute; inset:3px; border:2px solid #fafafa; border-radius:3px; mix-blend-mode:overlay; }
  .custom-row { display:flex; gap:6px; }
  .custom-row input { flex:1; background:#1e293b; border:1px solid #334155; color:#e2e8f0; font-size:11px; padding:4px 6px; border-radius:4px; }
  .apply { background:#334155; border:1px solid #475569; color:#e2e8f0; font-size:11px; padding:4px 8px; border-radius:4px; cursor:pointer; }
  .apply:hover { background:#475569; }
  .coming { font-size:11px; color:#94a3b8; padding:12px 4px; text-align:center; }
</style>
