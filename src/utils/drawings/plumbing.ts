import { Layout } from '../../types';
import { C, MARGIN, SC, drawingBorder, northArrow, legend, gridLabels } from '../drawingHelpers';

function symbolWC(x: number, y: number): string {
  return `<g>
    <ellipse cx="${x}" cy="${y + 3}" rx="5" ry="7" fill="white" stroke="#2980b9" stroke-width="1"/>
    <rect x="${x - 5}" y="${y - 8}" width="10" height="8" rx="2" fill="white" stroke="#2980b9" stroke-width="1"/>
    <text x="${x}" y="${y - 2}" text-anchor="middle" font-size="5" fill="#2980b9">WC</text>
  </g>`;
}

function symbolWashBasin(x: number, y: number): string {
  return `<g>
    <ellipse cx="${x}" cy="${y}" rx="6" ry="4" fill="white" stroke="#2980b9" stroke-width="1"/>
    <circle cx="${x}" cy="${y}" r="1.5" fill="#2980b9"/>
    <text x="${x}" y="${y + 10}" text-anchor="middle" font-size="5" fill="#2980b9">WB</text>
  </g>`;
}

function symbolSink(x: number, y: number): string {
  return `<g>
    <rect x="${x - 7}" y="${y - 4}" width="14" height="8" rx="1" fill="white" stroke="#2980b9" stroke-width="1"/>
    <circle cx="${x - 2}" cy="${y}" r="1.5" fill="#2980b9"/>
    <circle cx="${x + 3}" cy="${y}" r="1.5" fill="#2980b9"/>
    <text x="${x}" y="${y + 12}" text-anchor="middle" font-size="5" fill="#2980b9">SINK</text>
  </g>`;
}

function symbolFloorTrap(x: number, y: number): string {
  return `<g>
    <circle cx="${x}" cy="${y}" r="4" fill="white" stroke="#8e6f3e" stroke-width="1"/>
    <line x1="${x - 2.5}" y1="${y - 2.5}" x2="${x + 2.5}" y2="${y + 2.5}" stroke="#8e6f3e" stroke-width="0.6"/>
    <line x1="${x + 2.5}" y1="${y - 2.5}" x2="${x - 2.5}" y2="${y + 2.5}" stroke="#8e6f3e" stroke-width="0.6"/>
    <text x="${x}" y="${y + 9}" text-anchor="middle" font-size="4" fill="#8e6f3e">FT</text>
  </g>`;
}

