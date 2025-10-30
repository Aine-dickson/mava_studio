<script lang="ts">
  import ActionsFlow from './components/ActionsFlow.svelte';
  import ConditionBuilder from './components/ConditionBuilder.svelte';
  import type { TriggerDef, SourceDef, ConditionNode, ActionDef, TimelineOption, VariableOption } from '../lib/schemas/triggers';

  export let isOpen = true;
  export let trigger: TriggerDef = {
    id: 'new',
    name: 'New trigger',
    enabled: true,
    source: { kind:'timeline', event:'cue', timelineId: undefined, cueId: '' },
    conditions: null,
    actions: [ { kind:'log', message:'Hello' } ]
  };
  export let timelines: TimelineOption[] = [];
  export let variables: VariableOption[] = [];

  // Events: save, discard, close, change
  function fire(name: string, detail?: any) { dispatchEvent(new CustomEvent(name, { detail })); }

  function set<K extends keyof TriggerDef>(k: K, v: TriggerDef[K]) {
    trigger = { ...trigger, [k]: v } as TriggerDef;
    fire('change', trigger);
  }

  function setSource(next: SourceDef) { set('source', next); }
  function setConditions(next: ConditionNode | null) { set('conditions', next); }
  function setActions(next: ActionDef[]) { set('actions', next); }
</script>

