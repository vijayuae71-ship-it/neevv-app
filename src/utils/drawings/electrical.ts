import { C, MARGIN, SC, dimChain, drawingBorder, northArrow, legend, drawTable } from '../drawingHelpers';
import { Layout, Room, ProjectRequirements } from '../../types';

interface ElecPoint {
  x: number; y: number; symbol: string; label: string; circuit: 'power' | 'lighting' | 'earth';
}

function roomElecPoints(room: Room): ElecPoint[] {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.depth / 2;
  const l = room.x + 0.15;
  const r = room.x + room.width - 0.15;
  const t = room.y + 0.15;
  const b = room.y + room.depth - 0.15;
  const pts: ElecPoint[] = [];

  const type = room.type;

  if (type === 'bedroom' || type === 'master_bedroom') {
    pts.push({ x: cx, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: cx, y: cy - 0.3, symbol: 'fan', label: 'FAN', circuit: 'lighting' });
    pts.push({ x: l + 0.1, y: cy - 0.2, symbol: 'switchBoard', label: 'SB', circuit: 'lighting' });
    pts.push({ x: l + 0.1, y: cy + 0.3, symbol: 'switchBoard', label: 'SB', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: t + 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: r - 0.1, y: cy, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: l + 0.1, y: b - 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: r - 0.1, y: b - 0.3, symbol: 'ac16A', label: '16A AC', circuit: 'power' });
    pts.push({ x: r - 0.1, y: cy + 0.4, symbol: 'tv', label: 'TV', circuit: 'power' });
    if (type === 'master_bedroom') {
      pts.push({ x: l + 0.3, y: t + 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    }
  } else if (type === 'hall') {
    pts.push({ x: cx - 0.5, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: cx + 0.5, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: cx - 0.5, y: cy - 0.3, symbol: 'fan', label: 'FAN', circuit: 'lighting' });
    pts.push({ x: cx + 0.5, y: cy - 0.3, symbol: 'fan', label: 'FAN', circuit: 'lighting' });
    pts.push({ x: l + 0.1, y: cy, symbol: 'switchBoard', label: 'SB', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: cy, symbol: 'switchBoard', label: 'SB', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: t + 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: r - 0.1, y: b - 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: l + 0.1, y: t + 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: l + 0.1, y: b - 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: r - 0.1, y: cy - 0.5, symbol: 'ac16A', label: '16A AC', circuit: 'power' });
    pts.push({ x: cx, y: b - 0.2, symbol: 'tv', label: 'TV', circuit: 'power' });
  } else if (type === 'kitchen') {
    pts.push({ x: cx, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: t + 0.2, symbol: 'exhaustFan', label: 'EF', circuit: 'lighting' });
    pts.push({ x: l + 0.2, y: t + 0.2, symbol: 'socket15A', label: '15A MIXER', circuit: 'power' });
    pts.push({ x: l + 0.5, y: t + 0.2, symbol: 'socket15A', label: '15A MW', circuit: 'power' });
    pts.push({ x: r - 0.3, y: b - 0.2, symbol: 'socket15A', label: '15A FRIDGE', circuit: 'power' });
    pts.push({ x: r - 0.1, y: t + 0.5, symbol: 'socket15A', label: '15A CHIMNEY', circuit: 'power' });
    pts.push({ x: l + 0.2, y: cy, symbol: 'geyser', label: 'GEYSER', circuit: 'power' });
  } else if (type === 'toilet') {
    pts.push({ x: cx, y: cy, symbol: 'cLightWP', label: 'CL(WP)', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: t + 0.2, symbol: 'exhaustFan', label: 'EF', circuit: 'lighting' });
    pts.push({ x: l + 0.2, y: t + 0.3, symbol: 'geyser', label: '15A GEYSER', circuit: 'power' });
  } else if (type === 'dining') {
    pts.push({ x: cx, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: cx, y: cy - 0.3, symbol: 'fan', label: 'FAN', circuit: 'lighting' });
    pts.push({ x: l + 0.1, y: cy, symbol: 'switchBoard', label: 'SB', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: t + 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
    pts.push({ x: r - 0.1, y: b - 0.3, symbol: 'socket5A', label: '5A', circuit: 'power' });
  } else if (type === 'staircase') {
    pts.push({ x: cx, y: cy, symbol: 'twoWay', label: '2W', circuit: 'lighting' });
  } else if (type === 'parking') {
    pts.push({ x: cx, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
    pts.push({ x: r - 0.1, y: cy, symbol: 'socket15A', label: '15A', circuit: 'power' });
  } else {
    // passage, entrance, balcony, puja, store, utility
    pts.push({ x: cx, y: cy, symbol: 'cLight', label: 'CL', circuit: 'lighting' });
  }
  return pts;
}

function drawSymbol(px: number, py: number, sym: string, label: string): string {
  const r = 6;
  let s = '';
  switch (sym) {
    case 'cLight':
      s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="${C.elecBlue}" stroke-width="1.5"/>`;
      s += `<line x1="${px - 4}" y1="${py - 4}" x2="${px + 4}" y2="${py + 4}" stroke="${C.elecBlue}" stroke-width="1"/>`;
      s += `<line x1="${px + 4}" y1="${py - 4}" x2="${px - 4}" y2="${py + 4}" stroke="${C.elecBlue}" stroke-width="1"/>`;
      break;
    case 'cLightWP':
      s += `<circle cx="${px}" cy="${py}" r="${r}" fill="${C.elecBlue}" stroke="${C.elecBlue}" stroke-width="1.5" opacity="0.6"/>`;
      break;
    case 'fan':
      s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="${C.elecBlue}" stroke-width="1.5"/>`;
      s += `<text x="${px}" y="${py + 3}" text-anchor="middle" font-size="7" fill="${C.elecBlue}" font-weight="bold">F</text>`;
      break;
    case 'exhaustFan':
      s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="${C.elecBlue}" stroke-width="1.5"/>`;
      s += `<text x="${px}" y="${py + 3}" text-anchor="middle" font-size="6" fill="${C.elecBlue}" font-weight="bold">EF</text>`;
      break;
    case 'switchBoard':
      s += `<rect x="${px - 5}" y="${py - 3}" width="10" height="6" fill="none" stroke="${C.elecBlue}" stroke-width="1.5"/>`;
      s += `<text x="${px}" y="${py + 2}" text-anchor="middle" font-size="5" fill="${C.elecBlue}">SB</text>`;
      break;
    case 'socket5A':
      s += `<polygon points="${px},${py - 6} ${px - 5},${py + 4} ${px + 5},${py + 4}" fill="none" stroke="${C.elecRed}" stroke-width="1.5"/>`;
      break;
    case 'socket15A':
      s += `<polygon points="${px},${py - 6} ${px - 5},${py + 4} ${px + 5},${py + 4}" fill="none" stroke="${C.elecRed}" stroke-width="1.5"/>`;
      s += `<line x1="${px - 3}" y1="${py + 1}" x2="${px + 3}" y2="${py + 1}" stroke="${C.elecRed}" stroke-width="1"/>`;
      break;
    case 'ac16A':
      s += `<polygon points="${px},${py - 6} ${px - 5},${py + 4} ${px + 5},${py + 4}" fill="${C.elecRed}" stroke="${C.elecRed}" stroke-width="1.5" opacity="0.7"/>`;
      break;
    case 'geyser':
      s += `<polygon points="${px},${py - 6} ${px - 5},${py + 4} ${px + 5},${py + 4}" fill="${C.elecRed}" stroke="${C.elecRed}" stroke-width="1.5" opacity="0.7"/>`;
      s += `<text x="${px}" y="${py + 12}" text-anchor="middle" font-size="5" fill="${C.elecRed}">GYS</text>`;
      break;
    case 'tv':
      s += `<rect x="${px - 5}" y="${py - 4}" width="10" height="8" fill="none" stroke="${C.elecRed}" stroke-width="1"/>`;
      s += `<text x="${px}" y="${py + 3}" text-anchor="middle" font-size="6" fill="${C.elecRed}">TV</text>`;
      break;
    case 'twoWay':
      s += `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="${C.elecBlue}" stroke-width="1.5"/>`;
      s += `<text x="${px}" y="${py + 3}" text-anchor="middle" font-size="6" fill="${C.elecBlue}">2W</text>`;
      break;
  }
  if (label && sym !== 'switchBoard' && sym !== 'tv' && sym !== 'geyser' && sym !== 'twoWay' && sym !== 'exhaustFan') {
    s += `<text x="${px}" y="${py + r + 9}" text-anchor="middle" font-size="5" fill="${C.text}" opacity="0.7">${label}</text>`;
  }
  return s;
}

export function renderElectrical(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const svgW = Math.round((plotW + 6) * SC);
  const svgH = Math.round((plotD + 8) * SC);
  const ox = MARGIN + 2 * SC;
  const oy = MARGIN + 1.5 * SC;

  const rooms = layout.floors[0]?.rooms || [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="'Courier New',monospace">`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="${C.bg}"/>`;
  svg += drawingBorder(svgW, svgH, 'ELECTRICAL LAYOUT', `Plot: ${plotW}m × ${plotD}m | Ground Floor`);
  svg += northArrow(svgW - MARGIN - 30, MARGIN + 40);

  // Plot outline
  const pw = plotW * SC;
  const pd = plotD * SC;
  svg += `<rect x="${ox}" y="${oy}" width="${pw}" height="${pd}" fill="none" stroke="${C.grid}" stroke-width="0.5" stroke-dasharray="6,3"/>`;

  // Building footprint
  const bx = ox + layout.setbacks.left * SC;
  const by = oy + layout.setbacks.front * SC;
  const bw = layout.buildableWidthM * SC;
  const bd = layout.buildableDepthM * SC;
  svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bd}" fill="#FAFAFA" stroke="${C.wall}" stroke-width="1"/>`;

  // Room outlines
  for (const room of rooms) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;
    svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="none" stroke="${C.wall}" stroke-width="0.8"/>`;
    svg += `<text x="${rx + rw / 2}" y="${ry + 12}" text-anchor="middle" font-size="7" fill="${C.text}" opacity="0.5">${room.name}</text>`;
  }

  // Electrical points per room
  const allPoints: ElecPoint[] = [];
  for (const room of rooms) {
    const pts = roomElecPoints(room);
    allPoints.push(...pts);
    for (const pt of pts) {
      const px = ox + pt.x * SC;
      const py = oy + pt.y * SC;
      svg += drawSymbol(px, py, pt.symbol, pt.label);
    }
  }

  // DB near hall/entrance
  const hallRoom = rooms.find(r => r.type === 'hall') || rooms.find(r => r.type === 'entrance') || rooms[0];
  let dbX = ox + 0.3 * SC;
  let dbY = oy + 0.3 * SC;
  if (hallRoom) {
    dbX = ox + hallRoom.x * SC + 10;
    dbY = oy + (hallRoom.y + hallRoom.depth) * SC - 20;
  }
  svg += `<rect x="${dbX}" y="${dbY}" width="24" height="16" fill="#FFF" stroke="${C.elecRed}" stroke-width="2"/>`;
  svg += `<text x="${dbX + 12}" y="${dbY + 11}" text-anchor="middle" font-size="7" fill="${C.elecRed}" font-weight="bold">DB</text>`;
  svg += `<text x="${dbX + 12}" y="${dbY + 24}" text-anchor="middle" font-size="5" fill="${C.text}">DISTRIBUTION BOARD</text>`;

  // MSB at entrance/front
  const msbX = ox + (plotW / 2) * SC - 12;
  const msbY = oy + pd - 20;
  svg += `<rect x="${msbX}" y="${msbY}" width="28" height="16" fill="#FFF" stroke="${C.elecRed}" stroke-width="2"/>`;
  svg += `<text x="${msbX + 14}" y="${msbY + 11}" text-anchor="middle" font-size="7" fill="${C.elecRed}" font-weight="bold">MSB</text>`;

  // Earth pit at rear/side
  const epX = ox + pw - 20;
  const epY = oy + 20;
  svg += `<circle cx="${epX}" cy="${epY}" r="8" fill="none" stroke="${C.elecGreen}" stroke-width="2"/>`;
  svg += `<line x1="${epX - 5}" y1="${epY + 10}" x2="${epX + 5}" y2="${epY + 10}" stroke="${C.elecGreen}" stroke-width="1.5"/>`;
  svg += `<line x1="${epX - 3}" y1="${epY + 13}" x2="${epX + 3}" y2="${epY + 13}" stroke="${C.elecGreen}" stroke-width="1.5"/>`;
  svg += `<line x1="${epX - 1}" y1="${epY + 16}" x2="${epX + 1}" y2="${epY + 16}" stroke="${C.elecGreen}" stroke-width="1.5"/>`;
  svg += `<text x="${epX}" y="${epY + 26}" text-anchor="middle" font-size="5" fill="${C.elecGreen}" font-weight="bold">EARTH PIT</text>`;

  // Circuit runs from DB to rooms
  for (const room of rooms) {
    const rcx = ox + (room.x + room.width / 2) * SC;
    const rcy = oy + (room.y + room.depth / 2) * SC;
    // Lighting circuit (blue)
    svg += `<line x1="${dbX + 12}" y1="${dbY + 8}" x2="${rcx}" y2="${rcy}" stroke="${C.elecBlue}" stroke-width="0.6" opacity="0.35" stroke-dasharray="4,2"/>`;
    // Power circuit (red) slightly offset
    const haspower = ['bedroom', 'master_bedroom', 'hall', 'kitchen', 'toilet', 'dining', 'parking'].includes(room.type);
    if (haspower) {
      svg += `<line x1="${dbX + 14}" y1="${dbY + 10}" x2="${rcx + 3}" y2="${rcy + 3}" stroke="${C.elecRed}" stroke-width="0.6" opacity="0.3" stroke-dasharray="2,2"/>`;
    }
  }

  // Earth line from DB to earth pit
  svg += `<line x1="${dbX + 24}" y1="${dbY + 8}" x2="${epX}" y2="${epY}" stroke="${C.elecGreen}" stroke-width="1" stroke-dasharray="5,3" opacity="0.6"/>`;
  // Line from MSB to DB
  svg += `<line x1="${msbX + 14}" y1="${msbY}" x2="${dbX + 12}" y2="${dbY + 16}" stroke="${C.elecRed}" stroke-width="1.2" opacity="0.5"/>`;

  // Load schedule table
  const numAC = rooms.filter(r => ['bedroom', 'master_bedroom', 'hall'].includes(r.type)).length;
  const numGeyser = rooms.filter(r => r.type === 'toilet' || r.type === 'kitchen').length;
  const acLoad = numAC * 1500;
  const geyserLoad = numGeyser * 2000;
  const totalLoad = 1500 + 3000 + acLoad + geyserLoad;

  const tableX = svgW - MARGIN - 220;
  const tableY = svgH - MARGIN - 160;
  svg += drawTable(tableX, tableY,
    ['Circuit', 'Load (W)', 'MCB'],
    [
      ['Lighting', '1500', '10A'],
      ['Power (5A/15A)', '3000', '16A'],
      [`AC × ${numAC}`, String(acLoad), '16A ea.'],
      [`Geyser × ${numGeyser}`, String(geyserLoad), '16A ea.'],
      ['TOTAL', String(totalLoad), '—'],
    ],
    [90, 70, 50]
  );

  svg += `<text x="${tableX}" y="${tableY - 6}" font-size="7" fill="${C.text}" font-weight="bold">LOAD SCHEDULE</text>`;

  // Symbol legend
  const lgX = MARGIN + 10;
  const lgY = svgH - MARGIN - 145;
  svg += `<rect x="${lgX}" y="${lgY}" width="150" height="135" fill="#FAFAFA" stroke="${C.dim}" stroke-width="0.5"/>`;
  svg += `<text x="${lgX + 75}" y="${lgY + 12}" text-anchor="middle" font-size="7" fill="${C.text}" font-weight="bold">LEGEND</text>`;
  const legendItems: Array<{ sym: string; label: string; desc: string }> = [
    { sym: 'cLight', label: 'CL', desc: 'Ceiling Light' },
    { sym: 'fan', label: 'FAN', desc: 'Fan Point' },
    { sym: 'switchBoard', label: 'SB', desc: 'Switch Board' },
    { sym: 'socket5A', label: '5A', desc: 'Socket 5A' },
    { sym: 'ac16A', label: '16A', desc: 'AC Socket 16A' },
    { sym: 'exhaustFan', label: 'EF', desc: 'Exhaust Fan' },
    { sym: 'geyser', label: 'GYS', desc: 'Geyser Point 15A' },
    { sym: 'tv', label: 'TV', desc: 'TV Point' },
    { sym: 'twoWay', label: '2W', desc: 'Two-Way Switch' },
  ];
  legendItems.forEach((item, i) => {
    const iy = lgY + 22 + i * 12;
    svg += drawSymbol(lgX + 15, iy, item.sym, '');
    svg += `<text x="${lgX + 32}" y="${iy + 3}" font-size="6" fill="${C.text}">${item.desc}</text>`;
  });

  // Circuit line legend
  const clY = lgY + 22 + legendItems.length * 12 + 4;
  svg += `<line x1="${lgX + 5}" y1="${clY}" x2="${lgX + 25}" y2="${clY}" stroke="${C.elecBlue}" stroke-width="1.2"/>`;
  svg += `<text x="${lgX + 32}" y="${clY + 3}" font-size="6" fill="${C.text}">Lighting Circuit</text>`;
  svg += `<line x1="${lgX + 5}" y1="${clY + 10}" x2="${lgX + 25}" y2="${clY + 10}" stroke="${C.elecRed}" stroke-width="1.2"/>`;
  svg += `<text x="${lgX + 32}" y="${clY + 13}" font-size="6" fill="${C.text}">Power Circuit</text>`;
  svg += `<line x1="${lgX + 5}" y1="${clY + 20}" x2="${lgX + 25}" y2="${clY + 20}" stroke="${C.elecGreen}" stroke-width="1.2" stroke-dasharray="4,2"/>`;
  svg += `<text x="${lgX + 32}" y="${clY + 23}" font-size="6" fill="${C.text}">Earth Line</text>`;

  svg += `</svg>`;
  return svg;
}
