import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';

/**
 * Register of everything produced for a project (server only): AI renders, AR models and drawing
 * sheets, under projects/<id>/assets. Only the project's owner can add to or read it.
 */
export type AssetKind = 'render' | 'interior_render' | 'ar_model' | 'drawing';
export interface ProjectAsset {
  kind: AssetKind;
  /** what it is within the project, e.g. 'front-3/4', 'room-12:render3d', 'walk0', 'A-101-FF' */
  key: string;
  url?: string;
  title?: string;
  sheetNo?: string;
  floor?: string;
  view?: string;
  roomId?: string;
  roomName?: string;
  edited?: boolean;
}

const KINDS: AssetKind[] = ['render', 'interior_render', 'ar_model', 'drawing'];
export const validProjectId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(id);
const str = (v: unknown, n = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const localUrl = (v: unknown) => { const s = str(v, 200); return s && /^\/api\/(render-image|ar-model)\/[A-Za-z0-9.]+$/.test(s) ? s : undefined; };

/** Cleans an asset sent by the browser (unknown fields dropped, sizes capped). */
export function cleanAsset(a: any): ProjectAsset | null {
  if (!a || !KINDS.includes(a.kind) || !str(a.key)) return null;
  const out: ProjectAsset = { kind: a.kind, key: str(a.key)! };
  const url = localUrl(a.url); if (url) out.url = url;
  for (const f of ['title', 'sheetNo', 'floor', 'view', 'roomId', 'roomName'] as const) { const v = str(a[f]); if (v) out[f] = v; }
  if (a.edited === true) out.edited = true;
  return out;
}

/** The owner's project, or null (missing project or someone else's). */
async function ownedProject(userId: string, projectId: string) {
  if (!validProjectId(projectId)) return null;
  const ref = getAdminDb().collection('projects').doc(projectId);
  const snap = await ref.get();
  return snap.exists && snap.data()?.userId === userId ? ref : null;
}

/**
 * Adds assets to the project's register. Renders are one entry per image (history kept); drawings and
 * AR models one entry per sheet / model slot (latest kept).
 */
export async function tagAssets(userId: string, projectId: string, assets: ProjectAsset[]): Promise<number> {
  const ref = await ownedProject(userId, projectId);
  if (!ref || !assets.length) return 0;
  const batch = getAdminDb().batch(), now = new Date().toISOString();
  for (const a of assets) {
    const idSource = a.kind === 'render' || a.kind === 'interior_render' ? `${a.kind}|${a.key}|${a.url ?? ''}` : `${a.kind}|${a.key}`;
    const id = createHash('sha256').update(idSource).digest('hex').slice(0, 24);
    batch.set(ref.collection('assets').doc(id), { ...a, updatedAt: now }, { merge: true });
  }
  batch.set(ref, { assetsUpdatedAt: now }, { merge: true });
  await batch.commit();
  return assets.length;
}

export async function listAssets(userId: string, projectId: string): Promise<(ProjectAsset & { updatedAt?: string })[] | null> {
  const ref = await ownedProject(userId, projectId);
  if (!ref) return null;
  const snap = await ref.collection('assets').orderBy('updatedAt', 'desc').limit(500).get();
  return snap.docs.map((d) => d.data() as ProjectAsset & { updatedAt?: string });
}
