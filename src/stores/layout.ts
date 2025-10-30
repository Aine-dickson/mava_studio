import { writable, get, type Writable } from "svelte/store";

// Pinia-like store for layout settings with localStorage sync
// Usage:
//   import { layout } from "../stores/layout";
//   const { asideWidth, terminalHeight, terminalState, setAsideWidth, setTerminalHeight } = layout;
//   $: console.log($terminalHeight);

export type TerminalState = "full" | "normal" | "closed";
export type TerminalTab = "scripts" | "timeline" | "output";
export type SideNavKey =
    | "structure"
    | "elements"
    | "components"
    | "cf_map"
    | "assets"
    | "inspector"
    | "animations";
export type RightUtilKey = "styles" | "actions";

const isBrowser = typeof window !== "undefined";

function readNumber(key: string, fallback: number): number {
    if (!isBrowser) return fallback;
    const raw = localStorage.getItem(key);
    const num = raw != null ? Number(raw) : NaN;
    return Number.isFinite(num) ? num : fallback;
}

function readString<T extends string>(key: string, fallback: T): T {
    if (!isBrowser) return fallback;
    const raw = localStorage.getItem(key);
    return (raw as T) ?? fallback;
}

function readStringNullable<T extends string>(key: string): T | null {
    if (!isBrowser) return null;
    const raw = localStorage.getItem(key);
    return raw == null || raw === "" ? null : (raw as T);
}

