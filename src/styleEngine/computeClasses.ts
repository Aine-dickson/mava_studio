import type { Element } from '../lib/schemas/element';

/** Utility maps translating numeric or semantic tokens into Tailwind-compatible suffixes. */
const radiusMap: Record<number,string> = { 0:'none',2:'sm',4:'',6:'md',8:'lg',12:'xl',16:'2xl',24:'3xl',9999:'full' };
const weightMap: Record<string,string> = { normal:'normal', regular:'normal', bold:'bold', medium:'medium', semibold:'semibold', light:'light' };

/** arbitrary
 * Wraps raw values with Tailwind arbitrary value syntax if not already wrapped.
 */
function arbitrary(v:string) { return v.startsWith('[') ? v : `[${v}]`; }

/** mapRadius
 * Produces appropriate rounded class token given a corner radius value.
 */
function mapRadius(v:number) {
    if (v>=9999) return 'rounded-full';
    const key = Object.keys(radiusMap).map(Number).sort((a,b)=>a-b).find(k=>k===v);
    if (key===undefined) return `rounded-${arbitrary(v+'px')}`;
    const token = radiusMap[key];
    return token===''? 'rounded' : (token==='none'?'rounded-none': `rounded-${token}`);
}

/** colorClass
 * Normalizes palette / raw color inputs into Tailwind utility (palette or arbitrary form).
 */
function colorClass(prefix:string, value:string) {
    if (!value) return '';
    if (/^[a-z]+-\d{1,3}$/i.test(value)) return `${prefix}-${value}`; // palette token e.g. slate-500
    if (/^#|rgb|hsl/i.test(value)) return `${prefix}-[${value}]`;      // raw color -> arbitrary
    return `${prefix}-[${value}]`; // fallback arbitrary (named or custom function)
}

/** opacityClass
 * Maps percentage to closest Tailwind standard token else uses arbitrary value.
 */
function opacityClass(v:number) {
    const pct = Math.max(0, Math.min(100, Math.round(v)));
    const standard = [0,5,10,20,25,30,40,50,60,70,75,80,90,95,100];
    if (standard.includes(pct)) return `opacity-${pct}`;
    return `opacity-[${pct}%]`;
}

/** computeElementClasses
 * Translates element.style + core element properties (e.g., opacity) to Tailwind utility list.
 * Deduplicates and returns stable ordering for class string construction upstream.
 */
export function computeElementClasses(el: Element): string[] {
    const cls: string[] = [];
    const style: any = (el as any).style || {};
    switch(el.type) {
        case 'rectangle':
        case 'ellipse':
        case 'hotspot':
        case 'collection': {
            if (style.fillColor) cls.push(colorClass('bg', style.fillColor));
            if (style.strokeColor || style.strokeWidth) {
                if (style.strokeColor) cls.push(colorClass('border', style.strokeColor));
                const w = style.strokeWidth ?? 1;
                if (w===1) cls.push('border'); else if (w===2) cls.push('border-2'); else cls.push(`border-[${w}px]`);
            }
            if (style.borderRadius?.dimensions) {
                const r = style.borderRadius.dimensions;
                const vals = [r.topLeft,r.topRight,r.bottomRight,r.bottomLeft];
                if (vals.every(v=>v===vals[0])) {
                    cls.push(mapRadius(vals[0]));
                } else {
                    if (r.topLeft!=null) cls.push(`rounded-tl-${arbitrary(r.topLeft+'px')}`);
                    if (r.topRight!=null) cls.push(`rounded-tr-${arbitrary(r.topRight+'px')}`);
                    if (r.bottomRight!=null) cls.push(`rounded-br-${arbitrary(r.bottomRight+'px')}`);
                    if (r.bottomLeft!=null) cls.push(`rounded-bl-${arbitrary(r.bottomLeft+'px')}`);
                }
            }
            if (style.padding) {
                const p = style.padding; // { top,right,bottom,left }
                const vals = [p.top,p.right,p.bottom,p.left];
                if (vals.every(v=>v===vals[0])) cls.push(`p-[${vals[0]}px]`);
                else cls.push(`pt-[${p.top}px]`,`pr-[${p.right}px]`,`pb-[${p.bottom}px]`,`pl-[${p.left}px]`);
            }
            if (style.shadowLevel) {
                const sl = style.shadowLevel;
                if (['sm','md','lg','xl'].includes(sl)) cls.push(sl==='md'?'shadow':'shadow-'+sl); else if (sl==='none'){} else cls.push('shadow');
            }
            break;
        }
        case 'text': {
            if (style.color) cls.push(colorClass('text', style.color));
            if (style.fontSize) {
                const fs = Number(style.fontSize);
                const mapping: Record<number,string> = {12:'text-xs',14:'text-sm',16:'text-base',18:'text-lg',20:'text-xl',24:'text-2xl'};
                if (mapping[fs]) cls.push(mapping[fs]); else cls.push(`text-[${fs}px]`);
            }
            if (style.fontWeight) {
                const w = weightMap[String(style.fontWeight).toLowerCase()] || style.fontWeight;
                if (w && w!=='normal') cls.push('font-'+w);
            }
            if (style.textAlign) {
                const ta = style.textAlign; if (['left','center','right','justify'].includes(ta)) cls.push('text-'+ta);
            }
            break;
        }
    }
    if (el.opacity != null && el.opacity !== 100) cls.push(opacityClass(el.opacity));
    return Array.from(new Set(cls)); // ensure uniqueness
}
