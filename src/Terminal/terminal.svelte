<div class="text-sm h-[92%]">
    <section class="flex justify-between px-2">
        <ul class="flex my-2">
            <li class="me-2 cursor-pointer">
                <button type="button" class={"inline-block border-b-1 rounded-t-lg " + ($terminalTab === 'scripts' ? 'text-gray-600 border-gray-300 dark:text-gray-300' : 'text-gray-500 hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 border-transparent')} aria-current={$terminalTab === 'scripts' ? 'page' : undefined} onclick={() => setTerminalTab('scripts')}>Scripts</button>
            </li>
            <li class="me-2 cursor-pointer">
                <button type="button" class={"inline-block border-b-1 rounded-t-lg " + ($terminalTab === 'timeline' ? 'text-gray-600 border-gray-300 dark:text-gray-300' : 'text-gray-500 hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 border-transparent')} onclick={() => setTerminalTab('timeline')}>Timeline</button>
            </li>
            <li class="me-2 cursor-pointer">
                <button type="button" class={"inline-block border-b-1 rounded-t-lg " + ($terminalTab === 'output' ? 'text-gray-600 border-gray-300 dark:text-gray-300' : 'text-gray-500 hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 border-transparent')} onclick={() => setTerminalTab('output')}>Output</button>
            </li>
        </ul>
        
        <div class="flex space-x-4 my-2">
            {#if $terminalTab === 'scripts'}
            <!-- Add Script -->
            <button type="button" class="inline-flex items-center justify-center cursor-pointer text-gray-800 dark:text-white" aria-label="Add script" onclick={() => addScript()}>
                <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7 7V5"/>
                </svg>
            </button>
            <!-- Delete Script -->
            <button type="button" class="inline-flex items-center cursor-pointer justify-center text-gray-800 dark:text-white" aria-label="Delete selected script" onclick={() => deleteSelectedScript()}>
                <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"/>
                </svg>
            </button>
            <!-- Run/Stop current script -->
            <button type="button" class="inline-flex items-center cursor-pointer justify-center text-gray-800 dark:text-white" aria-label={isRunning ? 'Stop script' : 'Run script'} onclick={() => (isRunning ? stopRun() : startRun())}>
                <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    {#if isRunning}
                        <!-- Stop icon -->
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6h12v12H6z"/>
                    {:else}
                        <!-- Play icon -->
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5v14l11-7-11-7z"/>
                    {/if}
                </svg>
            </button>
            {/if}

            <!-- Full / Exit full -->
            <button type="button" class="inline-flex items-center cursor-pointer justify-center text-gray-800 dark:text-white" aria-label="Toggle full screen" onclick={() => toggleFull()}>
                <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    {#if $terminalState === 'full'}
                        <!-- Exit full icon -->
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h4V4m12 4h-4V4M4 16h4v4m12-4h-4v4"/>
                    {:else}
                        <!-- Enter full icon -->
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4H4m0 0v4m0-4 5 5m7-5h4m0 0v4m0-4-5 5M8 20H4m0 0v-4m0 4 5-5m7 5h4m0 0v-4m0 4-5-5"/>
                    {/if}
                </svg>
            </button>

            <!-- Close -->
            <button type="button" class="inline-flex items-center cursor-pointer justify-center text-gray-800 dark:text-white" aria-label="Close terminal" onclick={() => closeTerminal()}>
                <svg class="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 17.94 6M18 18 6.06 6"/>
                </svg>
            </button>
        </div>
    </section>
    <section class="flex flex-col h-full">
        {#if $terminalTab === 'scripts'}
            <div class="flex-1 h-full grid grid-cols-[1fr_8rem] gap-0 min-h-0">
                <!-- Left: Script Editor preview area (fills available height) -->
                <div class="min-h-0 flex flex-col border-r border-slate-200 dark:border-slate-700">
                    <div class="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 justify-between">
                        <div class="flex items-center gap-2 min-w-0">
                            {#if $selectedScript}
                                {#if editingName}
                                    <input
                                      bind:this={nameInput}
                                      class="min-w-0 flex-1 bg-transparent outline-none border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-slate-700 dark:text-slate-200"
                                      type="text"
                                      bind:value={nameDraft}
                                      onblur={commitRename}
                                      onkeydown={(e)=>{ if(e.key==='Enter'){ commitRename(); } else if(e.key==='Escape'){ cancelRename(); } }}
                                    />
                                {:else}
                                    <button type="button" class="truncate select-none text-left bg-transparent p-0 m-0 underline-offset-2 hover:underline" title="Double-click to rename" ondblclick={startRename} onclick={(e)=>{ if(e.detail===0){ /* programmatic */ } }}>{$selectedScript.name}</button>
                                {/if}
                                <button type="button" class="capitalize cursor-pointer" title="Toggle scope" onclick={() => toggleScriptScope($selectedScript.id)}>
                                    ({$selectedScript.scope == 'global' ? 'Global' : 'Local' })
                                </button>
                            {:else}
                                <span>No script selected</span>
                            {/if}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            {#if tsLibError}
                                <span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" title={tsLibError}>TS libs: error</span>
                            {:else if tsLibInfo}
                                <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" title={libTooltip}>
                                    TS libs: {tsLibInfo.hasPromise && tsLibInfo.hasDocument ? 'OK' : 'Partial'}
                                </span>
                            {/if}
                        </div>
                    </div>
                    <div class="flex-1 min-h-0">
                        {#if $selectedScript}
                            <ScriptEditorMonaco
                              scriptId={$selectedScript.id}
                              code={$selectedScript.code ?? ''}
                              onChange={(next) => updateScriptCode($selectedScript.id, next)}
                              on:libInfo={handleLibInfo}
                                                            on:selfTest={handleSelfTest}
                                                            runtimeSymbols={$runtimeCompletions}
                                                            variableTypeDefs={$variableTypeDefsSource}
                            />
                        {:else}
                            <div class="h-full w-full grid place-items-center text-slate-400 text-xs">No script selected</div>
                        {/if}
                    </div>
                </div>
                <!-- Right: Script list (global + current page) like VS Code terminals -->
                <div class="min-h-0 flex flex-col">
                    <div class="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        Scripts
                    </div>
                    <div class="flex-1 overflow-auto">
                        <ul class="text-xs divide-y divide-slate-200 dark:divide-slate-700">
                            {#each $visibleScripts as s}
                                <li>
                                    <button type="button" class="w-full px-2 py-1 flex justify-between items-center text-left { $selectedScriptId === s.id ? 'bg-slate-100 dark:bg-slate-800' : '' }" onclick={() => selectScript(s.id)}>
                                        <span class="truncate">{s.name}</span>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </div>
                </div>
            </div>
        {:else if $terminalTab === 'timeline'}
            <TimelineEditor/>
        {:else}
            <div class="flex-1 overflow-auto">
                <ul class="text-xs divide-y divide-slate-200 dark:divide-slate-700">
                    {#each $entries as item}
                        <li class="px-2 py-1">
                            <span class="mr-2 opacity-60">{new Date(item.time).toLocaleTimeString()}</span>
                            <span class="mr-2 font-mono {item.level === 'error' ? 'text-rose-600' : item.level === 'warn' ? 'text-amber-600' : 'text-emerald-600'}">[{item.level}]</span>
                            <span>{item.message}</span>
                        </li>
                    {/each}
                </ul>
            </div>
            <div class="p-2 border-t border-slate-200 dark:border-slate-700 flex gap-2">
                <button class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600" onclick={clearOutput}>Clear</button>
            </div>
        {/if}
    </section>
</div>

<script lang="ts">
    import { layout } from "../stores/layout";
    import { devOutput } from '../stores/devOutput';
    import { derived } from 'svelte/store';
    import TimelineEditor from './Timeline/TimelineEditor.svelte';
    import ScriptEditorMonaco from './ScriptEditorMonaco.svelte';
    import { addScript, deleteSelectedScript, selectScript, visibleScripts, selectedScriptId, toggleScriptScope, selectedScript, renameScript, updateScriptCode } from '../stores/scripts';
    import { createSandbox, type Sandbox } from './runtime/sandboxClient';
    import { selectedElementId, projectData, currentPageId, patchElement } from '../stores/project';
    import { get } from 'svelte/store';
    import { variableValues, variableDefs, type VarType, type VariableDef } from '../stores/variables';
    const { toggleFull, closeTerminal, terminalState, terminalTab, setTerminalTab } = layout;

    // Output store bindings
    const entries = derived(devOutput, ($store)=>$store as any);
    function clearOutput(){ devOutput.clear(); }

    type CompletionContext = 'any' | 'root' | 'variables' | 'timeline' | 'elements' | 'builtin';
    interface RuntimeCompletionMeta {
        label: string;
        insertText?: string;
        detail?: string;
        documentation?: string;
        contexts?: CompletionContext[];
        sortText?: string;
    }

    function tsTypeForVar(type: VarType): string {
        switch (type) {
            case 'string': return 'string';
            case 'number': return 'number';
            case 'boolean': return 'boolean';
            case 'json': return 'unknown';
            case 'object': return 'Record<string, unknown>';
            case 'array': return 'unknown[]';
            default: return 'any';
        }
    }

    function escapeStringLiteral(input: string): string {
        return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    function isValidIdentifier(name: string): boolean {
        return /^[$A-Z_a-z][$\w]*$/u.test(name);
    }

    function createVariableTypeAugmentation(defs: VariableDef[]): string {
        const header = `// Auto-generated variable typings from current project state\n`;
        if (!defs.length) {
            return `${header}interface MavaVariableAPI {\n  /* no user variables declared yet */\n}\n`;
        }

        const propertyLines: string[] = [];
        const getLines: string[] = [];
        const readonlyLines: string[] = [];
        const setLines: string[] = [];
        const mutableLines: string[] = [];

        const sorted = [...defs].sort((a, b) => a.name.localeCompare(b.name));
        for (const def of sorted) {
            const rawName = def.name;
            const escaped = escapeStringLiteral(rawName);
            const tsType = tsTypeForVar(def.type);
            const scopeLabel = def.scope === 'global' ? 'global' : `page:${def.pageId ?? 'unknown'}`;
            const propKey = isValidIdentifier(rawName) ? rawName : `['${escaped}']`;
            const comment = `  /** variable "${rawName}" (${scopeLabel}) · ${tsType} */`;

            propertyLines.push(comment);
            propertyLines.push(`  ${def.readOnly ? 'readonly ' : ''}${propKey}: ${tsType};`);

            getLines.push(comment);
            getLines.push(`  get(name: '${escaped}'): ${tsType};`);

            readonlyLines.push(comment);
            readonlyLines.push(`  readonly(name: '${escaped}'): ReadonlySignal<${tsType}>;`);

            if (!def.readOnly) {
                setLines.push(comment);
                setLines.push(`  set(name: '${escaped}', value: ${tsType}): void;`);

                mutableLines.push(comment);
                mutableLines.push(`  mutable(name: '${escaped}'): Signal<${tsType}>;`);
            }
        }

        const lines = [header, 'interface MavaVariableAPI {'];
        lines.push(...propertyLines);
        lines.push(...getLines);
        lines.push(...readonlyLines);
        if (setLines.length) lines.push(...setLines);
        if (mutableLines.length) lines.push(...mutableLines);
        lines.push('}\n');
        return lines.join('\n');
    }

    const variableTypeDefsSource = derived(variableDefs, ($defs) => createVariableTypeAugmentation($defs));

    function defaultValueForVarType(type: VarType): any {
        switch (type) {
            case 'string': return '';
            case 'number': return 0;
            case 'boolean': return false;
            case 'json':
            case 'object': return {};
            case 'array': return [];
            default: return undefined;
        }
    }

    function materializeVariableValue(def: VariableDef, raw: any): any {
        if (raw !== undefined) return raw;
        return defaultValueForVarType(def.type);
    }

    function pushVariablesToSandbox(sandboxInstance: Sandbox, defs: VariableDef[], valuesById: Record<string, any>) {
        for (const def of defs) {
            const raw = valuesById[def.id];
            const value = materializeVariableValue(def, raw);
            try { sandboxInstance.setVar(def.name, value); } catch {}
        }
    }

    const runtimeCompletions = derived([variableDefs, currentPageId], ([$defs, $pageId]) => {
        const completions: RuntimeCompletionMeta[] = [];

        interface VariableCompletion { name: string; type: string; readOnly: boolean; scope: string; }
        const variables: VariableCompletion[] = [];
        for (const def of $defs) {
            if (def.scope === 'global' || (def.scope === 'page' && def.pageId === $pageId)) {
                variables.push({ name: def.name, type: tsTypeForVar(def.type), readOnly: !!def.readOnly, scope: def.scope === 'global' ? 'Global' : `Page · ${def.pageId ?? 'unknown'}` });
            }
        }
        variables.sort((a, b) => a.name.localeCompare(b.name)).forEach((entry, index) => {
            completions.push({
                label: entry.name,
                detail: `Variable · ${entry.type}`,
                documentation: `${entry.scope} variable "${entry.name}" (${entry.type})${entry.readOnly ? ' · read-only' : ''}`,
                contexts: ['variables'],
                sortText: `az${index.toString().padStart(3,'0')}`
            });
        });

        return completions;
    });

    // Inline rename state
    let editingName = false;
    let nameDraft: string = '';
    let nameInput: HTMLInputElement | null = null;

    function startRename() {
        if ($selectedScript) {
            editingName = true;
            nameDraft = $selectedScript.name;
            // focus after next microtask so the input is in DOM
            queueMicrotask(() => nameInput?.focus());
            queueMicrotask(() => nameInput?.select());
        }
    }
    function cancelRename() {
        editingName = false;
    }
    function commitRename() {
        if ($selectedScript && nameDraft.trim() && nameDraft !== $selectedScript.name) {
            renameScript($selectedScript.id, nameDraft.trim());
        }
        editingName = false;
    }

    // --- Sandbox wiring (exposes runtime Mava API to scripts) ---
    const sandbox = createSandbox();
    let isRunning = false;
    let logUnsub: null | (() => void) = null;
    let evtUnsub: null | (() => void) = null;
    let selUnsub: null | (() => void) = null;
    let rafId: number | null = null;
    let lastT: number | null = null;

    function startRaf() {
        if (rafId != null) return;
        const loop = (t: number) => {
            if (!isRunning) { rafId = null; return; }
            const prev = lastT ?? t;
            const dt = t - prev;
            lastT = t;
            try { sandbox.setTime(t, dt); } catch {}
            rafId = requestAnimationFrame(loop) as unknown as number;
        };
        rafId = requestAnimationFrame(loop) as unknown as number;
    }
    function stopRaf() { if (rafId != null) { cancelAnimationFrame(rafId as any); rafId = null; } lastT = null; }

    function cloneForSandbox<T>(value: T): T {
        if (value === null || typeof value !== 'object') return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch {}
        }
        try { return JSON.parse(JSON.stringify(value)) as T; } catch {}
        if (Array.isArray(value)) {
            return value.slice() as unknown as T;
        }
        return { ...(value as Record<string, any>) } as T;
    }

    function snapshotPageForSandbox() {
        const proj = get(projectData);
        const pageId = get(currentPageId);
        if (!pageId) return { id: null as string | null, elements: [] as any[] };
        const page = proj?.pagesById?.[pageId];
        if (!page) return { id: pageId, elements: [] };
        const elements = page.elements.map((el: any) => {
            const clone = cloneForSandbox(el);
            if (clone && typeof clone === 'object') {
                (clone as any).pageId = pageId;
            }
            return clone;
        });
        return { id: pageId, elements };
    }

    async function startRun() {
        if (!$selectedScript) { devOutput.append('warn', 'No script selected'); return; }
        // Clean previous
        try { await sandbox.stop(); } catch {}
        if (logUnsub) { logUnsub(); logUnsub = null; }
        if (evtUnsub) { evtUnsub(); evtUnsub = null; }
        if (selUnsub) { selUnsub(); selUnsub = null; }

        // Bridge logs/events to Output
        logUnsub = sandbox.onLog((level, args) => {
            const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
            const levelMap = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
            devOutput.append(levelMap as any, msg, { source: 'script' });
        });
        evtUnsub = sandbox.onEvent((e) => {
            if (!e) return;
            if (e.type === 'runtimeError') {
                devOutput.append('error', e.message || 'Runtime error', { stack: e.stack });
            } else if (e.type === 'ran') {
                devOutput.append('info', 'Script ran');
            } else if (e.type === 'stopped') {
                devOutput.append('info', 'Script stopped');
            } else if (e.type === 'elementPatch') {
                const payload = e.payload ?? e;
                if (payload?.id && payload?.changes && typeof payload.changes === 'object') {
                    patchElement(String(payload.id), payload.changes as Record<string, any>, { pageId: payload.pageId ?? undefined, reason: 'style' });
                }
            } else if (e.type === 'timelineCommand') {
                const payload = e.payload ?? e;
                const action = (payload && typeof payload === 'object' ? payload.action : undefined) ?? 'unknown';
                devOutput.append('info', `Timeline command from script: ${action}`, { source: 'script' });
            }
        });

        // Forward selection reactively while running
        selUnsub = selectedElementId.subscribe((id) => {
            try { sandbox.setSelection(id); } catch {}
        });
        // Push initial selection
        try { sandbox.setSelection(get(selectedElementId)); } catch {}

        // Forward variables reactively (by name) to sandbox
        // push current variable values once
        try {
            const defs = get(variableDefs) as VariableDef[];
            const vals = get(variableValues) as Record<string, any>;
            pushVariablesToSandbox(sandbox, defs, vals);
        } catch {}
        // subscribe changes
        const unsubVals = variableValues.subscribe((vals) => {
            try {
                const defs = get(variableDefs) as VariableDef[];
                pushVariablesToSandbox(sandbox, defs, vals as Record<string, any>);
            } catch {}
        });
        // ensure we clean sub on stop
        userStopHooks.push(() => unsubVals());

                const unsubDefs = variableDefs.subscribe((defs) => {
                    try {
                        const vals = get(variableValues) as Record<string, any>;
                        pushVariablesToSandbox(sandbox, defs as VariableDef[], vals);
                    } catch {}
                });
                userStopHooks.push(() => unsubDefs());

        // Builtin snapshots (project meta and timeline basic)
        const pushBuiltin = () => {
            const proj = get(projectData);
            const projectSnap = { title: proj.course?.metadata?.title, version: proj.projectVersion };
            const timelineSnap = { time: performance.now?.() ?? Date.now() };
            const pageSnap = snapshotPageForSandbox();
            try { sandbox.setBuiltin({ project: projectSnap, timeline: timelineSnap, page: pageSnap }); } catch {}
        };
        pushBuiltin();
        const unsubProj = projectData.subscribe(() => pushBuiltin());
        const unsubPage = currentPageId.subscribe(() => pushBuiltin());
        userStopHooks.push(() => unsubPage());
        userStopHooks.push(() => unsubProj());

        // Run script code
        try {
            await sandbox.run($selectedScript.code ?? '');
            isRunning = true;
            startRaf();
        } catch (e: any) {
            devOutput.append('error', e?.message || String(e) || 'Failed to run script');
        }
    }

    const userStopHooks: Array<() => void> = [];
    async function stopRun() {
        isRunning = false;
        stopRaf();
        try { await sandbox.stop(); } catch {}
        if (logUnsub) { logUnsub(); logUnsub = null; }
        if (evtUnsub) { evtUnsub(); evtUnsub = null; }
        if (selUnsub) { selUnsub(); selUnsub = null; }
        // run custom unsub hooks
        while (userStopHooks.length) { const fn = userStopHooks.pop(); try { fn && fn(); } catch {} }
    }

    // TS lib debug state
    type LibInfo = { defaultLib: string; length: number; hasPromise: boolean; hasDocument: boolean; hasGetLibFileFromBundle?: boolean; hasLibMap?: boolean; libsCount?: number; libSource?: string; build?: string };
    let tsLibInfo: LibInfo | null = null;
    let tsLibError: string | null = null;
    let tsSelfTest: { flags: any; diagnostics: Array<{ start: number; end: number; message: string; severity: number }> } | null = null;
    // Computed tooltip content including self-test diagnostics
    let libTooltip: string = '';
    function sevLabel(s: number) {
        return s === 1 ? 'error' : s === 0 ? 'warning' : 'info';
    }
    $: {
        if (!tsLibInfo) {
            libTooltip = '';
        } else {
            const base = [
                `lib=${tsLibInfo.defaultLib}`,
                `length=${tsLibInfo.length}`,
                `Promise=${tsLibInfo.hasPromise}`,
                `Document=${tsLibInfo.hasDocument}`,
                `source=${tsLibInfo.libSource ?? '?'}`,
                `getLibFromBundle=${tsLibInfo.hasGetLibFileFromBundle ? 'yes' : 'no'}`,
                `libMap=${tsLibInfo.hasLibMap ? 'yes' : 'no'}`,
                `libsCount=${tsLibInfo.libsCount ?? 0}`,
                `build=${tsLibInfo.build ?? ''}`,
            ];
            const selfCount = tsSelfTest?.diagnostics?.length ?? 0;
            base.push(`selfDiag=${selfCount}`);
            if (selfCount > 0) {
                const lines = tsSelfTest!.diagnostics.slice(0, 5).map((d, i) => {
                    const msg = (d.message || '').replace(/\s+/g, ' ').slice(0, 200);
                    return `  #${i + 1} [${sevLabel(d.severity)}] ${msg}`;
                });
                if ((tsSelfTest!.diagnostics.length) > lines.length) {
                    lines.push(`  …and ${tsSelfTest!.diagnostics.length - lines.length} more`);
                }
                base.push('selfDiagMessages:\n' + lines.join('\n'));
            }
            libTooltip = base.join('\n');
        }
    }
    function handleLibInfo(e: CustomEvent<LibInfo | { error: string }>) {
        const v: any = e.detail;
        if (v && typeof v === 'object' && 'error' in v) {
            tsLibInfo = null;
            tsLibError = String(v.error);
        } else {
            tsLibError = null;
            tsLibInfo = v as LibInfo;
        }
    }
    function handleSelfTest(e: CustomEvent<any>) {
        tsSelfTest = e.detail || null;
    }
</script>

<style>
</style>