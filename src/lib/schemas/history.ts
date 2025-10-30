import type { ProjectData } from './project';

export type ScopeName = 'elementInternal' | 'page' | 'lesson' | 'module' | 'course';

export interface ScopedHistory<T> {
  past: T[];
  future: T[];
  current: T;
}

export type HistoryStacks = {
  elementInternal?: ScopedHistory<unknown>; // ephemeral per element session
  page: ScopedHistory<ProjectData>;
  lesson: ScopedHistory<ProjectData>;
  module: ScopedHistory<ProjectData>;
  course: ScopedHistory<ProjectData>;
};

export interface HistoryController {
  activeScope: ScopeName;
  setActiveScope(scope: ScopeName): void;
  commit(scope: ScopeName, next: ProjectData): void;
  undo(): void;
  redo(): void;
  canUndo(scope?: ScopeName): boolean;
  canRedo(scope?: ScopeName): boolean;
}

export type AutosavePayload = {
  scope: ScopeName;
  data: ProjectData;
  past?: number;
  future?: number;
  at: number;
};
