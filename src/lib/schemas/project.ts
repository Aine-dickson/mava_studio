import type { Element } from './element';

// Project data schema version (increment on breaking structural changes)
export const CURRENT_PROJECT_VERSION = 1 as const;

interface LayoutProps {
    stageSize: { width: number; height: number };
    elementProps: Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }>;
}

export type Page = {
    id: string;
    visible: boolean;
    elements: Element[];
    backgroundColor: string;
    layouts: Record<'desktop' | 'tablet' | 'mobile', LayoutProps>;
    metadata: {
        title: string;
                duration: number; // minutes estimate
                description?: string;
                url?: string;
                version: number;
                createdAt: number;
                updatedAt: number;
        lastEditedBy: {
            userId: string;
            name: string;
        };
                // Optional extras
                tags?: string[];
                thumbnailUrl?: string;
        };
};

export type Lesson = {
    id: string;
    type: "activity" | "assessment";
    visible: boolean;
    pages: {
        id: string;       // page id
        order: number;    // position in the lesson (1-based)
    }[];
    cfNodeIds?: string[];  // linked competence framework node IDs
    summary?: string; // optional summary text
    metadata: {
        title: string;
                description?: string;
                duration: number; // minutes
                url?: string;
                version: number;
                createdAt: number;
                updatedAt: number;
        lastEditedBy: {
            userId: string;
            name: string;
        };
                // From course docs
                estimatedCompletionTime?: number;
                required?: boolean;
                autoComplete?: boolean; // auto complete on view
                prerequisites?: string[]; // lesson ids
                tags?: string[];
    };
};

export type Module = {
    id: string;
    visible: boolean;
    lessons: {
        id: string;
        order: number;
    }[];
    notes?: string;
    cfNodeIds?: string[];
    metadata: {
        title: string;
                description?: string;
                duration: number; // minutes total
                url?: string;
                version: number;
                createdAt: number;
                updatedAt: number;
        lastEditedBy: {
            userId: string;
            name: string;
        };
                // From course docs
                overview?: string;
                estimatedCompletionTime?: number;
                prerequisites?: string[]; // module ids
                unlockConditions?: string[];
                tags?: string[];
    };
};


export type Course = {
    id: string;
    modules: {
        id: string;
        order: number;
    }[];
    cfNodeIds: string[];  // root competency nodes covered by the course
    metadata: {
        title: string;
                subtitle?: string;
                description: string;
                category?: string;
                targetAudience?: string;
                difficulty?: 'beginner' | 'intermediate' | 'advanced';
                duration: number; // minutes
                prerequisites?: string[];
                tags?: string[];
                coverImage?: string;
                author?: string;
                languages?: string[];
                visibility?: 'public' | 'private' | 'draft';
                licensing?: string;
                pricing?: { type: 'free' | 'one-time' | 'subscription'; amount?: number; currency?: string };
                releaseSchedule?: 'all-at-once' | 'drip';
                completionRequirements?: string[];
                url?: string;
                publishedAt: number | 'pending'; // timestamp or 'pending' for draft
                version: number;
                createdAt: number;
                updatedAt: number;
        lastEditedBy: {
            userId: string;
            name: string;
        };
    };
};

// ---- Normalized project container ----
// Designed for multi-level history: content entities live in maps by id; 
// parent scopes maintain ordered references (id + order) to children.
export type ProjectData = {
    projectVersion: number; // semantic schema version for migrations
    course: Course;
    modulesById: Record<string, Module>;
    lessonsById: Record<string, Lesson>;
    pagesById: Record<string, Page>;
};

// Optional: metadata for history coordination (not persisted to backend by default)
export type HistoryMeta = {
    lastCommitAt: number;
    lastCommitId?: string;
    rev?: number;
};

// Prefer structuredClone when available (preserves richer types if introduced later)
export function deepClone<T>(obj: T): T {
    // @ts-ignore structuredClone global may not be in lib target
    if (typeof structuredClone === 'function') return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}