<script lang="ts">
    /** StylePanel
     * Dynamic style editing surface that renders controls from a schema.
     * Responsibilities:
     *  - Determine current editing target (page vs selected element).
     *  - Retrieve schema describing grouped controls for that target type.
     *  - Maintain an in-progress mutable draft (live preview) separate from committed history snapshots.
     *  - Commit finalized changes through history system with category 'style'.
     */
    import { projectData, selectedElementId, currentPageId, toggleLocked, toggleVisibility } from '../stores/project';
    import { getSchema, type SectionKey, controls } from '../styleSchemas/base';
    import { computeElementClasses } from '../styleEngine/computeClasses';
    import { commitPageChange } from '../stores/historyScoped';
    import { get, writable } from 'svelte/store';
    import ControlRenderer from './ControlRenderer.svelte';
    import { type Element } from '../lib/schemas/element';
    import UnifiedToolbar from '../Stages/UnifiedToolbar.svelte';

    // UI state flag for potential future edit modes (currently unused placeholder).
    const editing = writable(false);
    $: contentEditable = writable(false);

    // Reactive references: current page, selected element (if any), editing mode (element type or page), and schema.
    $: page = $projectData.pagesById[$currentPageId];
    $: element = $selectedElementId ? (page?.elements.find(e=>e.id===$selectedElementId) as Element) : null;
    // Map multiple graphical element variants onto shared 'shape' schema; fall back to page or text automatically.
    $: mode = element ? element.type : 'page';
    $: schema = getSchema(mode==='rectangle'?'shape':mode==='circle'?'shape':mode==='collection'?'shape':mode);

    /** editingTitle
     *  Enables contentEditable mode on the element name button.
     */
    function editingTitle() {
        contentEditable.set(true);
        // Focus and place cursor at end
        const el = document.querySelector('.element-header [contenteditable]') as HTMLElement;
        if (el) {
            el.focus();
            // document.execCommand('selectAll', false);
            document.getSelection()?.collapseToEnd();
        }
    }
    /** writePath
     *  Mutates (or creates) nested property path inside target object.
     *  Creates intermediate objects as needed to avoid undefined errors.
     */
    function writePath(obj:any, path:string, value:any) {
        const parts = path.split('.');
        const last = parts.pop()!; // final key to assign
        let cursor = obj;
        for (const p of parts) { 
            if (!(p in cursor) || typeof cursor[p] !== 'object') cursor[p] = {}; 
            cursor = cursor[p];
        }
        cursor[last] = value;
    }
    function readPath(obj:any, path:string) {
        try { return path.split('.').reduce((o:any,k:string)=>o?.[k], obj); } catch { return undefined; }
    }

    // Draft copy used for live, reversible previews without immediately committing history.
    let liveDraft: any = null;

    /** ensureDraft
     *  Lazily clones selected element into liveDraft for isolated mutation.
     */
    function ensureDraft() { if (!liveDraft && element) liveDraft = JSON.parse(JSON.stringify(element)); }

    /** applyDraftCommit
     *  Applies draft style changes to real element then records a style history snapshot.
     */
    function applyDraftCommit() {
        if (!element || !liveDraft) return;
        element.style = liveDraft.style;
        element.appliedClasses = computeElementClasses(element);
        commitPageChange(get(currentPageId), 'style');
    }


    /** onControlInput
     *  Unified handler for preview vs commit from any control.
     *  - For page-level settings (no element selection) writes directly then commits.
     *  - For element styles uses draft for preview, commits on final action (blur/enter/explicit commit).
     */
    function onControlInput(ctrl:any, val:any, commit:boolean, target:any) {
        if (mode==='page' && !element) { // Page scope editing: no drafting required.
            if (ctrl.path) writePath(page, ctrl.path, val);
            commitPageChange(get(currentPageId), 'style');
            return;
        }
        if (!element) return; // Safety guard (no active selection).
        if (element.locked) return; // Read-only when locked
        ensureDraft();
        if (ctrl.path) writePath(liveDraft, ctrl.path, val);
        if (commit) {
            applyDraftCommit();
            liveDraft = null; // reset draft after commit
        } else { 
            // Live preview: copy style portion only (non-destructive to other element fields).
            element.style = liveDraft.style; 
            element.appliedClasses = computeElementClasses(element); 
        }
    }

    // Curated font family list (extensible later with custom insertion).
    const fontFamilies = ['system-ui','Georgia, serif','ui-monospace, monospace'];

    // ControlRenderer handles value extraction & event dispatch for each control.

    // Section-based layout branching: choose grid per section key.
    const sectionLayout: Record<SectionKey, string> = {
        size: 'grid grid-cols-2 gap-2',
        typography: 'grid grid-cols-2 gap-2',
        transform: 'grid grid-cols-2 gap-2',
        radius: 'grid grid-cols-2 gap-2',
        padding: "w-full",
        appearance: 'grid gap-2',
        effects: 'grid grid-cols-1 grid-rows-3 gap-2',
        page: 'grid grid-cols-2 gap-2',
        defaultText: 'grid grid-cols-2 gap-2'
    };

    // Device catalog for quick viewport presets
    type DeviceItem = { id: string; label: string; w: number; h: number };
    const deviceProfiles: Record<string, { label: string; items: DeviceItem[] }> = {
        mobile: {
            label: 'Mobile',
            items: [
                { id: 'iphone-13', label: 'iPhone 13', w: 390, h: 844 },
                { id: 'iphone-se-2', label: 'iPhone SE (2nd gen)', w: 375, h: 667 },
                { id: 'pixel-7', label: 'Pixel 7', w: 412, h: 915 },
            ],
        },
        tablet: {
            label: 'Tablet',
            items: [
                { id: 'ipad-portrait', label: 'iPad (P)', w: 768, h: 1024 },
                { id: 'ipad-landscape', label: 'iPad (L)', w: 1024, h: 768 },
            ],
        },
        laptop: {
            label: 'Laptop',
            items: [
                { id: 'macbook-13', label: '13" MacBook', w: 1280, h: 800 },
                { id: 'hd-1366', label: 'HD 1366×768', w: 1366, h: 768 },
                { id: 'fhd-1536', label: 'FHD (scaled 1536×864)', w: 1536, h: 864 },
            ],
        },
        desktop: {
            label: 'Desktop',
            items: [
                { id: 'fhd', label: 'FHD 1920×1080', w: 1920, h: 1080 },
                { id: 'wqhd', label: 'WQHD 2560×1440', w: 2560, h: 1440 },
            ],
        },
    };

    // Resolve page width/height paths from controls map
    $: widthPath = controls.width?.path as string | undefined;
    $: heightPath = controls.height?.path as string | undefined;
    $: pageWidth = widthPath ? readPath(page, widthPath) : undefined;
    $: pageHeight = heightPath ? readPath(page, heightPath) : undefined;
    function matches(w:number,h:number) { return pageWidth === w && pageHeight === h; }
    function anyDeviceMatch(): boolean {
        for (const grp of Object.values(deviceProfiles)) {
            for (const it of grp.items) { if (matches(it.w,it.h)) return true; }
        }
        return false;
    }
