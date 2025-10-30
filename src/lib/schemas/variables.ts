/** Variable model and scopes for the runtime */

export type VarScope =
  | 'global'
  | 'course'
  | 'module'
  | 'lesson'
  | 'page'
  | 'element';

export interface VariableDef<T = any> {
  id: string; // unique within project
  key: string; // human key
  scope: VarScope;
  initial: T;
  persistent?: boolean; // if true, persisted in project data/user profile
  description?: string;
}

export type VariableValue = any;

export interface VariableRef {
  id: string; // fully qualified id (already scoped)
}

export type VariableMap = Record<string, VariableValue>;
