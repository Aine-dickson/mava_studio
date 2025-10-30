<script lang="ts">
    import { onMount, tick } from 'svelte';
    import {
        projectData, currentModuleId, currentLessonId,
        createModule, createLesson, createPage,
        deleteModule, deleteLesson, deletePage,
        selectPage, currentPageId,
        renameModule, renameLesson, renamePage,
        reorderModules, reorderLessons, reorderPages,
        moveLesson, movePage,
    selectElement, selectElementFromOutline, selectedElementIds, selectedElementId
    } from '../stores/project';
    import { selectedScript, requestInsertIntoSelectedScript } from '../stores/scripts';
    import { devOutput } from '../stores/devOutput';

    // Section metadata (unused but kept for potential future)
    const sections = [
        { id: 'workspace', title: 'Workspace' },
        { id: 'outline', title: 'Outline' },
    ];

    // expanded state per module/lesson plus top-level
    let expanded = {};
    const LS_KEY = 'structure:expanded';

    function saveExpanded() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(expanded)); } catch {}
    }
    function toggle(key) {
        const v = expanded[key] ?? true;
        expanded = { ...expanded, [key]: !v };
        saveExpanded();
    }
    function expandAll() {
        const p = $projectData;
    const next = { workspace: true, outline: expanded['outline'] ?? true };
        for (const m of p.course.modules) next[`m:${m.id}`] = true;
        for (const les of Object.values(p.lessonsById)) next[`l:${les.id}`] = true;
        expanded = next; saveExpanded();
    }
    function collapseAll() {
        // collapse only workspace tree; keep outline as-is
        expanded = { workspace: true, outline: expanded['outline'] ?? true }; saveExpanded();
    }

    $: insertEligibility = (() => {
        const script = $selectedScript;
        if (!script) {
            return { allowed: false, reason: 'Select a script to insert element IDs' } as const;
        }
        if (script.scope === 'page') {
            const currentPage = $currentPageId ?? null;
            if (!currentPage || script.pageId !== currentPage) {
                return { allowed: false, reason: 'Selected script is scoped to a different page' } as const;
            }
        }
        return { allowed: true, reason: '' } as const;
    })();
    $: insertActionTitle = insertEligibility.allowed ? 'Insert element id into script' : insertEligibility.reason;

    async function insertElementIdToScript(elementId: string) {
        const pageId = $currentPageId ?? null;
        const result = requestInsertIntoSelectedScript(`'${elementId}'`, { pageId });
        if (!result.ok) {
            if (result.reason === 'no-script') {
                devOutput.append('warn', 'Select a script to insert element IDs', { source: 'outline' });
            } else if (result.reason === 'scope-mismatch') {
                devOutput.append('warn', 'Current script is scoped to a different page', { source: 'outline', script: $selectedScript?.name });
            }
            return;
        }
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(elementId);
            }
        } catch {}
        devOutput.append('info', `Inserted element id ${elementId} into ${$selectedScript?.name ?? 'script'}`, { source: 'outline' });
    }

    // context menu state
    let ctxOpen = false;
    let ctxX = 0, ctxY = 0;
    let ctxKind = null; // 'module' | 'lesson' | 'workspace' | 'page'
    let ctxId = null;
    function openCtx(e, kind, id = null) {
        e.preventDefault();
        ctxOpen = true; ctxKind = kind; ctxId = id; ctxX = e.clientX; ctxY = e.clientY;
        window.addEventListener('click', closeCtxOnce, { once: true });
    }
    function closeCtxOnce() { ctxOpen = false; ctxKind = null; ctxId = null; }

    function onCreateUnder() {
        if (ctxKind === 'workspace') return newModule();
        if (ctxKind === 'module' && ctxId) return newLesson(ctxId);
        if (ctxKind === 'lesson' && ctxId) return newPage(ctxId);
    }
    function onDeleteItem() {
        if (!ctxId) return;
        if (ctxKind === 'module') return deleteModule(ctxId);
        if (ctxKind === 'lesson') return deleteLesson(ctxId);
        if (ctxKind === 'page') return deletePage(ctxId);
    }

    // inline rename editing state
    let editingKind = null; // 'module' | 'lesson' | 'page'
    let editingId = null;
    let editingTitle = '';
    let editingIsNew = false; // deletion if empty & new
    let editInput = null;

    function startEdit(kind, id, initial, isNew = false) {
        editingKind = kind; editingId = id; editingTitle = initial; editingIsNew = isNew;
        tick().then(() => { if (editInput) { editInput.focus(); editInput.select(); } });
    }
    function commitEdit() {
        if (!editingKind || !editingId) return;
        const raw = editingTitle.trim();
        if (!raw) {
            // empty: delete if new, else revert (no rename)
            if (editingIsNew) {
                if (editingKind === 'module') deleteModule(editingId);
                else if (editingKind === 'lesson') deleteLesson(editingId);
                else if (editingKind === 'page') deletePage(editingId);
            }
            editingKind = null; editingId = null; editingTitle = ''; editingIsNew = false; return;
        }
        // rename only if changed
        let currentTitle = '';
        if (editingKind === 'module') currentTitle = $projectData.modulesById[editingId].metadata.title;
        else if (editingKind === 'lesson') currentTitle = $projectData.lessonsById[editingId].metadata.title;
        else if (editingKind === 'page') currentTitle = $projectData.pagesById[editingId].metadata.title;
        if (raw !== currentTitle) {
            if (editingKind === 'module') renameModule(editingId, raw);
            else if (editingKind === 'lesson') renameLesson(editingId, raw);
            else if (editingKind === 'page') renamePage(editingId, raw);
        }
        editingKind = null; editingId = null; editingTitle = ''; editingIsNew = false;
    }
    function cancelEdit() {
        if (!editingKind) return;
        if (editingIsNew && editingId) {
            if (editingKind === 'module') deleteModule(editingId);
            else if (editingKind === 'lesson') deleteLesson(editingId);
            else if (editingKind === 'page') deletePage(editingId);
        }
        editingKind = null; editingId = null; editingTitle = ''; editingIsNew = false;
    }
    function onEditKeydown(e) {
        if (e.key === 'Enter') { commitEdit(); }
        else if (e.key === 'Escape') { cancelEdit(); }
    }

    function replaceUnfinishedIfAny() {
        if (editingIsNew && editingId && editingTitle.trim() === '' && editingKind) {
            if (editingKind === 'module') deleteModule(editingId);
            else if (editingKind === 'lesson') deleteLesson(editingId);
            else if (editingKind === 'page') deletePage(editingId);
            editingKind = null; editingId = null; editingTitle = ''; editingIsNew = false;
        }
    }
    function ensureExpanded(keys) {
        let changed = false;
        for (const k of keys) {
            if (expanded[k] === false) { changed = true; }
            if (expanded[k] !== true) expanded[k] = true;
        }
        if (changed) { expanded = { ...expanded }; saveExpanded(); }
    }
    function findModuleIdForLesson(lessonId) {
        const p = $projectData;
        for (const m of p.course.modules) {
            const mod = p.modulesById[m.id];
            if (mod.lessons.some(l => l.id === lessonId)) return mod.id;
        }
        return null;
    }
    function newModule() {
        replaceUnfinishedIfAny();
        ensureExpanded(['workspace']);
        const id = createModule();
        // expand the new module so its inline input is visible
        ensureExpanded([`m:${id}`]);
        startEdit('module', id, '', true);
    }
    function newLesson(moduleId) {
        replaceUnfinishedIfAny();
        ensureExpanded(['workspace', `m:${moduleId}`]);
        const id = createLesson(moduleId);
        if (id) {
            ensureExpanded([`l:${id}`]);
            startEdit('lesson', id, '', true);
        }
    }
    function newPage(lessonId) {
        replaceUnfinishedIfAny();
        const modId = findModuleIdForLesson(lessonId);
        const keys = ['workspace'];
        if (modId) keys.push(`m:${modId}`);
        keys.push(`l:${lessonId}`);
        ensureExpanded(keys);
        const id = createPage(lessonId);
        if (id) {
            selectPage(id);
            startEdit('page', id, '', true);
        }
    }

    function handleGlobalKey(e) {
        if (e.key === 'F2') {
            // choose most specific selection: page > lesson > module
            if ($currentPageId) {
                const page = $projectData.pagesById[$currentPageId];
                if (page) startEdit('page', page.id, page.metadata.title, false);
            } else if ($currentLessonId) {
                const les = $projectData.lessonsById[$currentLessonId];
                if (les) startEdit('lesson', les.id, les.metadata.title, false);
            } else if ($currentModuleId) {
                const mod = $projectData.modulesById[$currentModuleId];
                if (mod) startEdit('module', mod.id, mod.metadata.title, false);
            }
        }
    }

    onMount(() => {
        window.addEventListener('keydown', handleGlobalKey);
        try {
            const raw = localStorage.getItem(LS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            const p = $projectData;
            const initial = { workspace: parsed.workspace ?? true, outline: parsed.outline ?? true };
            for (const m of p.course.modules) initial[`m:${m.id}`] = parsed[`m:${m.id}`] ?? true;
            for (const les of Object.values(p.lessonsById)) initial[`l:${les.id}`] = parsed[`l:${les.id}`] ?? true;
            expanded = initial;
        } catch {
            const p = $projectData;
            const initial = { workspace: true, outline: true };
            for (const m of p.course.modules) initial[`m:${m.id}`] = true;
            for (const les of Object.values(p.lessonsById)) initial[`l:${les.id}`] = true;
            expanded = initial;
        }
    });

    // cleanup
    import { onDestroy } from 'svelte';
    onDestroy(() => { window.removeEventListener('keydown', handleGlobalKey); });
</script>

<style>
    .chev { transition: transform 120ms ease; }
    .rot { transform: rotate(90deg); }
    .row { line-height: 26px; height: 26px; }
    .row:hover { background: color-mix(in oklab, canvastext 30%, canvas); }
    .active { background: color-mix(in oklab, canvastext 42%, canvas); }
    .ctx { position: fixed; z-index: 40; min-width: 160px; }
    .ctx li { padding: 6px 10px; }
    .ctx li:hover { background: color-mix(in oklab, canvastext 10%, canvas); }
    .icon { width: 16px; height: 16px; opacity: 0.8; }
    .toolbar button { opacity: 0.8; }
    .toolbar button:hover { opacity: 1; }
    :global(.drag-over-before) { box-shadow: inset 0 2px 0 0 var(--drag-color, #3b82f6); }
    :global(.drag-over-after) { box-shadow: inset 0 -2px 0 0 var(--drag-color, #3b82f6); }
    /* Removed old vscode-row-icon; using provided SVG classes */
    .badge { font-size:10px; line-height:14px; padding:0 4px; border-radius:8px; background:color-mix(in oklab, canvastext 70%, canvas); color:canvas; }
    .outline-action {
        display:flex;
        align-items:center;
        justify-content:center;
        width:20px;
        height:20px;
        border-radius:4px;
        border:none;
        background:transparent;
        opacity:0.6;
    }
    .outline-action:hover { opacity:1; background:color-mix(in oklab, canvastext 8%, canvas); }
    .outline-action:focus-visible { outline:2px solid color-mix(in srgb, #2563eb 70%, transparent); outline-offset:2px; }
    .outline-action:disabled {
        opacity:0.25;
        cursor:not-allowed;
    }
</style>

<div class="h-full text-sm select-none">
    <!-- Top: Workspace header with toolbar like VS Code -->
    <div class="border-b border-slate-300/30 dark:border-slate-600/40">
        <div class="w-full flex items-center justify-between px-2 py-2">
            <button type="button" class="flex items-center gap-2" onclick={() => toggle('workspace')} aria-expanded={expanded['workspace'] ?? true} aria-controls="sec-workspace" oncontextmenu={(e) => openCtx(e, 'workspace')}>
                <svg class="w-4 h-4 text-gray-800 dark:text-white chev {expanded['workspace'] ? 'rot' : ''}" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>
                <span class="uppercase tracking-wider text-[11px] text-gray-600 dark:text-gray-300">Workspace</span>
            </button>
            <div class="toolbar flex items-center gap-1">
                <button aria-label="New Module" title="New Module" onclick={() => newModule()}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M12 5v14M5 12h14"/></svg></button>
                <button aria-label="Delete Selected" title="Delete Selected" onclick={() => $currentPageId ? deletePage($currentPageId) : $currentLessonId ? deleteLesson($currentLessonId) : $currentModuleId ? deleteModule($currentModuleId) : null}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M6 7h12M9 7V5h6v2m-8 2 1 11h8l1-11"/></svg></button>
                <button aria-label="Collapse All" title="Collapse All" onclick={() => collapseAll()}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M8 9h8M8 15h8"/></svg></button>
                <button aria-label="Expand All" title="Expand All" onclick={() => expandAll()}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M6 12h12M12 6v12"/></svg></button>
                <button aria-label="More options" title="More">
                    <svg class="icon" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>
                </button>
            </div>
        </div>
        {#if expanded['workspace']}
            <div id="sec-workspace" class="pb-2">
                <!-- Modules list -->
                {#each $projectData.course.modules as mRef (mRef.id)}
                    {@const mod = $projectData.modulesById[mRef.id]}
                    <div class="group">
            <div class="row flex items-center justify-between px-2"
                            role="button" tabindex="0" aria-haspopup="menu"
                            draggable="true"
                ondragstart={(e) => { e.dataTransfer?.setData('text/plain', JSON.stringify({ kind:'module', id: mod.id })); e.dataTransfer?.setDragImage(new Image(),0,0); }}
                ondragover={(e) => { e.preventDefault(); try { const raw = e.dataTransfer?.getData('text/plain'); if (raw) { const data = JSON.parse(raw); if (data.kind==='lesson') { e.currentTarget.classList.add('drag-over-after'); return; } } } catch {} const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; e.currentTarget.classList.toggle('drag-over-before', before); e.currentTarget.classList.toggle('drag-over-after', !before); }}
                            ondragleave={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); }}
                ondrop={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); try { const raw = e.dataTransfer?.getData('text/plain'); if(!raw) return; const data = JSON.parse(raw); if (data.kind==='module' && data.id!==mod.id) { const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; reorderModules(data.id, mod.id, before); } else if (data.kind==='lesson' && data.moduleId !== mod.id) { moveLesson(data.id, mod.id, null, false); } } catch {} }}
                            oncontextmenu={(e) => openCtx(e, 'module', mod.id)}>
                            <button class="flex items-center gap-2 grow text-left" onclick={() => toggle(`m:${mod.id}`)} aria-expanded={expanded[`m:${mod.id}`] ?? true}>
                                <svg class="w-4 h-4 chev {expanded[`m:${mod.id}`] ? 'rot' : ''}" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>
                                                                <!-- Provided module icon -->
                                                                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path fill-rule="evenodd" d="M3 6a2 2 0 0 1 2-2h5.532a2 2 0 0 1 1.536.72l1.9 2.28H3V6Zm0 3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H3Z" clip-rule="evenodd"/>
                                                                </svg>
                                {#if editingKind === 'module' && editingId === mod.id}
                                    <input class="px-1 rounded border border-slate-400/40 dark:border-slate-600/60 bg-white dark:bg-slate-700 text-sm w-full" bind:this={editInput} bind:value={editingTitle} onkeydown={onEditKeydown} onblur={commitEdit} />
                                {:else}
                                    <span class="text-gray-800 dark:text-gray-200" role="button" tabindex="0" ondblclick={() => startEdit('module', mod.id, mod.metadata.title)}>{mod.metadata.title}</span>
                                {/if}
                                <span class="badge" title="Lessons">{mod.lessons.length}</span>
                            </button>
                            <div class="invisible group-hover:visible flex items-center gap-1 pr-2">
                                <button aria-label="New Lesson" title="New Lesson" onclick={() => newLesson(mod.id)}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M12 5v14M5 12h14"/></svg></button>
                            </div>
                        </div>
                        {#if expanded[`m:${mod.id}`]}
                            <!-- Lessons under module -->
                            {#each mod.lessons as lRef (lRef.id)}
                                {@const les = $projectData.lessonsById[lRef.id]}
                                <div class="ml-4">
                                    <div class="row flex items-center justify-between px-2"
                                        role="button" tabindex="0" aria-haspopup="menu"
                                        draggable="true"
                                        ondragstart={(e) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', JSON.stringify({ kind:'lesson', id: les.id, moduleId: mod.id })); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(new Image(),0,0); } }}
                                        ondragover={(e) => { e.preventDefault(); try { const raw = e.dataTransfer?.getData('text/plain'); if (raw) { const data = JSON.parse(raw); if (data.kind==='page') { e.currentTarget.classList.add('drag-over-after'); return; } } } catch {} const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; e.currentTarget.classList.toggle('drag-over-before', before); e.currentTarget.classList.toggle('drag-over-after', !before); }}
                                        ondragleave={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); }}
                                        ondrop={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); try { const raw = e.dataTransfer?.getData('text/plain'); if(!raw) return; const data = JSON.parse(raw); const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; if (data.kind==='lesson' && data.id!==les.id) { if (data.moduleId === mod.id) { reorderLessons(mod.id, data.id, les.id, before); } else { moveLesson(data.id, mod.id, les.id, before); } } else if (data.kind==='page' && data.lessonId !== les.id) { movePage(data.id, les.id, null, false); } } catch {} }}
                                        oncontextmenu={(e) => openCtx(e, 'lesson', les.id)}>
                                        <button class="flex items-center gap-2 grow text-left" onclick={() => toggle(`l:${les.id}`)} aria-expanded={expanded[`l:${les.id}`] ?? true}>
                                            <svg class="w-4 h-4 chev {expanded[`l:${les.id}`] ? 'rot' : ''}" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>
                                                                                        <!-- Provided lesson icon -->
                                                                                        <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                                                                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.429M7 8h3M8 8V4h4v2m4 0V5h-4m3 4v3a1 1 0 0 1-1 1h-3m9-3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-6.397a1 1 0 0 1 .27-.683l2.434-2.603a1 1 0 0 1 .73-.317H19a1 1 0 0 1 1 1Z"/>
                                                                                        </svg>
                                            {#if editingKind === 'lesson' && editingId === les.id}
                                                <input class="px-1 rounded border border-slate-400/40 dark:border-slate-600/60 bg-white dark:bg-slate-700 text-sm w-full" bind:this={editInput} bind:value={editingTitle} onkeydown={onEditKeydown} onblur={commitEdit} />
                                            {:else}
                                                <span class="text-gray-700 dark:text-gray-300" role="button" tabindex="0" ondblclick={() => startEdit('lesson', les.id, les.metadata.title)}>{les.metadata.title}</span>
                                            {/if}
                                            <span class="badge" title="Pages">{les.pages.length}</span>
                                        </button>
                                        <div class="invisible group-hover:visible flex items-center gap-1 pr-2">
                                            <button aria-label="New Page" title="New Page" onclick={() => newPage(les.id)}><svg class="icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="2" d="M12 5v14M5 12h14"/></svg></button>
                                        </div>
                                    </div>
                                    {#if expanded[`l:${les.id}`]}
                                        <!-- Pages under lesson -->
                                        <div class="ml-4">
                                            {#each les.pages as pRef (pRef.id)}
                                                {@const page = $projectData.pagesById[pRef.id]}
                                                <button class="row w-full text-left px-2 { $currentPageId === page.id ? 'active' : '' }"
                                                    draggable="true"
                                                    ondragstart={(e) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', JSON.stringify({ kind:'page', id: page.id, lessonId: les.id })); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(new Image(),0,0); } }}
                                                    ondragover={(e) => { e.preventDefault(); const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; e.currentTarget.classList.toggle('drag-over-before', before); e.currentTarget.classList.toggle('drag-over-after', !before); }}
                                                    ondragleave={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); }}
                                                    ondrop={(e) => { e.currentTarget.classList.remove('drag-over-before','drag-over-after'); try { const raw = e.dataTransfer?.getData('text/plain'); if(!raw) return; const data = JSON.parse(raw); const bounds = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - bounds.top) < bounds.height/2; if (data.kind==='page' && data.id!==page.id) { if (data.lessonId === les.id) { reorderPages(les.id, data.id, page.id, before); } else { movePage(data.id, les.id, page.id, before); } } } catch {} }}
                                                    oncontextmenu={(e) => openCtx(e, 'page', page.id)} onclick={() => { if (editingKind !== 'page') selectPage(page.id); }}>
                                                    {#if editingKind === 'page' && editingId === page.id}
                                                        <input class="px-1 rounded border border-slate-400/40 dark:border-slate-600/60 bg-white dark:bg-slate-700 text-sm w-full" bind:this={editInput} bind:value={editingTitle} onkeydown={onEditKeydown} onblur={commitEdit} />
                                                    {:else}
                                                        <span class="flex items-center gap-1 text-gray-600 dark:text-gray-300" role="button" tabindex="0" ondblclick={() => startEdit('page', page.id, page.metadata.title)}>
                                                                                                                        <!-- Provided page icon -->
                                                                                                                        <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                                                                                                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 3v4a1 1 0 0 1-1 1H5m8-2h3m-3 3h3m-4 3v6m4-3H8M19 4v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1ZM8 12v6h8v-6H8Z"/>
                                                                                                                        </svg>
                                                            {page.metadata.title}
                                                        </span>
                                                    {/if}
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Outline: list elements/components on selected page -->
    <div class="border-b border-slate-300/30 dark:border-slate-600/40">
        <div class="w-full flex items-center justify-between px-2 py-2">
            <button type="button" class="flex items-center gap-2" onclick={() => toggle('outline')} aria-expanded={expanded['outline'] ?? true} aria-controls="sec-outline">
                <svg class="w-4 h-4 text-gray-800 dark:text-white chev {expanded['outline'] ? 'rot' : ''}" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>
                <span class="uppercase tracking-wider text-[11px] text-gray-600 dark:text-gray-300">Outline</span>
            </button>
        </div>
        {#if expanded['outline']}
            <div id="sec-outline" class="pb-2">
                {#if $projectData.pagesById[$currentPageId] && $projectData.pagesById[$currentPageId].elements.length}
                    <div class="pl-2">
                        {#each $projectData.pagesById[$currentPageId].elements as el (el.id)}
                            <div class="row w-full flex items-center gap-2 px-2 { $selectedElementIds.has(el.id) ? 'active' : '' }"
                                role="button" tabindex="0"
                                onclick={(e) => { const t = e.target; if (t && t.closest && t.closest('button[aria-label="Toggle collection"]')) return; if (el.visible === false) { selectElementFromOutline(el.id); } else { selectElement(el.id, e.metaKey || e.ctrlKey); } }}
                                onkeydown={(e) => { if (e.key==='Enter' || e.key===' ') { const t = e.target; if (t && t.closest && t.closest('button[aria-label="Toggle collection"]')) return; e.preventDefault(); if (el.visible === false) { selectElementFromOutline(el.id); } else { selectElement(el.id, e.ctrlKey || e.metaKey); } } }}
                                title={el.name || el.type}>
                                {#if el.type === 'collection' && el.memberIds && el.memberIds.length}
                                    <button class="flex items-center gap-1" aria-label="Toggle collection" onclick={() => toggle(`e:${el.id}`)}>
                                        <svg class="w-4 h-4 chev {expanded[`e:${el.id}`] ? 'rot' : ''}" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/></svg>
                                    </button>
                                {:else}
                                    <span class="w-4 h-4"></span>
                                {/if}
                                <span class="text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                                    {el.name || el.type}
                                    {#if el.locked}
                                        <svg class="w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    {/if}
                                    {#if el.visible === false}
                                        <svg class="w-3 h-3 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                    {/if}
                                </span>
                                <div class="ml-auto flex items-center gap-1">
                                    <button type="button" class="outline-action" title={insertActionTitle} aria-label="Insert element id into script" disabled={!insertEligibility.allowed}
                                        onclick={(e) => { if (!insertEligibility.allowed) return; e.stopPropagation(); e.preventDefault(); insertElementIdToScript(el.id); }}>
                                        <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                            <path d="M7.5 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2m3-11h2A1.5 1.5 0 0 1 15.5 6v8A1.5 1.5 0 0 1 14 15.5h-1.5m-5-5H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                            <path d="M9 10 7.5 8.5 9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </button>
                                    <span class="text-[11px] text-gray-400 flex items-center gap-1">{el.type}</span>
                                </div>
                            </div>
                            {#if el.type === 'collection' && el.memberIds && el.memberIds.length && expanded[`e:${el.id}`] !== false}
                                <div class="ml-6">
                                    {#each el.memberIds as cid (cid)}
                                        {#if $projectData.pagesById[$currentPageId].elements.find(e2=>e2.id===cid)}
                                            {@const child = $projectData.pagesById[$currentPageId].elements.find(e2=>e2.id===cid)}
                                            <div class="row w-full flex items-center gap-2 px-2 { $selectedElementIds.has(child.id) ? 'active' : '' }"
                                                role="button" tabindex="0"
                                                onclick={(e) => { if (child.visible === false) { selectElementFromOutline(child.id); } else { selectElement(child.id, e.metaKey || e.ctrlKey); } }}
                                                onkeydown={(e) => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); if (child.visible === false) { selectElementFromOutline(child.id); } else { selectElement(child.id, e.ctrlKey || e.metaKey); } } }}
                                                title={child.name || child.type}>
                                                <span class="w-4 h-4"></span>
                                                <span class="text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
                                                    {child.name || child.type}
                                                    {#if child.locked}
                                                        <svg class="w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                    {/if}
                                                    {#if child.visible === false}
                                                        <svg class="w-3 h-3 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                    {/if}
                                                </span>
                                                <div class="ml-auto flex items-center gap-1">
                                                    <button type="button" class="outline-action" title={insertActionTitle} aria-label="Insert element id into script" disabled={!insertEligibility.allowed}
                                                        onclick={(e) => { if (!insertEligibility.allowed) return; e.stopPropagation(); e.preventDefault(); insertElementIdToScript(child.id); }}>
                                                        <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                                            <path d="M7.5 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2m3-11h2A1.5 1.5 0 0 1 15.5 6v8A1.5 1.5 0 0 1 14 15.5h-1.5m-5-5H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                                            <path d="M9 10 7.5 8.5 9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                                        </svg>
                                                    </button>
                                                    <span class="text-[11px] text-gray-400 flex items-center gap-1">{child.type}</span>
                                                </div>
                                            </div>
                                        {/if}
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    <div class="px-3 pb-3 text-gray-500 dark:text-gray-400">No elements on this page</div>
                {/if}
            </div>
        {/if}
    </div>
    {#if ctxOpen}
        <ul class="ctx bg-white/95 dark:bg-slate-800/95 border border-black/10 dark:border-white/10 rounded shadow-lg" role="menu" style={`left:${ctxX}px; top:${ctxY}px`}>
            {#if ctxKind === 'workspace'}
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onCreateUnder}>New Module</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={expandAll}>Expand All</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={collapseAll}>Collapse All</button></li>
            {:else if ctxKind === 'module'}
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onCreateUnder}>New Lesson</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={() => { if (ctxId) { const mod = $projectData.modulesById[ctxId]; if (mod) startEdit('module', ctxId, mod.metadata.title); } }}>{editingKind==='module' && editingId===ctxId ? 'Renaming…' : 'Rename'}</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onDeleteItem}>Delete Module</button></li>
            {:else if ctxKind === 'lesson'}
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onCreateUnder}>New Page</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={() => { if (ctxId) { const les = $projectData.lessonsById[ctxId]; if (les) startEdit('lesson', ctxId, les.metadata.title); } }}>{editingKind==='lesson' && editingId===ctxId ? 'Renaming…' : 'Rename'}</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onDeleteItem}>Delete Lesson</button></li>
            {:else if ctxKind === 'page'}
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={() => { if (ctxId) { const page = $projectData.pagesById[ctxId]; if (page) startEdit('page', ctxId, page.metadata.title); } }}>{editingKind==='page' && editingId===ctxId ? 'Renaming…' : 'Rename'}</button></li>
                <li><button type="button" role="menuitem" class="w-full text-left" onclick={onDeleteItem}>Delete Page</button></li>
            {/if}
        </ul>
    {/if}
</div>