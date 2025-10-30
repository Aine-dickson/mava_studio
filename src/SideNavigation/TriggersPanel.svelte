<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { TriggerDef } from '../lib/schemas/triggers';
        import { variablesByPage, variablesApi, type VarScope, type VarType } from '../stores/variables';

  export let triggers: TriggerDef[] = [];
  export let filterTimelineId: string | '' = '';
    let selectedId: string | null = null;

    // Events: new, edit, copy, delete, vars, filter
    const dispatch = createEventDispatcher();
    function fire(name: string, detail?: any) {
        dispatch(name as any, detail);
    }

  $: filtered = filterTimelineId
    ? triggers.filter(t => (t.timelineId ?? '') === filterTimelineId)
    : triggers;

    // Variables modal state
    let showVars = false;
    let draftName = '';
    let draftScope: VarScope = 'global';
    let draftType: VarType = 'string';
    let draftInitial = '';
    let draftReadOnly = false;
        // derived store is variablesByPage; use it directly in markup

    function createVar() {
        const name = draftName.trim(); if (!name) return;
        const initial = parseInitial(draftType, draftInitial);
        variablesApi.createVariable({ name, scope: draftScope, type: draftType, initial, readOnly: draftReadOnly });
        draftName = '';
        draftInitial = '';
    }
    function parseInitial(t: VarType, s: string) {
        if (!s) return undefined;
        try {
            if (t === 'number') return Number(s);
            if (t === 'boolean') return (/^(true|1|yes|on)$/i).test(s);
            if (t === 'json') return JSON.parse(s);
            return s;
        } catch { return s; }
    }
    function rename(id: string) {
        const v = $variablesByPage.find(x => x.id === id); if (!v) return;
        const next = prompt('New variable name', v.name); if (!next) return;
        variablesApi.renameVariable(id, next.trim());
    }
    function del(id: string) {
        if (!confirm('Delete variable?')) return;
        variablesApi.deleteVariable(id);
    }
</script>

