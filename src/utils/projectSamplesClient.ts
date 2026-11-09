'use client';

import { authFetch } from '@/utils/authFetch';
import type { RoomInterior } from '@/types';

/** Sample prices by room, as stored on the project. */
export type ProjectRoomSamples = Record<string, { roomName: string; samples: NonNullable<RoomInterior['samples']> }>;

/** null when the prices could not be read (so nothing is overwritten). */
export async function fetchProjectSamples(projectId: string): Promise<ProjectRoomSamples | null> {
  try {
    const res = await authFetch(`/api/project-samples?projectId=${encodeURIComponent(projectId)}`);
    if (res.status === 404) return {}; // project not saved yet: nothing stored
    if (!res.ok) return null;
    const data = await res.json();
    return data.rooms && typeof data.rooms === 'object' ? data.rooms : {};
  } catch { return null; }
}

export async function saveProjectSamples(projectId: string, rooms: RoomInterior[]): Promise<boolean> {
  const payload: ProjectRoomSamples = {};
  for (const r of rooms) if (r.samples && Object.keys(r.samples).length) payload[r.roomId] = { roomName: r.roomName, samples: r.samples };
  try {
    const res = await authFetch('/api/project-samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, rooms: payload }) });
    return res.ok;
  } catch { return false; }
}
