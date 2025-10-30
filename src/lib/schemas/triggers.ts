// Minimal trigger schemas/types used by TriggerPanel and TriggerWizard
// These are UI-level types; adapt as needed to your runtime schemas.

export type ID = string;

export type TriggerSourceKind = 'timeline' | 'element' | 'timer';

export type TimelineEvent = 'cue' | 'play' | 'pause' | 'stop' | 'seek';
export type ElementEvent = 'click';
export type TimerEvent = 'timeout';

export type SourceDef =
  | { kind: 'timeline'; event: TimelineEvent; timelineId?: string; cueId?: string | null }
  | { kind: 'element'; event: ElementEvent; selector: string }
  | { kind: 'timer'; event: TimerEvent; delayMs: number };

export type ValueRef =
  | { type: 'variable'; name: string }
  | { type: 'value'; value: string | number | boolean };

export type CompareOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'includes';

export type ConditionLeaf = {
  kind: 'leaf';
  left: ValueRef; // usually variable on LHS
  op: CompareOp;
  right: ValueRef; // can be variable or literal
};

export type ConditionGroup = {
  kind: 'group';
  logic: 'AND' | 'OR';
  items: ConditionNode[];
};

export type ConditionNode = ConditionLeaf | ConditionGroup;

export type ActionKind =
  | 'log'
  | 'timeline.play'
  | 'timeline.pause'
  | 'timeline.stop'
  | 'timeline.seek';

export type ActionDef =
  | { kind: 'log'; message: string; condition?: ConditionNode | null }
  | { kind: 'timeline.play'; timelineId?: string; condition?: ConditionNode | null }
  | { kind: 'timeline.pause'; timelineId?: string; condition?: ConditionNode | null }
  | { kind: 'timeline.stop'; timelineId?: string; condition?: ConditionNode | null }
  | { kind: 'timeline.seek'; timelineId?: string; ms: number; condition?: ConditionNode | null };

export interface TriggerDef {
  id: ID;
  name: string;
  enabled: boolean;
  scope?: 'global' | 'timeline';
  timelineId?: string | null; // for filtering/association
  source: SourceDef;
  conditions?: ConditionNode | null; // global conditions
  actions: ActionDef[]; // actions may also have local optional conditions
}

// Mini helper types used by UI dropdowns
export interface TimelineOption { id: string; label?: string }
export interface VariableOption { name: string; type: 'string' | 'number' | 'boolean' }
// (Legacy runtime-specific types removed from this UI schema file. Use a mapper between UI types and runtime types.)
