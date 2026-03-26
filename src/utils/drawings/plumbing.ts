import { C, MARGIN, SC, dimChain, drawingBorder, northArrow, legend, drawTable } from '../drawingHelpers';
import { Layout, Room, ProjectRequirements } from '../../types';

function drawWC(px: number, py: number): string {
  let s = '';
  s += `<rect x="${px - 8}" y="${py - 5}" width="16" height="12" rx="2" fill="#FFF" stroke="${C.drain}" stroke-width="1.2"/>`;
  s += `<circle cx="${px}" cy="${py + 1}" r="4" fill="none" stroke="${C.drain}" stroke-width="1"/>`;
  s += `<text x="${px}" y="${py + 18}" text-anchor="middle" font-size="5" fill="${C.text}">WC</text>`;
  return s;
}

function drawBasin(px: number, py: number): string {
  let s = '';
  s += `<path d="M${px - 7},${py} A7,7 0 0,1 ${px + 7},${py}" fill="none" stroke="${C.drain}" stroke-width="1.2"/>`;
  s += `<line x1="${px - 7}" y1="${py}" x2="${px + 7}" y2="${py}" stroke="${C.drain}" stroke-width="1"/>`;
  s += `<text x="${px}" y="${py + 12}" text-anchor="middle" font-size="5" fill="${C.text}">WB</text>`;
  return s;
}

function drawShower(px: number, py: number): string {
  let s = '';
  s += `<circle cx="${px}" cy="${py}" r="6" fill="none" stroke="${C.water}" stroke-width="1.2"/>`;
  s += `<line x1="${px - 4}" y1="${py - 4}" x2="${px + 4}" y2="${py + 4}" stroke="${C.water}" stroke-width="0.8"/>`;
  s += `<line x1="${px + 4}" y1="${py - 4}" x2="${px - 4}" y2="${py + 4}" stroke="${C.water}" stroke-width="0.8"/>`;
  s += `<text x="${px}" y="${py + 14}" text-anchor="middle" font-size="5" fill="${C.text}">FT</text>`;
  return s;
}

function drawSink(px: number, py: number): string {
  let s = '';
  s += `<rect x="${px - 10}" y="${py - 5}" width="20" height="10" rx="2" fill="#FFF" stroke="${C.drain}" stroke-width="1.2"/>`;
  s += `<circle cx="${px}" cy="${py}" r="2" fill="${C.drain}"/>`;
  s += `<text x="${px}" y="${py + 16}" text-anchor="middle" font-size="5" fill="${C.text}">SINK</text>`;
  return s;
}

function drawFloorDrain(px: number, py: number): string {
  let s = '';
  s += `<circle cx="${px}" cy="${py}" r="4" fill="none" stroke="${C.drain}" stroke-width="1"/>`;
  s += `<circle cx="${px}" cy="${py}" r="1.5" fill="${C.drain}"/>`;
  s += `<text x="${px}" y="${py + 12}" text-anchor="middle" font-size="4" fill="${C.text}">FD</text>`;
  return s;
}

function drawManhole(px: number, py: number, label: string): string {
  let s = '';
  s += `<rect x="${px - 6}" y="${py - 6}" width="12" height="12" fill="${C.drain}" stroke="#553322" stroke-width="1.5" opacity="0.7"/>`;
  s += `<line x1="${px - 6}" y1="${py - 6}" x2="${px + 6}" y2="${py + 6}" stroke="#553322" stroke-width="0.6"/>`;
  s += `<line x1="${px + 6}" y1="${py - 6}" x2="${px - 6}" y2="${py + 6}" stroke="#553322" stroke-width="0.6"/>`;
  s += `<text x="${px}" y="${py + 18}" text-anchor="middle" font-size="5" fill="${C.text}" font-weight="bold">${label}</text>`;
  return s;
}

