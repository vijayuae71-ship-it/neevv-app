/**
 * Shared quantity rules — the ONE definition used by both the BOQ calculator and the
 * verification engine, so cross-checks compare like with like and can never drift.
 */
import type { Layout, Room } from '../types';

/** Electrical points per room (lights + fans + sockets + switch points), meets the recommended minimums. */
export const ELECTRICAL_POINT_MAP: Record<string, number> = {
  master_bedroom: 10, bedroom: 8, hall: 12, kitchen: 8,
  toilet: 3, dining: 4, puja: 2, passage: 2, study: 6,
  balcony: 2, store: 1, utility: 3, parking: 2, entrance: 2, staircase: 2,
};

/** Pooja niches are features inside another room, not rooms: excluded from areas, walls and counts. */
export const isNiche = (r: Room) => r.type === 'puja' && /niche/i.test(r.name);

export function electricalPoints(rooms: Room[]): number {
  return rooms.filter((r) => !isNiche(r)).reduce((sum, r) => sum + (ELECTRICAL_POINT_MAP[r.type] ?? 2), 0);
}

/** Supply/drainage points: bath 5 (WC, basin, shower, health faucet, floor trap), kitchen 3, utility/wash 2. */
export function plumbingPoints(rooms: Room[]): number {
  const n = (t: string) => rooms.filter((r) => r.type === t).length;
  return n('toilet') * 5 + n('kitchen') * 3 + n('utility') * 2;
}

/** Ids of the doors and windows that belong to bedrooms, from the locked openings schedule. */
export function bedroomOpeningIds(layout: Layout): { doors: Set<string>; windows: Set<string>; bedroomsWithoutDoor: string[]; bedroomsWithoutWindow: string[] } | null {
  const ops = layout.openingsSchedule?.openings ?? [];
  if (!ops.length || !ops.every((o) => o.roomId)) return null;
  const beds = layout.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'bedroom' || r.type === 'master_bedroom');
  const ids = new Set(beds.map((r) => r.id));
  const doors = new Set(ops.filter((o) => o.type === 'door' && ids.has(o.roomId!)).map((o) => o.id));
  const windows = new Set(ops.filter((o) => o.type === 'window' && ids.has(o.roomId!)).map((o) => o.id));
  return {
    doors, windows,
    bedroomsWithoutDoor: beds.filter((r) => !ops.some((o) => o.type === 'door' && o.roomId === r.id)).map((r) => r.name),
    bedroomsWithoutWindow: beds.filter((r) => !ops.some((o) => o.type === 'window' && o.roomId === r.id)).map((r) => r.name),
  };
}
