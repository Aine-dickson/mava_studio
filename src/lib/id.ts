// Stage 7: ID / Indexing Strategy - monotonic base36 IDs
const STORAGE_KEY = 'studioIdCounters';
type Counters = { m: number; l: number; p: number; e: number };
let counters: Counters = { m: 0, l: 0, p: 0, e: 0 };

function loadPersisted() {
  if (typeof window === 'undefined') return;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const parsed = JSON.parse(raw); if (parsed) counters = { ...counters, ...parsed }; } } catch {}
}
function persist() { if (typeof window === 'undefined') return; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counters)); } catch {} }

export function initIdCounters(projectData: { modulesById: Record<string, any>; lessonsById: Record<string, any>; pagesById: Record<string, any>; }) {
  loadPersisted();
  const bumpIf = (id: string, key: keyof Counters, prefix: string) => { if (!id.startsWith(prefix)) return; const part = id.slice(prefix.length); const n = parseInt(part, 36); if (!isNaN(n) && n > counters[key]) counters[key] = n; };
  for (const id of Object.keys(projectData.modulesById)) bumpIf(id, 'm', 'm_');
  for (const id of Object.keys(projectData.lessonsById)) bumpIf(id, 'l', 'l_');
  for (const id of Object.keys(projectData.pagesById)) bumpIf(id, 'p', 'p_');
  persist();
}

function next(key: keyof Counters) { counters[key] += 1; persist(); return counters[key].toString(36); }
export const generateModuleId = () => `m_${next('m')}`;
export const generateLessonId = () => `l_${next('l')}`;
export const generatePageId = () => `p_${next('p')}`;
export const generateElementId = () => `e_${next('e')}`;

export function resetIdCounters() { counters = { m: 0, l: 0, p: 0, e: 0 }; persist(); }