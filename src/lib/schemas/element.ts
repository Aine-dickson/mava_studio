/**
 * Discriminated union of all element kinds that can appear on a page / inside a collection.
*
* NOTE: When adding a new type make sure to:
*  - Extend the `Element` union below with the appropriate style payload.
*  - Update any switch statements (renderers, class computation, creation helpers, history logic).
*  - Consider isolation / nesting semantics if it can contain children.
*/
export type ElementType =
| 'line'
| 'rectangle'
| 'ellipse'
| 'path'
| 'text'
| 'image'
| 'hotspot'
| 'collection'
| 'component'
| 'polygon';

export type ShapePreset = 
| 'square'
| 'circle'
| 'triangle'
| 'hexagon'
| 'star'
| 'arrow'


/** Standard easing keywords for animation timelines. */
type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** DOM‑like events we surface for element trigger bindings. */
export type ElementEvent = 'click' | 'dblclick' | 'mouseenter' | 'mouseleave' | 'pointerdown' | 'pointerup' | 'keypress';

/**
 * A trigger binds an event to one or more actions (mini behaviour graph).
 * Actions are intentionally loose (type + params) so new behaviour can be added
 * without requiring a schema migration for existing documents.
*/
export type ElementTrigger = {
    /** Stable id (used by history + editing panels). */
    id: string;
    /** Event that fires this trigger. */
    event: ElementEvent;
    /** Ordered list of side‑effects (navigation, animation, property mutation, etc.). */
    actions: Array<{ type: string; params?: Record<string, unknown> }>; // e.g., navigate, playAnimation, setProp
};

/**
 * Lightweight keyframe animation descriptor.
 * Only simple numeric properties are supported for now (position, size, opacity, rotation).
*/
export type ElementAnimation = {
    id: string;
    /** Friendly name shown in timeline / inspector. */
    name?: string;
    /** Starting property overrides (falls back to current element state if omitted). */
    from?: Partial<{ x: number; y: number; width: number; height: number; opacity: number; rotation: number }>;
    /** Target property values (only specified keys animate). */
    to: Partial<{ x: number; y: number; width: number; height: number; opacity: number; rotation: number }>;
    /** Duration in milliseconds. */
    duration: number; // ms
    /** Optional initial delay before playing (ms). */
    delay?: number; // ms
    /** Easing function keyword. */
    easing?: Easing;
    /** If true the animation restarts automatically. */
    loop?: boolean;
};

/**
 * Properties shared by every element variant.
 * Keep this intentionally compact – large optional branches should live in variant style objects.
 */
interface BaseElement {
    /** Stable identifier (persisted in history and references). */
    id: string;
    /** Human readable name (layers panel, search). */
    name: string;
    /** Discriminant. */
    type: ElementType;
    /** Local position relative to parent collection (or stage if root). */
    position: { x: number; y: number };
    /** 2D size + optional lock (for uniform scaling / maintaining square). */
    size: {
        dimensions:{ width: number; height: number }
        /** When true editing width automatically updates height (and vice‑versa). */
        locked?: boolean; // if true, change in one dimension affects the other
    };
    /** Parent collection id if nested. Undefined => root element. */
    parentId?: string; // collection parent if nested
    /** Simple drop shadow styling. */
    shadow: { color: string; offsetX: number; offsetY: number; blur: number };
    /** Rotation in degrees (clockwise). */
    rotation: number;
    /** Opacity 0..1 (mirrors style schema). */
    opacity: number;
    /** Blur effect radius (pixels). */
    blur: number;
    /** Visibility toggle (hidden elements ignored by selection / snapping). */
    visible: boolean;
    /** Interactivity toggle (Locked elements can't be edited or formated but can be selected for inspection) */
    locked: boolean;
    /** Rendering (stacking) order – higher = front. */
    zIndex: number;
    /** Attaches this element as an instance of a given Component's Id */
    parentComponentId?: string; // if is instance of a component, the component id
    /** Cached Tailwind utility string – computed dynamically (see computeElementClasses). */
    appliedClasses?: string[]; // Tailwind utility classes computed from style
    // Behaviors / interaction
    /** Imperative callable methods (future expansion). */
    methods?: Array<{ name: string; params?: Record<string, unknown> }>; // callable methods
    /** Event -> actions mapping. */
    triggers?: ElementTrigger[];
    /** Optional animation clips bound to this element. */
    animations?: ElementAnimation[];
}

