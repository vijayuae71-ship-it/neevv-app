/**
 * The saved (cloud) project the customer is working on, readable anywhere: render screens tag their
 * output with it, drawing title blocks print its reference. Set by the page from auto-save.
 */
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();

export function setActiveProjectId(id: string | null): void {
  if (id === current) return;
  current = id;
  listeners.forEach((l) => l());
}
export const getActiveProjectId = () => current;

/** Short reference printed on drawings, e.g. "NV-7KQ2M9XA". */
export const projectRef = (id: string | null = current) => (id ? `NV-${id.slice(0, 8).toUpperCase()}` : null);

export function useActiveProjectId(): string | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
}
