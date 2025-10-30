/** Script metadata schema (placeholder for v1) */

export interface ScriptDef {
  id: string;
  name: string;
  scope: 'global' | 'page' | 'element';
  codeTs: string; // TypeScript source
  compiledJs?: string; // may be empty in dev web preview
  enabled?: boolean;
}
