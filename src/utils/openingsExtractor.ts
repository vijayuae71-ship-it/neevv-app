// src/utils/openingsExtractor.ts
// Computes a deterministic door/window schedule from the locked layout
// so that ALL drawings (plan, elevation, section, 3D) reference the SAME openings.

export interface Opening {
  id: string;
  type: 'door' | 'window' | 'ventilator';
  room: string;
  wall: 'front' | 'rear' | 'left' | 'right' | 'internal';
  widthMm: number;
  heightMm: number;
  sillHeightMm: number; // 0 for doors, 900 for windows, 2100 for ventilators
  material: string;
  quantity: number;
}

export interface OpeningsSchedule {
  openings: Opening[];
  totalDoors: number;
  totalWindows: number;
  totalVentilators: number;
  scheduleText: string; // Human-readable for prompt injection
}

// Standard sizes per IS 1948 / NBC guidelines
const DOOR_SIZES: Record<string, { w: number; h: number }> = {
  main_entrance: { w: 1050, h: 2100 },
  internal: { w: 900, h: 2100 },
  bathroom: { w: 750, h: 2100 },
  kitchen: { w: 900, h: 2100 },
  balcony: { w: 1800, h: 2100 }, // sliding
};

const WINDOW_SIZES: Record<string, { w: number; h: number }> = {
  bedroom: { w: 1200, h: 1200 },
  hall: { w: 1500, h: 1500 },
  kitchen: { w: 1200, h: 1050 },
  bathroom: { w: 600, h: 450 },
  dining: { w: 1200, h: 1200 },
  pooja: { w: 600, h: 900 },
  study: { w: 1200, h: 1200 },
  staircase: { w: 600, h: 900 },
};

interface RoomInfo {
  name: string;
  type: string;
  touchesFront?: boolean;
  touchesRear?: boolean;
  touchesLeft?: boolean;
  touchesRight?: boolean;
}

function determineWallContact(room: any, buildingWidthMm: number, buildingDepthMm: number): {
  touchesFront: boolean;
  touchesRear: boolean;
  touchesLeft: boolean;
  touchesRight: boolean;
} {
  // Use room position data from layout if available
  if (room.x !== undefined && room.y !== undefined && room.widthM !== undefined && room.depthM !== undefined) {
    const roomLeft = room.x * 1000;
    const roomRight = (room.x + room.widthM) * 1000;
    const roomTop = room.y * 1000;
    const roomBottom = (room.y + room.depthM) * 1000;
    const tolerance = 300; // 300mm tolerance for wall contact

    return {
      touchesFront: roomTop <= tolerance,
      touchesRear: Math.abs(roomBottom - buildingDepthMm) <= tolerance,
      touchesLeft: roomLeft <= tolerance,
      touchesRight: Math.abs(roomRight - buildingWidthMm) <= tolerance,
    };
  }

  // Fallback: use room type heuristics based on Vastu
  const type = (room.type || room.name || '').toLowerCase();
  return {
    touchesFront: ['hall', 'living', 'living room', 'foyer', 'entrance'].some(t => type.includes(t)),
    touchesRear: ['kitchen', 'utility', 'store'].some(t => type.includes(t)),
    touchesLeft: ['bedroom', 'master bedroom'].some(t => type.includes(t)),
    touchesRight: ['bathroom', 'toilet', 'pooja'].some(t => type.includes(t)),
  };
}

function getRoomType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('master') || n.includes('bedroom')) return 'bedroom';
  if (n.includes('hall') || n.includes('living')) return 'hall';
  if (n.includes('kitchen')) return 'kitchen';
  if (n.includes('bath') || n.includes('toilet') || n.includes('wc')) return 'bathroom';
  if (n.includes('dining')) return 'dining';
  if (n.includes('pooja') || n.includes('puja')) return 'pooja';
  if (n.includes('study') || n.includes('office')) return 'study';
  if (n.includes('stair')) return 'staircase';
  if (n.includes('balcony')) return 'balcony';
  return 'internal';
}

