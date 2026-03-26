import { Layout } from '../../types';
import { C, MARGIN, SC, drawingBorder, northArrow, legend } from '../drawingHelpers';

export function renderReinforcement(layout: Layout, numFloors: number): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const svgW = 800;
  const svgH = 700;
  const p: string[] = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`);
  p.push(drawingBorder(svgW, svgH, 'REINFORCEMENT DETAIL', `${numFloors}-Storey Residential | M25 / Fe500`));
  p.push(northArrow(svgW - 40, 70));

  // Defs
  p.push(`<defs>`);
  p.push(`<marker id="arrowRf" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4Z" fill="${C.dim}"/></marker>`);
  p.push(`</defs>`);

  // ====== DETAIL 1: COLUMN CROSS-SECTION (top-left) ======
  const cx1 = 120, cy1 = 140;
  const colW = 70, colH = 90; // visual px (230x300mm)
  p.push(`<text x="${cx1 + colW / 2}" y="${cy1 - 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="${C.text}">COLUMN SECTION (230×300mm)</text>`);
  // Outer concrete
  p.push(`<rect x="${cx1}" y="${cy1}" width="${colW}" height="${colH}" fill="#f0f0f0" stroke="${C.wall}" stroke-width="2"/>`);
  // Stirrup
  const stOff = 8;
  p.push(`<rect x="${cx1 + stOff}" y="${cy1 + stOff}" width="${colW - stOff * 2}" height="${colH - stOff * 2}" fill="none" stroke="${C.accent}" stroke-width="1.5"/>`);
  // Main bars (4 nos 16mm dia)
  const barR = 4;
  const barPositions = [
    { x: cx1 + stOff + 4, y: cy1 + stOff + 4 },
    { x: cx1 + colW - stOff - 4, y: cy1 + stOff + 4 },
    { x: cx1 + stOff + 4, y: cy1 + colH - stOff - 4 },
    { x: cx1 + colW - stOff - 4, y: cy1 + colH - stOff - 4 },
  ];
  barPositions.forEach((bp) => {
    p.push(`<circle cx="${bp.x}" cy="${bp.y}" r="${barR}" fill="${C.accent}" stroke="#000" stroke-width="0.5"/>`);
  });
  // Labels
  p.push(`<text x="${cx1 + colW + 10}" y="${cy1 + 15}" font-size="8" fill="${C.text}">4-16mm Ø bars</text>`);
  p.push(`<text x="${cx1 + colW + 10}" y="${cy1 + 30}" font-size="8" fill="${C.text}">8mm Ø stirrups</text>`);
  p.push(`<text x="${cx1 + colW + 10}" y="${cy1 + 45}" font-size="8" fill="${C.text}">@ 150mm c/c</text>`);
  p.push(`<text x="${cx1 + colW + 10}" y="${cy1 + 65}" font-size="8" fill="${C.dim}">Clear cover: 40mm</text>`);
  // Dimension lines
  p.push(`<line x1="${cx1}" y1="${cy1 + colH + 10}" x2="${cx1 + colW}" y2="${cy1 + colH + 10}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${cx1 + colW / 2}" y="${cy1 + colH + 22}" text-anchor="middle" font-size="7" fill="${C.dim}">230mm</text>`);
  p.push(`<line x1="${cx1 - 10}" y1="${cy1}" x2="${cx1 - 10}" y2="${cy1 + colH}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${cx1 - 14}" y="${cy1 + colH / 2}" text-anchor="end" font-size="7" fill="${C.dim}" transform="rotate(-90,${cx1 - 14},${cy1 + colH / 2})">300mm</text>`);

  // ====== DETAIL 2: BEAM SECTION (top-right) ======
  const bx1 = 420, by1 = 140;
  const bmW = 50, bmH = 100; // 150x300mm
  p.push(`<text x="${bx1 + bmW / 2}" y="${by1 - 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="${C.text}">BEAM SECTION (150×300mm)</text>`);
  p.push(`<rect x="${bx1}" y="${by1}" width="${bmW}" height="${bmH}" fill="#f0f0f0" stroke="${C.wall}" stroke-width="2"/>`);
  // Stirrup
  const bsOff = 7;
  p.push(`<rect x="${bx1 + bsOff}" y="${by1 + bsOff}" width="${bmW - bsOff * 2}" height="${bmH - bsOff * 2}" fill="none" stroke="${C.accent}" stroke-width="1.5"/>`);
  // Top bars (2-16mm)
  [bx1 + bsOff + 4, bx1 + bmW - bsOff - 4].forEach((x) => {
    p.push(`<circle cx="${x}" cy="${by1 + bsOff + 4}" r="${barR}" fill="${C.accent}" stroke="#000" stroke-width="0.5"/>`);
  });
  // Bottom bars (2-12mm)
  [bx1 + bsOff + 4, bx1 + bmW - bsOff - 4].forEach((x) => {
    p.push(`<circle cx="${x}" cy="${by1 + bmH - bsOff - 4}" r="3" fill="#e74c3c" stroke="#000" stroke-width="0.5"/>`);
  });
  // Labels
  p.push(`<text x="${bx1 + bmW + 10}" y="${by1 + 15}" font-size="8" fill="${C.text}">2-16mm Ø (top)</text>`);
  p.push(`<text x="${bx1 + bmW + 10}" y="${by1 + bmH - 5}" font-size="8" fill="${C.text}">2-12mm Ø (bottom)</text>`);
  p.push(`<text x="${bx1 + bmW + 10}" y="${by1 + 45}" font-size="8" fill="${C.text}">8mm Ø stirrups</text>`);
  p.push(`<text x="${bx1 + bmW + 10}" y="${by1 + 60}" font-size="8" fill="${C.text}">@ 150mm c/c</text>`);
  p.push(`<text x="${bx1 + bmW + 10}" y="${by1 + 80}" font-size="8" fill="${C.dim}">Clear cover: 25mm</text>`);
  // Dimensions
  p.push(`<line x1="${bx1}" y1="${by1 + bmH + 10}" x2="${bx1 + bmW}" y2="${by1 + bmH + 10}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${bx1 + bmW / 2}" y="${by1 + bmH + 22}" text-anchor="middle" font-size="7" fill="${C.dim}">150mm</text>`);
  p.push(`<line x1="${bx1 - 10}" y1="${by1}" x2="${bx1 - 10}" y2="${by1 + bmH}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${bx1 - 14}" y="${by1 + bmH / 2}" text-anchor="end" font-size="7" fill="${C.dim}" transform="rotate(-90,${bx1 - 14},${by1 + bmH / 2})">300mm</text>`);

  // ====== DETAIL 3: FOOTING SECTION (bottom-left) ======
  const fx1 = 80, fy1 = 370;
  const ftW = 140, ftH = 45; // 1200x450mm
  const pedW = 70, pedH = 30;
  p.push(`<text x="${fx1 + ftW / 2}" y="${fy1 - 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="${C.text}">ISOLATED FOOTING (1200×1200×450mm)</text>`);
  // Footing base
  p.push(`<rect x="${fx1}" y="${fy1}" width="${ftW}" height="${ftH}" fill="#e8e8e8" stroke="${C.wall}" stroke-width="2"/>`);
  // Pedestal
  p.push(`<rect x="${fx1 + (ftW - pedW) / 2}" y="${fy1 - pedH}" width="${pedW}" height="${pedH}" fill="#f0f0f0" stroke="${C.wall}" stroke-width="1.5"/>`);
  // Bottom reinforcement
  for (let i = 0; i < 7; i++) {
    const bx = fx1 + 10 + i * 20;
    p.push(`<circle cx="${bx}" cy="${fy1 + ftH - 8}" r="2.5" fill="${C.accent}" stroke="#000" stroke-width="0.5"/>`);
  }
  // Labels
  p.push(`<text x="${fx1 + ftW + 10}" y="${fy1 + 15}" font-size="8" fill="${C.text}">12mm Ø @ 150mm c/c</text>`);
  p.push(`<text x="${fx1 + ftW + 10}" y="${fy1 + 30}" font-size="8" fill="${C.text}">both ways</text>`);
  p.push(`<text x="${fx1 + ftW + 10}" y="${fy1 + 50}" font-size="8" fill="${C.dim}">Clear cover: 50mm</text>`);
  // PCC bed
  p.push(`<rect x="${fx1 - 10}" y="${fy1 + ftH}" width="${ftW + 20}" height="8" fill="#ddd" stroke="${C.dim}" stroke-width="0.5"/>`);
  p.push(`<text x="${fx1 + ftW + 15}" y="${fy1 + ftH + 7}" font-size="7" fill="${C.dim}">150mm PCC (M10)</text>`);
  // Dimensions
  p.push(`<line x1="${fx1}" y1="${fy1 + ftH + 20}" x2="${fx1 + ftW}" y2="${fy1 + ftH + 20}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${fx1 + ftW / 2}" y="${fy1 + ftH + 32}" text-anchor="middle" font-size="7" fill="${C.dim}">1200mm</text>`);

  // ====== DETAIL 4: SLAB SECTION (bottom-right) ======
  const sx1 = 420, sy1 = 370;
  const slW = 200, slH = 20; // 125mm thick
  p.push(`<text x="${sx1 + slW / 2}" y="${sy1 - 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="${C.text}">SLAB SECTION (125mm thick)</text>`);
  // Slab body
  p.push(`<rect x="${sx1}" y="${sy1}" width="${slW}" height="${slH}" fill="#f0f0f0" stroke="${C.wall}" stroke-width="2"/>`);
  // Bottom reinforcement bars
  for (let i = 0; i < 10; i++) {
    const bx = sx1 + 10 + i * 20;
    p.push(`<circle cx="${bx}" cy="${sy1 + slH - 5}" r="2" fill="${C.accent}" stroke="#000" stroke-width="0.5"/>`);
  }
  // Distribution bars (shown as dashes)
  p.push(`<line x1="${sx1 + 5}" y1="${sy1 + slH - 10}" x2="${sx1 + slW - 5}" y2="${sy1 + slH - 10}" stroke="${C.accent}" stroke-width="1" stroke-dasharray="3,8"/>`);
  // Labels
  p.push(`<text x="${sx1 + slW + 10}" y="${sy1 + 10}" font-size="8" fill="${C.text}">10mm Ø main bars</text>`);
  p.push(`<text x="${sx1 + slW + 10}" y="${sy1 + 23}" font-size="8" fill="${C.text}">@ 150mm c/c</text>`);
  p.push(`<text x="${sx1 + slW + 10}" y="${sy1 + 38}" font-size="8" fill="${C.text}">8mm Ø dist. bars</text>`);
  p.push(`<text x="${sx1 + slW + 10}" y="${sy1 + 51}" font-size="8" fill="${C.text}">@ 200mm c/c</text>`);
  p.push(`<text x="${sx1 + slW + 10}" y="${sy1 + 68}" font-size="8" fill="${C.dim}">Clear cover: 25mm (bottom)</text>`);
  // Dimensions
  p.push(`<line x1="${sx1 - 10}" y1="${sy1}" x2="${sx1 - 10}" y2="${sy1 + slH}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${sx1 - 14}" y="${sy1 + slH / 2 + 3}" text-anchor="end" font-size="7" fill="${C.dim}">125mm</text>`);

  // ====== DETAIL 5: COLUMN ELEVATION (bottom center) ======
  const ex1 = 220, ey1 = 490;
  const elW = 30, elH = 120;
  p.push(`<text x="${ex1 + 60}" y="${ey1 - 10}" text-anchor="middle" font-size="11" font-weight="bold" fill="${C.text}">COLUMN ELEVATION</text>`);
  p.push(`<rect x="${ex1}" y="${ey1}" width="${elW}" height="${elH}" fill="#f0f0f0" stroke="${C.wall}" stroke-width="1.5"/>`);
  // Stirrup spacing marks
  const numStirr = 7;
  for (let i = 0; i <= numStirr; i++) {
    const yy = ey1 + 10 + i * (elH - 20) / numStirr;
    p.push(`<line x1="${ex1}" y1="${yy}" x2="${ex1 + elW}" y2="${yy}" stroke="${C.accent}" stroke-width="0.8"/>`);
  }
  // Main bars vertical lines
  p.push(`<line x1="${ex1 + 6}" y1="${ey1}" x2="${ex1 + 6}" y2="${ey1 + elH}" stroke="${C.accent}" stroke-width="1.5"/>`);
  p.push(`<line x1="${ex1 + elW - 6}" y1="${ey1}" x2="${ex1 + elW - 6}" y2="${ey1 + elH}" stroke="${C.accent}" stroke-width="1.5"/>`);
  // Spacing label
  p.push(`<line x1="${ex1 + elW + 5}" y1="${ey1 + 10}" x2="${ex1 + elW + 5}" y2="${ey1 + 10 + (elH - 20) / numStirr}" stroke="${C.dim}" stroke-width="0.5" marker-start="url(#arrowRf)" marker-end="url(#arrowRf)"/>`);
  p.push(`<text x="${ex1 + elW + 10}" y="${ey1 + 10 + (elH - 20) / numStirr / 2 + 3}" font-size="7" fill="${C.dim}">150mm c/c</text>`);

  const notes = [
    'NOTES:',
    '1. Concrete grade: M25 (fck = 25 N/mm²)',
    '2. Steel grade: Fe500 (fy = 500 N/mm²)',
    '3. Clear cover: Footing 50mm, Column 40mm, Beam/Slab 25mm',
    '4. Lap length: 50d for columns, 40d for beams',
    '5. All stirrups: 135° hooks as per IS 456',
    '6. Development length as per IS 456:2000 Cl. 26.2',
  ].join('\n');
  p.push(legend(svgW, svgH, notes));
  p.push('</svg>');
  return p.join('');
}
