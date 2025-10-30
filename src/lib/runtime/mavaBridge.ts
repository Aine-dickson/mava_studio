/** Worker bridge stub for scripting. */

export interface BridgeMessage {
  type: 'init' | 'eval' | 'result' | 'error';
  id?: string;
  payload?: any;
}

export class MavaBridge {
  private worker: Worker;
  private pending = new Map<string, (value: any) => void>();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (ev) => {
      const msg = ev.data as BridgeMessage;
      if (msg.type === 'result' && msg.id) {
        this.pending.get(msg.id)?.(msg.payload);
        this.pending.delete(msg.id);
      } else if (msg.type === 'error') {
        console.error('[Script error]', msg.payload);
      }
    };
  }

  init(payload: any) {
    this.worker.postMessage({ type: 'init', payload } satisfies BridgeMessage);
  }

  eval(code: string): Promise<any> {
    const id = Math.random().toString(36).slice(2);
    const p = new Promise<any>((resolve) => this.pending.set(id, resolve));
    this.worker.postMessage({ type: 'eval', id, payload: code } satisfies BridgeMessage);
    return p;
  }
}
