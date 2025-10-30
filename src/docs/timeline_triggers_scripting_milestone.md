# Milestone: Timeline, Triggers, and Scripting (TTS) System v1

Editor‑first Timeline + Triggers foundation with a clear path to scripting. This document reflects the current shipped state and what remains.

Updated: 2025‑09‑21

## Status snapshot

- Done (editor/runtime/core):
  - rAF‑driven Timeline runtime with play/pause/seek/stop and loop/tick/seek events
  - Timeline Editor UI: layers, ruler with adaptive ticks, tracks/clips, keyframes, playhead, zoom
  - End‑of‑timeline handle with realtime clamp to longest clip and min duration
  - Cue points on the ruler with add/rename/delete, context menu, and badges for triggers
  - Centralized timeline actions for persistence + history
  - Derived view model (timelineVM) to reduce recomputation
  - Unified “stage” history scope (page + timeline + clips); single commit per interaction
  - Locking: clips for locked elements are non‑interactive and skipped in history
  - Componentization: `Ruler.svelte` and `Tracks.svelte` extracted; zoom is reactive and keeps playhead centered

- Partial (triggers):
  - Trigger runtime exists; current source supported in UI: `timeline.event: cue`
  - Actions implemented: `log`, `playTimeline`, `pauseTimeline`, `stopTimeline`
  - Idempotent registration for persisted triggers

- Planned (scripting & richer triggers):
  - Worker‑sandboxed scripting with a typed `mava` API and CodeMirror authoring
  - Additional trigger sources (element, page, keyboard, timer), conditions, and action types

## Architecture overview (current)

- Timeline Runtime (rAF): keeps timeline time, emits events, integrates with the editor
- Trigger Runtime: registers definitions and invokes actions; currently focused on timeline cue events
- Stores: `timelineData` (duration, cuePoints), `timelineClips`, `animationData` (keyframes), `triggersStore`, `timelines` registry, editor state
- History: unified stage scope with scoped stacks and single commit per interaction (pointerup)
- View Model: `timelineVM` derives layers, clips (with keyframes/triggers), and current timeline

## Editor UX (current)

- Ruler
  - Adaptive seconds/half/quarter/tenth ticks, non‑overlapping labels
  - Playhead scrubbing, right‑click context menu at time, cue markers with rename/delete
  - End‑of‑timeline handle; clamps to max( minDuration, longestClipEnd ) live during drag; commits once on release

- Tracks
  - Rows for layers; clips render per layer with move and resize
  - Keyframes display within clips; drag to move; commit on release
  - Triggers render as badges at times (when cue‑based triggers exist)
  - Locked clips are visibly disabled and ignore pointer interactions

- Zoom
  - Reactive zoom affects both Ruler and Tracks immediately
  - Anchored around the playhead; scroll recenters on zoom change

## Centralized actions (persistence + history)

- `setTimelineDuration(tid, newDuration, { commit? })`: clamps to min duration and longest clip; adjusts clips; updates runtime; optional history commit
- `moveOrResizeClip(tid, { id, elementId, start, end }, { commit? })`: clamps within duration; optional commit
- Cue points: `addCue`, `renameCue`, `deleteCue` with optional runtime recreation
- Keyframes: `addKeyframe` (ensure clip covers, optional commit), `moveKeyframe` (optional commit)

These are the only write paths used by the editor to keep behavior consistent and undoable.

## Data model (persisted, current)

- TimelineRecord
  - `{ id, pageId, duration, cuePoints?: Array<{ id, time, name? }> }`
- Clip
  - `{ id, elementId, start, end }` stored per timeline in `timelineClips`
- Keyframe
  - `{ id, elementId, property, time, value, easing }` stored per timeline in `animationData`
- Trigger (minimal in current UI)
  - `source: { kind: 'timeline.event', timelineId, event: 'cue', cueId? name? cueTime? }`
  - `actions: Array<{ type: 'log'|'playTimeline'|'pauseTimeline'|'stopTimeline', ... }>`

## Scripting (planned)

- Worker‑sandboxed execution (no DOM/store access), typed `mava` API
- Authoring via CodeMirror with TS hints (desktop first; web optional)
- Example API sketch (planned): `getElement`, `setByPath`, `animate`, `playTimeline`, `on/off/emit`, and utilities

Security (planned): validate bridge calls, time‑slice tasks, no network/FS; opt‑in later.

## Phasing

- M1 (Foundation) — current
  - Timeline runtime and editor basics (playhead, ruler, tracks, clips, keyframes, zoom)
  - Cue points and cue‑based triggers; simple actions; unified history; locks
  - Centralized actions; derived VM; componentization of Ruler/Tracks

- M2 (Authoring & triggers)
  - Trigger editor improvements (conditions, debounce/throttle, once)
  - More trigger sources (element/page/keyboard/timer) and action types

- M3 (Scripting)
  - Worker + `mava` API + CodeMirror authoring
  - Errors/diagnostics surfaced in UI

- M4 (Integration & quality)
  - Tests, profiling, recording mode, playback niceties (yoyo/repeat)

## Acceptance criteria

- Delivered (M1)
  - Move/resize clips and move keyframes are undoable (single commit per interaction)
  - End handle clamps under longest clip and respects minimum duration, including on initial load
  - Locked elements' clips are non‑interactive (UI disabled and no history changes)
  - Ruler extracted; Tracks extracted; zoom is reactive and centered on playhead
  - Cue add/rename/delete with runtime refresh; timeline cue triggers can log or control playback

- Upcoming
  - Additional trigger sources/conditions; richer actions
  - Script authoring and sandboxed execution with a typed API

## Test plan (working)

- Unit: clip clamp logic, duration clamp vs. longest clip, keyframe move boundaries
- Integration: centralized actions produce single commits; undo/redo across stage scope
- Runtime: play/pause/seek reflect in editor; cue triggers fire and execute actions
- UX smoke: zoom responds instantly; playhead scrubbing; ruler ticks adaptive; end handle commit on release

## Open questions

- Trigger condition model and UI (scopes, selectors, once/debounce/throttle)
- Script capability surface and safety budget per frame
- Export strategy and optional adapters (e.g., GSAP)

---

This is a living document. It reflects the current shipped foundation and the planned path to triggers and scripting. Update as we land features.
