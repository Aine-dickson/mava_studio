// Lightweight validation & migration for ProjectData (Stage 1)
// Intentionally minimal to avoid runtime overhead; only used at load/import boundaries.

import type { ProjectData, Course, Module, Lesson, Page } from '../schemas/project';
import { CURRENT_PROJECT_VERSION, deepClone } from '../schemas/project';

export interface ValidationResult {
  ok: boolean;
  data?: ProjectData;
  error?: string;
  migrated?: boolean;
}

// Narrow type guards (shallow) -------------------------------------------------
function isObject(v: unknown): v is Record<string, any> { return typeof v === 'object' && v !== null; }
function isArray(v: unknown): v is any[] { return Array.isArray(v); }
function isString(v: unknown): v is string { return typeof v === 'string'; }
function isNumber(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

// Basic structural validators (only fields we critically rely on for boot)
function validatePage(raw: any): raw is Page {
  return isObject(raw) && isString(raw.id) && isArray(raw.elements) && isObject(raw.layouts) && isObject(raw.metadata);
}
function validateLesson(raw: any): raw is Lesson {
  return isObject(raw) && isString(raw.id) && isArray(raw.pages) && isObject(raw.metadata);
}
function validateModule(raw: any): raw is Module {
  return isObject(raw) && isString(raw.id) && isArray(raw.lessons) && isObject(raw.metadata);
}
function validateCourse(raw: any): raw is Course {
  return isObject(raw) && isString(raw.id) && isArray(raw.modules) && isObject(raw.metadata);
}

// Migration placeholder --------------------------------------------------------
function migrateIfNeeded(raw: any): { data?: ProjectData; error?: string; migrated: boolean } {
  if (!isObject(raw)) return { error: 'Root not object', migrated: false };
  // If version missing, assume v0 legacy; wrap migration
  let version = (raw as any).projectVersion;
  if (version == null) {
    // v0 -> v1: inject projectVersion
    version = 1;
    (raw as any).projectVersion = 1;
  }
  if (!isNumber(version)) return { error: 'Invalid projectVersion', migrated: false };
  if (version > CURRENT_PROJECT_VERSION) return { error: 'Project version newer than runtime', migrated: false };

  // Future: handle incremental migrations here.
  return { data: raw as ProjectData, migrated: version !== (raw as any).projectVersion };
}

export function validateAndMigrateProject(raw: unknown): ValidationResult {
  const migrated = migrateIfNeeded(raw as any);
  if (migrated.error) return { ok: false, error: migrated.error, migrated: false };
  const data = migrated.data!;

  if (!validateCourse(data.course)) return { ok: false, error: 'Invalid course', migrated: false };
  if (!isObject(data.modulesById)) return { ok: false, error: 'modulesById missing', migrated: false };
  if (!isObject(data.lessonsById)) return { ok: false, error: 'lessonsById missing', migrated: false };
  if (!isObject(data.pagesById)) return { ok: false, error: 'pagesById missing', migrated: false };

  // Spot check referenced ids exist
  for (const mRef of data.course.modules) {
    if (!data.modulesById[mRef.id]) return { ok: false, error: `Dangling module ref ${mRef.id}`, migrated: false };
  }
  for (const modRaw of Object.values(data.modulesById) as any[]) {
    const mod = modRaw as Module;
    if (!validateModule(mod)) return { ok: false, error: `Invalid module ${mod && (mod as any).id}` };
    for (const lRef of mod.lessons) if (!data.lessonsById[lRef.id]) return { ok: false, error: `Dangling lesson ref ${lRef.id}` };
  }
  for (const lesRaw of Object.values(data.lessonsById) as any[]) {
    const les = lesRaw as Lesson;
    if (!validateLesson(les)) return { ok: false, error: `Invalid lesson ${les && (les as any).id}` };
    for (const pRef of les.pages) if (!data.pagesById[pRef.id]) return { ok: false, error: `Dangling page ref ${pRef.id}` };
  }
  for (const pgRaw of Object.values(data.pagesById) as any[]) {
    const pg = pgRaw as Page;
    if (!validatePage(pg)) return { ok: false, error: `Invalid page ${pg && (pg as any).id}` };
  }

  // Deep clone to decouple from raw storage object (defensive)
  const clean = deepClone(data);
  return { ok: true, data: clean, migrated: migrated.migrated };
}

export function createEmptyProject(): ProjectData {
  // This mirrors initial creation logic; caller may still enhance.
  const now = Date.now();
  return {
    projectVersion: CURRENT_PROJECT_VERSION,
    course: {
      id: 'course-1',
      modules: [{ id: 'module-1', order: 1 }],
      cfNodeIds: [],
      metadata: {
        title: 'Untitled Course',
        description: '',
        duration: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastEditedBy: { userId: 'system', name: 'System' },
        publishedAt: 'pending'
      }
    },
    modulesById: {
      'module-1': {
        id: 'module-1', visible: true, lessons: [{ id: 'lesson-1', order: 1 }], metadata: {
          title: 'Module 1', description: '', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }
        }
      }
    },
    lessonsById: {
      'lesson-1': {
        id: 'lesson-1', type: 'activity', visible: true, pages: [{ id: 'page-1', order: 1 }], metadata: {
          title: 'Lesson 1', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }
        }
      }
    },
    pagesById: {
      'page-1': {
        id: 'page-1', visible: true, elements: [], backgroundColor: '#ffffff',
        layouts: {
          desktop: { stageSize: { width: 1280, height: 720 }, elementProps: {} },
          tablet: { stageSize: { width: 1024, height: 768 }, elementProps: {} },
          mobile: { stageSize: { width: 375, height: 667 }, elementProps: {} }
        },
        metadata: {
          title: 'Page 1', duration: 0, version: 1, createdAt: now, updatedAt: now, lastEditedBy: { userId: 'system', name: 'System' }
        }
      }
    }
  };
}