<style>
  .card { border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px; background:white; cursor:pointer; }
  .head { display:flex; align-items:center; justify-content: space-between; margin-bottom:6px; }
  .name { font-weight:600; font-size:13px; }
  .badge { font-size:10px; padding:2px 6px; border-radius:999px; border:1px solid #e2e8f0; color:#475569; background:#f8fafc; }
  .badge.enabled { border-color:#bbf7d0; background:#dcfce7; color:#059669; }
  .sub { font-size:12px; color:#64748b; }
  /* Dark theme overrides */
  :global(.dark) .card { background:#0f172a; border-color:#334155; }
  :global(.dark) .name { color:#e2e8f0; }
  :global(.dark) .sub { color:#94a3b8; }
  :global(.dark) .badge { background:#0f172a; color:#e2e8f0; border-color:#334155; }
  :global(.dark) .badge.enabled { background:#064e3b; color:#d1fae5; border-color:#065f46; }
</style>

<div class="px-2">
    <div class="flex justify-between">
        <div>
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button class="cursor-pointer" on:click={() => fire('new')}>
                <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7 7V5"/>
                </svg>
            </button>
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button class="cursor-pointer" on:click={() => fire('edit', selectedId ? { id: selectedId } : undefined)}>
                <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.779 17.779 4.36 19.918 6.5 13.5m4.279 4.279 8.364-8.643a3.027 3.027 0 0 0-2.14-5.165 3.03 3.03 0 0 0-2.14.886L6.5 13.5m4.279 4.279L6.499 13.5m2.14 2.14 6.213-6.504M12.75 7.04 17 11.28"/>
                </svg>
            </button>
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button class="cursor-pointer" on:click={() => fire('copy', selectedId ? { id: selectedId } : undefined)}>
                <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                    <path fill-rule="evenodd" d="M7 9v6a4 4 0 0 0 4 4h4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1v2Z" clip-rule="evenodd"/>
                    <path fill-rule="evenodd" d="M13 3.054V7H9.2a2 2 0 0 1 .281-.432l2.46-2.87A2 2 0 0 1 13 3.054ZM15 3v4a2 2 0 0 1-2 2H9v6a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3Z" clip-rule="evenodd"/>
                </svg>
            </button>
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button class="cursor-pointer" on:click={() => fire('delete', selectedId ? { id: selectedId } : undefined)}>
                <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>
                </svg>
            </button>
        </div>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="cursor-pointer" on:click={() => (showVars = true)}>
            <svg class="w-5 h-5 text-gray-800 dark:text-white" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
                <path d="M560-160v-80h120q17 0 28.5-11.5T720-280v-80q0-38 22-69t58-44v-14q-36-13-58-44t-22-69v-80q0-17-11.5-28.5T680-720H560v-80h120q50 0 85 35t35 85v80q0 17 11.5 28.5T840-560h40v160h-40q-17 0-28.5 11.5T800-360v80q0 50-35 85t-85 35H560Zm-280 0q-50 0-85-35t-35-85v-80q0-17-11.5-28.5T120-400H80v-160h40q17 0 28.5-11.5T160-600v-80q0-50 35-85t85-35h120v80H280q-17 0-28.5 11.5T240-680v80q0 38-22 69t-58 44v14q36 13 58 44t22 69v80q0 17 11.5 28.5T280-240h120v80H280Z"/>
            </svg>
        </button>
    </div>
   
    {#each filtered as t}
        <div class="card" role="button" tabindex="0"
            on:click={() => { selectedId = t.id; fire('edit', { id: t.id }) }}
            on:keydown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); selectedId = t.id; fire('edit', { id: t.id }); } }}>
        <div class="head">
            <div class="name">{t.name}</div>
            <span class="badge {t.enabled ? 'enabled' : ''}">{t.enabled ? 'enabled' : 'disabled'}</span>
        </div>
        <div class="sub">
            {#if t.source.kind === 'timeline'}
            Timeline {t.source.timelineId ?? 'current'} · {t.source.event}{#if t.source.cueId} · cue {t.source.cueId}{/if}
            {:else if t.source.kind === 'element'}
            Element {t.source.selector} · {t.source.event}
            {:else}
            Timer · {t.source.delayMs} ms
            {/if}
        </div>
        </div>
    {/each}

    <!-- Variables modal -->
    {#if showVars}
        <button type="button" class="fixed inset-0 bg-black/30 z-10" on:click={() => (showVars = false)} aria-label="Close variables panel"></button>
        <div class="fixed z-20 bottom-4 right-4 w-[360px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg">
            <div class="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div class="text-sm font-semibold">Variables</div>
                <button class="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700" on:click={() => (showVars = false)}>Close</button>
            </div>
            <div class="p-3 space-y-3">
                <form class="space-y-2" on:submit|preventDefault={createVar}>
                    <div class="flex gap-2">
                        <input class="flex-1 bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" placeholder="Name (e.g. score)" bind:value={draftName} />
                        <select class="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" bind:value={draftScope}>
                            <option value="global">Global</option>
                            <option value="page">Page</option>
                        </select>
                        <select class="border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" bind:value={draftType}>
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="json">json</option>
                            <option value="object">object</option>
                            <option value="array">array</option>
                        </select>
                    </div>
                    <div class="flex gap-2 items-center">
                        <label class="text-xs opacity-70"><input type="checkbox" bind:checked={draftReadOnly} class="mr-1 align-middle"/>Read only</label>
                        <input class="flex-1 bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" placeholder="Initial value (optional)" bind:value={draftInitial} />
                    </div>
                    <div class="flex justify-end">
                        <button class="text-xs px-2 py-1 rounded bg-emerald-600 text-white" type="submit">Add</button>
                    </div>
                </form>

                        <div class="max-h-64 overflow-auto divide-y divide-slate-200 dark:divide-slate-700">
                            {#each $variablesByPage as v}
                        <div class="py-2 text-sm flex items-center gap-2">
                            <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{v.scope === 'global' ? 'G' : 'P'}</span>
                            <span class="font-semibold">{v.name}</span>
                            <span class="opacity-60 text-xs">({v.type}{v.readOnly ? ', ro' : ''})</span>
                            <span class="flex-1"></span>
                            <button class="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700" on:click={() => rename(v.id)}>Rename</button>
                            <button class="text-xs px-1.5 py-0.5 rounded bg-rose-600 text-white" on:click={() => del(v.id)}>Delete</button>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</div>
