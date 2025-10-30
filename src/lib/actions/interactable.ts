import type { Action } from 'svelte/action';

export type DragOpts = {
  enabled?: boolean;
  onStart?: (e: any) => void;
  onMove?: (e: any) => void;
  onEnd?: (e: any) => void;
};

export type ResizeOpts = {
  enabled?: boolean;
  edges?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
  onStart?: (e: any) => void;
  onMove?: (e: any) => void;
  onEnd?: (e: any) => void;
};

export type InteractableParams = {
  drag?: DragOpts | boolean;
  resize?: ResizeOpts | boolean;
};

export const interactable: Action<HTMLElement, InteractableParams> = (node, params) => {
  let disposed = false;
  let instance: any = null;
  let initPromise: Promise<void> | null = null;

  async function ensureInstance() {
    if (instance || disposed) return;
    if (!initPromise) {
      initPromise = import('interactjs').then(({ default: interact }) => {
        if (disposed) return;
        instance = interact(node);
      });
    }
    await initPromise;
  }

  function applyConfig() {
    if (!instance) return;
    const drag = typeof params?.drag === 'object' ? params.drag : { enabled: !!params?.drag };
    const resize = typeof params?.resize === 'object' ? params.resize : { enabled: !!params?.resize };

    if (drag?.enabled) {
      instance.draggable({
        listeners: {
          start: (e: any) => drag.onStart?.(e),
          move: (e: any) => drag.onMove?.(e),
          end: (e: any) => drag.onEnd?.(e)
        }
      });
    } else if (instance.draggable) {
      instance.draggable(false);
    }

    if (resize?.enabled) {
      instance.resizable({
        edges: resize.edges ?? { right: true, bottom: true },
        listeners: {
          start: (e: any) => resize.onStart?.(e),
          move: (e: any) => resize.onMove?.(e),
          end: (e: any) => resize.onEnd?.(e)
        }
      });
    } else if (instance.resizable) {
      instance.resizable(false as any);
    }
  }

  ensureInstance().then(applyConfig);

  return {
    update(next) {
      params = next;
      if (instance) applyConfig();
      else ensureInstance().then(applyConfig);
    },
    destroy() {
      disposed = true;
      try { instance?.unset?.(); } catch {}
      instance = null;
    }
  };
};
