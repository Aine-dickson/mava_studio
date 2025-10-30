import { timelineData, type TimelineRecord } from './timelineData';
import { timelineClips as clipsStore, type Clip } from './timelineClips';
import { animationData, type Keyframe } from './animationData';
import { timelines } from './timelines';
import { commitTimelineChange } from './historyScoped';

const MIN_TIMELINE_MS = 1000;

function clampClipsToDuration(timelineId: string, duration: number) {
  const arr = clipsStore.getForTimeline(timelineId);
  let changed = false;
  for (const c of arr) {
    if (c.end > duration) { clipsStore.upsert(timelineId, { ...c, end: duration }); changed = true; }
  }
  return changed;
}

export function setTimelineDuration(timelineId: string, newDuration: number, opts?: { commit?: boolean }) {
  const rec0 = timelineData.getById(timelineId); if (!rec0) return;
  const maxClipEnd = clipsStore.getMaxEnd?.(timelineId) ?? 0;
  const duration = Math.max(MIN_TIMELINE_MS, maxClipEnd, Math.floor(newDuration));
  if (duration === rec0.duration) { if (opts?.commit) commitTimelineChange(timelineId, 'timeline'); return; }
  const rec: TimelineRecord = { ...rec0, duration };
  timelineData.update(rec);
  clampClipsToDuration(timelineId, duration);
  const tl = timelines.get(rec.id) || timelines.create(rec);
  tl.setDuration?.(duration);
  if (tl.time > duration) tl.seek(duration);
  if (opts?.commit) commitTimelineChange(rec.id, 'timeline');
}

export function moveOrResizeClip(timelineId: string, clip: { id: string; elementId: string; start: number; end: number }, opts?: { commit?: boolean }) {
  const dur = timelineData.getById(timelineId)?.duration ?? Infinity;
  let s = Math.max(0, Math.min(clip.start, clip.end));
  let e = Math.max(s, Math.min(dur, clip.end));
  clipsStore.upsert(timelineId, { id: clip.id, elementId: clip.elementId, start: s, end: e });
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
}

export function addCue(timelineId: string, cue: { time: number; name?: string }, opts?: { commit?: boolean; recreateRuntime?: boolean }) {
  timelineData.addCue(timelineId, cue);
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
  if (opts?.recreateRuntime) { const rec = timelineData.getById(timelineId)!; timelines.delete(rec.id); timelines.create(rec); }
}

export function renameCue(timelineId: string, cueId: string, name: string, opts?: { commit?: boolean; recreateRuntime?: boolean }) {
  timelineData.renameCue(timelineId, cueId, name);
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
  if (opts?.recreateRuntime) { const rec = timelineData.getById(timelineId)!; timelines.delete(rec.id); timelines.create(rec); }
}

export function deleteCue(timelineId: string, cueId: string, opts?: { commit?: boolean; recreateRuntime?: boolean }) {
  timelineData.deleteCue(timelineId, cueId);
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
  if (opts?.recreateRuntime) { const rec = timelineData.getById(timelineId)!; timelines.delete(rec.id); timelines.create(rec); }
}

export function addKeyframe(timelineId: string, kf: Keyframe, opts?: { ensureClipCovers?: boolean; commit?: boolean }) {
  animationData.addKeyframe(timelineId, kf);
  if (opts?.ensureClipCovers) {
    const rec = timelineData.getById(timelineId);
    const dur = rec?.duration ?? Infinity;
    // find the clip for this element and expand if needed
    const clips = clipsStore.getForTimeline(timelineId);
    const c = clips.find(c => c.elementId === kf.elementId) as Clip | undefined;
    if (c) {
      let ns = c.start, ne = c.end;
      if (kf.time < c.start) ns = Math.max(0, kf.time);
      if (kf.time > c.end) ne = Math.min(dur, kf.time);
      if (ns !== c.start || ne !== c.end) {
        clipsStore.upsert(timelineId, { id: c.id, elementId: c.elementId, start: ns, end: ne });
      }
    }
  }
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
}

export function moveKeyframe(timelineId: string, kfId: string, newTime: number, opts?: { commit?: boolean }) {
  const kf = animationData.getForTimeline(timelineId).find(k => k.id === kfId); if (!kf) return;
  animationData.updateKeyframe(timelineId, { ...kf, time: newTime });
  if (opts?.commit) commitTimelineChange(timelineId, 'timeline');
}
