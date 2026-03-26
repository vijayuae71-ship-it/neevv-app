import { Layout } from '../../types';
import { C, MARGIN, SC, drawingBorder, northArrow, legend, gridLabels } from '../drawingHelpers';

function tilePattern(x: number, y: number, w: number, h: number, tileSize: number, color: string): string {
  const lines: string[] = [];
  // Horizontal tile lines
  for (let ty = y; ty <= y + h; ty += tileSize) {
    lines.push(`<line x1="${x}" y1="${ty}" x2="${x + w}" y2="${ty}" stroke="${color}" stroke-width="0.3"/>`);
  }
  // Vertical tile lines
  for (let tx = x; tx <= x + w; tx += tileSize) {
    lines.push(`<line x1="${tx}" y1="${y}" x2="${tx}" y2="${y + h}" stroke="${color}" stroke-width="0.3"/>`);
  }
  return lines.join('');
}

function dadoMark(x: number, y: number, h: number, label: string): string {
  return `<g>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 15}" stroke="#8e44ad" stroke-width="0.8" stroke-dasharray="2,2"/>
    <line x1="${x - 4}" y1="${y - 15}" x2="${x + 4}" y2="${y - 15}" stroke="#8e44ad" stroke-width="0.8"/>
    <text x="${x}" y="${y - 18}" text-anchor="middle" font-size="5.5" fill="#8e44ad">DADO ${label}</text>
  </g>`;
}

