export type Unsubscribe = () => void;

export interface ReadonlySignal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): Unsubscribe;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(updater: (prev: T) => T): void;
}

export namespace MavaTypes {
  export type EntityId = string;
  export interface Vector2 {
    x: number;
    y: number;
  }
}


export interface MavaVariableAPI {
  /** Get a reactive read-only signal for a variable by name, scoped (page overrides global). */
  //readonly(name: string): ReadonlySignal<any>;
  /** Get a mutable signal (if variable is writable). Setting the value updates the variable. */
  //mutable(name: string): Signal<any>;
  /** Read current value (non-reactive snapshot). */
  //get(name: string): any;
  /** Write a value (no-op if readOnly). */
  //set(name: string, value: any): void;
  /** Direct property access to variable values, e.g. `Mava.variables.username`. */
  [variableName: string]: any;
}

export interface MavaTimelineSnapshot {
  id?: string;
  name?: string;
  duration?: number;
  playing?: boolean;
  time?: number;
  [k: string]: any;
}

export interface MavaTimelineAPI extends MavaTimelineSnapshot {
  /** Current snapshot value. Mirrors spread properties for ergonomic access. */
  //readonly value: MavaTimelineSnapshot;
  /** Reactive timeline info feed. */
  //readonly signal: ReadonlySignal<MavaTimelineSnapshot>;
  /** Subscribe to timeline change events. */
  onChange(fn: (snapshot: MavaTimelineSnapshot) => void): Unsubscribe;
  /** Request playback start from the host environment. */
  play(): void;
  /** Request playback pause from the host environment. */
  pause(): void;
  /** Seek to a timestamp (in milliseconds) on the host timeline. */
  seek(time: number): void;
}

export interface MavaElementSnapshot {
  id: string;
  name?: string;
  type?: string;
  pageId?: string | null;
  parentId?: string | null;
  position?: { x: number; y: number };
  size?: { width?: number; height?: number; dimensions?: { width: number; height: number } };
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  [k: string]: any;
}

export type MavaElementMutations = Partial<MavaElementSnapshot>;

export interface MavaElementsAPI {
  /** Snapshot list of elements on the active page (shallow copy). */
  list(): MavaElementSnapshot[];
  /** Lookup element by id. */
  get(id: string): MavaElementSnapshot | undefined;
  /** Lookup element by display name (page scope). */
  byName(name: string): MavaElementSnapshot | undefined;
  /** Reactive signal tracking element snapshot list. */
  readonly signal: ReadonlySignal<MavaElementSnapshot[]>;
  /** Subscribe to element snapshot updates. */
  onChange(fn: (snapshot: MavaElementSnapshot[]) => void): Unsubscribe;
  /** Request a partial mutation to be applied by the host editor. */
  patch(id: string, changes: MavaElementMutations, opts?: { pageId?: string }): void;
  /** Alias of patch for compatibility. */
  set(id: string, next: MavaElementMutations, opts?: { pageId?: string }): void;
}

export interface MavaBuiltinAPI {
  project: ReadonlySignal<{ id?: string; title?: string; version?: number; [k: string]: any }>;
  //timeline: ReadonlySignal<MavaTimelineSnapshot>;
  //selection: ReadonlySignal<MavaTypes.EntityId | null>;
  page: ReadonlySignal<{ id: string | null; elements: MavaElementSnapshot[] }>;
}

export interface MavaAPI {
  readonly time: ReadonlySignal<number>;
  onTick(fn: (t: number, dt: number) => void): Unsubscribe;

  //readonly selection: ReadonlySignal<MavaTypes.EntityId | null>;

  //signal<T>(initial: T): Signal<T>;
  //computed<T>(calc: () => T): ReadonlySignal<T>;
  //effect(fn: () => void): Unsubscribe;

  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;

  setTimeout(fn: () => void, ms: number): Unsubscribe;
  setInterval(fn: () => void, ms: number): Unsubscribe;

  lerp(a: number, b: number, t: number): number;

  variables: MavaVariableAPI;

  timeline: MavaTimelineAPI;

  //elements: MavaElementsAPI;

  builtin: MavaBuiltinAPI;
}
