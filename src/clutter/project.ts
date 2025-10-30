// src/lib/schemas/course.ts

/** Top-level course, history scope: course-wide settings, module order */
export interface Course {
  id: string;
  metadata: {
    title: string;
    subtitle?: string;
    description?: string;
    category?: string;
    targetAudience?: string;
    difficulty?: string;
    estimatedDuration?: number;
    prerequisites?: string[];
    tags?: string[];
    coverImage?: string;
    author?: string;
    language?: string;
    visibility?: 'public' | 'private' | 'draft';
    licensing?: string;
    pricing?: string;
    releaseSchedule?: 'all' | 'drip';
    completionRequirements?: string[];
    createdAt: number;
    updatedAt: number;
    publishedAt?: number | 'pending';
    version: number;
    lastEditedBy?: { userId: string; name: string };
  };
  modules: ModuleRef[]; // ordered list of modules
}

export interface ModuleRef {
  id: string;
  order: number;
}

/** Module, history scope: module metadata, lesson order */
export interface Module {
  id: string;
  metadata: {
    title: string;
    overview?: string;
    estimatedTime?: number;
    prerequisites?: string[];
    unlockConditions?: string[];
    createdAt: number;
    updatedAt: number;
    version: number;
    lastEditedBy?: { userId: string; name: string };
  };
  lessons: LessonRef[]; // ordered list of lessons
  notes?: string;
}

export interface LessonRef {
  id: string;
  order: number;
}

/** Lesson, history scope: lesson metadata, page order */
export interface Lesson {
  id: string;
  metadata: {
    title: string;
    summary?: string;
    estimatedTime?: number;
    createdAt: number;
    updatedAt: number;
    version: number;
    lastEditedBy?: { userId: string; name: string };
  };
  pages: PageRef[]; // ordered list of pages
}

export interface PageRef {
  id: string;
  order: number;
}

/** Page, history scope: layout, block/element add/remove, element-level commits */
export interface Page {
  id: string;
  metadata: {
    title: string;
    duration?: number;
    description?: string;
    createdAt: number;
    updatedAt: number;
    version: number;
    lastEditedBy?: { userId: string; name: string };
  };
  blocks: Block[]; // ordered list of blocks/elements
  layout?: LayoutProps; // optional for visual editor
  backgroundColor?: string;
  visible?: boolean;
}

/** Block/Element, history scope: internal editing session (text/code) */
export type Block =
  | TextBlock
  | MediaBlock
  | QuizBlock
  | CodeBlock
  | MathBlock
  | ActivityBlock
  | NoteBlock
  | DownloadBlock
  | CustomBlock; // extensible

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
    fontWeight?: 'normal' | 'bold' | 'italic';
    highlight?: { color: string; start: number; end: number };
  };
  internalHistory?: ScopedHistory<string>; // for text editing session
}

export interface MediaBlock {
  id: string;
  type: 'media';
  mediaType: 'image' | 'video' | 'audio' | 'diagram';
  src: string;
  alt?: string;
  style?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill';
    borderRadius?: number;
    opacity?: number;
    filters?: { brightness?: number; contrast?: number; grayscale?: number; blur?: number };
  };
}

export interface QuizBlock {
  id: string;
  type: 'quiz';
  quizType: 'multiple-choice' | 'true-false' | 'fill-in' | 'matching';
  question: string;
  options: string[];
  answer: string | string[];
  feedback?: string;
}

export interface CodeBlock {
  id: string;
  type: 'code';
  language: string;
  code: string;
  internalHistory?: ScopedHistory<string>; // for code editing session
}

export interface MathBlock {
  id: string;
  type: 'math';
  formula: string;
  renderer?: 'KaTeX' | 'MathJax';
}

export interface ActivityBlock {
  id: string;
  type: 'activity';
  activityType: string;
  instructions: string;
  resources?: string[];
}

export interface NoteBlock {
  id: string;
  type: 'note';
  content: string;
  style?: { color?: string; icon?: string };
}

export interface DownloadBlock {
  id: string;
  type: 'download';
  fileUrl: string;
  label?: string;
}

export interface CustomBlock {
  id: string;
  type: string; // for extensibility
  [key: string]: any;
}

/** LayoutProps for visual editor (optional) */
export interface LayoutProps {
  stageSize?: { width: number; height: number };
  elementProps?: Record<string, { position: { x: number; y: number }; size: { width: number; height: number } }>;
}

/** Generic scoped history for any level */
export interface ScopedHistory<T> {
  past: T[];
  future: T[];
  current: T;
}