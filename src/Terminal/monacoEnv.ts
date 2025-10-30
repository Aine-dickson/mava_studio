// Wire Monaco workers for Vite (Tauri compatible)
// Vite will turn these into Worker constructors
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
// import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';

// @ts-ignore
self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  }
};
