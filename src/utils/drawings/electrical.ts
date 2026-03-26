import { Layout } from '../../types';
import { C, MARGIN, SC, drawingBorder, northArrow, legend, gridLabels } from '../drawingHelpers';

function symbolSwitch(x: number, y: number): string {
  return `<g>
    <rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="white" stroke="${C.text}" stroke-width="1"/>
    <text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="8" font-weight="bold" fill="${C.text}">S</text>
  </g>`;
}

function symbolSocket(x: number, y: number): string {
  return `<g>
    <rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="white" stroke="${C.text}" stroke-width="1"/>
    <rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="none" stroke="${C.text}" stroke-width="0.8"/>
    <circle cx="${x}" cy="${y}" r="1.5" fill="${C.text}"/>
  </g>`;
}

function symbolLight(x: number, y: number): string {
  return `<g>
    <circle cx="${x}" cy="${y}" r="6" fill="#fff9c4" stroke="#f57f17" stroke-width="1.2"/>
    <line x1="${x - 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 4}" stroke="#f57f17" stroke-width="0.8"/>
    <line x1="${x + 4}" y1="${y - 4}" x2="${x - 4}" y2="${y + 4}" stroke="#f57f17" stroke-width="0.8"/>
    <line x1="${x}" y1="${y - 5.5}" x2="${x}" y2="${y + 5.5}" stroke="#f57f17" stroke-width="0.8"/>
    <line x1="${x - 5.5}" y1="${y}" x2="${x + 5.5}" y2="${y}" stroke="#f57f17" stroke-width="0.8"/>
  </g>`;
}

function symbolFan(x: number, y: number): string {
  return `<g>
    <circle cx="${x}" cy="${y}" r="6" fill="white" stroke="${C.text}" stroke-width="1"/>
    <text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="8" font-weight="bold" fill="${C.text}">F</text>
  </g>`;
}

function symbolAC(x: number, y: number): string {
  return `<g>
    <rect x="${x - 8}" y="${y - 4}" width="16" height="8" rx="2" fill="white" stroke="#2980b9" stroke-width="1.2"/>
    <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="6" font-weight="bold" fill="#2980b9">AC</text>
  </g>`;
}

function symbolDB(x: number, y: number): string {
  return `<g>
    <rect x="${x - 10}" y="${y - 8}" width="20" height="16" fill="white" stroke="#e74c3c" stroke-width="1.5"/>
    <line x1="${x - 10}" y1="${y - 2}" x2="${x + 10}" y2="${y - 2}" stroke="#e74c3c" stroke-width="0.8"/>
    <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="5" font-weight="bold" fill="#e74c3c">DB</text>
  </g>`;
}

