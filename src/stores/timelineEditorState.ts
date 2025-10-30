import { writable } from 'svelte/store';

export interface TimelineEditorState {
  pixelsPerSecond: number;
  fps: number;
  showFrames: boolean;
  selectedElementId: string | null;
  selectedKeyframeId: string | null;
}

const initial: TimelineEditorState = {
  pixelsPerSecond: 200,
  fps: 60,
  showFrames: false,
  selectedElementId: null,
  selectedKeyframeId: null,
};

export const timelineEditorState = writable<TimelineEditorState>(initial);

export function setZoom(pps: number) {
  timelineEditorState.update((s)=>({ ...s, pixelsPerSecond: Math.max(20, Math.min(pps, 2000)) }));
}
export function setFps(fps: number) {
  timelineEditorState.update((s)=>({ ...s, fps: Math.max(1, Math.min(fps, 240)) }));
}
export function selectElement(id: string | null) {
  timelineEditorState.update((s)=>({ ...s, selectedElementId: id }));
}
export function selectKeyframe(id: string | null) {
  timelineEditorState.update((s)=>({ ...s, selectedKeyframeId: id }));
}
