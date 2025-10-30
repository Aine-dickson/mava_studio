## Overview

- Purpose: Give script authors a small, reactive, sandbox-safe API for:
  - reacting to time, selection, and state
  - working with user variables (global/page-scoped)
  - observing built-in system state (project, timeline, page)
  - reading/writing a whitelisted set of stage entity properties for the same page
  - logging and timers
- Security: No DOM access, no direct store access. Mutations are host-mediated, allowed by policy, and scoped to the current page.

Status
- Available now: time/onTick, selection, variables (create/use), built-ins (project/selection/timeline time), logging, timers.
- Proposed: entities (query + reactive properties + mutations), timeline controls, storage, events, utils, permissions.

## Core primitives (Mava.core)

Purpose: Reactive building blocks and utilities used across the API.

- signal<T>(initial: T): Signal<T>
  - Create a writable reactive signal.
- computed<T>(fn: () => T): ReadonlySignal<T>
  - Derive values that update when dependencies change.
- effect(fn: () => void): Unsubscribe
  - Run side-effects whenever read signals referenced in fn change.
- onTick((t: number, dt: number) => void): Unsubscribe
  - Per-frame callback with time (ms) and delta (ms); auto‑stops when your script stops.
- setTimeout(fn, ms): Unsubscribe, setInterval(fn, ms): Unsubscribe
  - Tracked timers; auto-cleared on script stop.
- batch(fn: () => void) [proposed]
  - Group updates to minimize intermediate effects.
- nextTick(fn: () => void) [proposed]
  - Schedule work after current microtask.
- utils [proposed]
  - clamp(n,min,max), lerp(a,b,t), mapRange(v,inMin,inMax,outMin,outMax), ease.{linear,inOutQuad,…}

Example:
const count = Mava.core.signal(0);
Mava.core.effect(() => Mava.log('count =', count.value));
const stop = Mava.core.setInterval(() => count.update(n => n + 1), 1000);
return () => stop();

## Variables (Mava.variables)

Purpose: User-defined variables, reactive everywhere, scoped like scripts (global/page). Strongly typed with readOnly support.

- readonly(name: string): ReadonlySignal<any>
  - Observe a variable reactively.
- mutable(name: string): Signal<any>
  - Writable signal for a variable (throws/no-op if readOnly).
- get(name: string): any
  - Snapshot read.
- set(name: string, value: any): void
  - Update value (no-op if readOnly).
- list(options?) [proposed]
  - Enumerate variables with scope/type metadata.

Notes
- Types: string | number | boolean | object | array | json.
- Scoping: Page overrides global with same name when used on that page.
- Uniqueness: Names are enforced unique per scope+page (case-insensitive). Implemented.

Example:
const score = Mava.variables.mutable('score');
Mava.core.effect(() => Mava.log('score:', score.value));
Mava.variables.set('score', 42);

Status: Implemented (including creation via Vars panel; reactive in scripts).

## Built-in state (Mava.builtin)

Purpose: Read-only, reactive snapshots of system state fed by the host.

- project: ReadonlySignal<{ id?: string; title?: string; version?: number; … }>
- timeline: ReadonlySignal<{ time: number; dt?: number; duration?: number; playing?: boolean; rate?: number }> [duration/playing/rate proposed]
- selection: ReadonlySignal<string | null | string[]> 
  - Today: primary id or null; proposed: support array for multi-select.
- pageId: ReadonlySignal<string | null> [proposed]
- env: ReadonlySignal<{ dev: boolean; version: string }> [proposed]

Example:
Mava.builtin.timeline.subscribe(t => {
  if (Math.floor(t.time) % 1000 < (t.dt ?? 16)) Mava.log('tick');
});

Status: Implemented (project minimal, timeline time, selection). Extended fields proposed.

## Timeline controls (Mava.timeline) [proposed, permission-gated]

Purpose: Programmatic control of the current page’s timeline, if enabled.

- seek(timeMs: number): void
- play(): void
- pause(): void
- setRate(rate: number): void

Notes
- Mirrors Mava.builtin.timeline for state, but provides mutators that are host-mediated.
- If disabled by policy, methods no‑op or throw (configurable).

Example:
Mava.timeline.seek(1000);
Mava.timeline.play();

## Stage entities (Mava.entities)

Purpose: Safe access to stage objects on the current page. Observe properties reactively; mutate whitelisted properties with host approval.

Addressing
- byId(id: string): EntityRef
- byTag(tag: string): ReadonlySignal<EntityRef[]> [proposed]
- selected(): ReadonlySignal<EntityRef | null> [proposed convenience]

