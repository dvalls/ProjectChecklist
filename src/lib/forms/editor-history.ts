import type { LayoutMode } from "@/lib/supabase/types";
import type { EditorField, EditorSection } from "@/components/form-builder/editor-model";

export type EditorSnapshot = {
  name: string;
  description: string;
  layoutMode: LayoutMode;
  environments: string[];
  sections: EditorSection[];
  fields: EditorField[];
};

export type EditorHistory<T> = {
  past: T[];
  future: T[];
  coalesceKey: string | null;
};

const HISTORY_LIMIT = 50;

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "email",
  "tel",
  "password",
  "number",
  "date",
]);

export function createEditorHistory<T>(): EditorHistory<T> {
  return { past: [], future: [], coalesceKey: null };
}

export function snapshotsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function trimOldest<T>(entries: T[]) {
  while (entries.length > HISTORY_LIMIT) entries.shift();
}

export function closeCoalesce<T>(history: EditorHistory<T>, current: T) {
  if (!history.coalesceKey) return;
  const baseline = history.past[history.past.length - 1];
  if (baseline !== undefined && snapshotsEqual(baseline, current)) {
    history.past.pop();
  }
  history.coalesceKey = null;
}

export function pushDiscrete<T>(history: EditorHistory<T>, current: T) {
  closeCoalesce(history, current);
  history.future = [];
  const top = history.past[history.past.length - 1];
  if (top !== undefined && snapshotsEqual(top, current)) return;
  history.past.push(structuredClone(current));
  trimOldest(history.past);
}

export function pushCoalesced<T>(history: EditorHistory<T>, key: string, current: T) {
  if (history.coalesceKey === key) return;
  closeCoalesce(history, current);
  history.future = [];
  history.past.push(structuredClone(current));
  trimOldest(history.past);
  history.coalesceKey = key;
}

export function undo<T>(history: EditorHistory<T>, current: T): T | null {
  closeCoalesce(history, current);
  const snapshot = history.past.pop();
  if (snapshot === undefined) return null;
  history.future.push(structuredClone(current));
  trimOldest(history.future);
  return snapshot;
}

export function redo<T>(history: EditorHistory<T>, current: T): T | null {
  closeCoalesce(history, current);
  const snapshot = history.future.pop();
  if (snapshot === undefined) return null;
  history.past.push(structuredClone(current));
  trimOldest(history.past);
  return snapshot;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  const node = target instanceof Node ? target : null;
  const element = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  if (!element) return false;
  if (element.isContentEditable || element.closest("[contenteditable='true']")) {
    return true;
  }
  const field = element.closest("input, textarea");
  if (field instanceof HTMLTextAreaElement) return true;
  if (field instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(field.type);
  return false;
}
