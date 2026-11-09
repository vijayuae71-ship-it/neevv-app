'use client';

import { authFetch } from '@/utils/authFetch';
import { getActiveProjectId } from '@/utils/activeProject';

/** Browser side of the project register: batches tags (drawings come in bursts) and reads the register. */
export type AssetTag = { kind: 'render' | 'interior_render' | 'ar_model' | 'drawing'; key: string; url?: string; title?: string; sheetNo?: string; floor?: string; view?: string; roomId?: string; roomName?: string; edited?: boolean };
export type RegisteredAsset = AssetTag & { updatedAt?: string };

let queue: { projectId: string; asset: AssetTag }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const byProject = new Map<string, AssetTag[]>();
  for (const q of queue.splice(0)) byProject.set(q.projectId, [...(byProject.get(q.projectId) ?? []), q.asset]);
  for (const [projectId, assets] of byProject) {
    for (let i = 0; i < assets.length; i += 60) {
      try { await authFetch('/api/project-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, assets: assets.slice(i, i + 60) }) }); }
      catch { /* tagging is best effort; the work itself is not affected */ }
    }
  }
}

/** Tags assets to the current project (no-op until the project has been saved once). */
export function tagToProject(...assets: AssetTag[]): void {
  const projectId = getActiveProjectId();
  if (!projectId || !assets.length) return;
  queue.push(...assets.map((asset) => ({ projectId, asset })));
  if (!timer) timer = setTimeout(flush, 2000);
}

export async function fetchProjectAssets(projectId: string): Promise<RegisteredAsset[]> {
  try {
    const res = await authFetch(`/api/project-assets?projectId=${encodeURIComponent(projectId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.assets) ? data.assets : [];
  } catch { return []; }
}
