import { writable } from 'svelte/store';

export type PalettePayload = {
  value?: string;
  label?: string;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
};

export type PaletteState = {
  open: boolean;
  value?: string;
  original?: string;
  label?: string;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
};

const noop = () => {};

const init: PaletteState = {
  open: false,
  value: undefined,
  original: undefined,
  label: undefined,
  onPreview: noop,
  onCommit: noop,
};

const _state = writable<PaletteState>({ ...init });

function openPalette(payload: PalettePayload) {
  _state.update(() => ({
    open: true,
    value: payload.value,
    original: payload.value,
    label: payload.label,
    onPreview: payload.onPreview,
    onCommit: payload.onCommit,
  }));
}

function closePalette(commit = false) {
  _state.update((s) => {
    if (!commit && s.original !== undefined) {
      s.onPreview(s.original);
      s.onCommit(s.original);
    }
    return { ...init, open: false };
  });
}

function preview(color: string) {
  _state.update((s) => {
    s.value = color;
    s.onPreview(color);
    return s;
  });
}

function commit(color: string) {
  _state.update((s) => {
    s.value = color;
    s.onPreview(color);
    s.onCommit(color);
    return { ...init, open: false };
  });
}

export const palette = {
  subscribe: _state.subscribe,
  openPalette,
  closePalette,
  preview,
  commit,
};
