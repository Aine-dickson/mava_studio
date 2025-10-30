<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { scriptCommands, acknowledgeScriptCommand } from '../stores/scripts';

  export let scriptId: string;
  export let code: string = '';
  export let readOnly = false;
  export let onChange: (next: string) => void;
  export let variableTypeDefs: string | null | undefined = null;
  type RuntimeCompletionContext = 'any' | 'root' | 'variables' | 'timeline' | 'elements' | 'builtin';
  interface RuntimeCompletion {
    label: string;
    insertText?: string;
    detail?: string;
    documentation?: string;
    sortText?: string;
    filterText?: string;
    commitCharacters?: string[];
    kind?: number;
    contexts?: RuntimeCompletionContext[];
  }

  export let runtimeSymbols: RuntimeCompletion[] | undefined = [];

  let host: HTMLDivElement;
  let editor: any = null;
  let model: any = null;
  let monaco: any = null;
  let lastScriptId: string | null = null;
  let sub: any = null; // subscription disposable
  let commandUnsub: (() => void) | null = null;
  let variableTypesDisposable: { dispose(): void } | null = null;
  let lastVariableTypeSource: string | null = null;

  const dispatch = createEventDispatcher<{
    libInfo: { defaultLib: string; length: number; hasPromise: boolean; hasDocument: boolean; build?: string } | { error: string },
    selfTest: any
  }>();

  // Register a lightweight completion provider for runtime symbols
  let disposeRtProvider: any = null;
  function detectCompletionContext(model: any, position: any): RuntimeCompletionContext {
    try {
      const offset = model.getOffsetAt(position);
      const source: string = model.getValue();
      const before = source.slice(0, offset);
  if (/Mava\.variables\.[\w$]*$/u.test(before)) return 'variables';
  if (/Mava\.timeline\.[\w$]*$/u.test(before)) return 'timeline';
  if (/Mava\.elements\.[\w$]*$/u.test(before)) return 'elements';
  if (/Mava\.builtin\.[\w$]*$/u.test(before)) return 'builtin';
      if (/Mava\.[\w$]*$/u.test(before)) return 'root';
    } catch {}
    return 'any';
  }

  function registerRuntimeCompletions() {
    if (!monaco) return;
    if (disposeRtProvider) { try { disposeRtProvider.dispose?.(); } catch {}
      disposeRtProvider = null; }
    if (!runtimeSymbols || runtimeSymbols.length === 0) return;
    disposeRtProvider = monaco.languages.registerCompletionItemProvider('typescript', {
      triggerCharacters: ['.', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789'.split('')],
      provideCompletionItems: (model: any, position: any) => {
        try {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };
          const ctx = detectCompletionContext(model, position);
          const suggestions = (runtimeSymbols ?? [])
            .filter((sym) => {
              const contexts = sym.contexts ?? ['any'];
              return contexts.includes('any') || contexts.includes(ctx);
            })
            .map((sym) => ({
              label: sym.label,
              kind: sym.kind ?? monaco.languages.CompletionItemKind.Variable,
              insertText: sym.insertText ?? sym.label,
              detail: sym.detail,
              documentation: sym.documentation,
              sortText: sym.sortText,
              filterText: sym.filterText,
              commitCharacters: sym.commitCharacters,
              range,
            }));
          return { suggestions };
        } catch {
          return { suggestions: [] };
        }
      },
    });
  }

  async function runSelfTest() {
    try {
      if (!monaco) return;
      // Use TS worker directly
      const getW = await monaco.languages.typescript.getTypeScriptWorker();
      const worker = await getW(model.uri);
      const probe = [
        'async function test(){',
        '  await Promise.resolve(1);',
        '  document.body;',
        '}',
      ].join('\n');
      const tempModel = monaco.editor.createModel(probe, 'typescript');
      const diags = await worker.getSemanticDiagnostics(tempModel.uri.toString());
      tempModel.dispose();
      const out = diags.map((d: any) => ({
        start: d.start || 0,
        end: (d.start || 0) + (d.length || 0),
        message: monaco.MarkerSeverity ? d.messageText : String(d.messageText),
        severity: d.category ?? 1,
      }));
      dispatch('selfTest', { flags: monaco.languages.typescript.typescriptDefaults.getCompilerOptions(), diagnostics: out });
      // Also send a libInfo-like signal
      dispatch('libInfo', {
        defaultLib: '(monaco builtin)',
        length: 0,
        hasPromise: out.length === 0, // crude signal; if no diags above, Promise and document are present
        hasDocument: out.length === 0,
        build: 'monaco-typescript'
      } as any);
    } catch (e) {
      dispatch('libInfo', { error: String(e) } as any);
    }
  }

  export function insertText(snippet: string) {
    if (!editor || !model || typeof snippet !== 'string') return;
    const modelRef = editor.getModel();
    if (!modelRef) return;
    const selection = editor.getSelection();
    const range = selection ?? (monaco ? new monaco.Range(1, 1, 1, 1) : null);
    if (!range) return;
    const start = range.getStartPosition();
    const startOffset = modelRef.getOffsetAt(start);
    const insertText = snippet;
    editor.executeEdits('mava-insert', [
      {
        range,
        text: insertText,
        forceMoveMarkers: true,
      },
    ]);
    const newOffset = startOffset + insertText.length;
    const newPosition = modelRef.getPositionAt(newOffset);
    editor.setPosition(newPosition);
    editor.revealPositionInCenter(newPosition);
    editor.focus();
  }

  onMount(async () => {
    // Dynamic import so this file can exist before deps are installed
    try {
      // @ts-ignore: resolved at runtime once monaco-editor is installed
      monaco = await import('monaco-editor');
    } catch (e) {
      // If monaco isn't installed yet, surface a helpful message but don't crash
      console.warn('Monaco not installed. Run: bun add monaco-editor vite-plugin-monaco-editor');
      return;
    }

    // Core CSS is expected to be imported globally (see +layout.svelte)
    // Define a single Abyss-like theme (no extra theme packs)
    try {
        const abyss = {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: '225588' },
                { token: 'type', foreground: '9966B8', fontStyle: 'italic' },
                { token: 'string', foreground: '22AA44' },
                { token: 'number', foreground: 'F280D0' },
                { token: 'comment', foreground: '384887' },
                { token: 'function', foreground: 'DDBB88' },
            ],
            colors: {
                'editor.background': '#000C18',
                'editor.foreground': '#6688CC',
                'editorCursor.foreground': '#DDBB88',
                'editor.selectionBackground': '#770811',
                'editor.lineHighlightBackground': '#082050',
                'editorGutter.background': '#000C18',
                'editorLineNumber.foreground': '#406385',
                'editorActiveLineNumber.foreground': '#80A2C2',
                'editorIndentGuide.background': '#103050',
                'editorBracketMatch.border': '#596f99',
                'editorBracketMatch.background': '#596f9955',
            }
        } as any;
        monaco.editor.defineTheme('abyss', abyss);
        monaco.editor.setTheme('abyss');
    } catch {}

    // Configure TS defaults (no DOM in the lib)
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowJs: false,
      esModuleInterop: false,
      noImplicitAny: false,
      lib: ["esnext"],
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeNext,
      allowNonTsExtensions: true,
    });

    // Load Mava API typings so users get helpful completions
    async function loadMavaDts(): Promise<string> {
      // 1) raw import
      try {
        // @ts-ignore Vite raw import at runtime; types are injected into Monaco only
        const mod = await import('./mava.api.d.ts?raw');
        const dts = (mod as any).default ?? mod as any;
        return String(dts);
      } catch {}
      // 2) URL fetch
      try {
        const url = new URL('./mava.api.d.ts', import.meta.url);
        const res = await fetch(url);
        if (res.ok) return await res.text();
      } catch {}
      // 3) Minimal fallback to avoid "Cannot find name 'Mava'"
      return 'declare interface ReadonlySignal<T>{readonly value:T;subscribe(fn:(v:T)=>void):()=>void;}\n' +
             'declare interface Signal<T> extends ReadonlySignal<T>{set(v:T):void;update(u:(p:T)=>T):void;}\n' +
             'declare type Unsubscribe=()=>void;\n' +
             'declare namespace MavaTypes{type EntityId=string;interface Vector2{x:number;y:number}}\n' +
             'declare interface MavaAPI{readonly time:ReadonlySignal<number>;onTick(fn:(t:number,dt:number)=>Unsubscribe):Unsubscribe;readonly selection:ReadonlySignal<MavaTypes.EntityId|null>;signal<T>(i:T):Signal<T>;computed<T>(c:()=>T):ReadonlySignal<T>;effect(fn:()=>void):Unsubscribe;log(...a:any[]):void;warn(...a:any[]):void;error(...a:any[]):void;setTimeout(fn:()=>void,ms:number):Unsubscribe;setInterval(fn:()=>void,ms:number):Unsubscribe;lerp(a:number,b:number,t:number):number;}\n' +
             'declare const Mava: MavaAPI;\n';
    }
    try {
      const dts = await loadMavaDts();
      monaco.languages.typescript.typescriptDefaults.addExtraLib(dts, 'file:///mava.api.d.ts');
    } catch (e) {
      console.warn('Failed to inject Mava API typings; Mava completions may be limited.', e);
    }

    model = monaco.editor.createModel(code ?? '', 'typescript');
    editor = monaco.editor.create(host, {
        model,
        theme: 'abyss',
        minimap: { enabled: false },
        wordWrap: 'on',
        automaticLayout: true,
        readOnly,
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: true, strings: true },
    });

    sub = editor.onDidChangeModelContent((e: any) => {
        const next = model.getValue();
        onChange?.(next);
        // If last inserted char is '.' then trigger suggestions explicitly
        try {
            if (e.isFlush) return;
            const changes = e.changes || [];
            const last = changes[changes.length - 1];
            if (last?.text === '.') {
                editor.trigger('suggest','editor.action.triggerSuggest',{});
            }
        } catch {}
    });

    // Provide runtime symbols as extra suggestions
    registerRuntimeCompletions();

    commandUnsub = scriptCommands.subscribe((cmd) => {
      if (!cmd) return;
      if (cmd.scriptId !== scriptId) return;
      if (cmd.type === 'insert-text') {
        insertText(cmd.payload.text);
        acknowledgeScriptCommand(cmd.id);
      }
    });

    // Run a small self-test and emit info for the status chip
    await runSelfTest();

    lastScriptId = scriptId;
  });

  // Cleanup when component is destroyed (must be registered during init)
  onDestroy(() => {
    try { sub?.dispose?.(); } catch {}
    try { disposeRtProvider?.dispose?.(); } catch {}
    try { editor?.dispose?.(); } catch {}
    try { model?.dispose?.(); } catch {}
    try { variableTypesDisposable?.dispose?.(); variableTypesDisposable = null; } catch {}
    try { commandUnsub?.(); commandUnsub = null; } catch {}
  });

  // Prop change handling
  $: if (editor && model) {
    // script switch
    if (scriptId !== lastScriptId) {
      model.setValue(code ?? '');
      lastScriptId = scriptId;
    } else {
      const current = model.getValue();
      if (code != null && code !== current) {
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
      }
    }
    // readOnly
    editor.updateOptions({ readOnly });
  }

  $: if (runtimeSymbols && monaco) {
    registerRuntimeCompletions();
  }

  function applyVariableTypeDefs(source: string | null | undefined) {
    if (!monaco) return;
    const nextSource = source ? source.trim() : '';
    if (lastVariableTypeSource === nextSource) return;
    lastVariableTypeSource = nextSource;
    try { variableTypesDisposable?.dispose?.(); } catch {}
    variableTypesDisposable = null;
    if (nextSource) {
      variableTypesDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(nextSource, 'file:///mava.variables.d.ts');
    }
  }

  $: if (monaco) {
    applyVariableTypeDefs(variableTypeDefs);
  }
</script>

<div class="h-full w-full" bind:this={host}>
  <!-- Monaco mounts here -->
</div>

<style>
  :global(.monaco-editor), :global(.monaco-editor-background) {
    background-color: transparent;
  }
</style>