export function renderTiling(layout: Layout, numFloors: number): string {
  const floor = layout.floors[0];
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const sb = layout.setbacks;
  const bx0 = sb.left;
  const by0 = sb.front;
  const bw = plotW - sb.left - sb.right;
  const bd = plotD - sb.front - sb.rear;
  const svgW = Math.max(700, MARGIN * 2 + plotW * SC + 120);
  const svgH = Math.max(500, MARGIN * 2 + plotD * SC + 120);
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;
  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'TILING LAYOUT', `Ground Floor | ${numFloors}-Storey Residential`));
  p.push(northArrow(svgW - 40, 70));

  // Plot and building outlines
  p.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${plotW * SC}" height="${plotD * SC}" fill="none" stroke="${C.plot}" stroke-width="1" stroke-dasharray="10,5"/>`);
  p.push(`<rect x="${tx(bx0)}" y="${ty(by0)}" width="${bw * SC}" height="${bd * SC}" fill="none" stroke="${C.wall}" stroke-width="2"/>`);

  // Tile type configs
  const tileConfig: Record<string, { fill: string; tileSize: number; gridColor: string; label: string; dado: string; skirting: boolean }> = {
    bedroom: { fill: '#fdf2e9', tileSize: 8, gridColor: '#d4a574', label: 'Vitrified 600×600', dado: '', skirting: true },
    living: { fill: '#fef9e7', tileSize: 8, gridColor: '#c9b037', label: 'Vitrified 800×800', dado: '', skirting: true },
    hall: { fill: '#fef9e7', tileSize: 8, gridColor: '#c9b037', label: 'Vitrified 800×800', dado: '', skirting: true },
    kitchen: { fill: '#eaf2f8', tileSize: 5, gridColor: '#5dade2', label: 'Ceramic Anti-skid 300×300', dado: '600mm', skirting: false },
    toilet: { fill: '#e8f8f5', tileSize: 4, gridColor: '#48c9b0', label: 'Ceramic Anti-skid 300×300', dado: '1200mm (full ht: 2100mm)', skirting: false },
    bathroom: { fill: '#e8f8f5', tileSize: 4, gridColor: '#48c9b0', label: 'Ceramic Anti-skid 300×300', dado: '2100mm (full)', skirting: false },
    puja: { fill: '#fdedec', tileSize: 6, gridColor: '#e6b0aa', label: 'Marble / Vitrified 600×600', dado: '', skirting: true },
    passage: { fill: '#f4f6f7', tileSize: 6, gridColor: '#aab7b8', label: 'Vitrified 600×600', dado: '', skirting: true },
    store: { fill: '#f4f6f7', tileSize: 6, gridColor: '#aab7b8', label: 'Ceramic 300×300', dado: '', skirting: true },
  };
  const defaultTile = { fill: '#f8f9fa', tileSize: 6, gridColor: '#bdc3c7', label: 'Vitrified 600×600', dado: '', skirting: true };

  // Material schedule data
  const schedule: Array<{ room: string; type: string; area: number; finish: string }> = [];

  floor.rooms.forEach((r) => {
    const rx = bx0 + r.x;
    const ry = by0 + r.y;
    const rw = r.width;
    const rd = r.depth;
    const conf = tileConfig[r.type] || defaultTile;

    // Fill room with tile color
    p.push(`<rect x="${tx(rx)}" y="${ty(ry)}" width="${rw * SC}" height="${rd * SC}" fill="${conf.fill}" stroke="${C.dim}" stroke-width="0.8"/>`);

    // Tile grid pattern
    p.push(tilePattern(tx(rx), ty(ry), rw * SC, rd * SC, conf.tileSize, conf.gridColor));

    // Skirting lines (inner border)
    if (conf.skirting) {
      const sk = 2; // px offset for skirting
      p.push(`<rect x="${tx(rx) + sk}" y="${ty(ry) + sk}" width="${rw * SC - sk * 2}" height="${rd * SC - sk * 2}" fill="none" stroke="#7f8c8d" stroke-width="1" stroke-dasharray="1,2"/>`);
    }

    // Room label
    const cx = tx(rx + rw / 2);
    const cy = ty(ry + rd / 2);
    // Background for readability
    p.push(`<rect x="${cx - 40}" y="${cy - 18}" width="80" height="36" rx="3" fill="white" fill-opacity="0.85" stroke="none"/>`);
    p.push(`<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="8" font-weight="bold" fill="${C.text}">${r.name.toUpperCase()}</text>`);
    p.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="6" fill="${conf.gridColor}">${conf.label}</text>`);
    if (conf.dado) {
      p.push(`<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="5.5" fill="#8e44ad">Dado: ${conf.dado}</text>`);
      // Dado mark
      p.push(dadoMark(tx(rx + rw) - 5, ty(ry + rd) - 5, 1200, conf.dado));
    }
    if (conf.skirting) {
      p.push(`<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="5" fill="#7f8c8d">Skirting: 100mm</text>`);
    }

    // Anti-skid note for wet areas
    if (r.type === 'toilet' || r.type === 'bathroom' || r.type === 'kitchen') {
      p.push(`<text x="${cx}" y="${cy + 24}" text-anchor="middle" font-size="5" fill="#c0392b" font-weight="bold">⚠ ANTI-SKID</text>`);
    }

    schedule.push({
      room: r.name,
      type: r.type,
      area: +(rw * rd).toFixed(1),
      finish: conf.label,
    });
  });

  p.push(gridLabels(tx, ty, bx0, by0, bw, bd, floor.rooms));

  // Material schedule table
  const tblX = tx(0) + 10;
  const tblY = ty(plotD) + 35;
  const colW = [100, 120, 60, 150];
  const tblHeaders = ['Room', 'Finish Type', 'Area (m²)', 'Dado / Skirting'];
  const totalW = colW.reduce((a, b) => a + b, 0);
  const rowH = 16;

  p.push(`<text x="${tblX}" y="${tblY - 5}" font-size="9" font-weight="bold" fill="${C.text}">MATERIAL SCHEDULE</text>`);

  // Header
  p.push(`<rect x="${tblX}" y="${tblY}" width="${totalW}" height="${rowH + 2}" fill="#2c3e50" stroke="${C.wall}" stroke-width="1"/>`);
  let hx = tblX;
  tblHeaders.forEach((h, i) => {
    p.push(`<text x="${hx + colW[i] / 2}" y="${tblY + rowH / 2 + 4}" text-anchor="middle" font-size="7" font-weight="bold" fill="white">${h}</text>`);
    hx += colW[i];
  });

  // Rows
  schedule.forEach((s, i) => {
    const ry = tblY + rowH + 2 + i * rowH;
    const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
    p.push(`<rect x="${tblX}" y="${ry}" width="${totalW}" height="${rowH}" fill="${bg}" stroke="${C.dim}" stroke-width="0.3"/>`);
    const conf = tileConfig[s.type] || defaultTile;
    const dadoSkirting = conf.dado ? `Dado: ${conf.dado}` : conf.skirting ? 'Skirting: 100mm' : '-';
    const cells = [s.room, s.finish, s.area.toString(), dadoSkirting];
    let cx = tblX;
    cells.forEach((c, ci) => {
      p.push(`<text x="${cx + colW[ci] / 2}" y="${ry + rowH / 2 + 3}" text-anchor="middle" font-size="6.5" fill="${C.text}">${c}</text>`);
      cx += colW[ci];
    });
  });

  // Table border
  p.push(`<rect x="${tblX}" y="${tblY}" width="${totalW}" height="${rowH + 2 + schedule.length * rowH}" fill="none" stroke="${C.wall}" stroke-width="1"/>`);

  const notes = [
    'NOTES:',
    '1. Wet area tiles: Anti-skid ceramic (CoF ≥ 0.6)',
    '2. Dry area tiles: Vitrified/Polished as specified',
    '3. Dado tiles: Wall tiles up to specified height',
    '4. Skirting: 100mm high matching floor tile',
    '5. Tile adhesive: Polymer modified (wet areas)',
    '6. Grouting: Epoxy grout for wet, cementitious for dry',
    '7. Waterproofing below tiles in all wet areas',
    '8. Floor slope in wet areas: 1:60 towards drain',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
