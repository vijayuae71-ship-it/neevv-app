import { Layout } from '../../types';
import { C, MARGIN, SC, dimChain, drawingBorder, northArrow, legend, gridLabels, brickHatch } from '../drawingHelpers';

export function renderBrickwork(layout: Layout, numFloors: number): string {
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

  const wallThick230 = 230 / 1000 * SC; // 230mm wall in SVG units
  const wallThick115 = 115 / 1000 * SC; // 115mm partition wall

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'BRICKWORK LAYOUT', `Ground Floor | Plot: ${plotW}m × ${plotD}m`));
  p.push(northArrow(svgW - 40, 70));

  // Defs for brick hatch
  p.push(`<defs>`);
  p.push(`<pattern id="brickPat" width="12" height="6" patternUnits="userSpaceOnUse">`);
  p.push(`<rect width="12" height="6" fill="#f5d5b8"/>`);
  p.push(`<line x1="0" y1="0" x2="12" y2="0" stroke="#c0956e" stroke-width="0.3"/>`);
  p.push(`<line x1="0" y1="3" x2="12" y2="3" stroke="#c0956e" stroke-width="0.3"/>`);
  p.push(`<line x1="6" y1="0" x2="6" y2="3" stroke="#c0956e" stroke-width="0.3"/>`);
  p.push(`<line x1="0" y1="3" x2="0" y2="6" stroke="#c0956e" stroke-width="0.3"/>`);
  p.push(`</pattern>`);
  p.push(`<pattern id="partitionPat" width="8" height="4" patternUnits="userSpaceOnUse">`);
  p.push(`<rect width="8" height="4" fill="#fce4cc"/>`);
  p.push(`<line x1="0" y1="2" x2="8" y2="2" stroke="#d4a574" stroke-width="0.3"/>`);
  p.push(`<line x1="4" y1="0" x2="4" y2="2" stroke="#d4a574" stroke-width="0.3"/>`);
  p.push(`</pattern>`);
  p.push(`</defs>`);

  // Plot boundary
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="1.5" stroke-dasharray="10,5"/>`);

  // Building outline (outer wall - 230mm thick)
  const half230 = wallThick230 / 2;
  p.push(`<rect x="${tx(bx0) - half230}" y="${ty(by0) - half230}" width="${bw * SC + wallThick230}" height="${bd * SC + wallThick230}" fill="url(#brickPat)" stroke="${C.wall}" stroke-width="2"/>`);
  p.push(`<rect x="${tx(bx0) + half230}" y="${ty(by0) + half230}" width="${bw * SC - wallThick230}" height="${bd * SC - wallThick230}" fill="white" stroke="${C.wall}" stroke-width="1.5"/>`);

  // Track lintels
  let lintelCount = 0;
  const lintels: string[] = [];

  // Room partitions (internal walls)
  floor.rooms.forEach((r, ri) => {
    const rx = bx0 + r.x;
    const ry = by0 + r.y;
    const rw = r.width;
    const rd = r.depth;
    const isWet = r.type === 'toilet' || r.type === 'bathroom' || r.type === 'kitchen';
    const isPartition = r.type === 'store' || r.type === 'utility';

    // Draw internal walls for room boundaries (not on building edge)
    const wallPat = isPartition ? 'url(#partitionPat)' : 'url(#brickPat)';
    const wallW = isPartition ? wallThick115 : wallThick230;
    const wallType = isPartition ? '115mm' : '230mm';

    // Right wall (if not at building right edge)
    if (r.x + r.width < bw - 0.1) {
      p.push(`<rect x="${tx(rx + rw) - wallW / 2}" y="${ty(ry)}" width="${wallW}" height="${rd * SC}" fill="${wallPat}" stroke="${C.wall}" stroke-width="1"/>`);
    }
    // Bottom wall (if not at building bottom edge)
    if (r.y + r.depth < bd - 0.1) {
      p.push(`<rect x="${tx(rx)}" y="${ty(ry + rd) - wallW / 2}" width="${rw * SC}" height="${wallW}" fill="${wallPat}" stroke="${C.wall}" stroke-width="1"/>`);
    }

    // Door opening (assume door on most accessible wall)
    const doorW = isWet ? 0.75 : 0.9; // 750mm for wet, 900mm for others
    const doorX = tx(rx + 0.3);
    const doorY = ty(ry + rd) - wallW / 2;
    if (r.y + r.depth < bd - 0.1) {
      // Door opening in bottom wall
      p.push(`<rect x="${doorX}" y="${doorY - 1}" width="${doorW * SC}" height="${wallW + 2}" fill="white" stroke="none"/>`);
      // Door swing arc
      p.push(`<path d="M${doorX},${doorY + wallW} A${doorW * SC},${doorW * SC} 0 0,1 ${doorX + doorW * SC},${doorY + wallW}" fill="none" stroke="${C.dim}" stroke-width="0.5" stroke-dasharray="3,2"/>`);
      // Lintel mark
      lintelCount++;
      const lMark = `L${lintelCount}`;
      p.push(`<line x1="${doorX - 3}" y1="${doorY - 2}" x2="${doorX + doorW * SC + 3}" y2="${doorY - 2}" stroke="${C.accent}" stroke-width="1.5"/>`);
      p.push(`<text x="${doorX + doorW * SC / 2}" y="${doorY - 5}" text-anchor="middle" font-size="6" fill="${C.accent}" font-weight="bold">${lMark}</text>`);
      lintels.push(`${lMark}: ${(doorW + 0.3).toFixed(1)}m (${r.name})`);
    }

    // Window openings for rooms on exterior walls
    if (r.type === 'bedroom' || r.type === 'living' || r.type === 'hall') {
      // Window on outer wall
      const winW = 1.2;
      if (r.y < 0.1) {
        // Room at front - window on front wall
        const winX = tx(rx + rw / 2 - winW / 2);
        const winY = ty(by0) - half230;
        p.push(`<rect x="${winX}" y="${winY - 1}" width="${winW * SC}" height="${wallThick230 + 2}" fill="white" stroke="none"/>`);
        p.push(`<line x1="${winX}" y1="${winY + wallThick230 / 2}" x2="${winX + winW * SC}" y2="${winY + wallThick230 / 2}" stroke="${C.text}" stroke-width="1" stroke-dasharray="4,2"/>`);
        // Sill mark
        p.push(`<text x="${winX + winW * SC / 2}" y="${winY - 4}" text-anchor="middle" font-size="6" fill="#27ae60" font-weight="bold">W${ri + 1}</text>`);
      }
    }

    // Room label
    const cx = tx(rx + rw / 2);
    const cy = ty(ry + rd / 2);
    p.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="8" font-weight="bold" fill="${C.text}">${r.name.toUpperCase()}</text>`);
    p.push(`<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="6.5" fill="${C.dim}">${rw.toFixed(1)}×${rd.toFixed(1)}m</text>`);
    p.push(`<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="6" fill="${isPartition ? '#e67e22' : '#8e44ad'}">[${wallType} wall]</text>`);
  });

  // Main entrance door
  const mainDoorW = 1.0;
  const mainDoorX = tx(bx0 + bw / 2 - mainDoorW / 2);
  const mainDoorY = ty(by0 + bd) - half230;
  p.push(`<rect x="${mainDoorX}" y="${mainDoorY - 1}" width="${mainDoorW * SC}" height="${wallThick230 + 2}" fill="white" stroke="none"/>`);
  p.push(`<path d="M${mainDoorX},${mainDoorY + wallThick230 + 2} A${mainDoorW * SC},${mainDoorW * SC} 0 0,0 ${mainDoorX + mainDoorW * SC},${mainDoorY + wallThick230 + 2}" fill="none" stroke="${C.dim}" stroke-width="0.5" stroke-dasharray="3,2"/>`);
  p.push(`<text x="${mainDoorX + mainDoorW * SC / 2}" y="${mainDoorY + wallThick230 + 16}" text-anchor="middle" font-size="7" fill="${C.accent}" font-weight="bold">MAIN DOOR (1000mm)</text>`);
  lintelCount++;
  p.push(`<line x1="${mainDoorX - 3}" y1="${mainDoorY - 2}" x2="${mainDoorX + mainDoorW * SC + 3}" y2="${mainDoorY - 2}" stroke="${C.accent}" stroke-width="1.5"/>`);
  p.push(`<text x="${mainDoorX + mainDoorW * SC / 2}" y="${mainDoorY - 5}" text-anchor="middle" font-size="6" fill="${C.accent}" font-weight="bold">L${lintelCount}</text>`);

  // Dimension chains
  p.push(dimChain(tx(0), ty(plotD) + 30, tx(plotW), ty(plotD) + 30, `${plotW.toFixed(1)}m`, 'h'));
  p.push(dimChain(tx(bx0), ty(plotD) + 50, tx(bx0 + bw), ty(plotD) + 50, `${bw.toFixed(1)}m`, 'h'));
  p.push(dimChain(tx(plotW) + 30, ty(0), tx(plotW) + 30, ty(plotD), `${plotD.toFixed(1)}m`, 'v'));

  p.push(gridLabels(tx, ty, bx0, by0, bw, bd, floor.rooms));

  const lintelList = lintels.length > 0 ? lintels.join(', ') : 'As per door schedule';
  const notes = [
    'NOTES:',
    '1. Outer walls: 230mm thick (9" brick)',
    '2. Partition walls: 115mm thick (4.5" brick)',
    '3. Mortar: CM 1:6 for superstructure',
    '4. Brick: Class A (min 3.5 N/mm² compressive)',
    '5. Lintels: RCC 150×230mm, M20 grade',
    `6. Lintel schedule: ${lintelList}`,
    '7. Sill height: 900mm (windows), 600mm (ventilators)',
    '8. All dimensions in meters unless noted',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
