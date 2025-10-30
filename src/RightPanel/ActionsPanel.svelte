<script lang="ts">
  import TriggersPanel from '../SideNavigation/TriggersPanel.svelte';
  import TriggerWizard from '../SideNavigation/TriggerWizard.svelte';
  import type { TriggerDef, TimelineOption, VariableOption } from '../lib/schemas/triggers';

  // Props to allow wiring in from stores later
  export let triggers: TriggerDef[] = [];
  export let timelines: TimelineOption[] = [];
  export let variables: VariableOption[] = [];

  let isWizardOpen = false;
  let current: TriggerDef | null = null;

  function openNew() {
    current = {
      id: 'new',
      name: 'New trigger',
      enabled: true,
      source: { kind:'timeline', event:'cue', timelineId: undefined, cueId: '' },
      conditions: null,
      actions: [{ kind:'log', message:'' }]
    };
    isWizardOpen = true;
  }
  function openEdit(id?: string) {
    const t = id ? triggers.find(x => x.id === id) : triggers[0];
    if (!t) return openNew();
    current = structuredClone(t);
    isWizardOpen = true;
  }
  function onSave(e: CustomEvent<TriggerDef>) {
    const t = e.detail;
    const idx = triggers.findIndex(x => x.id === t.id);
    if (idx >= 0) triggers[idx] = t; else triggers = [...triggers, { ...t, id: `t${Date.now()}` }];
    isWizardOpen = false;
  }
</script>

<div class="triggers-ui">
  <TriggersPanel {triggers}
    on:new={openNew}
    on:edit={(e)=>openEdit(e.detail?.id)}
  />

  <TriggerWizard bind:isOpen={isWizardOpen} trigger={current ?? {
    id: 'new', name: 'New trigger', enabled: true,
    source: { kind:'timeline', event:'cue', timelineId: undefined, cueId: '' },
    conditions: null, actions: [{ kind:'log', message:'' }]
  }} {timelines} {variables}
    on:save={onSave}
    on:discard={() => isWizardOpen=false}
    on:close={() => isWizardOpen=false}
  />
</div>

<!-- Rely on per-component dark styles (TriggersPanel/TriggerWizard) -->
