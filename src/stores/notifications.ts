import { writable } from 'svelte/store';

/** Unified notification object */
export interface AppNotification {
  id: string;
  type: 'info' | 'warn' | 'error';
  message: string;
  ts: number;
  ttl?: number; // auto-dismiss after ttl ms
}

const notifications = writable<AppNotification[]>([]);
export { notifications };

function newId() { return 'n_' + Math.random().toString(36).slice(2, 10); }

export function addNotification(message: string, opts: { type?: 'info'|'warn'|'error'; ttl?: number } = {}) {
  const note: AppNotification = { id: newId(), type: opts.type ?? 'info', message, ts: Date.now(), ttl: opts.ttl ?? 4000 };
  notifications.update(l => [note, ...l]);
  if (note.ttl) setTimeout(() => dismissNotification(note.id), note.ttl);
  return note.id;
}
export function dismissNotification(id: string) { notifications.update(l => l.filter(n => n.id !== id)); }
export function clearNotifications() { notifications.set([]); }

// Specific helpers
export function notifyLockedMultiSelect() { addNotification('Locked element cannot be added to multi-selection', { type: 'warn' }); }
export function notifyLockedInteraction() { addNotification('Element is locked', { type: 'warn', ttl: 2500 }); }
export function notifyHiddenSelection() { addNotification('Element is hidden (visibility off)', { type: 'info', ttl: 2500 }); }