Reading (reactive)
- property<T = any>(id: string, path: string): ReadonlySignal<T | undefined>
  - Reactive view of a property; path uses dot-notation (e.g., "transform.position.x", "opacity", "style.fill").

Mutating (permission-gated)
- setProperty(id: string, path: string, value: any): Promise<void> | void
  - Host validates whitelist, page scoping, and types, then applies.

Property path grammar
- Dot separated segments; numeric indices supported for arrays: "style.items[0].color".
- Whitelist examples (design-time): transform.position.{x,y}, transform.rotation, transform.scale.{x,y}, opacity, visible, text.content, style.{fill,stroke,strokeWidth}, video.playbackRate, zIndex.
- Structural mutations (adding/removing elements) are not exposed here.

Query helpers [proposed]
- list(): ReadonlySignal<Array<{ id: string; name?: string; tags?: string[] }>>
- boundingBox(id: string): ReadonlySignal<{ x,y,width,height }> 
- hitTest(point): ReadonlySignal<id | null>

Examples
- Reactive read:
const x$ = Mava.entities.property<number>('hero', 'transform.position.x');
Mava.core.effect(() => Mava.log('hero x:', x$.value));
- Write (if permitted):
await Mava.entities.setProperty('hero', 'opacity', 0.5);
- Animate with tick:
let t0 = 0;
Mava.core.onTick((t) => {
  if (!t0) t0 = t;
  const phase = Math.min(1, (t - t0) / 1000);
  const y = Mava.core.utils.lerp(100, 200, phase);
  Mava.entities.setProperty('hero', 'transform.position.y', y);
});

Status: Proposed; host mediation will wire these to the store for the current page only.

## Events (Mava.events) [proposed]

Purpose: Lightweight event bus bridging system events and script events.

- on(name: string, handler: (payload: any) => void): Unsubscribe
- emit(name: string, payload?: any): void

Predefined system events
- 'selectionChanged', 'variableChanged', 'pageChanged', 'timelinePlay', 'timelinePause', 'timelineSeek'

Notes
- System events are read-only; user emits are local to the script sandbox (unless host chooses to bridge).

## Logging (Mava.log)

Purpose: Script-visible logging to the Output pane.

- log(...args), warn(...args), error(...args)
- assert(cond, ...args) [proposed]

Status: Implemented (log/warn/error forwarded to Output).

## Storage (Mava.storage) [proposed, permission-gated]

Purpose: Script-local persistence in a sandboxed namespace.

- get<T = any>(key: string, fallback?: T): T
- set<T = any>(key: string, value: T): void
- remove(key: string): void
- clear(): void

Notes
- Namespaced per script or per page by default; policy determines availability.

## Permissions and safety

Purpose: Guard rails that keep scripts safe by default.

- AllowedStageMutation: boolean (default false)
- AllowedTimelineControl: boolean (default false)
- AllowedStorage: boolean (default false)
- CPU/Timer budget (max concurrent timers, guard long sync tasks with watchdog) [proposed]
- Same-page scope restriction for entities and timeline.

Behavior
- Disallowed operations either no-op or throw (configurable per policy).
- All timers cleared and effects torn down on script stop.

## Error handling

Purpose: Predictable failures with good messages.

- Mutation attempts outside whitelist: throws "Property not writable or not allowed"
- Unknown entity id: property() yields undefined; setProperty throws "Entity not found"
- Invalid path: property() yields undefined; setProperty throws "Invalid property path"
- readOnly variable set: no-op or error (configurable; currently no-op)

## Examples: end-to-end

- React to selection and write to a variable:
Mava.builtin.selection.subscribe(id => {
  Mava.variables.set('lastSelected', id);
});

- Page-scoped variables (override global)
const speed$ = Mava.variables.readonly('speed');
Mava.core.onTick((t, dt) => {
  Mava.entities.setProperty('hero', 'transform.position.x', (speed$.value || 0) * (t / 1000));
});

- Simple timeline control (if enabled)
Mava.events.on('variableChanged', (name) => {
  if (name === 'shouldPlay') Mava.timeline.play();
});

## Notes for implementation (host side)

- Entities
  - Implement a property-path resolver on the host with a whitelist map and type guards.
  - All reads feed ReadonlySignals; all writes dispatch via mutations + history if needed.
- Timeline
  - Bridge play/pause/seek/rate to your timeline store; mirror back to builtin.timeline.
- Selection
  - Today: primary id; extend to array for multi-selection if needed.
- Variables
  - Done: store + UI + editor typings + sandbox bridge.

