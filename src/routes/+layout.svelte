<div class="h-screen bg-gray-100 select-none dark:bg-slate-950 grid grid-cols-none overflow-hidden grid-rows-[min-content_1fr] text-gray-950 dark:text-gray-200">
    <header class="max-h-12">
        <Header/>
    </header>
    <section class="h-full min-h-0 grid grid-rows-[1fr_min-content] relative">
        <main class="h-full min-h-0 grid grid-rows-none grid-cols-[min-content_1fr_min-content] relative">
            <!-- DebugPanel removed per user preference -->
            <nav class="bg-white dark:bg-slate-800 shadow-md h-full min-h-0 grid grid-rows-none grid-cols-[min-content_min-content]">
                
                <!-- Side navigation component -->
                <SideNav/>

                <!-- Nav Associates: hidden when none selected -->
                {#if $activeSideNav}
                    <aside bind:this={asideEl} class="min-w-48 relative max-w-64 resize-x overflow-hidden  bg-slate-200 dark:bg-slate-700" style:width={`${$asideWidth}px`}>
                        <div class="h-full overflow-auto">
                            <NavAssociates/>
                        </div>
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div 
                            class="absolute top-0 right-0 bottom-0 w-0.5 cursor-ew-resize bg-transparent hover:bg-slate-400 transition"
                            onpointerdown={(e) => startResize(e, "aside")}>
                        </div>
                    </aside>
                {/if}

            </nav>

            <section class="h-full min-h-0 overflow-auto relative">
                {@render children()}
                <GlobalPalette/>

                <!-- Terminal component -->
                <div bind:this={terminalEl} id="terminal" class="absolute z-20 bottom-0 left-0 right-0 min-h-[3px] max-h-full resize-y overflow-auto bg-slate-950 border-slate-50 dark:border-slate-800 no-scroll overflow-y-auto {$terminalState === 'closed' ? 'border-0' : 'border-t'}" style:height={`${$terminalState === 'closed' ? 3 : $terminalHeight}px`}>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="absolute top-0 right-0 left-0 h-1 cursor-ns-resize bg-transparent hover:bg-slate-400 transition"
                        onpointerdown={(e) => startResize(e, "terminal")}>
                    </div>
                    <Terminal/>
                </div>
            </section>
    
            <!-- Right pane utilities: hidden when none selected -->
            <section class="h-full min-h-0 overflow-hidden bg-slate-200 dark:bg-slate-700 text-white">
                {#if $activeRightUtil}
                    <div class="w-62 h-full min-h-0 flex flex-col">
                        <RightUtilities/>
                    </div>
                {/if}
            </section>
        </main>

        <!-- TODO: Footer -->
        <footer class="bg-white dark:bg-slate-800 shadow-md p-1 relative">
            <p class="text-sm text-gray-500 dark:text-gray-400">Footer content</p>
        </footer>
    </section>
</div>

<script lang="ts">
    import { onMount } from 'svelte';
    import '../main.css';
    import Header from '../header.svelte';
    // Monaco CSS: let Vite resolve from node_modules (works with vite-plugin-monaco-editor)
    // import 'monaco-editor/min/vs/editor/editor.main.css';
    // Monaco worker environment for Vite/Tauri
    import '../Terminal/monacoEnv';
    import Terminal from '../Terminal/terminal.svelte';
    import SideNav from '../SideNavigation/sideNav.svelte';
    import NavAssociates from '../SideNavigation/navAssociates.svelte';
    import RightUtilities from '../rightUtilities.svelte';
    import { layout } from '../stores/layout';
    // DebugPanel removed per user preference
    import GlobalPalette from '../RightPanel/GlobalPalette.svelte';
    import { currentModuleId, currentLessonId, currentPageId, deleteModule, deleteLesson, deletePage } from '../stores/project';
    import '../stores/timelineOrchestrator';
    import { undo, redo, setFocusScope, focusScope } from '../stores/historyScoped';
    // Initialize persisted triggers and rebind on timeline creation
    import '../stores/triggersInit';

    let { children } = $props();

    const { asideWidth, terminalHeight, terminalState, activeSideNav, activeRightUtil, setAsideWidth, setTerminalHeight, openTerminal, closeTerminal } = layout;

    let asideEl = $state<HTMLElement | null>(null);
    let terminalEl = $state<HTMLElement | null>(null);

    let dragTarget: "aside" | "terminal" | null = null;

    function startResize(e: PointerEvent, target: "aside" | "terminal") {
        e.preventDefault();
        dragTarget = target;

        // Prevent accidental text selection while dragging
        document.body.style.userSelect = "none";

        document.addEventListener("pointermove", handleResize);
        document.addEventListener("pointerup", stopResize);
    }

    function handleResize(e: PointerEvent) {
        if (dragTarget === "aside") {
            if (!asideEl) return;
            const newWidth = e.clientX - asideEl.getBoundingClientRect().left;
            if (newWidth >= 150 && newWidth <= 400) {
                setAsideWidth(newWidth);
            }
        }
    else if (dragTarget === "terminal") {
            if (!terminalEl) return;
            const containerBottom = window.innerHeight;
            const newHeight = containerBottom - e.clientY;
            // terminal state should change from closed if was closed so that the ui can adjust accordingly
            if (newHeight >= 3 && newHeight <= containerBottom - 50) {
                setTerminalHeight(newHeight);
                if ($terminalState === 'closed') openTerminal();
            } else if (newHeight < 3) {
                setTerminalHeight(3); // Prevent it from going below minimum height
                closeTerminal();
            }
        }
    }

    function stopResize() {
        dragTarget = null;
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove", handleResize);
        document.removeEventListener("pointerup", stopResize);
    }


    onMount(()=>{
        // Ensure initial element sizes reflect store values
    if (asideEl) asideEl.style.width = `${$asideWidth}px`;
    if (terminalEl) terminalEl.style.height = `${$terminalState === 'closed' ? 0 : $terminalHeight}px`;

        // Load autosaved project (if any)
        // TODO: implement project loading logic
        // historyManager.loadFromStorage();

        // Global undo/redo/delete shortcuts
        const onKey = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
                return; // don't hijack text inputs
            }
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            if (!ctrlOrCmd) return;
            const key = e.key.toLowerCase();
            // Redo: Ctrl+Shift+Z or Ctrl+Y
            if ((key === 'z' && e.shiftKey) || key === 'y') {
                e.preventDefault();
                redo();
                return;
            }
            // Undo: Ctrl+Z
            if (key === 'z') {
                e.preventDefault();
                undo();
                return;
            }
            // Delete: Ctrl+Delete (Windows) — delete selected page, else lesson, else module
            if (key === 'delete') {
                e.preventDefault();
                if ($currentPageId) {
                    deletePage($currentPageId);
                } else if ($currentLessonId) {
                    deleteLesson($currentLessonId);
                } else if ($currentModuleId) {
                    deleteModule($currentModuleId);
                }
                return;
            }
        };
        window.addEventListener('keydown', onKey, { capture: true });

        // Reactive focus scope derivation (simple heuristic)
        const deriveScope = () => {
            if ($currentPageId) setFocusScope('page');
            else if ($currentLessonId) setFocusScope('lesson');
            else setFocusScope('module');
        };
        const unsub1 = currentPageId.subscribe(()=>deriveScope());
        const unsub2 = currentLessonId.subscribe(()=>deriveScope());
        const unsub3 = currentModuleId.subscribe(()=>deriveScope());
        deriveScope();
        return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
    })
</script>