/** Styling for pure text elements. */
interface TextStyle {
    inlineStyle: InlineTextStyle;
    textDecoration: 'underline' | 'line-through' | 'none';
    lineHeight: number; // em
    letterSpacing: number; // em
    wordSpacing: number; // em
    
    whiteSpace: 'normal' | 'nowrap' | 'pre' | 'pre-wrap' | 'pre-line';
    /** Text shadow effect. */
    textShadow: { color: string; offsetX: number; offsetY: number; blur: number };
    /** Text vertical alignment within element box. */
    verticalAlign: 'top' | 'middle' | 'bottom';
    /** Vertical placement within containing shape (experimental). */
    placement: 'top' | 'bottom' | 'middle';
    /** Optional substring highlight region. */
    highlight: {
        color: string;
        start: number;
        end: number;
    }
    /** Raw textual content. */
    content: string;
}

interface InlineTextStyle {
    content: string;
    fontSize: number;
    fontFamily?: string;
    textColor: string;
    fontStyle: 'italic' | 'normal';
    textAlign: 'left' | 'center' | 'right';
    fontWeight: 'normal' | 'bold' | 'black' | 'semibold' | 'medium' | 'light' | number; // number = 100..900
    textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    lineHeight?: number;
    letterSpacing?: number;
}

/** Shared styling for simple shapes (rect, circle, hotspot, collection container). */
interface ShapeStyle extends LineStyle {
    fillColor: string;
    /** Internal padding (used when shape houses text / children). */
    padding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    borderRadius: {
        dimensions: {
            topLeft: number;
            topRight: number;
            bottomRight: number;
            bottomLeft: number;
        }
        /** When true all corners mirror topLeft value. */
        locked: boolean; // if true, all corners have same radius
    };
    /** Optional embedded text styling. */
    textContent?: InlineTextStyle;
}

/** Style subset for straight line elements. */
interface LineStyle {
    strokeColor: string;
    strokeWidth: number;
    strokeStyle: 'solid' | 'dashed' | 'dotted';
    start?: 'none' | 'arrow' | 'circle' | 'square' | 'diamond' | 'tee' | 'vee';
    end?: 'none' | 'arrow' | 'circle' | 'square' | 'diamond' | 'tee' | 'vee';
}

interface PathStyle extends LineStyle {
    closed: boolean;
    smooth: boolean;
}

/** Commands used to define the path of a free form element */
type PathCommand = 
    | { type: 'M'; x: number; y: number } // Move to
    | { type: 'L'; x: number; y: number } // Line to
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } // Cubic Bezier
    | { type: 'Q'; x1: number; y1: number; x: number; y: number } // Quadratic Bezier
    | { type: 'Z' }; // Close path

interface PolygonStyle extends ShapeStyle {
    /** The number of sides (system default polygons define their starting values). */
    sides: number;
    /** Radius of the polygon (distance from center to vertices). */
    radius: number;
}

/** Image specific styling + transformation filters. */
interface ImageStyle {
    src: string;
    alt: string;
    fit: 'cover' | 'contain' | 'fill';
    borderRadius: number;
    opacity: number;
    filters: { brightness: number; contrast: number; grayscale: number; blur: number };
}

/**
 * Final discriminated union tying each element `type` to its style payload.
 * Collections carry an additional `memberIds` list (composition) – their children
 * live as independent Element entries for simpler indexing / history, but inherit
 * relative positioning via `parentId`.
 */
export type Element =
    | (BaseElement & { type: 'line'; style: LineStyle })
    | (BaseElement & { type: 'path'; style: PathStyle, commands: PathCommand[] })
    | (BaseElement & { type: 'rectangle' | 'ellipse' | 'hotspot'; style: ShapeStyle })
    | (BaseElement & { type: 'polygon'; style: PolygonStyle })
    | (BaseElement & { type: 'text'; style: TextStyle })
    | (BaseElement & { type: 'image'; style: ImageStyle })
    | (BaseElement & { type: 'component'; memberIds: string[], style: ShapeStyle })
    | (BaseElement & { type: 'collection'; memberIds: string[]; style: ShapeStyle });