function slopeArrow(x1: number, y1: number, x2: number, y2: number): string {
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8e6f3e" stroke-width="1" marker-end="url(#slopeArr)"/>
    <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-size="5" fill="#8e6f3e">1:60</text>
  </g>`;
}

export function renderPlumbing(layout: Layout, numFloors: number): string {
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
  p.push(drawingBorder(svgW, svgH, 'PLUMBING LAYOUT', `Ground Floor | ${numFloors}-Storey Residential`));
  p.push(northArrow(svgW - 40, 70));

  // Defs
  p.push(`<defs>`);
  p.push(`<marker id="slopeArr" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4Z" fill="#8e6f3e"/></marker>`);
  p.push(`</defs>`);

  // Plot and building outlines
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="1" stroke-dasharray="10,5"/>`);
  p.push(`<rect x="${tx(bx0)}" y="${ty(by0)}" width="${bw * SC}" height="${bd * SC}" fill="#fafafa" stroke="${C.wall}" stroke-width="2"/>`);

  // Room outlines and plumbing fixtures
  const wetRooms: Array<{ x: number; y: number; w: number; d: number; type: string; name: string }> = [];

  floor.rooms.forEach((r) => {
    const rx = bx0 + r.x;
    const ry = by0 + r.y;
    const rw = r.width;
    const rd = r.depth;

    // Room outline
    const isWet = r.type === 'toilet' || r.type === 'bathroom' || r.type === 'kitchen';
    p.push(`<rect x="${tx(rx)}" y="${ty(ry)}" width="${rw * SC}" height="${rd * SC}" fill="${isWet ? '#e8f4fd' : 'none'}" stroke="${C.dim}" stroke-width="0.8"/>`);

    // Room label
    p.push(`<text x="${tx(rx + rw / 2)}" y="${ty(ry) + 12}" text-anchor="middle" font-size="7" fill="${C.dim}" font-style="italic">${r.name}</text>`);

    if (isWet) {
      wetRooms.push({ x: rx, y: ry, w: rw, d: rd, type: r.type, name: r.name });
    }

    // Plumbing fixtures based on room type
    if (r.type === 'toilet' || r.type === 'bathroom') {
      // WC
      p.push(symbolWC(tx(rx + rw - 0.4), ty(ry + 0.4)));
      // Wash basin
      p.push(symbolWashBasin(tx(rx + 0.4), ty(ry + 0.4)));
      // Floor trap
      p.push(symbolFloorTrap(tx(rx + rw / 2), ty(ry + rd - 0.4)));
      // Slope arrow to floor trap
      p.push(slopeArrow(tx(rx + 0.3), ty(ry + rd / 2), tx(rx + rw / 2) - 6, ty(ry + rd - 0.4)));

      // Water supply line (blue)
      p.push(`<line x1="${tx(rx)}" y1="${ty(ry + 0.3)}" x2="${tx(rx + rw - 0.2)}" y2="${ty(ry + 0.3)}" stroke="#2980b9" stroke-width="1.5"/>`);
      p.push(`<text x="${tx(rx + rw / 2)}" y="${ty(ry + 0.3) - 4}" text-anchor="middle" font-size="4.5" fill="#2980b9">CW 15mm CPVC</text>`);

      // Hot water line (red) - for bathroom
      if (r.type === 'bathroom') {
        p.push(`<line x1="${tx(rx)}" y1="${ty(ry + 0.5)}" x2="${tx(rx + 0.6)}" y2="${ty(ry + 0.5)}" stroke="#e74c3c" stroke-width="1.2" stroke-dasharray="4,2"/>`);
        p.push(`<text x="${tx(rx + 0.3)}" y="${ty(ry + 0.5) + 8}" text-anchor="middle" font-size="4.5" fill="#e74c3c">HW 15mm</text>`);
      }

      // Drain line (brown)
      p.push(`<line x1="${tx(rx + rw / 2)}" y1="${ty(ry + rd - 0.3)}" x2="${tx(rx + rw)}" y2="${ty(ry + rd - 0.3)}" stroke="#8e6f3e" stroke-width="2" stroke-dasharray="6,2"/>`);
      p.push(`<text x="${tx(rx + rw - 0.3)}" y="${ty(ry + rd - 0.3) - 4}" text-anchor="middle" font-size="4.5" fill="#8e6f3e">75mm PVC</text>`);

      // Soil pipe from WC
      p.push(`<line x1="${tx(rx + rw - 0.4)}" y1="${ty(ry + 0.7)}" x2="${tx(rx + rw)}" y2="${ty(ry + 0.7)}" stroke="#5d4037" stroke-width="2.5"/>`);
      p.push(`<text x="${tx(rx + rw) + 3}" y="${ty(ry + 0.7) + 3}" font-size="4.5" fill="#5d4037">110mm</text>`);
    }

    if (r.type === 'kitchen') {
      // Kitchen sink
      p.push(symbolSink(tx(rx + rw - 0.5), ty(ry + 0.5)));
      // Floor trap
      p.push(symbolFloorTrap(tx(rx + rw / 2), ty(ry + rd - 0.3)));

      // Water supply
      p.push(`<line x1="${tx(rx)}" y1="${ty(ry + 0.4)}" x2="${tx(rx + rw - 0.3)}" y2="${ty(ry + 0.4)}" stroke="#2980b9" stroke-width="1.5"/>`);
      p.push(`<text x="${tx(rx + rw / 2)}" y="${ty(ry + 0.4) - 4}" text-anchor="middle" font-size="4.5" fill="#2980b9">CW 15mm CPVC</text>`);

      // Hot water line
      p.push(`<line x1="${tx(rx)}" y1="${ty(ry + 0.6)}" x2="${tx(rx + rw - 0.3)}" y2="${ty(ry + 0.6)}" stroke="#e74c3c" stroke-width="1.2" stroke-dasharray="4,2"/>`);
      p.push(`<text x="${tx(rx + rw / 2)}" y="${ty(ry + 0.6) + 8}" text-anchor="middle" font-size="4.5" fill="#e74c3c">HW 15mm CPVC</text>`);

      // Drain
      p.push(`<line x1="${tx(rx + rw - 0.5)}" y1="${ty(ry + 0.8)}" x2="${tx(rx + rw)}" y2="${ty(ry + 0.8)}" stroke="#8e6f3e" stroke-width="1.5" stroke-dasharray="6,2"/>`);
      p.push(`<text x="${tx(rx + rw) + 3}" y="${ty(ry + 0.8) + 3}" font-size="4.5" fill="#8e6f3e">50mm</text>`);

      // Slope arrow
      p.push(slopeArrow(tx(rx + rw - 0.8), ty(ry + rd / 2), tx(rx + rw / 2) + 5, ty(ry + rd - 0.3)));
    }
  });

  // Main water supply riser (blue, thick)
  const riserX = tx(bx0 - 0.3);
  p.push(`<line x1="${riserX}" y1="${ty(by0)}" x2="${riserX}" y2="${ty(by0 + bd)}" stroke="#2980b9" stroke-width="2.5"/>`);
  p.push(`<text x="${riserX - 3}" y="${ty(by0 + bd / 2)}" text-anchor="end" font-size="6" fill="#2980b9" transform="rotate(-90,${riserX - 3},${ty(by0 + bd / 2)})">MAIN SUPPLY RISER 25mm</text>`);

  // Main drain line (brown, thick)
  const drainY = ty(by0 + bd + 0.3);
  p.push(`<line x1="${tx(bx0)}" y1="${drainY}" x2="${tx(bx0 + bw)}" y2="${drainY}" stroke="#8e6f3e" stroke-width="3"/>`);
  p.push(`<text x="${tx(bx0 + bw / 2)}" y="${drainY + 12}" text-anchor="middle" font-size="6" fill="#8e6f3e">MAIN DRAIN 110mm PVC → MUNICIPAL SEWER</text>`);
  // Slope arrow on drain
  p.push(slopeArrow(tx(bx0 + bw / 2), drainY - 6, tx(bx0 + bw) - 10, drainY - 6));

  // Overhead tank position (top-right)
  const ohtX = tx(bx0 + bw) + 15;
  const ohtY = ty(by0) - 10;
  p.push(`<rect x="${ohtX}" y="${ohtY}" width="30" height="20" rx="3" fill="#d4e6f1" stroke="#2980b9" stroke-width="1.5"/>`);
  p.push(`<text x="${ohtX + 15}" y="${ohtY + 13}" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#2980b9">OHT</text>`);
  p.push(`<text x="${ohtX + 15}" y="${ohtY + 28}" text-anchor="middle" font-size="5" fill="#2980b9">1000L</text>`);

  // Underground sump position (bottom-left)
  const sumpX = tx(bx0) - 35;
  const sumpY = ty(by0 + bd) - 20;
  p.push(`<rect x="${sumpX}" y="${sumpY}" width="30" height="20" rx="3" fill="#fadbd8" stroke="#e74c3c" stroke-width="1.5"/>`);
  p.push(`<text x="${sumpX + 15}" y="${sumpY + 13}" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#e74c3c">SUMP</text>`);
  p.push(`<text x="${sumpX + 15}" y="${sumpY + 28}" text-anchor="middle" font-size="5" fill="#e74c3c">2000L</text>`);

  // Geyser position (in/near bathroom)
  const bathRoom = floor.rooms.find((r) => r.type === 'bathroom' || r.type === 'toilet');
  if (bathRoom) {
    const gx = tx(bx0 + bathRoom.x + bathRoom.width - 0.3);
    const gy = ty(by0 + bathRoom.y + bathRoom.depth - 0.3);
    p.push(`<rect x="${gx - 6}" y="${gy - 6}" width="12" height="12" rx="2" fill="#fdebd0" stroke="#e67e22" stroke-width="1"/>`);
    p.push(`<text x="${gx}" y="${gy + 3}" text-anchor="middle" font-size="5" font-weight="bold" fill="#e67e22">G</text>`);
    p.push(`<text x="${gx}" y="${gy + 14}" text-anchor="middle" font-size="4.5" fill="#e67e22">GEYSER</text>`);
  }

  p.push(gridLabels(tx, ty, bx0, by0, bw, bd, floor.rooms));

  // Color legend
  const legX = tx(0) + 10;
  const legY = ty(plotD) + 35;
  p.push(`<text x="${legX}" y="${legY}" font-size="9" font-weight="bold" fill="${C.text}">PIPE LEGEND:</text>`);
  const pipes = [
    { color: '#2980b9', dash: '', label: 'Cold Water Supply (CPVC)', size: '15-25mm' },
    { color: '#e74c3c', dash: '4,2', label: 'Hot Water Supply (CPVC)', size: '15mm' },
    { color: '#8e6f3e', dash: '6,2', label: 'Waste/Drain Line (PVC)', size: '50-75mm' },
    { color: '#5d4037', dash: '', label: 'Soil Pipe (PVC)', size: '110mm' },
  ];
  pipes.forEach((pipe, i) => {
    const iy = legY + 14 + i * 14;
    p.push(`<line x1="${legX}" y1="${iy}" x2="${legX + 30}" y2="${iy}" stroke="${pipe.color}" stroke-width="2" ${pipe.dash ? `stroke-dasharray="${pipe.dash}"` : ''}/>`);
    p.push(`<text x="${legX + 35}" y="${iy + 3}" font-size="7" fill="${C.text}">${pipe.label} (${pipe.size})</text>`);
  });

  const notes = [
    'NOTES:',
    '1. All supply pipes: CPVC as per IS 15778',
    '2. Drain/waste pipes: uPVC SWR as per IS 13592',
    '3. Floor slope in wet areas: 1:60 towards floor trap',
    '4. Anti-siphon trap at every fixture',
    '5. Vent pipe: 75mm PVC extending 1m above terrace',
    '6. Pressure testing: 6 kg/cm² for 24 hrs',
    '7. Sump capacity: 2000L, OHT: 1000L (per floor)',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
