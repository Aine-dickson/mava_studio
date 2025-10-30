type Placement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export type TooltipParams = {
    content: string;
    placement?: Placement;
    offset?: number;
    delay?: number;
};

function createTooltipEl(text: string) {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
        position: 'fixed',
        zIndex: '10000',
        pointerEvents: 'none',
        background: 'rgba(60,60,60,0.95)', // VS Code-like dark
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        lineHeight: '1',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        whiteSpace: 'nowrap',
        opacity: '0',
        transform: 'translateY(-2px)',
        transition: 'opacity 80ms ease, transform 80ms ease',
    } as CSSStyleDeclaration);
    return el;
}

function placeTooltip(target: Element, tip: HTMLElement, placement: Placement, offset: number, arrow?: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fits = {
        top: rect.top - offset - tipRect.height >= 0,
        bottom: rect.bottom + offset + tipRect.height <= vh,
        left: rect.left - offset - tipRect.width >= 0,
        right: rect.right + offset + tipRect.width <= vw,
    };

        let chosen: Placement = placement;
    if (placement === 'auto') {
        // Prefer right, bottom, left, top
        if (fits.right) chosen = 'right';
        else if (fits.bottom) chosen = 'bottom';
        else if (fits.left) chosen = 'left';
        else chosen = 'top';
    } else {
        // If requested placement doesn't fit, fall back
        if (
            (placement === 'right' && !fits.right) ||
            (placement === 'bottom' && !fits.bottom) ||
            (placement === 'left' && !fits.left) ||
            (placement === 'top' && !fits.top)
        ) {
            return placeTooltip(target, tip, 'auto', offset);
        }
    }

    let top = 0, left = 0;
    if (chosen === 'right') {
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + offset;
    } else if (chosen === 'left') {
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - offset;
    } else if (chosen === 'bottom') {
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
    } else { // top
        top = rect.top - tipRect.height - offset;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
    }

    // Clamp into viewport horizontally
    left = Math.max(4, Math.min(left, vw - tipRect.width - 4));
    top = Math.max(4, Math.min(top, vh - tipRect.height - 4));

        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;

        // Position arrow if provided
        if (arrow) {
            const size = 8; // arrow square size
            // Ensure same color as tooltip background
            const bg = getComputedStyle(tip).backgroundColor || 'rgba(60,60,60,0.95)';
            Object.assign(arrow.style, {
                background: bg,
                width: `${size}px`,
                height: `${size}px`,
                position: 'absolute',
                transform: 'rotate(45deg)',
                pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            } as CSSStyleDeclaration);

            // reset sides
            arrow.style.top = '';
            arrow.style.bottom = '';
            arrow.style.left = '';
            arrow.style.right = '';

            if (chosen === 'right') {
                // center vertically on left edge
                arrow.style.top = '50%';
                arrow.style.left = `${-size / 2}px`;
                arrow.style.transform = 'translateY(-50%) rotate(45deg)';
            } else if (chosen === 'left') {
                arrow.style.top = '50%';
                arrow.style.right = `${-size / 2}px`;
                arrow.style.transform = 'translateY(-50%) rotate(45deg)';
            } else if (chosen === 'bottom') {
                arrow.style.top = `${-size / 2}px`;
                arrow.style.left = '50%';
                arrow.style.transform = 'translateX(-50%) rotate(45deg)';
            } else { // top
                arrow.style.bottom = `${-size / 2}px`;
                arrow.style.left = '50%';
                arrow.style.transform = 'translateX(-50%) rotate(45deg)';
            }
        }
}

export function tooltip(node: Element, params: TooltipParams | string) {
    if (typeof window === 'undefined') return {};

    let content = typeof params === 'string' ? params : params.content;
    let placement: Placement = typeof params === 'string' ? 'auto' : params.placement ?? 'auto';
    let offset = typeof params === 'string' ? 8 : params.offset ?? 8;
    let delay = typeof params === 'string' ? 200 : params.delay ?? 200;

        let tipEl: HTMLElement | null = null;
        let arrowEl: HTMLElement | null = null;
    let showTimer: number | null = null;

    function show() {
        if (tipEl || !content) return;
        tipEl = createTooltipEl(content);
        // Create arrow element inside tip for easy positioning relative to tip box
        arrowEl = document.createElement('div');
        tipEl.appendChild(arrowEl);
        document.body.appendChild(tipEl);
        // Position after in DOM to get accurate size
        placeTooltip(node, tipEl, placement, offset, arrowEl);
        requestAnimationFrame(() => {
            if (tipEl) {
                tipEl.style.opacity = '1';
                tipEl.style.transform = 'translateY(0)';
            }
        });
    }

    function hide() {
        if (!tipEl) return;
        const el = tipEl;
        tipEl = null;
        arrowEl = null;
        el.style.opacity = '0';
        el.style.transform = 'translateY(-2px)';
        setTimeout(() => {
            el.remove();
        }, 120);
    }

    function onEnter() {
        if (showTimer) window.clearTimeout(showTimer);
        showTimer = window.setTimeout(show, delay);
    }
    function onLeave() {
        if (showTimer) window.clearTimeout(showTimer);
        showTimer = null;
        hide();
    }
        function onMove() {
            if (tipEl) placeTooltip(node, tipEl, placement, offset, arrowEl || undefined);
    }

    node.addEventListener('mouseenter', onEnter);
    node.addEventListener('mouseleave', onLeave);
    node.addEventListener('focus', onEnter);
    node.addEventListener('blur', onLeave);
    node.addEventListener('pointermove', onMove);

    return {
        update(newParams: TooltipParams | string) {
            content = typeof newParams === 'string' ? newParams : newParams.content;
            placement = typeof newParams === 'string' ? 'auto' : newParams.placement ?? 'auto';
            offset = typeof newParams === 'string' ? 8 : newParams.offset ?? 8;
            delay = typeof newParams === 'string' ? 200 : newParams.delay ?? 200;
                    if (tipEl) {
                tipEl.textContent = content;
                        // Ensure arrow exists after update
                        if (!arrowEl) {
                            arrowEl = document.createElement('div');
                            tipEl.appendChild(arrowEl);
                        }
                        placeTooltip(node, tipEl, placement, offset, arrowEl);
            }
        },
        destroy() {
            node.removeEventListener('mouseenter', onEnter);
            node.removeEventListener('mouseleave', onLeave);
            node.removeEventListener('focus', onEnter);
            node.removeEventListener('blur', onLeave);
            node.removeEventListener('pointermove', onMove);
            if (showTimer) window.clearTimeout(showTimer);
            hide();
        }
    };
}
