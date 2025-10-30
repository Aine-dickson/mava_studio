/** Timeline schema (minimal for v1 runtime skeleton) */

export interface CuePoint {
  id: string;
  time: number; // ms
  /**
   * Human-friendly unique name per timeline. Prefer this over label.
   * If both name and label exist, name takes precedence.
   */
  name?: string;
  /** Deprecated: kept for backward compatibility with earlier builds */
  label?: string;
}

export interface TimelineConfig {
  id: string;
  duration: number; // ms
  loop?: boolean;
  cuePoints?: CuePoint[];
}
