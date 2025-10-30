import { derived, get, readable } from 'svelte/store';
import { currentPage } from './project';
import { selectedTimelineId, timelineData, type TimelineRecord } from './timelineData';
import { timelineClips } from './timelineClips';
import { animationData, type Keyframe } from './animationData';
import { triggersStore } from './triggers';

export type UILayer = { id: string; name: string; type?: string; locked?: boolean };
export type UIKey = { id: string; time: number };
export type UITrig = { id: string; time: number };
export type UIClip = { id: string; layerId: string; start: number; end: number; label: string; keyframes: UIKey[]; triggers: UITrig[]; locked?: boolean };
export type TimelineVM = {
  timeline: TimelineRecord | null;
  layers: UILayer[];
  clips: UIClip[];
};

function buildVM(): TimelineVM {
  const sel = get(selectedTimelineId);
  const list = get(timelineData);
  const timeline = sel ? (list.find((t) => t.id === sel) ?? null) : (list[0] ?? null);
  const page: any = get(currentPage);
  const layers: UILayer[] = page?.elements ? page.elements.map((e: any) => ({ id: e.id, name: e.name ?? e.id, type: e.type, locked: !!e.locked })) : [];
  let clips: UIClip[] = [];
  if (timeline) {
    const base = timelineClips.getForTimeline(timeline.id);
    const ensured = layers.map((l) => timelineClips.ensureClip(timeline.id, l.id, timeline.duration));
    const all = [...base, ...ensured].reduce((map, c) => { map.set(c.id, c); return map; }, new Map<string, any>());
    const kfs = animationData.getForTimeline(timeline.id);
    const trig = (triggersStore.getForTimeline?.(timeline.id) ?? []) as any[];
    clips = Array.from(all.values()).map((c) => {
      const layer = layers.find((l) => l.id === c.elementId);
      const keyframes = kfs.filter((k) => k.elementId === c.elementId && k.time >= c.start && k.time <= c.end).map((k) => ({ id: k.id, time: k.time }));
      const triggers = trig.filter(t => (t.source?.kind === 'timeline.event' && t.source.event === 'cue'))
        .map((t) => ({ id: t.id, time: (t as any).source?.cueTime ?? c.start }))
        .filter(x => x.time >= c.start && x.time <= c.end);
      return { id: c.id, layerId: c.elementId, start: c.start, end: c.end, label: layer?.name ?? c.elementId, keyframes, triggers, locked: !!layer?.locked };
    });
  }
  return { timeline, layers, clips };
}

// Simple derived readable that recomputes when any dependency changes.
// This keeps all compute in one place and memoizes output by reference when unchanged.
export const timelineVM = derived(
  [selectedTimelineId, timelineData, currentPage, timelineClips as any, animationData as any, triggersStore as any],
  () => buildVM()
);