</script>

{#if mode==='page' && !element}
    <!-- Page-level styling mode: render page schema sections -->
    <div class="panel-root flex-1 min-h-0 overflow-hidden">
        <div class="px-3 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <!-- <div class="element-header">Page Settings</div> Header for context -->
            <label class="element-header" for="device-select">Device</label>
            <select id="device-select" class="w-full mb-3 bg-slate-900 border border-slate-600 text-slate-100 text-xs p-2 rounded"
                onchange={(e)=>{
                    const val = (e.target as HTMLSelectElement).value;
                    if (!val) return;
                    const [cat,id] = val.split(':');
                    const prof = deviceProfiles[cat]?.items.find(i=>i.id===id);
                    if (prof) {
                        if (widthPath) writePath(page, widthPath, prof.w);
                        if (heightPath) writePath(page, heightPath, prof.h);
                        commitPageChange(get(currentPageId), 'style');
                    }
                }}>
                <option value="" selected={!anyDeviceMatch()}>Custom size</option>
                {#each Object.entries(deviceProfiles) as [cat,grp]}
                    <optgroup label={grp.label}>
                        {#each grp.items as it}
                            <option value={`${cat}:${it.id}`} selected={matches(it.w, it.h)}>{it.label} — {it.w}×{it.h}</option>
                        {/each}
                    </optgroup>
                {/each}
            </select>
            {#each schema.sections as section}
            <div class="section" data-section={section.name}>
                <div class="section-title font-bold">{section.title}</div>
                {#if section.name === 'padding'}
                    <div class="grid grid-cols-3 grid-rows-3 gap-1 place-items-center w-full">
                        <div></div>
                        {#if controls.padTop}
                            {@const ctrlDesc = controls.padTop}
                            <div class="control-row col-start-2 row-start-1 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                            </div>
                        {/if}
                        <div></div>

                        {#if controls.padLeft}
                            {@const ctrlDesc = controls.padLeft}
                            <div class="control-row col-start-1 row-start-2 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                            </div>
                        {/if}

                        <div class="w-full h-6"></div>

                        {#if controls.padRight}
                            {@const ctrlDesc = controls.padRight}
                            <div class="control-row col-start-3 row-start-2 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                            </div>
                        {/if}

                        <div></div>
                        {#if controls.padBottom}
                            {@const ctrlDesc = controls.padBottom}
                            <div class="control-row col-start-2 row-start-3 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                            </div>
                        {/if}
                        <div></div>
                    </div>
                {:else if section.name === 'size'}
                    <!-- Device selector spanning two columns -->
                    <div class={sectionLayout[section.name] || 'grid gap-2'}>
                    {#each section.controls as cid}
                        {#if controls[cid]}
                        {@const ctrlDesc = controls[cid]}
                        <div class="control-row">
                            <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                        </div>
                        {/if}
                    {/each}
                    </div>
                {:else}
                    <div class={sectionLayout[section.name] || 'grid gap-2'}>
                    {#each section.controls as cid}
                        {#if controls[cid]}
                        {@const ctrlDesc = controls[cid]}
                        <div class="control-row"> <!-- Container for individual dynamic control -->
                            <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={page} onPreview={(d)=>onControlInput(ctrlDesc,d,false,page)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,page)} />
                        </div>
                        {/if}
                    {/each}
                    </div>
                {/if}
            </div>
            {/each}
        </div>
    </div>
{:else if element}
    <!-- Element-level styling mode: uses element schema (shape/text) -->
    <div class="panel-root flex-1 min-h-0 overflow-hidden">
        <div class="border-b border-slate-300 dark:border-slate-600 mb-2 px-3">
            <UnifiedToolbar mode={"multiselect"} singleStageAlign={true} placement="panel" />
        </div>
        <div class="element-header flex justify-between items-center px-3">
            <button 
                ondblclick={editingTitle}
                aria-label="Edit element name"
                tabindex="0"
                aria-pressed="true"
                contenteditable={$contentEditable}
                class="w-[60%] border-b border-dashed text-left">{element.name}
            </button>
            <div class="flex gap-2">
                {#if element.locked}
                <svg
                    onclick={toggleLocked}
                    role="button"
                    tabindex="0"
                    aria-label="Unlock element"
                    aria-pressed="true"
                    class="w-4 h-4 cursor-pointer outline-0 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                    <path fill-rule="evenodd" d="M8 10V7a4 4 0 1 1 8 0v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1Zm2-3a2 2 0 1 1 4 0v3h-4V7Zm2 6a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1Z" clip-rule="evenodd"/>
                </svg>
                {:else}
                <svg
                    onclick={toggleLocked}
                    role="button"
                    tabindex="0"
                    aria-label="Unlock element"
                    aria-pressed="true"
                    class="w-4 h-4 cursor-pointer outline-0 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                    <path fill-rule="evenodd" d="M15 7a2 2 0 1 1 4 0v4a1 1 0 1 0 2 0V7a4 4 0 0 0-8 0v3H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2V7Zm-5 6a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1Z" clip-rule="evenodd"/>
                </svg>
                {/if}
    
                {#if element.visible}
                <svg 
                    onclick={toggleVisibility}
                    role="button"
                    tabindex="0"
                    aria-label="Unlock element"
                    aria-pressed="true"
                    class="w-4 h-4 cursor-pointer outline-0 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-width="2" d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"/>
                    <path stroke="currentColor" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                </svg>
                {:else}
                <svg
                    onclick={toggleVisibility}
                    role="button"
                    tabindex="0"
                    aria-label="Unlock element"
                    aria-pressed="true"
                    class="w-4 h-4 cursor-pointer outline-0 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.933 13.909A4.357 4.357 0 0 1 3 12c0-1 4-6 9-6m7.6 3.8A5.068 5.068 0 0 1 21 12c0 1-3 6-9 6-.314 0-.62-.014-.918-.04M5 19 19 5m-4 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                </svg>
                {/if}
            </div>
        </div>
    <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden thin-scroll">
            {#each schema.sections as section}
            <div class="section px-3" data-section={section.name}>
                <div class="section-title font-bold">{section.title}</div>
                {#if element.locked}
                    <div class="text-[10px] mb-1 text-amber-600 font-medium">Locked (read-only)</div>
                {/if}
                {#if section.name === 'padding'}
                    <div class="grid grid-cols-3 grid-rows-3 gap-1 place-items-center w-full">
                        <div></div>
                        {#if controls.padTop}
                            {@const ctrlDesc = controls.padTop}
                            <div class="control-row col-start-2 row-start-1 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={element} onPreview={(d)=>onControlInput(ctrlDesc,d,false,element)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,element)} />
                            </div>
                        {/if}
                        <div></div>

                        {#if controls.padLeft}
                            {@const ctrlDesc = controls.padLeft}
                            <div class="control-row col-start-1 row-start-2 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={element} onPreview={(d)=>onControlInput(ctrlDesc,d,false,element)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,element)} />
                            </div>
                        {/if}

                        <div class="w-full h-6"></div>

                        {#if controls.padRight}
                            {@const ctrlDesc = controls.padRight}
                            <div class="control-row col-start-3 row-start-2 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={element} onPreview={(d)=>onControlInput(ctrlDesc,d,false,element)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,element)} />
                            </div>
                        {/if}

                        <div></div>
                        {#if controls.padBottom}
                            {@const ctrlDesc = controls.padBottom}
                            <div class="control-row col-start-2 row-start-3 w-full">
                                <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={element} onPreview={(d)=>onControlInput(ctrlDesc,d,false,element)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,element)} />
                            </div>
                        {/if}
                        <div></div>
                    </div>
                {:else}
                    <div class={sectionLayout[section.name]}>
                        {#each section.controls as control}
                            {#if controls[control]}
                                {@const ctrlDesc = controls[control]}
                                <div class="control-row w-full" class:col-span-2={ctrlDesc.name == 'textAlign'}> <!-- Dynamic control row -->
                                    <ControlRenderer {ctrlDesc} sectionName={section.name} ctx={element} onPreview={(d)=>onControlInput(ctrlDesc,d,false,element)} onCommit={(d)=>onControlInput(ctrlDesc,d,true,element)} />
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
            {/each}
        </div>
    </div>
{:else}
    <div class="text-xs text-slate-500">Nothing selected.</div> <!-- Fallback / empty state -->
{/if}

<style>
    /* Layout + Visual Styling */
    .panel-root { font-family: system-ui, sans-serif; display:flex; flex-direction:column; gap:12px; font-size:12px;}
    .element-header { font-weight:600; font-size:13px; }
    .section { margin-bottom: 1rem;}
    .section-title { font-size:11px; text-transform:capitalize; letter-spacing:.05em; margin-bottom:6px; }
</style>