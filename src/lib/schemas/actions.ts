/** Action model (subset for v1 runtime skeleton) */

export type Action =
  | { type: 'log'; message: string }
  | { type: 'setVariable'; id: string; value: any }
  | { type: 'adjustVariable'; id: string; by: number }
  | { type: 'playTimeline'; timelineId: string }
  | { type: 'pauseTimeline'; timelineId: string }
  | { type: 'stopTimeline'; timelineId: string }
  | { type: 'seekTimeline'; timelineId: string; time: number }
  | { type: 'setTimelineLoop'; timelineId: string; loop: boolean };
