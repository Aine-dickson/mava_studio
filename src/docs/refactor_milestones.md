# Refactor Milestones (Offline‑First Authoring Studio)

Order mandated by request: 5, 1, 2, 6, 7, 3, 8, 9, 4 (mapped from the originally suggested refinement stages).

Original stage index reference:
1. Cloning & History Architecture
2. Autosave Pipeline
3. Element Scalability (interaction & rendering)
4. Competence Framework (CF) Enforcement Engine
5. Validation Layer (load/import boundaries)
6. History Memory Control (ring buffer, squashing)
7. ID / Indexing Strategy
8. Resizing & Layout Infrastructure
9. Serialization Strategy (snapshot formats)
10. Testing & Verification (INTENTIONALLY deferred beyond provided order)

Applied execution order below uses those definitions.

---

## Stage 5 → Validation Layer (Now Stage 1 in Execution Order)
Goal: Introduce a lightweight, zero‑overhead (runtime hot path) validation for data ingress (loading localStorage, importing signed CFs, restoring snapshots). Ensure corrupted or outdated payloads do not enter core stores.

Scope:
- Add top‑level `projectVersion` to `ProjectData` root.
- Define Zod (or minimal hand‑rolled) schemas behind a build flag; strip in production if bundle size critical (rollup/treeshake friendly).
- CF import validation: signature presence, structural integrity, node IDs uniqueness, acyclic graph.

Deliverables:
- `lib/validation/projectSchema.ts`
- `lib/validation/cfSchema.ts`
- `validateAndMigrateProject(raw: unknown): ProjectData | Error` (performs version bump migrations; currently no-op v1).
- Graceful fallback & user notification (queued toast / log) when load fails.

Performance Notes:
- Only run on load/import; no per‑mutation cost.
- Use `structuredClone` AFTER validation only if migration modifies shape.

Success Metrics:
- Corrupted localStorage load doesn’t crash; recovery to fresh default in < 5 ms.
- Validation adds < 3 KB minified (subject to build inspection).

Risks & Mitigations:
- Risk: Schema drift. Mitigate with a single export barrel + comments referencing types.
- Risk: Oversized validator dependency. Consider minimal custom guards if size > threshold.

---

## Stage 1 → Cloning & History Architecture (Execution Stage 2)
Goal: Page‑isolated mutation path. Undo/redo/autosave operate at active page granularity; fall back to lesson if “workspace bar” (lesson scope view) focused and no page active; else module level.

Key Changes:
- Replace whole‑project snapshotting with structural sharing: keep immutable maps for `modulesById`, `lessonsById`, `pagesById`; only clone mutated page entry.
- History entries become `{ scope: 'page'|'lesson'|'module', ts, patch }` where `patch` holds minimal diff or serialized prior value of changed node(s).
- Introduce `activeFocusScope` state separate from data selection.

Deliverables:
- `stores/history.ts` (new dedicated module) exposing: `commit(scope, patch)`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `setFocusScope()`.
- Wrapper helpers: `mutatePage(pageId, fn)` auto‑collects before/after diff.
- Replace ad hoc `historyManager` with new orchestrator; keep compatibility facade for existing calls during transition.

Performance Strategies:
- Use `structuredClone` only on the page object (not the whole project).
- Diff algorithm: shallow compare keys; for elements array use length + id list fingerprint (hash) to decide full replace vs skip.
- O(1) push/pop ring buffers (prepared in Stage 6 but interface aligned now).

Success Metrics:
- Typical element move commit (<100 elements on page) < 0.3 ms on mid‑tier CPU.
- Memory for 50 undos with unchanged modules/lessons reduced by >80% vs baseline full snapshots.

Risks:
- Incomplete diff misses field → add unit harness later (Testing stage) to assert replay integrity.

---

## Stage 2 → Autosave Pipeline (Execution Stage 3)
Goal: Page‑scoped autosave batching, avoiding main thread jank during drags; offline‑first durability.