export function renderPlumbing(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const svgW = Math.round((plotW + 6) * SC);
  const svgH = Math.round((plotD + 7) * SC);
  const ox = MARGIN + 2 * SC;
  const oy = MARGIN + 1.5 * SC;

  const rooms = layout.floors[0]?.rooms || [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" preserveAspectRatio="xMidYMin meet" font-family="'Courier New',monospace">`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="${C.bg}"/>`;
  svg += drawingBorder(svgW, svgH, 'PLUMBING LAYOUT', `Plot: ${plotW}m × ${plotD}m | Water Supply &amp; Drainage`);
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

  // Room outlines and fixtures
  const toilets: Room[] = [];
  const kitchens: Room[] = [];

  for (const room of rooms) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;
    svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="none" stroke="${C.wall}" stroke-width="0.8"/>`;
    svg += `<text x="${rx + rw / 2}" y="${ry + 12}" text-anchor="middle" font-size="7" fill="${C.text}" opacity="0.5">${room.name}</text>`;

    if (room.type === 'toilet') {
      toilets.push(room);
      // WC in top-left area
      svg += drawWC(rx + 18, ry + rd - 22);
      // Wash basin top-right
      svg += drawBasin(rx + rw - 18, ry + 22);
      // Shower/floor trap center
      svg += drawShower(rx + rw / 2, ry + rd / 2);
      // Floor drain
      svg += drawFloorDrain(rx + rw / 2 + 15, ry + rd - 15);
    } else if (room.type === 'kitchen') {
      kitchens.push(room);
      // Sink along top wall
      svg += drawSink(rx + rw / 2, ry + 18);
      // Dishwasher point
      svg += `<rect x="${rx + rw / 2 + 18}" y="${ry + 12}" width="12" height="12" fill="none" stroke="${C.water}" stroke-width="0.8" stroke-dasharray="2,1"/>`;
      svg += `<text x="${rx + rw / 2 + 24}" y="${ry + 32}" text-anchor="middle" font-size="4" fill="${C.text}">DW</text>`;
    } else if (room.type === 'utility') {
      // Washing machine point
      svg += `<rect x="${rx + rw / 2 - 8}" y="${ry + rd / 2 - 8}" width="16" height="16" rx="3" fill="none" stroke="${C.water}" stroke-width="1.2"/>`;
      svg += `<text x="${rx + rw / 2}" y="${ry + rd / 2 + 3}" text-anchor="middle" font-size="6" fill="${C.water}" font-weight="bold">WM</text>`;
    }
  }

  // Main water inlet from front (road side = bottom)
  const inletX = ox + (plotW * 0.3) * SC;
  const inletY = oy + pd;
  svg += `<line x1="${inletX}" y1="${inletY + 15}" x2="${inletX}" y2="${inletY}" stroke="${C.water}" stroke-width="2.5"/>`;
  svg += `<text x="${inletX + 5}" y="${inletY + 20}" font-size="6" fill="${C.water}" font-weight="bold">WATER MAIN INLET 25Ø</text>`;
  svg += `<polygon points="${inletX},${inletY} ${inletX - 4},${inletY + 6} ${inletX + 4},${inletY + 6}" fill="${C.water}"/>`;

  // Underground sump near front
  const sumpX = ox + (plotW * 0.15) * SC;
  const sumpY = oy + pd - 30;
  svg += `<rect x="${sumpX}" y="${sumpY}" width="36" height="24" fill="#D8EEFF" stroke="${C.water}" stroke-width="1.5"/>`;
  svg += `<text x="${sumpX + 18}" y="${sumpY + 10}" text-anchor="middle" font-size="6" fill="${C.water}" font-weight="bold">SUMP</text>`;
  svg += `<text x="${sumpX + 18}" y="${sumpY + 18}" text-anchor="middle" font-size="5" fill="${C.water}">2000L</text>`;

  // Overhead tank at top
  const ohtX = ox + (plotW * 0.7) * SC;
  const ohtY = oy + 8;
  svg += `<rect x="${ohtX}" y="${ohtY}" width="36" height="20" fill="#D8EEFF" stroke="${C.water}" stroke-width="1.5"/>`;
  svg += `<text x="${ohtX + 18}" y="${ohtY + 10}" text-anchor="middle" font-size="6" fill="${C.water}" font-weight="bold">OHT</text>`;
  svg += `<text x="${ohtX + 18}" y="${ohtY + 17}" text-anchor="middle" font-size="5" fill="${C.water}">1000L</text>`;

  // Rising main from sump to OHT
  svg += `<line x1="${sumpX + 18}" y1="${sumpY}" x2="${sumpX + 18}" y2="${oy + pd / 2}" stroke="${C.water}" stroke-width="2"/>`;
  svg += `<line x1="${sumpX + 18}" y1="${oy + pd / 2}" x2="${ohtX + 18}" y2="${oy + pd / 2}" stroke="${C.water}" stroke-width="2"/>`;
  svg += `<line x1="${ohtX + 18}" y1="${oy + pd / 2}" x2="${ohtX + 18}" y2="${ohtY + 20}" stroke="${C.water}" stroke-width="2"/>`;
  svg += `<text x="${sumpX + 22}" y="${oy + pd / 2 - 3}" font-size="5" fill="${C.water}">25Ø RISING MAIN</text>`;

  // Cold water branches to wet rooms from OHT
  for (const room of [...toilets, ...kitchens]) {
    const rcx = ox + (room.x + room.width / 2) * SC;
    const rcy = oy + (room.y + room.depth / 2) * SC;
    // Branch line (20mm)
    svg += `<line x1="${ohtX + 18}" y1="${rcy}" x2="${rcx}" y2="${rcy}" stroke="${C.water}" stroke-width="1.5"/>`;
    svg += `<text x="${(ohtX + 18 + rcx) / 2}" y="${rcy - 4}" text-anchor="middle" font-size="5" fill="${C.water}">20Ø</text>`;
  }

  // Hot water supply (dashed red) from geyser to shower/sink in toilets
  for (const room of toilets) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;
    // Geyser location
    const gx = rx + rw - 12;
    const gy = ry + 12;
    svg += `<rect x="${gx - 6}" y="${gy - 6}" width="12" height="12" fill="#FFDDDD" stroke="${C.hotWater}" stroke-width="1.2"/>`;
    svg += `<text x="${gx}" y="${gy + 3}" text-anchor="middle" font-size="5" fill="${C.hotWater}" font-weight="bold">G</text>`;
    // Hot line to shower
    svg += `<line x1="${gx}" y1="${gy + 6}" x2="${rx + rw / 2}" y2="${ry + rd / 2}" stroke="${C.hotWater}" stroke-width="1.2" stroke-dasharray="4,2"/>`;
    svg += `<text x="${gx - 8}" y="${gy + rd / 3}" font-size="4" fill="${C.hotWater}">HOT 15Ø</text>`;
  }

  // Hot water to kitchen sink
  for (const room of kitchens) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    // Geyser near sink
    const gx = rx + rw / 2 - 20;
    const gy = ry + 18;
    svg += `<rect x="${gx - 6}" y="${gy - 6}" width="12" height="12" fill="#FFDDDD" stroke="${C.hotWater}" stroke-width="1.2"/>`;
    svg += `<text x="${gx}" y="${gy + 3}" text-anchor="middle" font-size="5" fill="${C.hotWater}" font-weight="bold">G</text>`;
    svg += `<line x1="${gx + 6}" y1="${gy}" x2="${rx + rw / 2}" y2="${ry + 18}" stroke="${C.hotWater}" stroke-width="1.2" stroke-dasharray="4,2"/>`;
  }

  // Drainage - soil lines from WC to external manholes
  const mhSpacing = 40;
  let mhCount = 0;

  for (const room of toilets) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const rd = room.depth * SC;
    // Soil line out from WC (100mm)
    const wcX = rx + 18;
    const wcY = ry + rd - 22;
    const mhX = bx - 15;
    const mhY = wcY;
    svg += `<line x1="${wcX}" y1="${wcY}" x2="${mhX + 6}" y2="${mhY}" stroke="${C.drain}" stroke-width="3" opacity="0.6"/>`;
    svg += `<text x="${(wcX + mhX) / 2}" y="${mhY - 5}" text-anchor="middle" font-size="5" fill="${C.drain}">100Ø SOIL</text>`;
    svg += drawManhole(mhX, mhY, `MH${++mhCount}`);
    // Slope arrow
    svg += `<text x="${(wcX + mhX) / 2}" y="${mhY + 8}" text-anchor="middle" font-size="4" fill="${C.drain}">1:40 FALL →</text>`;

    // Waste line from basin/shower (75mm)
    const wbX = rx + rw - 18;
    const wbY = ry + 22;
    svg += `<line x1="${wbX}" y1="${wbY}" x2="${mhX + 6}" y2="${mhY - mhSpacing * 0.3}" stroke="${C.drain}" stroke-width="2" opacity="0.5"/>`;
    svg += `<text x="${(wbX + mhX) / 2}" y="${wbY - 5}" text-anchor="middle" font-size="4" fill="${C.drain}">75Ø WASTE</text>`;

    // Vent pipe
    svg += `<line x1="${rx + rw / 2}" y1="${ry}" x2="${rx + rw / 2}" y2="${ry - 15}" stroke="${C.drain}" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>`;
    svg += `<text x="${rx + rw / 2 + 5}" y="${ry - 8}" font-size="4" fill="${C.drain}">50Ø VP</text>`;
  }

  // Kitchen waste line
  for (const room of kitchens) {
    const rx = ox + room.x * SC;
    const ry = oy + room.y * SC;
    const rw = room.width * SC;
    const sinkX = rx + rw / 2;
    const sinkY = ry + 18;
    const mhX = bx - 15;
    const mhY = sinkY + 10;
    svg += `<line x1="${sinkX}" y1="${sinkY}" x2="${mhX + 6}" y2="${mhY}" stroke="${C.drain}" stroke-width="2" opacity="0.5"/>`;
    svg += `<text x="${(sinkX + mhX) / 2}" y="${mhY - 5}" text-anchor="middle" font-size="4" fill="${C.drain}">75Ø WASTE</text>`;
    svg += drawManhole(mhX, mhY, `MH${++mhCount}`);
  }

  // RWP at building corners
  const rwpPositions = [
    { x: bx + 6, y: by + 6 },
    { x: bx + bw - 6, y: by + 6 },
    { x: bx + 6, y: by + bd - 6 },
    { x: bx + bw - 6, y: by + bd - 6 },
  ];
  for (const pos of rwpPositions) {
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="5" fill="none" stroke="${C.drain}" stroke-width="1.2"/>`;
    svg += `<text x="${pos.x}" y="${pos.y + 3}" text-anchor="middle" font-size="4" fill="${C.drain}" font-weight="bold">RWP</text>`;
  }

  // Septic tank / municipal sewer at front
  const stX = ox + (plotW * 0.6) * SC;
  const stY = oy + pd - 8;
  svg += `<rect x="${stX}" y="${stY}" width="60" height="16" fill="#F5EED8" stroke="${C.drain}" stroke-width="1.5"/>`;
  svg += `<text x="${stX + 30}" y="${stY + 11}" text-anchor="middle" font-size="5" fill="${C.drain}" font-weight="bold">CONNECTION TO MUNICIPAL SEWER</text>`;

  // Drain line from last manhole to sewer
  if (mhCount > 0) {
    svg += `<line x1="${bx - 15}" y1="${by + bd - 20}" x2="${stX}" y2="${stY + 8}" stroke="${C.drain}" stroke-width="3" opacity="0.5"/>`;
    svg += `<text x="${bx + bw / 3}" y="${by + bd + 10}" font-size="5" fill="${C.drain}">100Ø TO SEWER →</text>`;
  }

  // Pipe size schedule table
  const tableX = svgW - MARGIN - 200;
  const tableY = svgH - MARGIN - 120;
  svg += `<text x="${tableX}" y="${tableY - 6}" font-size="7" fill="${C.text}" font-weight="bold">PIPE SIZE SCHEDULE</text>`;
  svg += drawTable(tableX, tableY,
    ['Line', 'Size', 'Material'],
    [
      ['Cold Water Main', '25mm', 'CPVC'],
      ['CW Branch', '20mm', 'CPVC'],
      ['CW Sub-branch', '15mm', 'CPVC'],
      ['Hot Water', '15mm', 'CPVC'],
      ['Soil Line', '100mm', 'SWR PVC'],
      ['Waste Line', '75mm', 'SWR PVC'],
      ['Vent Pipe', '50mm', 'SWR PVC'],
      ['Rain Water', '110mm', 'PVC'],
    ],
    [85, 50, 60]
  );

  // Legend
  const lgX = MARGIN + 10;
  const lgY = svgH - MARGIN - 105;
  svg += `<rect x="${lgX}" y="${lgY}" width="150" height="95" fill="#FAFAFA" stroke="${C.dim}" stroke-width="0.5"/>`;
  svg += `<text x="${lgX + 75}" y="${lgY + 12}" text-anchor="middle" font-size="7" fill="${C.text}" font-weight="bold">LEGEND</text>`;
  const legItems: Array<[string, string, string, string]> = [
    [C.water, '2.5', '', 'Cold Water Supply'],
    [C.hotWater, '1.5', '4,2', 'Hot Water Supply'],
    [C.drain, '3', '', 'Soil/Drainage Line'],
    [C.drain, '1', '3,2', 'Vent Pipe'],
  ];
  legItems.forEach(([color, sw, dash, desc], i) => {
    const iy = lgY + 24 + i * 14;
    svg += `<line x1="${lgX + 8}" y1="${iy}" x2="${lgX + 35}" y2="${iy}" stroke="${color}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    svg += `<text x="${lgX + 42}" y="${iy + 3}" font-size="6" fill="${C.text}">${desc}</text>`;
  });
  // Fixture symbols in legend
  const fiy = lgY + 24 + legItems.length * 14 + 4;
  svg += `<rect x="${lgX + 10}" y="${fiy - 4}" width="8" height="8" fill="${C.drain}" opacity="0.7" stroke="#553322" stroke-width="0.8"/>`;
  svg += `<text x="${lgX + 42}" y="${fiy + 3}" font-size="6" fill="${C.text}">Manhole</text>`;
  svg += `<circle cx="${lgX + 14}" cy="${fiy + 14}" r="4" fill="none" stroke="${C.drain}" stroke-width="1"/>`;
  svg += `<text x="${lgX + 42}" y="${fiy + 17}" font-size="6" fill="${C.text}">Rain Water Pipe</text>`;

  svg += `</svg>`;
  return svg;
}
