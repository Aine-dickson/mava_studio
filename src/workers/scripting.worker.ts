// Scripting worker (very minimal, no real sandbox API yet)

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: 'init' | 'eval'; id?: string; payload?: any };
  try {
    switch (msg.type) {
      case 'init': {
        // Future: wire mava API capabilities provided via payload
        break;
      }
      case 'eval': {
        let result: any = undefined;
        // Extremely naive and unsafe eval placeholder; in real impl, use a safer interpreter or restricted Function with injected API.
        // eslint-disable-next-line no-new-func
        const fn = new Function('mava', msg.payload as string);
        result = fn({});
        (self as any).postMessage({ type: 'result', id: msg.id, payload: result });
        break;
      }
    }
  } catch (err: any) {
    (self as any).postMessage({ type: 'error', payload: String(err?.message || err) });
  }
};
