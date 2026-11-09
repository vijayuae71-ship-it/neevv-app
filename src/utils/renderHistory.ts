'use client';

/**
 * Per-browser list of the renders made for a design, so they are still there after a reload.
 * Only addresses are kept (the images live in the server's render store), so this stays small.
 */
export type SavedRender = { imageData: string; timestamp: number; isEdited?: boolean };

/** Short, stable id of a design (rooms, sizes, style) used to file its renders. */
export function designId(...parts: unknown[]): string {
  const s = JSON.stringify(parts);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const KEY = (design: string, slot: string) => `neevv:renders:${design}:${slot}`;
/** Only stored addresses survive; inline images (when the store was unavailable) are too big to keep. */
const keepable = (r: SavedRender) => typeof r.imageData === 'string' && r.imageData.startsWith('/api/render-image/');

export function loadRenders(design: string, slot: string): SavedRender[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(design, slot)) || '[]');
    return Array.isArray(v) ? v.filter(keepable).slice(-12) : [];
  } catch { return []; }
}

export function saveRenders(design: string, slot: string, list: SavedRender[]): void {
  try { localStorage.setItem(KEY(design, slot), JSON.stringify(list.filter(keepable).slice(-12))); } catch { /* storage full or blocked: renders still show this session */ }
}
