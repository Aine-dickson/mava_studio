import { derived, get, writable } from 'svelte/store';
import { selectedTimelineId } from './timelineData';
import { currentPage } from './project';
import { timelines } from './timelines';
import { timelineClips } from './timelineClips';

/**
 * currentAlive: Set of elementIds that are alive (within their clip lifetime)
 * for the currently selected timeline at its current playhead.
 *
 * If no timeline is selected or no runtime exists, returns null (treat as all alive).
 */
export const currentAlive = writable<Set<string> | null>(null);

let detach: (() => void) | null = null;
let timer: any = null;

function recompute() {
  const tid = get(selectedTimelineId);
  const page: any = get(currentPage);
  if (!tid || !page) { currentAlive.set(null); return; }
  const tl = timelines.get(tid);
  const time = tl?.time ?? 0;
  const clips = timelineClips.getForTimeline(tid);
  const ids: string[] = (page.elements ?? []).map((e: any) => e.id);
  const alive = new Set<string>();
  for (const id of ids) {
    const clip = clips.find((c) => c.elementId === id);
    if (!clip) { alive.add(id); continue; }
    if (time >= clip.start && time < clip.end) alive.add(id);
  }
  currentAlive.set(alive);
}

function attach() {
  if (detach) { detach(); detach = null; }
  const tid = get(selectedTimelineId);
  const tl = tid ? timelines.get(tid) : null;
  const offs: Array<() => void> = [];
  // Listen to timeline ticks/seek/stop/play/pause
  if (tl) {
    const handler = () => recompute();
    tl.on(handler);
    offs.push(() => tl.off(handler));
  }
  // Poll as a fallback while selected timeline is active, to catch playhead changes
  if (timer) { clearInterval(timer); timer = null; }
  if (tid) {
    timer = setInterval(() => recompute(), 120);
    offs.push(() => { if (timer) { clearInterval(timer); timer = null; } });
  }
  // Listen to clip changes affecting lifetimes
  const unsubClips = (timelineClips as any).subscribe ? (timelineClips as any).subscribe(() => recompute()) : null;
  if (unsubClips) offs.push(unsubClips);
  // Listen to page changes (elements list)
  const unsubPage = (currentPage as any).subscribe ? (currentPage as any).subscribe(() => recompute()) : null;
  if (unsubPage) offs.push(unsubPage);
  detach = () => offs.forEach((f) => f());
  recompute();
}

// React to selected timeline changes
selectedTimelineId.subscribe(() => attach());
// Initialize once
attach();
