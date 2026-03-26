import { Layout } from '../../types';
import { C, MARGIN, SC, dimChain, drawingBorder, northArrow, legend, gridLabels } from '../drawingHelpers';

export function renderExcavation(layout: Layout, numFloors: number): string {
  const floor = layout.floors[0];
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const sb = layout.setbacks;
  const svgW = Math.max(700, MARGIN * 2 + plotW * SC + 120);
  const svgH = Math.max(500, MARGIN * 2 + plotD * SC + 80);
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;
  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'EXCAVATION DRAWING', `Plot: ${plotW}m × ${plotD}m | Floors: ${numFloors}`));
  p.push(northArrow(svgW - 40, 70));

  // Defs: earth hatch pattern
  p.push(`<defs>`);
  p.push(`<pattern id="earthHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`);
  p.push(`<line x1="0" y1="0" x2="0" y2="8" stroke="${C.dim}" stroke-width="0.5"/>`);
  p.push(`</pattern>`);
  p.push(`<pattern id="trenchFill" width="6" height="6" patternUnits="userSpaceOnUse">`);
  p.push(`<rect width="6" height="6" fill="#f5e6d3"/>`);
  p.push(`<circle cx="1" cy="1" r="0.6" fill="${C.dim}"/>`);
  p.push(`<circle cx="4" cy="4" r="0.6" fill="${C.dim}"/>`);
  p.push(`</pattern>`);
  p.push(`</defs>`);

  // Plot boundary
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="2" stroke-dasharray="10,5"/>`);
  p.push(`<text x="${tx(plotW / 2)}" y="${ty(0) - 8}" text-anchor="middle" font-size="9" fill="${C.plot}">PLOT BOUNDARY</text>`);

  // Setback lines
  const bx = sb.left;
  const by = sb.front;
  const bw = plotW - sb.left - sb.right;
  const bd = plotD - sb.front - sb.rear;
  p.push(`<rect x="${tx(bx)}" y="${ty(by)}" width="${bw * SC}" height="${bd * SC}" fill="none" stroke="${C.setback}" stroke-width="1" stroke-dasharray="6,3"/>`);
  p.push(`<text x="${tx(bx) + 4}" y="${ty(by) - 4}" font-size="8" fill="${C.setback}">SETBACK LINE</text>`);

  // Trench width in meters
  const trenchW = 0.6; // 600mm

  // Draw trench around building footprint
  // Outer trench boundary
  const tox = bx - trenchW / 2;
  const toy = by - trenchW / 2;
  const tow = bw + trenchW;
  const tod = bd + trenchW;
  // Inner trench boundary
  const tix = bx + trenchW / 2;
  const tiy = by + trenchW / 2;
  const tiw = bw - trenchW;
  const tid = bd - trenchW;

  // Outer trench rectangle with earth fill
  p.push(`<rect x="${tx(tox)}" y="${ty(toy)}" width="${tow * SC}" height="${tod * SC}" fill="url(#trenchFill)" stroke="${C.wall}" stroke-width="1.5"/>`);
  // Inner cutout (building interior - no trench)
  p.push(`<rect x="${tx(tix)}" y="${ty(tiy)}" width="${tiw * SC}" height="${tid * SC}" fill="white" stroke="${C.wall}" stroke-width="1"/>`);

  // Draw internal wall trenches for each room
  floor.rooms.forEach((r) => {
    const rx = bx + r.x;
    const ry = by + r.y;
    // Internal trench lines along room boundaries
    // Bottom edge
    if (r.y + r.depth < bd - 0.1) {
      p.push(`<rect x="${tx(rx)}" y="${ty(ry + r.depth - trenchW / 2)}" width="${r.width * SC}" height="${trenchW * SC}" fill="url(#trenchFill)" stroke="${C.dim}" stroke-width="0.5"/>`);
    }
    // Right edge
    if (r.x + r.width < bw - 0.1) {
      p.push(`<rect x="${tx(rx + r.width - trenchW / 2)}" y="${ty(ry)}" width="${trenchW * SC}" height="${r.depth * SC}" fill="url(#trenchFill)" stroke="${C.dim}" stroke-width="0.5"/>`);
    }
  });

  // Room labels
  floor.rooms.forEach((r) => {
    const cx = tx(bx + r.x + r.width / 2);
    const cy = ty(by + r.y + r.depth / 2);
    p.push(`<text x="${cx}" y="${cy}" text-anchor="middle" font-size="8" fill="${C.text}" font-weight="bold">${r.name.toUpperCase()}</text>`);
    p.push(`<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="7" fill="${C.dim}">${r.width.toFixed(1)}×${r.depth.toFixed(1)}m</text>`);
  });

  // Depth annotations at corners
  const depthLabel = '1200mm DEEP';
  const corners = [
    { x: tox, y: toy },
    { x: tox + tow, y: toy },
    { x: tox, y: toy + tod },
    { x: tox + tow, y: toy + tod },
  ];
  corners.forEach((c, i) => {
    const cx = tx(c.x);
    const cy = ty(c.y);
    const offX = i % 2 === 0 ? -50 : 20;
    const offY = i < 2 ? -12 : 16;
    p.push(`<line x1="${cx}" y1="${cy}" x2="${cx + offX}" y2="${cy + offY}" stroke="${C.dim}" stroke-width="0.5"/>`);
    p.push(`<text x="${cx + offX}" y="${cy + offY - 2}" font-size="7" fill="${C.accent}">${depthLabel}</text>`);
  });

  // Dimension chains
  // Horizontal: plot width
  p.push(dimChain(tx(0), ty(plotD) + 30, tx(plotW), ty(plotD) + 30, `${plotW.toFixed(1)}m`, 'h'));
  // Horizontal: building width
  p.push(dimChain(tx(bx), ty(plotD) + 50, tx(bx + bw), ty(plotD) + 50, `${bw.toFixed(1)}m`, 'h'));
  // Vertical: plot depth
  p.push(dimChain(tx(plotW) + 30, ty(0), tx(plotW) + 30, ty(plotD), `${plotD.toFixed(1)}m`, 'v'));
  // Vertical: building depth
  p.push(dimChain(tx(plotW) + 50, ty(by), tx(plotW) + 50, ty(by + bd), `${bd.toFixed(1)}m`, 'v'));

  // Setback dimensions
  if (sb.front > 0) {
    p.push(dimChain(tx(0) - 20, ty(0), tx(0) - 20, ty(by), `${sb.front.toFixed(1)}m`, 'v'));
  }
  if (sb.left > 0) {
    p.push(dimChain(tx(0), ty(0) - 20, tx(bx), ty(0) - 20, `${sb.left.toFixed(1)}m`, 'h'));
  }

  // Trench width annotation
  const midX = tx(bx + bw / 2);
  const trenchTop = ty(by - trenchW / 2);
  p.push(`<line x1="${midX - 15}" y1="${trenchTop}" x2="${midX - 15}" y2="${trenchTop + trenchW * SC}" stroke="${C.accent}" stroke-width="0.8"/>`);
  p.push(`<text x="${midX - 18}" y="${trenchTop + trenchW * SC / 2 + 3}" text-anchor="end" font-size="7" fill="${C.accent}">600mm</text>`);

  // Grid labels
  p.push(gridLabels(tx, ty, bx, by, bw, bd, floor.rooms));

  const notes = [
    'NOTES:',
    '1. Trench width: 600mm for all walls',
    '2. Trench depth: 1200mm from NGL',
    '3. PCC bed: 150mm thick M10 grade at trench bottom',
    '4. Excavated earth to be stacked min 1m from edge',
    '5. Dewatering if water table encountered',
    `6. Total excavation depth: 1200mm below NGL`,
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
