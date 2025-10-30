import type { TriggerDef, TriggerSource, Condition } from '../schemas/triggers';
import type { Action } from '../schemas/actions';
import { get, writable, type Writable } from 'svelte/store';
import { variablesStore, setVar, adjustVar } from '../../stores/variables.ts';
import { timelines } from '../../stores/timelines.ts';
import type { VariableMap } from '../schemas/variables';
import { devOutput } from '../../stores/devOutput.ts';

export interface TriggerRuntime {
  def: TriggerDef;
  dispose: () => void;
}

const triggers: Map<string, TriggerRuntime> = new Map();

export function registerTrigger(def: TriggerDef): TriggerRuntime {
  // If a trigger with this id already exists, dispose it to prevent duplicate handlers
  const existing = triggers.get(def.id);
  if (existing) {
    try { existing.dispose(); } catch {}
    triggers.delete(def.id);
  }
  const disposeFns: Array<() => void> = [];

  switch (def.source.kind) {
    case 'variable.change': {
      const unsub = variablesStore.subscribe((all: VariableMap) => {
        // naive: run conditions on any change; optimize later
        maybeRun(def);
      });
      disposeFns.push(unsub);
      break;
    }
    case 'timer.timeout': {
      const id = setTimeout(() => maybeRun(def), def.source.delay);
      disposeFns.push(() => clearTimeout(id));
      break;
    }
    case 'timer.interval': {
      const id = setInterval(() => maybeRun(def), def.source.interval);
      disposeFns.push(() => clearInterval(id));
      break;
    }
    case 'timeline.event': {
      const src = def.source as Extract<TriggerSource, { kind: 'timeline.event' }>;
      const tl = timelines.get(src.timelineId);
      if (tl) {
        const handler = (e: any) => {
          if (src.event === 'cue' && e.type === 'cue') {
            // If specific cue filters are set, enforce them
            const cue = e.cue as any;
            if (src.cueId && cue.id !== src.cueId) return;
            if (src.cueName && cue.name !== src.cueName) return;
            if (typeof src.cueTime === 'number' && cue.time !== src.cueTime) return;
            maybeRun(def);
          } else if (e.type === src.event) {
            maybeRun(def);
          }
        };
        tl.on(handler);
        disposeFns.push(() => tl.off(handler));
      }
      break;
    }
    default:
      break;
  }

  const runtime: TriggerRuntime = { def, dispose: () => disposeFns.forEach((f) => f()) };
  triggers.set(def.id, runtime);
  return runtime;
}

function maybeRun(def: TriggerDef) {
  if (def.enabled === false) return;
  if (def.conditions && def.conditions.length > 0) {
    const ok = def.conditions.every(evaluateCondition);
    if (!ok) return;
  }
  runActions(def.actions);
}

function evaluateCondition(c: Condition): boolean {
  const lhs = valueOf(c.lhs);
  const rhs = valueOf(c.rhs);
  switch (c.op) {
    case '==': return lhs == rhs;
    case '!=': return lhs != rhs;
    case '>': return lhs > rhs;
    case '<': return lhs < rhs;
    case '>=': return lhs >= rhs;
    case '<=': return lhs <= rhs;
    case 'includes': return Array.isArray(lhs) ? lhs.includes(rhs) : (typeof lhs === 'string' ? lhs.includes(String(rhs)) : false);
    default: return false;
  }
}

function valueOf(arg: { type: 'variable'; id: string } | { type: 'const'; value: any }) {
  if (arg.type === 'const') return arg.value;
  const all = get(variablesStore) as VariableMap;
  return all[arg.id];
}

export function runActions(actions: Action[]) {
  for (const a of actions) {
    switch (a.type) {
      case 'log':
        console.log('[Trigger log]', a.message);
        devOutput.append('info', a.message, { source: 'trigger' });
        break;
      case 'setVariable':
        setVar(a.id, a.value);
        break;
      case 'adjustVariable':
        adjustVar(a.id, a.by);
        break;
      case 'playTimeline': {
        const tl = timelines.get(a.timelineId);
        tl?.play();
        break;
      }
      case 'pauseTimeline': {
        const tl = timelines.get(a.timelineId);
        tl?.pause();
        break;
      }
      case 'stopTimeline': {
        const tl = timelines.get(a.timelineId);
        tl?.stop();
        break;
      }
      case 'seekTimeline': {
        const tl = timelines.get(a.timelineId);
        tl?.seek(a.time);
        break;
      }
      case 'setTimelineLoop': {
        const tl = timelines.get(a.timelineId);
        tl?.setLoop(a.loop);
        break;
      }
      default:
        console.warn('Unknown action', a);
        break;
    }
  }
}