Design:
- Introduce write queue -> Web Worker (`autosave.worker.ts`).
- Main thread posts compact payload: `{version, changedPages: { [id]: PageMinimal }, metaChanged: boolean, time}`.
- Worker merges into a shadow object and writes debounced (800 ms) to localStorage key `studioProjectDataV<version>`.
- Flush triggers: visibilitychange (hidden), beforeunload, explicit `flush()` (e.g., manual save hotkey).

Deliverables:
- `workers/autosave.worker.ts`
- `lib/persistence/index.ts` with API: `queueSave(kind, dataRef)`, `flush()`, `loadLatest()`.

Performance:
- Worker serialization cost minimal due to partial payload instead of full project.
- Drag interactions never enqueue (only finalized pointerup commit triggers save queue).

Success Metrics:
- Pointer move (100 Hz) adds 0 allocations in save path.
- Autosave flush under 10 ms for 5 changed pages, 3 KB each.

Risks:
- Worker unsupported (older environments) fallback path: direct debounced write (desktop Tauri includes worker support).

---

## Stage 6 → History Memory Control (Execution Stage 4)
Goal: Bound memory & optimize commit frequency.

Features:
- Fixed‑size ring buffer per scope (page, lesson, module) default 100 (configurable).
- Temporal merge: commits within 300 ms on same page & same mutation category (e.g., transform) squash.
- Category tagging: 'structure' | 'transform' | 'style' | 'meta'.

Deliverables:
- Extend `stores/history.ts` with ring buffer implementation (`class RingBuffer<T>` minimal, no array shift).
- Heuristics util: `shouldSquash(prev, next)`.

Metrics:
- 50 rapid drag updates produce ≤ 2 history entries.
- Undo stack memory stays < 5 MB in stress test (500 element transformations).

Risks:
- Over‑aggressive squashing harms granularity; allow debug flag to disable.

---

## Stage 7 → ID / Indexing Strategy (Execution Stage 5)
Goal: Faster lookups & clearer semantics; future CF cross references.

Changes:
- IDs adopt prefix + base36 counter: `p_`, `l_`, `m_`, `e_`. Central monotonic counters persisted (lightweight) for deterministic ordering.
- Maintain `pageGeneration[pageId]` incremented on structural mutation (element add/remove/reorder) to invalidate caches.
- Replace `elementIndex` Map with two maps: `elementToPage`, `elementCacheFingerprint` (hash of element signature for diffing).

Deliverables:
- `lib/id.ts` (generator, reset, serialization for persistence).
- Refactor creation helpers to use new generator.

Metrics:
- Element lookup O(1) unchanged, diffing step can skip unchanged page when generation identical.

Risks:
- Migration: existing stored IDs remain; introduce lazy translation layer or permit mixed scheme (documented).

---

## Stage 3 → Element Scalability (Execution Stage 6)
Goal: Maintain interactive smoothness with large element counts (hundreds).

Features:
- Introduce lightweight spatial grid index: cell size configurable (e.g., 128 px). Update index only on transform commit.
- rAF batching: pointermove writes enqueued; last event in frame mutates store (no >1 state commit per frame).
- Optional visibility culling (if future canvas/DOM overlay hybrid).

Deliverables:
- `lib/elements/spatialIndex.ts` (add, remove, update, queryRect, queryPoint).
- `actions/interactTransform.ts` integrates InteractJS events → batched operations.

Metrics:
- Dragging remains 60 fps with 400 elements (target environment baseline).
- Hit test for selection ~O(k) where k is elements in overlapped cells (<< total elements).

Risks:
- Overhead for small pages; allow feature toggle (auto disable under threshold N).

---

## Stage 8 → Resizing & Layout Infrastructure (Execution Stage 7)
Goal: Consolidate UI resize logic and ensure accessibility.

Tasks:
- Introduce `actions/resizable.ts` supporting horizontal/vertical axes, constraints, keyboard (Arrow +/- 10px, Shift +/‑ 50px).
- Constants module: `UI_BOUNDS = { aside: {min:150,max:400}, terminal:{min:3} }` single source of truth.
- Apply `role="separator"` & proper ARIA attributes.

