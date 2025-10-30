/** StyleContext
 *  Describes runtime context for style application (single vs multi selection, element type).
 *  Currently minimal; reserved for future multi-selection mixed state logic.
 */
export interface StyleContext { type: string; multi: boolean; }
/** ControlDescriptor
 *  Config object driving dynamic control rendering. Fields:
 *   - id: stable key
 *   - kind: renderer type (number|color|font|select|segmented|shadow|...)
 *   - label: short UI label
 *   - path: dot path into page/element object to read/write
 *   - options: optional list for select controls
 */
export type ControlKey =
    // shape sizing/positioning
    'width' | 'height' | 'x' | 'y' | 'rotation'
    // colors and stroke
    | 'fillColor' | 'strokeColor' | 'strokeWidth'
    // effects
    | 'shadowLevel' | 'opacity' | 'blur'
    // corners
    | 'radiusTopLeft' | 'radiusTopRight' | 'radiusBottomRight' | 'radiusBottomLeft'
    // padding
    | 'padTop' | 'padRight' | 'padBottom' | 'padLeft'
    // text
    | 'fontFamily' | 'fontSize' | 'fontWeight' | 'textColor' | 'textAlign' | 'fontStyle' | 'textTransform' | 'lineHeight' | 'letterSpacing'
    // page
    | 'orientation'
    // defaults
    | 'defFontFamily' | 'defFontSize' | 'defTextColor';

export type SectionKey = 
    'size' | 'appearance' | 'radius'| 'padding' | 'effects' | 'typography' | 'transform' | 'page' | 'defaultText'

export interface ControlDescriptor { name: ControlKey; label?: string; path?: string; options?: string[]; }
/** StyleSchema groups controls into visual sections for a specific target type. */
export interface StyleSchema { type:string; sections:{ name: SectionKey; title:string; controls:ControlKey[] }[]; }


export const controls: Record<string,ControlDescriptor> = {
    // shape sizing/positioning
    width:{ name:'width', path:'size.dimensions.width', label:'W'},
    height:{ name:'height', path:'size.dimensions.height', label:'H'},
    x:{ name:'x', path:'position.x', label:'X'},
    y:{ name:'y', path:'position.y', label:'Y'},
    rotation :{ name:'rotation', path:'rotation', label:'R°'}, 
    // colors and stroke
    fillColor:{ name:'fillColor', path:'style.fillColor', label:'Fill'},
    strokeColor:{ name:'strokeColor', path:'style.strokeColor', label:'Stroke'},
    strokeWidth:{ name:'strokeWidth', path:'style.strokeWidth', label:'StrokeW'},
    // effects
    shadowLevel:{ name:'shadowLevel', path:'style.shadowLevel', label:'Shadow'},
    opacity:{ name:'opacity', path:'opacity', label:'Opacity'},
    blur:{ name:'blur', path:'style.blur', label:'Blur'},
    // corners
    radiusTopLeft:{ name:'radiusTopLeft', path:'style.borderRadius.dimensions.topLeft', label:`&#x25DC;`},
    radiusTopRight:{ name:'radiusTopRight', path:'style.borderRadius.dimensions.topRight', label:'&#x25DD;'},
    radiusBottomRight:{ name:'radiusBottomRight', path:'style.borderRadius.dimensions.bottomRight', label:'&#x25DF;'},
    radiusBottomLeft:{ name:'radiusBottomLeft', path:'style.borderRadius.dimensions.bottomLeft', label:'&#x25DE;'},
    // padding
    padTop:{ name:'padTop', path:'style.padding.top', label:'Pt'},
    padRight:{ name:'padRight', path:'style.padding.right', label:'Pr'},
    padBottom:{ name:'padBottom', path:'style.padding.bottom', label:'Pb'},
    padLeft:{ name:'padLeft', path:'style.padding.left', label:'Pl'},
    // text
    fontFamily:{ name:'fontFamily', path:'style.fontFamily', label:'Font'},
    fontSize:{ name:'fontSize', path:'style.fontSize', label:'Size'},
    fontWeight:{ name:'fontWeight', path:'style.fontWeight', label:'Weight', options:['light','normal','medium','semibold','bold']},
    textColor:{ name:'textColor', path:'style.color', label:'Color'},
    textAlign:{ name:'textAlign', path:'style.textAlign', label:'Align'},
    fontStyle:{ name:'fontStyle', path:'style.fontStyle', label:'Style', options:['normal','italic']},
    textTransform:{ name:'textTransform', path:'style.textTransform', label:'Transform', options:['none','uppercase','lowercase','capitalize']},
    lineHeight:{ name:'lineHeight', path:'style.lineHeight', label:'LineH'},
    letterSpacing:{ name:'letterSpacing', path:'style.letterSpacing', label:'LetterS'},
    // page
    orientation:{ name:'orientation', path:'metadata.viewport.orientation', label:'Orientation', options:['landscape','portrait']},
    // defaults
};

// Shape-like elements (rectangles, circles, collections) share this schema.
export const shapeSchema: StyleSchema = {
        type:'shape',
        sections:[
            { name: 'size', title: 'Size & Position', controls: ['x', 'width', 'y', 'height', 'rotation']},
            { name: 'typography', title:'Text', controls:['fontFamily', 'fontSize', 'textColor', 'fontWeight', 'textTransform', 'lineHeight', 'letterSpacing', 'textAlign', 'fontStyle']},
            { name: 'appearance', title:'Fill & Stroke', controls:['fillColor','strokeColor','strokeWidth'] },
            { name: 'radius', title:'Corners', controls:['radiusTopLeft','radiusTopRight','radiusBottomRight','radiusBottomLeft'] },
            { name: 'padding', title:'Padding', controls:['padTop','padRight','padBottom','padLeft'] },
            { name: 'effects', title:'Effects', controls:['shadowLevel','opacity', 'blur'] }
        ],
};

// Text-specific styling schema.
export const textSchema: StyleSchema = {
    type:'text',
    sections:[
        { name:'typography', title:'Text', controls:['fontFamily','fontSize','fontWeight','textColor','textAlign'] },
        { name:'transform', title:'Transform', controls:['rotation'] },
        { name:'effects', title:'Effects', controls:['shadowLevel','opacity'] }
    ],
};

// Page-level schema controls overall canvas & default text style seeds.
export const pageSchema: StyleSchema = {
    type:'page',
    sections:[
        { name:'size', title:'Page Size', controls:['width','height', 'orientation'] },
        { name: 'appearance', title: 'Background', controls: ['fillColor']},
        { name:'typography', title:'Default Text Settings', controls:['fontFamily','fontSize','textColor'] }
    ],
};

/** getSchema
 * Returns a schema for element or page type with shape fallback for generic graphical items.
 */
export function getSchema(type:string) {
    if (type==='text') return textSchema;
    if (type==='page') return pageSchema;
    return shapeSchema;
}