function save(key: string, value: string | number) {
    if (!isBrowser) return;
    localStorage.setItem(key, String(value));
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function createLayoutStore() {
    // Initial values (with bounds matching the UI drag limits)
    const initialAsideWidth = clamp(readNumber("asideWidth", 250), 150, 400);
    const initialTerminalHeight = clamp(readNumber("terminalHeight", 3), 3, Number.MAX_SAFE_INTEGER);
    const initialTerminalState = readString<TerminalState>("terminalState", "closed");
    const initialPrevHeight = clamp(readNumber("terminalPrevHeight", initialTerminalHeight), 3, Number.MAX_SAFE_INTEGER);
    const initialTerminalTab = readString<TerminalTab>("terminalTab", "scripts");
    const initialActiveSideNav = readStringNullable<SideNavKey>("activeSideNav");
    const initialActiveRightUtil = readStringNullable<RightUtilKey>("activeRightUtil");

    // State (writables so Svelte components can use $store syntax)
    const asideWidth: Writable<number> = writable(initialAsideWidth);
    const terminalHeight: Writable<number> = writable(initialTerminalHeight);
    const terminalState: Writable<TerminalState> = writable(initialTerminalState);
    const terminalPrevHeight: Writable<number> = writable(initialPrevHeight);
    const terminalTab: Writable<TerminalTab> = writable(initialTerminalTab);
    const activeSideNav: Writable<SideNavKey | null> = writable(initialActiveSideNav);
    const activeRightUtil: Writable<RightUtilKey | null> = writable(initialActiveRightUtil);

    // Persist changes to localStorage
    asideWidth.subscribe((v) => save("asideWidth", v));
    terminalHeight.subscribe((v) => save("terminalHeight", v));
    terminalState.subscribe((v) => save("terminalState", v));
    terminalPrevHeight.subscribe((v) => save("terminalPrevHeight", v));
    terminalTab.subscribe((v) => save("terminalTab", v));
    activeSideNav.subscribe((v) => {
        if (!isBrowser) return;
        if (v == null) localStorage.removeItem("activeSideNav");
        else save("activeSideNav", v);
    });
    activeRightUtil.subscribe((v) => {
        if (!isBrowser) return;
        if (v == null) localStorage.removeItem("activeRightUtil");
        else save("activeRightUtil", v);
    });

    // Optionally react to external changes (e.g., another window)
    if (isBrowser) {
        window.addEventListener("storage", (e) => {
            if (!e.key) return;
            if (e.key === "asideWidth" && e.newValue != null) asideWidth.set(Number(e.newValue));
            if (e.key === "terminalHeight" && e.newValue != null) terminalHeight.set(Number(e.newValue));
            if (e.key === "terminalState" && e.newValue != null) terminalState.set(e.newValue as TerminalState);
            if (e.key === "terminalPrevHeight" && e.newValue != null) terminalPrevHeight.set(Number(e.newValue));
            if (e.key === "terminalTab" && e.newValue != null) terminalTab.set(e.newValue as TerminalTab);
            if (e.key === "activeSideNav") activeSideNav.set((e.newValue ?? null) as SideNavKey | null);
            if (e.key === "activeRightUtil") activeRightUtil.set((e.newValue ?? null) as RightUtilKey | null);
        });
    }

    // Actions (Pinia-style)
    function setAsideWidth(width: number) {
        // Keep in sync with UI constraints (150-400)
        asideWidth.set(clamp(width, 150, 400));
    }

    function setTerminalHeight(height: number) {
        // UI minimum is 3px, no strict max since it depends on viewport
        const h = Math.max(3, Math.floor(height));
        terminalHeight.set(h);
        // Resizing implies we're in a resizable state
        const s = get(terminalState);
        if (s !== "normal") terminalState.set("normal");
    }

    function setTerminalState(state: TerminalState) {
        const current = get(terminalState);
        if (state === current) return;

        if (state === "full") {
            // Remember height before going full
            const h = get(terminalHeight);
            terminalPrevHeight.set(h);
            if (isBrowser) {
                const maxH = window.innerHeight;
                terminalHeight.set(Math.max(3, Math.floor(maxH)));
            }
            terminalState.set("full");
            return;
        }

        if (state === "normal") {
            if (current === "full") {
                // Restore previous height if coming from full
                const prev = get(terminalPrevHeight);
                terminalHeight.set(Math.max(3, Math.floor(prev)));
            }
            terminalState.set("normal");
            return;
        }

        // closed
        const h = get(terminalHeight);
        terminalPrevHeight.set(h);
        terminalState.set("closed");
    }

    function toggleFull() {
        const s = get(terminalState);
        if (s === "full") {
            setTerminalState("normal");
        } else {
            // If closed, use prevHeight to reopen later
            setTerminalState("full");
        }
    }

    function openTerminal() {
        const s = get(terminalState);
        let prev = get(terminalPrevHeight) || get(terminalHeight);
        if (s === "closed") {
            if (prev <= 20) prev = 250; // Default to 250px if closed and prev was less that minimum open height

            terminalHeight.set(Math.max(3, Math.floor(prev)));
            terminalState.set("normal");
        } else if (s === "normal" && prev <= 3) {
            terminalHeight.set(Math.max(3, 250));
        }
    }

    function closeTerminal() {
        setTerminalState("closed");
    }

    function setTerminalTab(tab: TerminalTab) {
        terminalTab.set(tab);
    }

    function openTerminalWithTab(tab: TerminalTab) {
        setTerminalTab(tab);
        openTerminal();
    }

    function setActiveSideNav(key: SideNavKey | null) {
        activeSideNav.set(key);
    }

    function setActiveRightUtil(key: RightUtilKey | null) {
        activeRightUtil.set(key);
    }

    function resetLayout() {
        setAsideWidth(250);
        setTerminalHeight(3);
        setTerminalState("closed");
    }

    return {
        // state
        asideWidth, terminalHeight, terminalState,
        terminalPrevHeight, terminalTab, activeSideNav,
        activeRightUtil,
        // actions
        setAsideWidth, setTerminalHeight, setTerminalState,
        toggleFull, openTerminal, closeTerminal,
        setTerminalTab, openTerminalWithTab,
        setActiveSideNav, setActiveRightUtil, resetLayout,
    };
}

// Singleton instance
export const layout = createLayoutStore();