Deliverables:
- `lib/ui/constants.ts`
- `lib/actions/resizable.ts`
- Refactor `+layout.svelte` to use action.

Metrics:
- No duplicate numeric bounds remain in codebase (search gate in PR review).

Risks:
- Keyboard resize may conflict with global shortcuts → scope with focus containment.

---

## Stage 9 → Serialization Strategy (Execution Stage 8)
Goal: Faster load/save & future remote sync readiness.

Design:
- Abstract persistence format: interface `Serializer { encode(ProjectDataPartial): Uint8Array; decode(Uint8Array): ProjectDataPartial; }`.
- Provide JSON serializer (default) + optional MessagePack (if dependency acceptable) behind dynamic import.
- Store marker header: `"PDATA" + version + codecId` for fast detection.

Deliverables:
- `lib/persistence/serializer.ts` (registry + fallback).
- Worker updated to use pluggable serializer.

Metrics:
- MessagePack (if enabled) reduces payload size ≥ 25% for typical sample set.
- Decode + validate under 15 ms for 1 MB payload.

Risks:
- Additional dependency size; make optional & lazy.

---

## Stage 4 → Competence Framework Enforcement Engine (Execution Stage 9)
Goal: Efficient real‑time validation that authored content satisfies imported, signed CFs before publish.

Model:
- CF imported as DAG: nodes (competence/outcome) with requirements: quantitative (count of activities of type X), qualitative (presence of assessment), sequencing (prerequisite nodes).
- Precompile into evaluators: each node -> function `eval(context) -> { satisfied: boolean, unmetReasons[] }`.
- Maintain incremental cache keyed by nodeId; invalidate only when relevant lesson/page categories change (using generation + element category tags).

Integration:
- Expose store `cfStatus` with aggregates per scope (course/module/lesson) and publish gate boolean.
- Inspector & CF mapper panels subscribe to minimal derived structure.

Deliverables:
- `lib/cf/types.ts`, `lib/cf/compiler.ts`, `lib/cf/evaluator.ts`.
- Hook into history commit to trigger targeted invalidations.

Metrics:
- Full recompute (cold) for 500 nodes < 40 ms; incremental update (single page change) < 2 ms median.

Risks:
- Complex rule expansion; start with a constrained rule DSL.

---

## Cross‑Cutting Concerns
- Desktop & Offline First: All network‑optional; CF signing verification can be pluggable (signature object stored and validated offline via embedded public key). Fail gracefully if signature absent.
- InteractJS Integration: Encapsulate InteractJS config inside actions to avoid scattered setup costs; detach listeners on destroy to prevent leaks.
- Performance Budget: Target < 16 ms worst interactive frame; avoid large synchronous GC churn (ring buffers, structural sharing, rAF batching).
- Simplicity: Each stage produces independent modules with clear contracts before modifying existing store logic extensively.

## Deferred (Testing Stage)
Although not in the execution order requested, a future Stage 10 should add invariant tests (history replay fidelity, serializer round‑trip, CF rule correctness) before expanding complexity.

## Suggested Timeline (Indicative)
1. Validation Layer – 1 day
2. Cloning & History Architecture – 2–3 days
3. Autosave Pipeline – 1 day
4. History Memory Control – 0.5 day
5. ID / Indexing – 0.5–1 day
6. Element Scalability – 2 days (progressively guarded) 
7. Resizing & Layout Infrastructure – 0.5 day
8. Serialization Strategy – 1 day
9. CF Enforcement Engine – 3–4 days (dependent on CF complexity)

## Acceptance Checklist Per Stage (Abbrev.)
- Benchmarks captured & recorded.
- No regression in drag FPS (manual smoke test) after each history/autosave change.
- LocalStorage migration path documented when schema increments.
- All new modules have concise READMEs or top‑of‑file contract comments.

---

This file should be updated after each completed stage with: Date, Outcome Summary, Metrics Observed, Follow‑ups.
