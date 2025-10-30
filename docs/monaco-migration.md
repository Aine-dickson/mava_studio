# Monaco migration notes

Goal: replace CodeMirror + custom TS worker with Monaco Editor + monaco-typescript for out-of-the-box TypeScript + DOM completions.

## What we keep
- Script list UI and status chip in `src/Terminal/terminal.svelte`.
- `onChange` wiring back to the scripts store.
- Runtime symbol suggestions (re-implemented as a Monaco completion provider).
- Self-test probe that checks Promise/document availability and reports into the status chip.

## New component
- `src/Terminal/ScriptEditorMonaco.svelte` – a drop-in alternative to `ScriptEditorCM.svelte`.
- Exports: `scriptId`, `code`, `readOnly`, `onChange`, `runtimeSymbols`.
- Emits: `libInfo`, `selfTest` like the existing component so the status chip keeps working.

## Install deps

```bash
bun add monaco-editor vite-plugin-monaco-editor
```

> If using npm/yarn/pnpm, use the equivalent add/install command.

## Vite setup
Add the plugin so Monaco workers and assets are bundled correctly.

Create or update `vite.config.ts` (top-level of the project):

```ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import monaco from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [sveltekit(), monaco({
    languageWorkers: ['editorWorkerService','typescript','json','html','css'],
  })],
});
```

If you already have a Vite config, just add the `monaco()` plugin alongside `sveltekit()`.

## Global CSS
Import Monaco base CSS once (e.g., in `src/app.html` or root layout):

```html
<link rel="stylesheet" href="/node_modules/monaco-editor/min/vs/editor/editor.main.css" />
```

Alternatively, in a global entry file:

```ts
import 'monaco-editor/min/vs/editor/editor.main.css';
```

## Swap the component
In `src/Terminal/terminal.svelte`, replace the editor when ready:

```svelte
<!-- import ScriptEditorMonaco instead of ScriptEditorCM -->
<script>
  import ScriptEditorMonaco from './ScriptEditorMonaco.svelte';
</script>
<!-- ... -->
<ScriptEditorMonaco
  scriptId={$selectedScript.id}
  code={$selectedScript.code ?? ''}
  onChange={(next) => updateScriptCode($selectedScript.id, next)}
  runtimeSymbols={/* pass if needed */}
  on:libInfo={handleLibInfo}
  on:selfTest={handleSelfTest}
/>
```

Keep the status chip logic as-is; this Monaco component emits the same events.

## Notes
- Monaco’s built-in TypeScript service ships with the full standard libs (ES + DOM). Completions on string/array/DOM should work out-of-the-box and trigger on `.` or `Ctrl+Space`.
- The component triggers suggestions when you type a dot, mirroring the CM behavior.
- If you want to keep CM available as a fallback, you can conditionally render one or the other via a setting.

## Optional: strictness toggle
You can adjust TS defaults at runtime via:

```ts
import * as monaco from 'monaco-editor';
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({ noImplicitAny: true });
```

This can be wired to a UI toggle if desired.
