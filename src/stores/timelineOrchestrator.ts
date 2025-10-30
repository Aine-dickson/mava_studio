import { get } from 'svelte/store';
import { currentPageId, projectData } from './project';
import { stage } from './stage';
import { timelineData, selectedTimelineId, type TimelineRecord } from './timelineData';
import { timelines } from './timelines';
import { devOutput } from './devOutput';

function makeId(pageId: string, stageKey: string) {
  return `page-${pageId}:${stageKey}`;
}

function ensureTimeline(pageId: string, stageKey: string) {
  const id = makeId(pageId, stageKey);
  const list = timelineData.getAll();
  let rec = list.find((t) => t.id === id);
  if (!rec) {
    const page = get(projectData).pagesById[pageId];
    const name = `${page?.metadata?.title ?? pageId} · ${stageKey}`;
    const duration = Math.max(0, page?.metadata?.duration ?? 3000);
    rec = { id, name, duration, loop: false, cuePoints: [] };
    timelineData.add(rec);
  }
  let tl = timelines.get(id);
  if (!tl) tl = timelines.create(rec!);
  selectedTimelineId.set(id);
  // Attach event logging once (naive - idempotent enough for now)
  tl.on((e) => {
    if (e.type === 'cue') devOutput.append('info', `Cue: ${e.cue.label ?? e.cue.id} @ ${e.cue.time}ms`, { timelineId: id });
    if (e.type === 'loop') devOutput.append('info', `Loop ${e.count}`, { timelineId: id });
  });
}

// Subscribe and orchestrate
let prevPage: string | null = null;
let prevStage: string | null = null;

function recompute() {
  const pid = get(currentPageId);
  const s = get(stage);
  if (!pid || !s) return;
  if (pid === prevPage && s === prevStage) return;
  prevPage = pid; prevStage = s;
  ensureTimeline(pid, s);
}

currentPageId.subscribe(() => recompute());
stage.subscribe(() => recompute());
projectData.subscribe(() => recompute());
