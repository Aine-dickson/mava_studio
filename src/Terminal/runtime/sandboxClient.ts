export type Sandbox = {
    run: (code: string) => Promise<void>;
    stop: () => Promise<void>;
    setTime: (t: number, dt: number) => void;
    setSelection: (id: string | null) => void;
    setVar: (name: string, value: any) => void;
    setBuiltin: (payload: { project?: any; timeline?: any; page?: { id: string | null; elements: any[] } }) => void;
    onLog: (cb: (level: 'log'|'warn'|'error', args: any[]) => void) => () => void;
    onEvent: (cb: (event: { type: string; [k: string]: any }) => void) => () => void;
};

export function createSandbox(): Sandbox {
    // @ts-ignore
    const worker = new Worker(new URL('./sandboxWorker.ts', import.meta.url), { type: 'module' });
    const logSubs = new Set<(l:'log'|'warn'|'error', a:any[])=>void>();
    const evtSubs = new Set<(e:any)=>void>();

    worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data || {};
        if (msg.type === 'log') {
        const { level, args } = msg;
        for (const cb of Array.from(logSubs)) try { cb(level, args); } catch {}
        return;
        }
        for (const cb of Array.from(evtSubs)) try { cb(msg); } catch {}
    };

    function post(type: string, payload?: any) { worker.postMessage({ type, payload }); }

    return {
        run: async (code: string) => { post('run', { code }); },
        stop: async () => { post('stop'); },
        setTime: (t: number, dt: number) => post('setTime', { t, dt }),
        setSelection: (id: string | null) => post('setSelection', { id }),
        setVar: (name: string, value: any) => post('setVar', { name, value }),
    setBuiltin: (payload: { project?: any; timeline?: any; page?: { id: string | null; elements: any[] } }) => post('setBuiltin', payload),
        onLog: (cb) => { logSubs.add(cb); return () => logSubs.delete(cb); },
        onEvent: (cb) => { evtSubs.add(cb); return () => evtSubs.delete(cb); },
    };
}