export function extractOpeningsSchedule(layout: any): OpeningsSchedule {
  const openings: Opening[] = [];
  let openingId = 1;

  const buildingWidthMm = layout.buildingWidthMm || (layout.buildableWidthM || 7) * 1000;
  const buildingDepthMm = layout.buildingDepthMm || (layout.buildableDepthM || 9) * 1000;

  // Get all rooms from all floors
  const allFloors = layout.floors || [];

  for (const floor of allFloors) {
    const rooms = floor.rooms || [];

    for (const room of rooms) {
      const roomName = room.name || room.type || 'Room';
      const roomType = getRoomType(roomName);
      const contact = determineWallContact(room, buildingWidthMm, buildingDepthMm);

      // Main entrance door (only on ground floor, front-facing room)
      if (floor.floor === 0 && contact.touchesFront && ['hall', 'living'].includes(roomType)) {
        openings.push({
          id: `O${openingId++}`,
          type: 'door',
          room: roomName,
          wall: 'front',
          widthMm: DOOR_SIZES.main_entrance.w,
          heightMm: DOOR_SIZES.main_entrance.h,
          sillHeightMm: 0,
          material: 'Teak wood frame, flush door shutter',
          quantity: 1,
        });
      }

      // Internal door for every room
      if (!['staircase', 'balcony'].includes(roomType)) {
        const doorType = roomType === 'bathroom' ? 'bathroom' : 'internal';
        openings.push({
          id: `O${openingId++}`,
          type: 'door',
          room: roomName,
          wall: 'internal',
          widthMm: DOOR_SIZES[doorType].w,
          heightMm: DOOR_SIZES[doorType].h,
          sillHeightMm: 0,
          material: doorType === 'bathroom' ? 'WPC frame, PVC shutter' : 'Sal wood frame, flush door shutter',
          quantity: 1,
        });
      }

      // Balcony sliding door
      if (roomType === 'balcony') {
        openings.push({
          id: `O${openingId++}`,
          type: 'door',
          room: roomName,
          wall: contact.touchesFront ? 'front' : contact.touchesRear ? 'rear' : 'left',
          widthMm: DOOR_SIZES.balcony.w,
          heightMm: DOOR_SIZES.balcony.h,
          sillHeightMm: 0,
          material: 'UPVC sliding door, clear glass',
          quantity: 1,
        });
      }

      // Windows — on exterior walls only
      const windowSize = WINDOW_SIZES[roomType] || WINDOW_SIZES.bedroom;
      const exteriorWalls: ('front' | 'rear' | 'left' | 'right')[] = [];
      if (contact.touchesFront) exteriorWalls.push('front');
      if (contact.touchesRear) exteriorWalls.push('rear');
      if (contact.touchesLeft) exteriorWalls.push('left');
      if (contact.touchesRight) exteriorWalls.push('right');

      // Each room gets at least one window on an exterior wall
      if (exteriorWalls.length > 0 && roomType !== 'staircase') {
        const wall = exteriorWalls[0]; // Primary window on first available exterior wall
        openings.push({
          id: `O${openingId++}`,
          type: roomType === 'bathroom' ? 'ventilator' : 'window',
          room: roomName,
          wall,
          widthMm: windowSize.w,
          heightMm: windowSize.h,
          sillHeightMm: roomType === 'bathroom' ? 2100 : 900,
          material: roomType === 'bathroom' ? 'Aluminium frame, frosted glass' : 'UPVC frame, clear glass, MS grille',
          quantity: 1,
        });
      }

      // Large rooms (hall, master bedroom) get an additional window
      if (['hall', 'bedroom'].includes(roomType) && exteriorWalls.length > 1) {
        openings.push({
          id: `O${openingId++}`,
          type: 'window',
          room: roomName,
          wall: exteriorWalls[1],
          widthMm: windowSize.w,
          heightMm: windowSize.h,
          sillHeightMm: 900,
          material: 'UPVC frame, clear glass, MS grille',
          quantity: 1,
        });
      }
    }
  }

  const totalDoors = openings.filter(o => o.type === 'door').length;
  const totalWindows = openings.filter(o => o.type === 'window').length;
  const totalVentilators = openings.filter(o => o.type === 'ventilator').length;

  // Build human-readable schedule text for prompt injection
  const scheduleLines = openings.map(o =>
    `${o.id}: ${o.type.toUpperCase()} in ${o.room} on ${o.wall} wall — ${o.widthMm}×${o.heightMm}mm, sill ${o.sillHeightMm}mm, ${o.material}`
  );

  const scheduleText = `SCHEDULE OF OPENINGS (${totalDoors} doors, ${totalWindows} windows, ${totalVentilators} ventilators):\n${scheduleLines.join('\n')}`;

  return {
    openings,
    totalDoors,
    totalWindows,
    totalVentilators,
    scheduleText,
  };
}

// Returns openings on a specific wall — used by elevation prompts
export function getOpeningsOnWall(schedule: OpeningsSchedule, wall: 'front' | 'rear' | 'left' | 'right'): Opening[] {
  return schedule.openings.filter(o => o.wall === wall);
}

// Returns a prompt-friendly description of openings on a wall
export function describeWallOpenings(schedule: OpeningsSchedule, wall: 'front' | 'rear' | 'left' | 'right'): string {
  const wallOpenings = getOpeningsOnWall(schedule, wall);
  if (wallOpenings.length === 0) return `No openings on ${wall} wall.`;

  return wallOpenings.map(o =>
    `${o.id}: ${o.type} ${o.widthMm}×${o.heightMm}mm at sill ${o.sillHeightMm}mm (${o.room})`
  ).join('; ');
}
