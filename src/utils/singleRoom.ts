import type { Layout, LayoutOpening, ProjectRequirements } from '../types';

export type Wall = 'front' | 'rear' | 'left' | 'right';

/** Room types offered in "Design a Room", mapped to the planner's room types. */
export const SINGLE_ROOM_TYPES: Record<string, string> = {
  living_room: 'hall', bedroom: 'bedroom', master_bedroom: 'master_bedroom', kitchen: 'kitchen', bathroom: 'toilet',
  dining: 'dining', puja: 'puja', balcony: 'balcony', study: 'study',
};

export interface SingleRoomInput {
  roomType: string; widthFt: number; depthFt: number; style: string;
  /** wall with the entry door, and wall with the window ('none' = no window); "front" is the wall at the top of the plan */
  doorWall: Wall; windowWall: Wall | 'none';
  city?: string; state?: string;
}

/**
 * A one-room "plan" so the same engine draws, quantifies and renders a single room:
 * the room sits on its own, with the door and window on the walls the customer picked.
 */
export function buildSingleRoom(input: SingleRoomInput): { layout: Layout; requirements: ProjectRequirements } {
  // the customer gives the carpet (inside) size; the 230 mm walls sit outside it
  const WALL = 0.23, inW = Math.max(1.2, input.widthFt * 0.3048), inD = Math.max(1.2, input.depthFt * 0.3048);
  const widthM = inW + 2 * WALL, depthM = inD + 2 * WALL;
  const type = SINGLE_ROOM_TYPES[input.roomType] || 'hall';
  const name = input.roomType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const len = (w: Wall) => (w === 'front' || w === 'rear' ? widthM : depthM) * 1000, W0 = WALL * 1000;
  const wet = type === 'toilet';
  const doorW = wet ? 750 : type === 'puja' ? 750 : 900;
  // door near a corner (300 mm + half the leaf), leaving the long run of the wall free
  const doorPos = Math.min(len(input.doorWall) / 2, W0 + 150 + doorW / 2);
  const openings: LayoutOpening[] = [{
    id: 'D1', floor: 0, roomId: 'room_1', face: input.doorWall, positionMm: doorPos, main: true, type: 'door', room: name, wall: input.doorWall,
    widthMm: doorW, heightMm: 2100, sillHeightMm: 0, material: wet ? 'WPC flush door' : 'Flush door, teak finish', quantity: 1,
  }];
  if (input.windowWall !== 'none') {
    const L = len(input.windowWall), sameWall = input.windowWall === input.doorWall;
    const ww = wet ? 600 : Math.max(600, Math.min(1800, Math.round((L - 2 * W0 - (sameWall ? doorW + 900 : 600)) / 100) * 100));
    const pos = sameWall ? Math.min(L - W0 - ww / 2 - 150, doorPos + doorW / 2 + 450 + ww / 2) : L / 2;
    if (!sameWall || pos - ww / 2 > doorPos + doorW / 2 + 200)
      openings.push({ id: wet ? 'V1' : 'W1', floor: 0, roomId: 'room_1', face: input.windowWall, positionMm: pos, type: wet ? 'ventilator' : 'window', room: name, wall: input.windowWall,
        widthMm: ww, heightMm: wet ? 450 : 1200, sillHeightMm: wet ? 1800 : 900, material: 'UPVC sliding, clear glass', quantity: 1 });
  }
  const doors = openings.filter(o => o.type === 'door').length;
  const layout: Layout = {
    id: 'room_design_' + input.roomType, name: name + ' Design', strategy: 'room_design', description: 'Individual room design',
    floors: [{ floor: 0, floorLabel: 'Ground Floor', rooms: [{ id: 'room_1', name, type: type as any, x: 0, y: 0, width: widthM, depth: depthM, floor: 0 }], columns: [] }],
    vastuScore: 0, vastuDetails: [], nbcCompliant: true, nbcIssues: [],
    builtUpAreaSqM: inW * inD, builtUpAreaSqFt: input.widthFt * input.depthFt,
    setbacks: { front: 0, rear: 0, left: 0, right: 0 }, plotWidthM: widthM, plotDepthM: depthM, buildableWidthM: widthM, buildableDepthM: depthM,
    openingsSchedule: { openings, totalDoors: doors, totalWindows: openings.length - doors, totalVentilators: 0, scheduleText: '' },
  };
  const requirements: ProjectRequirements = {
    city: input.city || 'Bangalore', state: input.state || 'Karnataka', plotWidthFt: input.widthFt, plotDepthFt: input.depthFt, facing: 'North',
    vastuCompliance: false, parkingType: 'None', budget: 'standard', architecturalStyle: input.style as any,
    floors: [{ floorLabel: 'Ground Floor', bedrooms: type === 'bedroom' || type === 'master_bedroom' ? 1 : 0, halls: type === 'hall' ? 1 : 0, kitchens: type === 'kitchen' ? 1 : 0, hasDining: type === 'dining', hasPuja: type === 'puja' }],
  };
  return { layout, requirements };
}