<style>
    .float { position:fixed; right:24px; top:80px; width: 840px; max-width: calc(100% - 48px); max-height: calc(100% - 120px); overflow:auto; border:1px solid #e2e8f0; border-radius:12px; box-shadow: 0 6px 18px rgba(2,6,23,0.12); padding:14px; z-index: 1000; }
    .header { display:flex; align-items:center; justify-content: space-between; margin-bottom:10px; }
    .title { display:flex; align-items:center; gap:10px; }
    .title h2 { margin:0; font-size:16px; }
    .close { border:none; background: transparent; font-size: 22px; color: #64748b; cursor:pointer; }
    .steps { display:flex; gap:8px; margin-bottom:12px; }
    .step { font-size:11px; padding:4px 8px; border-radius:999px; border:1px solid #031038; color:#475569; }
    .active { border-color:#bfdbfe; color:#2563eb; }
    .section { border:1px solid #1a2430; border-radius:10px; padding:12px; margin-bottom:12px; }
    .row { display:flex; gap:10px; flex-wrap: wrap; }
    .col { flex:1; min-width: 220px; }
    label { display:block; font-size:11px; color:#475569; margin-bottom:4px; }
    .select, .input { padding:6px 8px; border:1px solid #25282c; border-radius:6px; font-size:12px; width:100%; }
    .footer { display:flex; justify-content:flex-end; gap:8px; margin-top: 12px; }
    .btn { border:1px solid #292e35; color:#475569; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer; }
    .save { background:#2563eb; color:white; border-color:#1d4ed8; }
    .discard { border-color:#fecaca; color:#e11d48; }
</style>

{#if isOpen}
  <section class="float" aria-label="Trigger wizard">
    <header class="header">
      <div class="title">
        <h2>Trigger Wizard</h2>
        <span style="font-size:10px; padding:2px 6px; border-radius:999px; border:1px solid #e2e8f0; color:#475569; background:#f8fafc;">Draft</span>
      </div>
      <button class="close" aria-label="Close wizard" on:click={() => fire('close')}>×</button>
    </header>

    <nav class="steps" aria-label="Steps">
      <span class="step active">1 · Source</span>
      <span class="step">2 · Conditions</span>
      <span class="step">3 · Actions</span>
      <span class="step">4 · Review</span>
    </nav>

    <!-- Source & Event -->
    <section class="section">
      <h4 style="margin:0 0 8px; font-size:13px; color:#475569;">Source & Event</h4>
      <div class="row">
        <div class="col">
          <label for="src-kind">Source</label>
          <select id="src-kind" class="select" on:change={(e:any)=>setSource({ kind: e.target.value, event: (trigger.source as any).event } as any)}>
            <option value="timeline" selected={trigger.source.kind==='timeline'}>Timeline</option>
            <option value="element" selected={trigger.source.kind==='element'}>Element</option>
            <option value="timer" selected={trigger.source.kind==='timer'}>Timer</option>
          </select>
        </div>
        <div class="col">
          <label for="src-event">Event</label>
          {#if trigger.source.kind === 'timeline'}
            <select id="src-event" class="select" on:change={(e:any)=>setSource({ ...(trigger.source as any), event: e.target.value })}>
              {#each ['cue','play','pause','stop','seek'] as ev}
                <option value={ev} selected={(trigger.source as any).event===ev}>{ev}</option>
              {/each}
            </select>
          {:else if trigger.source.kind === 'element'}
            <select id="src-event" class="select" on:change={(e:any)=>setSource({ ...(trigger.source as any), event: e.target.value })}>
              <option value="click" selected={(trigger.source as any).event==='click'}>click</option>
            </select>
          {:else}
            <select id="src-event" class="select" disabled>
              <option selected>timeout</option>
            </select>
          {/if}
        </div>
        <div class="col">
          <label for="src-target">Target</label>
          {#if trigger.source.kind === 'timeline'}
            <select id="src-target" class="select" on:change={(e:any)=>setSource({ ...(trigger.source as any), timelineId: e.target.value || undefined })}>
              <option value="" selected={!('timelineId' in trigger.source) || !(trigger.source as any).timelineId}>Current</option>
              {#each timelines as t}
                <option value={t.id} selected={(trigger.source as any).timelineId===t.id}>{t.label ?? t.id}</option>
              {/each}
            </select>
          {:else if trigger.source.kind === 'element'}
            <input id="src-target" class="input" placeholder="#selector" value={(trigger.source as any).selector ?? ''} on:input={(e:any)=>setSource({ ...(trigger.source as any), selector: e.target.value })} />
          {:else}
            <input id="src-target" class="input" disabled value="(timer)" />
          {/if}
        </div>
      </div>
      <div class="row" style="margin-top:8px;">
        {#if trigger.source.kind === 'timeline'}
          <div class="col">
            <label for="cue-name">Cue (optional)</label>
            <input id="cue-name" class="input" placeholder="cue id or name" value={(trigger.source as any).cueId ?? ''} on:input={(e:any)=>setSource({ ...(trigger.source as any), cueId: e.target.value })} />
          </div>
        {:else if trigger.source.kind === 'timer'}
          <div class="col">
            <label for="timer-delay">Timer (ms)</label>
            <input id="timer-delay" type="number" class="input" placeholder="e.g. 1000" value={(trigger.source as any).delayMs ?? 1000} on:input={(e:any)=>setSource({ ...(trigger.source as any), delayMs: +e.target.value })} />
          </div>
        {/if}
      </div>
    </section>

    <!-- Conditions -->
    <section class="section">
      <ConditionBuilder value={trigger.conditions ?? null} variables={variables} on:change={(e:any)=>setConditions(e.detail)} />
    </section>

    <!-- Actions -->
    <section class="section">
      <div style="display:flex; align-items:center; justify-content: space-between; margin-bottom:6px;">
        <h4 style="margin:0; font-size:13px; color:#475569;">Actions</h4>
        <div>
          <select class="select" on:change={(e:any)=>{ const k=e.target.value; if(!k) return; const next=[...trigger.actions]; if(k==='log') next.push({ kind:'log', message:''}); if(k==='timeline.play') next.push({ kind:'timeline.play'} as any); if(k==='timeline.pause') next.push({ kind:'timeline.pause'} as any); if(k==='timeline.stop') next.push({ kind:'timeline.stop'} as any); if(k==='timeline.seek') next.push({ kind:'timeline.seek', ms:0 } as any); setActions(next); e.target.value=''; }}>
            <option value="">+ Add action…</option>
            <option value="log">Log</option>
            <option value="timeline.play">Play Timeline</option>
            <option value="timeline.pause">Pause Timeline</option>
            <option value="timeline.stop">Stop Timeline</option>
            <option value="timeline.seek">Seek Timeline</option>
          </select>
        </div>
      </div>
      <ActionsFlow actions={trigger.actions} {timelines} variables={variables}
        on:change={(e:any)=>setActions(e.detail)}
      />
    </section>

    <footer class="footer">
      <button class="btn discard" on:click={() => fire('discard')}>Discard</button>
      <button class="btn save" on:click={() => fire('save', trigger)}>Save</button>
    </footer>
  </section>
{/if}
