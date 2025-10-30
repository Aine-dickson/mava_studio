import { triggersStore } from './triggers';
import { registerTrigger } from '../lib/runtime/triggers';
import type { TriggerDef } from '../lib/schemas/triggers';
import { timelines } from './timelines';

// On import, register all persisted triggers. registerTrigger is idempotent.
function initAll() {
  const list = triggersStore.all();
  list.forEach((def: TriggerDef) => {
    try { registerTrigger(def); } catch (e) { console.warn('Failed to register trigger', def?.id, e); }
  });
}

initAll();

// When a new timeline runtime is created later than triggers, we may need to re-register
// timeline.event triggers for that timeline so their event listeners bind.
// We monkey-patch timelines.create to run a quick rebind for that id.
const origCreate = timelines.create.bind(timelines);
(timelines as any).create = (cfg: any) => {
  const tl = origCreate(cfg);
  const id: string = cfg?.id;
  if (id) {
    const forTl = triggersStore.getForTimeline(id);
    forTl.forEach((def) => {
      try { registerTrigger(def); } catch (e) { console.warn('Failed to re-register trigger', def?.id, e); }
    });
  }
  return tl;
};

export {}; // module side-effects only