export function renderElectrical(layout: Layout, numFloors: number): string {
  const floor = layout.floors[0];
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const sb = layout.setbacks;
  const bx0 = sb.left;
  const by0 = sb.front;
  const bw = plotW - sb.left - sb.right;
  const bd = plotD - sb.front - sb.rear;
  const svgW = Math.max(700, MARGIN * 2 + plotW * SC + 120);
  const svgH = Math.max(500, MARGIN * 2 + plotD * SC + 80);
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;
  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'ELECTRICAL LAYOUT', `Ground Floor | ${numFloors}-Storey Residential`));
  p.push(northArrow(svgW - 40, 70));

  // Plot and building outlines
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="1" stroke-dasharray="10,5"/>`);
  p.push(`<rect x="${tx(bx0)}" y="${ty(by0)}" width="${bw * SC}" height="${bd * SC}" fill="#fafafa" stroke="${C.wall}" stroke-width="2"/>`);

  // Room outlines and electrical fixtures
  let dbPlaced = false;
  floor.rooms.forEach((r) => {
    const rx = bx0 + r.x;
    const ry = by0 + r.y;
    const rw = r.width;
    const rd = r.depth;
    const rcx = tx(rx + rw / 2);
    const rcy = ty(ry + rd / 2);

    // Room outline
    p.push(`<rect x="${tx(rx)}" y="${ty(ry)}" width="${rw * SC}" height="${rd * SC}" fill="none" stroke="${C.dim}" stroke-width="0.8"/>`);

    // Room label
    p.push(`<text x="${rcx}" y="${ty(ry) + 12}" text-anchor="middle" font-size="7" fill="${C.dim}" font-style="italic">${r.name}</text>`);

    // Light point at ceiling center
    p.push(symbolLight(rcx, rcy));

    // Fan point (for rooms > 8 sqm, offset from light)
    if (rw * rd > 8) {
      p.push(symbolFan(rcx + 20, rcy - 15));
    }

    // Switch near door (bottom-left of room)
    p.push(symbolSwitch(tx(rx) + 8, ty(ry + rd) - 12));

    // Circuit run from switch to light (dashed)
    p.push(`<line x1="${tx(rx) + 8}" y1="${ty(ry + rd) - 17}" x2="${tx(rx) + 8}" y2="${rcy + 8}" stroke="#e67e22" stroke-width="0.6" stroke-dasharray="3,2"/>`);
    p.push(`<line x1="${tx(rx) + 8}" y1="${rcy + 8}" x2="${rcx - 8}" y2="${rcy + 8}" stroke="#e67e22" stroke-width="0.6" stroke-dasharray="3,2"/>`);

    // Socket positions based on room type
    if (r.type === 'bedroom') {
      // Two sockets: near bed area and study
      p.push(symbolSocket(tx(rx + rw) - 12, rcy + 10));
      p.push(symbolSocket(tx(rx) + 12, rcy - 10));
      // AC point
      p.push(symbolAC(tx(rx + rw) - 15, ty(ry) + 12));
    } else if (r.type === 'kitchen') {
      // Multiple sockets for appliances
      p.push(symbolSocket(tx(rx + rw) - 12, ty(ry) + 15));
      p.push(symbolSocket(tx(rx + rw) - 12, rcy));
      p.push(symbolSocket(tx(rx + rw) - 12, ty(ry + rd) - 15));
      // Exhaust fan point
      p.push(symbolFan(tx(rx + rw) - 12, ty(ry) + 30));
    } else if (r.type === 'living' || r.type === 'hall') {
      // Sockets on two walls
      p.push(symbolSocket(tx(rx + rw) - 12, rcy));
      p.push(symbolSocket(tx(rx) + 12, rcy));
      p.push(symbolSocket(rcx, ty(ry + rd) - 12));
      // AC point
      p.push(symbolAC(tx(rx + rw) - 15, ty(ry) + 12));
      // Additional light for large rooms
      if (rw * rd > 15) {
        p.push(symbolLight(rcx - 25, rcy));
        p.push(symbolLight(rcx + 25, rcy));
      }
    } else if (r.type === 'toilet' || r.type === 'bathroom') {
      // Waterproof socket, exhaust
      p.push(symbolSocket(tx(rx) + 12, ty(ry) + 12));
      p.push(symbolFan(tx(rx + rw) - 12, ty(ry) + 12));
    } else {
      // Default: one socket
      p.push(symbolSocket(tx(rx + rw) - 12, rcy));
    }

    // Distribution board near entrance (place once)
    if (!dbPlaced && (r.type === 'living' || r.type === 'hall' || r.type === 'passage')) {
      p.push(symbolDB(tx(rx) + 15, ty(ry + rd) - 20));
      p.push(`<text x="${tx(rx) + 15}" y="${ty(ry + rd) - 30}" text-anchor="middle" font-size="6" fill="#e74c3c" font-weight="bold">DIST. BOARD</text>`);
      dbPlaced = true;
    }
  });

  // If DB not placed, place near building entrance
  if (!dbPlaced) {
    const dbX = tx(bx0 + bw / 2 + 0.5);
    const dbY = ty(by0 + bd) - 15;
    p.push(symbolDB(dbX, dbY));
    p.push(`<text x="${dbX}" y="${dbY - 12}" text-anchor="middle" font-size="6" fill="#e74c3c" font-weight="bold">DIST. BOARD</text>`);
  }

  // Meter board outside
  const meterX = tx(bx0 + bw / 2 - 1);
  const meterY = ty(by0 + bd) + 20;
  p.push(`<rect x="${meterX - 12}" y="${meterY - 8}" width="24" height="16" fill="white" stroke="#e74c3c" stroke-width="1.5"/>`);
  p.push(`<text x="${meterX}" y="${meterY + 4}" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#e74c3c">METER</text>`);
  // Main supply line
  p.push(`<line x1="${meterX}" y1="${meterY - 8}" x2="${meterX}" y2="${ty(by0 + bd)}" stroke="#e74c3c" stroke-width="1.5"/>`);

  p.push(gridLabels(tx, ty, bx0, by0, bw, bd, floor.rooms));

  // Legend
  const legX = tx(0) + 10;
  const legY = ty(plotD) + 35;
  p.push(`<text x="${legX}" y="${legY}" font-size="9" font-weight="bold" fill="${C.text}">LEGEND:</text>`);
  const legendItems = [
    { sym: symbolLight, label: 'Light Point' },
    { sym: symbolFan, label: 'Fan / Exhaust' },
    { sym: symbolSwitch, label: 'Switch Board' },
    { sym: symbolSocket, label: 'Power Socket' },
    { sym: symbolAC, label: 'AC Point' },
    { sym: symbolDB, label: 'Distribution Board' },
  ];
  legendItems.forEach((item, i) => {
    const ix = legX + (i % 3) * 140;
    const iy = legY + 18 + Math.floor(i / 3) * 20;
    p.push(item.sym(ix + 8, iy));
    p.push(`<text x="${ix + 22}" y="${iy + 4}" font-size="7" fill="${C.text}">${item.label}</text>`);
  });

  const notes = [
    'NOTES:',
    '1. Wiring: Concealed copper (FR-LSH) in PVC conduit',
    '2. Light circuit: 1.5 sq mm, Power: 2.5 sq mm, AC: 4 sq mm',
    '3. MCB rating: Light 6A, Power 16A, AC 20A',
    '4. ELCB/RCCB: 63A, 30mA sensitivity at main',
    '5. Earthing: Plate earthing as per IS 3043',
    '6. Switch height: 1200mm AFL, Socket: 300mm AFL',
    '7. All wiring as per IS 732 & National Electrical Code',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
