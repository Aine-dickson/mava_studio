<script lang="ts">
    import type { Element } from '../lib/schemas/element';
    import type { Page } from '../lib/schemas/project';
    import type { ControlDescriptor, ControlKey, SectionKey } from '../styleSchemas/base';
    /** ControlRenderer
     * Refactored to render based on control keys (id) instead of kind.
     * Provides custom-styled numeric inputs with unit suffixes and steppers.
     * Props:
     *  - onPreview(detail)  -> live (non-committing) updates
     *  - onCommit(detail)   -> final value application
     */
    import ColorPicker from './ColorPicker.svelte';
    import { tooltip } from '../lib/actions/tooltip';
    export let ctrlDesc: ControlDescriptor; // descriptor (id, path, label, ...)
    export let sectionName: SectionKey; // context section (for specialized rendering)
    export let ctx: Element | Page;         // element or page object receiving edits
    export let onPreview: (detail:any)=>void = () => {};
    export let onCommit: (detail:any)=>void = () => {};

    const fontFamilies = ['system-ui','Georgia, serif','ui-monospace, monospace'];
    const shadowLevels = ['none','sm','md','lg','xl','2xl','inner'] as const;

    const keyHints: Record<ControlKey, string> = {
        width: 'Width (px)',
        height: 'Height (px)',
        x: 'X position (px)',
        y: 'Y position (px)',
        rotation: 'Rotation (degrees)',
        fillColor: 'Fill color',
        strokeColor: 'Stroke color',
        strokeWidth: 'Stroke width (px)',
        shadowLevel: 'Shadow level',
        opacity: 'Opacity (%)',
        blur: 'Blur (px)',
        radiusTopLeft: 'Top-left corner radius (px)',
        radiusTopRight: 'Top-right corner radius (px)',
        radiusBottomRight: 'Bottom-right corner radius (px)',
        radiusBottomLeft: 'Bottom-left corner radius (px)',
        padTop: 'Padding top (px)',
        padRight: 'Padding right (px)',
        padBottom: 'Padding bottom (px)',
        padLeft: 'Padding left (px)',
        fontFamily: 'Font family',
        fontSize: 'Font size (px)',
        fontWeight: 'Font weight',
        textColor: 'Text color',
        textAlign: 'Text alignment',
        fontStyle: 'Font style',
        textTransform: 'Text transform',
        lineHeight: 'Line height',
        letterSpacing: 'Letter spacing',
        orientation: 'Page orientation',
        defFontFamily: 'Default font family',
        defFontSize: 'Default font size',
        defTextColor: 'Default text color'
    };
    $: tipText = keyHints[ctrlDesc.name] || (ctrlDesc.label || String(ctrlDesc.name));

    function read(path:string) { return path.split('.').reduce((o,k)=>o?.[k], ctx); }

    let draft: any = undefined; // local input buffer
    $: value = ctrlDesc.path ? read(ctrlDesc.path) : undefined;
    $: placeholder = value==null ? '' : value;

    function normalizeByKey(id: ControlKey, n:number) {
        if (id==='rotation') return ((n%360)+360)%360;
        if (id==='opacity') {
            if (n<0) n=0; if (n>100) n=100; return n;
        }
        return n;
    }
    function stepFor(id: ControlKey, e?: KeyboardEvent) {
        if (id==='rotation') return e?.shiftKey?15:(e?.altKey?5:1);
        return e?.shiftKey?5:1;
    }
    function preview(v:any) { onPreview(v); }
    function commit(v:any) { onCommit(v); }

    function adjust(dir:1|-1) {
        const base = (draft!==undefined && draft!=='' ? Number(draft) : (typeof value==='number'?value:0));
        const step = stepFor(ctrlDesc.name);
        let next = normalizeByKey(ctrlDesc.name, base + dir*step);
        draft = String(next);
        preview(next);
    }

    $: unit = ctrlDesc.name==='rotation' ? '°' : (ctrlDesc.name==='opacity' ? '%' : '');
</script>

<div class="control" data-id={ctrlDesc.name} use:tooltip={{ content: tipText, placement: 'auto', offset: 8 }}>
    <!-- keyed block ensures control internal state resets when descriptor path changes -->
    {#key ctrlDesc.path}
        {#if sectionName == 'size'}
            {#if ctrlDesc.name === 'orientation'}
                <div class="orient" role="group" aria-label="Orientation">
                    <button class:selected={value==='landscape'} aria-label="Landscape" on:click={()=>commit('landscape')} title="Landscape">
                        <div class="frame landscape" aria-hidden="true"></div>
                    </button>
                    <span class="sep" aria-hidden="true">|</span>
                    <button class:selected={value==='portrait'} aria-label="Portrait" on:click={()=>commit('portrait')} title="Portrait">
                        <div class="frame portrait" aria-hidden="true"></div>
                    </button>
                </div>
            {:else}
                <!-- Custom-styled numeric input with unit and steppers -->
                <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label>
                <div class="num">
                    <input id={ctrlDesc.path} type="number" bind:value={draft} placeholder={placeholder}
                        on:focus={() => { draft = value==null? '' : String(value); }}
                        on:keydown={(e)=>{ if(['ArrowUp','ArrowDown'].includes(e.key)) {
                            e.stopPropagation();
                            let base = (draft!==undefined && draft!==''? Number(draft): (typeof value==='number'?value:0));
                            const step = stepFor(ctrlDesc.name, e);
                            base += (e.key==='ArrowUp'? 1 : -1) * step;
                            base = normalizeByKey(ctrlDesc.name, base);
                            draft = String(base);
                            preview(Number(base));
                        }}}
                        on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); preview(num); }}
                        on:blur={()=>{ let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); draft=String(num); commit(num); }}
                    />
                    {#if unit}
                        <span class="unit">{unit}</span>
                    {/if}
                    <div class="steppers" aria-hidden="false">
                        <button class="step up" type="button" title="Increment" on:click={() => adjust(1)}>▴</button>
                        <button class="step down" type="button" title="Decrement" on:click={() => adjust(-1)}>▾</button>
                    </div>
                </div>
            {/if}
        {:else if sectionName == 'appearance'}
            <!-- Color picker with palette & gradient tabs (gradient placeholder) -->
            <span class="clab">{ctrlDesc.label}</span>
            <ColorPicker
                chipWidth={100}
                chipHeight={1.5}
                value={value} label={ctrlDesc.label}
                onPreview={(col)=>preview(col)}
                onCommit={(col)=>commit(col)}
            />
        {:else if sectionName == 'typography'}
            <!-- Font family selection -->
            {#if ctrlDesc.name == 'fontFamily'}
                <select id={ctrlDesc.path} on:change={(e)=>commit((e.target as HTMLSelectElement).value)}>
                    <option value="" disabled selected>Font family</option>
                    {#each fontFamilies as f}
                        <option value={f} selected={f===value}>{f}</option>
                    {/each}
                </select>
            {:else if ctrlDesc.name == 'textTransform'}
                <select id={ctrlDesc.path} on:change={(e)=>commit((e.target as HTMLSelectElement).value)}>
                    <option value="" disabled selected>Tranform</option>
                    {#each (ctrlDesc.options || ['None','Uppercase','Lowercase','Capitalize']) as opt}
                        <option value={opt} selected={opt===value}>{opt}</option>
                    {/each}
                </select>
            {:else if ctrlDesc.name==='fontWeight'}
                <!-- Font weight select -->
                <!-- <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label> -->
                <select id={ctrlDesc.path} on:change={(e)=>commit((e.target as HTMLSelectElement).value)}>
                    {#each (ctrlDesc.options || ['Light','Normal','Medium','Semibold','Bold']) as opt}
                        <option class="capitalize" value={opt} selected={opt===value}>{opt}</option>
                    {/each}
                </select>
            {:else if ctrlDesc.name==='textAlign' }
                <!-- <span class="clab" id={ctrlDesc.path + '-label'}>{ctrlDesc.label}</span> -->
                <div class="seg" role="group" aria-labelledby={ctrlDesc.path + '-label'}>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button class:selected={value==='left'} on:click={()=>commit('left')}>
                        <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6h8m-8 4h12M6 14h8m-8 4h12"/>
                        </svg>
                    </button>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button class:selected={value==='justify'} on:click={()=>commit('justify')}>
                        <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6H6m12 4H6m12 4H6m12 4H6"/>
                        </svg>
                    </button>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button class:selected={value==='center'} on:click={()=>commit('center')}>
                        <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 6h8M6 10h12M8 14h8M6 18h12"/>
                        </svg>
                    </button>
                    <!-- svelte-ignore a11y_consider_explicit_label -->
                    <button class:selected={value==='right'} on:click={()=>commit('right')}>
                        <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6h-8m8 4H6m12 4h-8m8 4H6"/>
                        </svg>
                    </button>
                </div>
                <!-- svelte-ignore a11y_consider_explicit_label -->
                <button class:selected={value==='right'} on:click={()=>commit('right')}>
                    <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m8.874 19 6.143-14M6 19h6.33m-.66-14H18"/>
                    </svg>
                </button>
                <!-- svelte-ignore a11y_consider_explicit_label -->
                <button class:selected={value==='right'} on:click={()=>commit('right')}>
                    <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                        <path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5 19h14M7.6 16l4.2979-10.92963c.0368-.09379.1674-.09379.2042 0L16.4 16m-8.8 0H6.5m1.1 0h1.65m7.15 0h-1.65m1.65 0h1.1m-8.33315-4h5.66025"/>
                    </svg>
                </button>
                <!-- svelte-ignore a11y_consider_explicit_label -->
                <button class:selected={value==='right'} on:click={()=>commit('right')}>
                    <svg class="w-5 h-5 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor">
                        <path d="M0 0h24v24H0z" fill="none"/>
                        <path stroke="none" d="M7.24 8.75c-.26-.48-.39-1.03-.39-1.67 0-.61.13-1.16.4-1.67.26-.5.63-.93 1.11-1.29.48-.35 1.05-.63 1.7-.83.66-.19 1.39-.29 2.18-.29.81 0 1.54.11 2.21.34.66.22 1.23.54 1.69.94.47.4.83.88 1.08 1.43s.38 1.15.38 1.81h-3.01c0-.31-.05-.59-.15-.85-.09-.27-.24-.49-.44-.68-.2-.19-.45-.33-.75-.44-.3-.1-.66-.16-1.06-.16-.39 0-.74.04-1.03.13s-.53.21-.72.36c-.19.16-.34.34-.44.55-.1.21-.15.43-.15.66 0 .48.25.88.74 1.21.38.25.77.48 1.41.7H7.39c-.05-.08-.11-.17-.15-.25zM21 12v-2H3v2h9.62c.18.07.4.14.55.2.37.17.66.34.87.51s.35.36.43.57c.07.2.11.43.11.69 0 .23-.05.45-.14.66-.09.2-.23.38-.42.53-.19.15-.42.26-.71.35-.29.08-.63.13-1.01.13-.43 0-.83-.04-1.18-.13s-.66-.23-.91-.42c-.25-.19-.45-.44-.59-.75s-.25-.76-.25-1.21H6.4c0 .55.08 1.13.24 1.58s.37.85.65 1.21c.28.35.6.66.98.92.37.26.78.48 1.22.65.44.17.9.3 1.38.39.48.08.96.13 1.44.13.8 0 1.53-.09 2.18-.28s1.21-.45 1.67-.79c.46-.34.82-.77 1.07-1.27s.38-1.07.38-1.71c0-.6-.1-1.14-.31-1.61-.05-.11-.11-.23-.17-.33H21V12z"/>
                    </svg>
                </button>
            {:else if ctrlDesc.name==='fontSize'}
                <div class="num">
                    <input id={ctrlDesc.path} type="number" bind:value={draft} placeholder={placeholder}
                    on:focus={() => { draft = value==null? '' : String(value); }}
                    on:keydown={(e)=>{ if(['ArrowUp','ArrowDown'].includes(e.key)) {
                        e.stopPropagation();
                        let base = (draft!==undefined && draft!==''? Number(draft): (typeof value==='number'?value:0));
                        const step = stepFor(ctrlDesc.name, e);
                        base += (e.key==='ArrowUp'? 1 : -1) * step;
                        base = normalizeByKey(ctrlDesc.name, base);
                        draft = String(base);
                        preview(Number(base));
                    }}}
                    on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); preview(num); }}
                    on:blur={()=>{ let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); draft=String(num); commit(num); }}
                />
                {#if unit}
                    <span class="unit">{unit}</span>
                {/if}
                <div class="steppers" aria-hidden="false">
                    <button class="step up" type="button" title="Increment" on:click={() => adjust(1)}>▴</button>
                    <button class="step down" type="button" title="Decrement" on:click={() => adjust(-1)}>▾</button>
                </div>
                </div>
            {:else if ctrlDesc.name==='lineHeight'}
                <div class="num">
                    <input id={ctrlDesc.path} type="number" bind:value={draft} placeholder={'Line height'}
                        on:focus={() => { draft = value==null? '' : String(value); }}
                        on:keydown={(e)=>{ if(['ArrowUp','ArrowDown'].includes(e.key)) {
                            e.stopPropagation();
                            let base = (draft!==undefined && draft!==''? Number(draft): (typeof value==='number'?value:0));
                            const step = stepFor(ctrlDesc.name, e);
                            base += (e.key==='ArrowUp'? 1 : -1) * step;
                            base = normalizeByKey(ctrlDesc.name, base);
                            draft = String(base);
                            preview(Number(base));
                        }}}
                        on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); preview(num); }}
                        on:blur={()=>{ let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); draft=String(num); commit(num); }}
                    />
                    {#if unit}
                        <span class="unit">{unit}</span>
                    {/if}
                    <div class="steppers" aria-hidden="false">
                        <button class="step up" type="button" title="Increment" on:click={() => adjust(1)}>▴</button>
                        <button class="step down" type="button" title="Decrement" on:click={() => adjust(-1)}>▾</button>
                    </div>
                </div>
            {:else if ctrlDesc.name==='letterSpacing'}
                <div class="num">
                    <input id={ctrlDesc.path} type="number" bind:value={draft} placeholder={'Letter spacing'}
                    on:focus={() => { draft = value==null? '' : String(value); }}
                    on:keydown={(e)=>{ if(['ArrowUp','ArrowDown'].includes(e.key)) {
                        e.stopPropagation();
                        let base = (draft!==undefined && draft!==''? Number(draft): (typeof value==='number'?value:0));
                        const step = stepFor(ctrlDesc.name, e);
                        base += (e.key==='ArrowUp'? 1 : -1) * step;
                        base = normalizeByKey(ctrlDesc.name, base);
                        draft = String(base);
                        preview(Number(base));
                    }}}
                    on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); preview(num); }}
                    on:blur={()=>{ let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); draft=String(num); commit(num); }}
                />
                {#if unit}
                    <span class="unit">{unit}</span>
                {/if}
                <div class="steppers" aria-hidden="false">
                    <button class="step up" type="button" title="Increment" on:click={() => adjust(1)}>▴</button>
                    <button class="step down" type="button" title="Decrement" on:click={() => adjust(-1)}>▾</button>
                </div>
                </div>
            {:else if ctrlDesc.name==='textColor'}
                <!-- <span class="clab" id={ctrlDesc.path + '-label'}>{ctrlDesc.label}</span> -->
                <ColorPicker
                    chipWidth={100}
                    chipHeight={2}
                    value={value} label={ctrlDesc.label}
                    onPreview={(col)=>preview(col)}
                    onCommit={(col)=>commit(col)}
                />
            {/if}
        {:else if sectionName === 'radius'}
            <div class="flex">
                <label class="text-2xl" class:order-1={ctrlDesc.name == 'radiusBottomLeft' || ctrlDesc.name == 'radiusTopRight'} for="{ctrlDesc.path}">{@html ctrlDesc.label}</label>
                <input class="bg-transparent w-full" id={ctrlDesc.path} type="number" bind:value={draft} placeholder={placeholder}
                    on:focus={() => { draft = value==null? '' : String(value); }}
                    on:keydown={(e)=>{ if(['ArrowUp','ArrowDown'].includes(e.key)) {
                        e.stopPropagation();
                        let base = (draft!==undefined && draft!==''? Number(draft): (typeof value==='number'?value:0));
                        const step = stepFor(ctrlDesc.name, e);
                        base += (e.key==='ArrowUp'? 1 : -1) * step;
                        base = normalizeByKey(ctrlDesc.name, base);
                        draft = String(base);
                        preview(Number(base));
                    }}}
                    on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); preview(num); }}
                    on:blur={()=>{ let num = Number(draft); num = normalizeByKey(ctrlDesc.name, num); draft=String(num); commit(num); }}
                />
                {#if unit}
                    <span class="unit">{unit}</span>
                {/if}
                <!-- <div class="steppers" aria-hidden="false">
                    <button class="step up" type="button" title="Increment" on:click={() => adjust(1)}>▴</button>
                    <button class="step down" type="button" title="Decrement" on:click={() => adjust(-1)}>▾</button>
                </div> -->
            </div>
        {:else if sectionName === 'padding'}
            {#if ctrlDesc.name === 'padTop'}
                <input
                class="w-full text-center col-start-2 row-start-1"
                id={ctrlDesc.path}
                type="number"
                placeholder="T"
                bind:value={ctrlDesc.path}
                />
            {:else if ctrlDesc.name === 'padLeft'}
                <input
                class="w-full text-center col-start-1 row-start-2"
                id={ctrlDesc.path}
                type="number"
                placeholder="L"
                bind:value={ctrlDesc.path}
                />
            {:else if ctrlDesc.name === 'padRight'}
                <input
                class="w-full text-center col-start-3 row-start-2"
                id={ctrlDesc.path}
                type="number"
                placeholder="R"
                bind:value={ctrlDesc.path}
                />
            {:else if ctrlDesc.name === 'padBottom'}
                <input
                class="w-full text-center col-start-0 row-start-3"
                id={ctrlDesc.path}
                type="number"
                placeholder="B"
                bind:value={ctrlDesc.path}
                />
            {/if}

            <!-- Optional content box for visualization -->
            <!-- <div class="col-start-2 row-start-2 w-16 h-16 bg-gray-700 border border-gray-500 flex items-center justify-center text-[10px] text-gray-300">
            content
            </div> -->

        {:else if sectionName === 'effects'}
            {#if ctrlDesc.name === 'blur'}
                <div class="flex flex-col">
                    <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label>
                    <div class="sliderRow">
                        <input id={ctrlDesc.path} class="range" type="range" min={0} max={50} step={1}
                            value={(typeof value==='number'? value : 0)}
                            on:input={(e)=>{ const n = Number((e.target as HTMLInputElement).value); preview(n); }}
                            on:change={(e)=>{ const n = Number((e.target as HTMLInputElement).value); commit(n); }} />
                        <div class="valueBox">{(value ?? 0)}<span class="unitBox">px</span></div>
                    </div>
                </div>
            {:else if ctrlDesc.name === 'shadowLevel'}
                <div class="flex flex-col">
                    <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label>
                    <div class="sliderRow">
                        <input id={ctrlDesc.path} class="range" type="range" min={0} max={shadowLevels.length-1} step={1}
                            value={Math.max(0, shadowLevels.indexOf((value as any) ?? 'none'))}
                            on:input={(e)=>{ const idx = Number((e.target as HTMLInputElement).value); preview(shadowLevels[idx]); }}
                            on:change={(e)=>{ const idx = Number((e.target as HTMLInputElement).value); commit(shadowLevels[idx]); }} />
                        <div class="valueBox">{(value ?? 'none')}</div>
                    </div>
                </div>
            {:else if ctrlDesc.name === 'opacity'}
                <div class="flex flex-col">
                    <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label>
                    <div class="sliderRow">
                        <input id={ctrlDesc.path} class="range" type="range" min={0} max={100} step={1}
                            value={(typeof value==='number'? value : (value==null? 100 : Number(value)))}
                            on:input={(e)=>{ let n = Number((e.target as HTMLInputElement).value); n = normalizeByKey('opacity', n); preview(n); }}
                            on:change={(e)=>{ let n = Number((e.target as HTMLInputElement).value); n = normalizeByKey('opacity', n); commit(n); }} />
                        <div class="valueBox">{(value ?? 100)}<span class="unitBox">%</span></div>
                    </div>
                </div>
            {/if}
        {:else}
            <!-- Fallback text input (rare) -->
            <label class="clab" for={ctrlDesc.path}>{ctrlDesc.label}</label>
            <input id={ctrlDesc.path} type="text" bind:value={draft} placeholder={placeholder}
                on:input={(e)=>{ draft=(e.target as HTMLInputElement).value; preview(draft); }}
                on:blur={()=>commit(draft)} />
        {/if}
    {/key}
</div>
<style>
    /* Base layout for a single control row */
    .control { display:flex; align-items:center; gap:6px; }
    .control input, .control select { flex:1 1 auto; background:#0f172a; border:1px solid #334155; color:#e2e8f0; font-size:11px; padding:6px 8px; border-radius:6px; }
    .control select { padding-right: 24px; }
    .clab { font-size:10px; color:#94a3b8; text-transform:uppercase; }

    /* Number field custom UI */
    .num { position:relative; flex:1 1 auto; }
    .num input { width:100%; padding-right:40px; }
    .num .unit { position:absolute; right:22px; top:50%; transform:translateY(-50%); font-size:10px; color:#94a3b8; pointer-events:none; }
    .num .steppers { position:absolute; right:2px; top:2px; bottom:2px; display:flex; flex-direction:column; gap:2px; }
    .num .step { width:18px; flex:1 1 0; background:#1f2937; border:1px solid #334155; color:#e2e8f0; font-size:10px; line-height:1; padding:0; border-radius:3px; cursor:pointer; }
    .num .step:hover { background:#111827; }

    /* Hide native spinners */
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { appearance: textfield; -moz-appearance: textfield; }

    /* Segmented */
    .seg { display:inline-flex; gap:2px; }
    .seg button { background:#334155; border:none; color:#e2e8f0; font-size:10px; padding:4px 6px; cursor:pointer; border-radius:4px; }
    .seg button.selected, .seg button:focus { outline:none; background:#1f2937; }

    /* Slider row styling */
    .sliderRow { display:flex; align-items:center; gap:8px; width:100%; }
    .sliderRow .range { flex:1 1 auto; accent-color:#3b82f6; }
    .sliderRow .valueBox { min-width:58px; display:flex; align-items:center; justify-content:center; padding:2px 6px; border:1px solid #334155; border-radius:6px; background:#0f172a; color:#e2e8f0; font-size:11px; }
    .sliderRow .unitBox { margin-left:4px; color:#94a3b8; font-size:10px; }

    select {
        width: 100%;
    }
    /* Orientation selector */
    .orient { display:flex; align-items:center; gap:8px; }
    .orient .sep { color:#64748b; }
    .orient button { background:#1e293b; border:1px solid #334155; border-radius:6px; padding:4px; cursor:pointer; }
    .orient button.selected, .orient button:hover { background:#334155; }
    .orient .frame { width:34px; height:22px; border:2px solid #94a3b8; border-radius:3px; background:transparent; position:relative; }
    .orient .frame.landscape::after { content:''; position:absolute; inset:4px 8px; border:2px dashed #64748b; border-radius:2px; }
    .orient .frame.portrait { width:22px; height:34px; }
    .orient .frame.portrait::after { content:''; position:absolute; inset:8px 4px; border:2px dashed #64748b; border-radius:2px; }
</style>
