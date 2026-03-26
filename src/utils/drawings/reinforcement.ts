import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, crossHatch, brickHatch, drawingBorder, northArrow, legend, gridLabels, drawTable } from '../drawingHelpers';
import { Layout, Column, Room, ProjectRequirements } from '../../types';

export function renderReinforcement(layout: Layout, requirements: ProjectRequirements): string {
  const svgW = 800;
  const svgH = 700;

  const boxW = 340;
  const boxH = 220;
  const gap = 20;
  const startX = MARGIN + 10;
  const startY = MARGIN + 30;

  let svg = '';

  // Helper: draw a detail box
  function detailBox(x: number, y: number, w: number, h: number, title: string): string {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.bg}" stroke="${C.wall}" stroke-width="1.2" rx="1"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="16" fill="${C.concrete}" fill-opacity="0.15" stroke="${C.wall}" stroke-width="1.2" rx="1"/>` +
      `<text x="${x + w / 2}" y="${y + 12}" font-size="8" fill="${C.text}" font-family="sans-serif" font-weight="bold" text-anchor="middle">${title}</text>`;
  }

  // Helper: filled circle for rebar cross-section
  function rebarDot(x: number, y: number, r: number = 3): string {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.steel}" stroke="${C.text}" stroke-width="0.6"/>`;
  }

  // Helper: open circle for stirrup corner
  function stirrupDot(x: number, y: number, r: number = 2.5): string {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C.steel}" stroke-width="1"/>`;
  }

  // ========== 1. FOOTING DETAIL (top-left) ==========
  {
    const bx = startX;
    const by = startY;
    svg += detailBox(bx, by, boxW, boxH, 'ISOLATED FOOTING DETAIL');

    // --- Plan view (left half) ---
    const planX = bx + 20;
    const planY = by + 30;
    const planS = 100; // footing size in px (1200mm)
    svg += `<text x="${planX + planS / 2}" y="${planY - 4}" font-size="6.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">PLAN</text>`;
    svg += `<rect x="${planX}" y="${planY}" width="${planS}" height="${planS}" fill="none" stroke="${C.wall}" stroke-width="2"/>`;

    // Mesh grid lines 12φ@150 c/c both ways
    const meshSpacing = planS / 8;
    for (let i = 1; i < 8; i++) {
      svg += `<line x1="${planX + i * meshSpacing}" y1="${planY}" x2="${planX + i * meshSpacing}" y2="${planY + planS}" stroke="${C.steel}" stroke-width="0.8"/>`;
      svg += `<line x1="${planX}" y1="${planY + i * meshSpacing}" x2="${planX + planS}" y2="${planY + i * meshSpacing}" stroke="${C.steel}" stroke-width="0.8"/>`;
    }

    // Column outline at center
    const colW = 20;
    const colH = 26;
    svg += `<rect x="${planX + planS / 2 - colW / 2}" y="${planY + planS / 2 - colH / 2}" width="${colW}" height="${colH}" fill="${C.concrete}" fill-opacity="0.4" stroke="${C.wall}" stroke-width="1.5"/>`;

    // Dims
    svg += dimChain(planX, planY + planS + 8, planX + planS, planY + planS + 8, '1200', 0, true);
    svg += `<text x="${planX + planS / 2}" y="${planY + planS + 28}" font-size="6" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">12φ@150 c/c B/W</text>`;

    // --- Section view (right half) ---
    const secX = bx + 170;
    const secY = by + 55;
    const secW = 120;
    const secFoot = 30; // footing depth px (300mm)
    const secPCC = 10; // PCC depth px (100mm)

    svg += `<text x="${secX + secW / 2}" y="${secY - 10}" font-size="6.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">SECTION X-X</text>`;

    // PCC bed
    svg += `<rect x="${secX - 10}" y="${secY + secFoot}" width="${secW + 20}" height="${secPCC}" fill="${C.concrete}" fill-opacity="0.3" stroke="${C.wall}" stroke-width="1"/>`;
    svg += `<text x="${secX + secW + 18}" y="${secY + secFoot + secPCC / 2 + 3}" font-size="5.5" fill="${C.dim}" font-family="sans-serif">100mm PCC</text>`;

    // Footing
    svg += `<rect x="${secX}" y="${secY}" width="${secW}" height="${secFoot}" fill="none" stroke="${C.wall}" stroke-width="2"/>`;
    svg += concreteHatch('foot-hatch', secX, secY, secW, secFoot, 6);

    // Column rising from footing
    const cw2 = 24;
    const ch2 = 40;
    svg += `<rect x="${secX + secW / 2 - cw2 / 2}" y="${secY - ch2}" width="${cw2}" height="${ch2}" fill="none" stroke="${C.wall}" stroke-width="1.5"/>`;
    svg += concreteHatch('col-ft-hatch', secX + secW / 2 - cw2 / 2, secY - ch2, cw2, ch2, 5);

    // Bars in section
    const barY = secY + secFoot - 6; // bottom bars
    for (let i = 0; i < 7; i++) {
      svg += rebarDot(secX + 8 + i * (secW - 16) / 6, barY, 2.5);
    }
    // Cover dimension
    svg += dimChain(secX, secY + secFoot + secPCC + 8, secX + secW, secY + secFoot + secPCC + 8, '1200', 0, true);
    svg += `<text x="${secX - 5}" y="${secY + secFoot / 2 + 3}" font-size="5" fill="${C.dim}" font-family="sans-serif" text-anchor="end">300</text>`;
    svg += `<text x="${secX + secW / 2}" y="${secY + secFoot + secPCC + 28}" font-size="5.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">50mm clear cover</text>`;

    // Earth line
    const earthY = secY + secFoot + secPCC + 2;
    svg += `<line x1="${secX - 25}" y1="${earthY}" x2="${secX + secW + 25}" y2="${earthY}" stroke="${C.earth}" stroke-width="1" stroke-dasharray="2,2"/>`;
  }

  // ========== 2. COLUMN DETAIL (top-right) ==========
  {
    const bx = startX + boxW + gap;
    const by = startY;
    svg += detailBox(bx, by, boxW, boxH, 'COLUMN SECTION');

    const cx = bx + boxW / 2;
    const cy = by + boxH / 2 + 5;
    const cW = 80; // 230mm
    const cH = 105; // 300mm

    // Outer concrete outline
    svg += `<rect x="${cx - cW / 2}" y="${cy - cH / 2}" width="${cW}" height="${cH}" fill="${C.concrete}" fill-opacity="0.15" stroke="${C.wall}" stroke-width="2.5"/>`;

    // Stirrup
    const cover = 14; // 40mm cover scaled
    svg += `<rect x="${cx - cW / 2 + cover}" y="${cy - cH / 2 + cover}" width="${cW - cover * 2}" height="${cH - cover * 2}" fill="none" stroke="${C.steel}" stroke-width="1.5" rx="2"/>`;
    // Stirrup hooks at top-left
    svg += `<line x1="${cx - cW / 2 + cover}" y1="${cy - cH / 2 + cover + 6}" x2="${cx - cW / 2 + cover + 10}" y2="${cy - cH / 2 + cover + 12}" stroke="${C.steel}" stroke-width="1.5"/>`;

    // 4 corner bars (12φ main)
    const innerL = cx - cW / 2 + cover;
    const innerR = cx + cW / 2 - cover;
    const innerT = cy - cH / 2 + cover;
    const innerB = cy + cH / 2 - cover;
    svg += rebarDot(innerL, innerT, 4);
    svg += rebarDot(innerR, innerT, 4);
    svg += rebarDot(innerL, innerB, 4);
    svg += rebarDot(innerR, innerB, 4);

    // 4 mid-face bars (10φ)
    svg += rebarDot((innerL + innerR) / 2, innerT, 3);
    svg += rebarDot((innerL + innerR) / 2, innerB, 3);
    svg += rebarDot(innerL, (innerT + innerB) / 2, 3);
    svg += rebarDot(innerR, (innerT + innerB) / 2, 3);

    // Dims
    svg += dimChain(cx - cW / 2, cy + cH / 2 + 12, cx + cW / 2, cy + cH / 2 + 12, '230', 0, true);
    svg += dimChain(cx + cW / 2 + 12, cy - cH / 2, cx + cW / 2 + 12, cy + cH / 2, '300', 0, false);

    // Cover dim
    svg += `<line x1="${cx - cW / 2}" y1="${innerT}" x2="${cx - cW / 2 - 8}" y2="${innerT}" stroke="${C.dim}" stroke-width="0.5"/>`;
    svg += `<line x1="${cx - cW / 2}" y1="${cy - cH / 2}" x2="${cx - cW / 2 - 8}" y2="${cy - cH / 2}" stroke="${C.dim}" stroke-width="0.5"/>`;
    svg += `<text x="${cx - cW / 2 - 10}" y="${cy - cH / 2 + cover / 2 + 3}" font-size="5.5" fill="${C.dim}" font-family="sans-serif" text-anchor="end">40mm clr</text>`;

    // Labels
    svg += `<text x="${cx}" y="${cy + cH / 2 + 32}" font-size="6" fill="${C.text}" font-family="sans-serif" text-anchor="middle">4-12φ corners + 4-10φ mid-face</text>`;
    svg += `<text x="${cx}" y="${cy + cH / 2 + 42}" font-size="6" fill="${C.text}" font-family="sans-serif" text-anchor="middle">8φ stirrups @ 150 c/c</text>`;
  }

  // ========== 3. BEAM DETAIL (middle-left) ==========
  {
    const bx = startX;
    const by = startY + boxH + gap;
    svg += detailBox(bx, by, boxW, boxH, 'BEAM SECTION');

    const cx = bx + boxW / 2;
    const cy = by + boxH / 2 + 10;
    const bW = 80; // 230mm
    const bH = 140; // 400mm

    // Outer concrete
    svg += `<rect x="${cx - bW / 2}" y="${cy - bH / 2}" width="${bW}" height="${bH}" fill="${C.concrete}" fill-opacity="0.12" stroke="${C.wall}" stroke-width="2.5"/>`;
    svg += concreteHatch('beam-hatch', cx - bW / 2, cy - bH / 2, bW, bH, 8);

    // Stirrup
    const cover = 10;
    svg += `<rect x="${cx - bW / 2 + cover}" y="${cy - bH / 2 + cover}" width="${bW - cover * 2}" height="${bH - cover * 2}" fill="${C.bg}" stroke="${C.steel}" stroke-width="1.5" rx="1"/>`;
    // Hook
    svg += `<line x1="${cx - bW / 2 + cover}" y1="${cy - bH / 2 + cover + 5}" x2="${cx - bW / 2 + cover + 8}" y2="${cy - bH / 2 + cover + 12}" stroke="${C.steel}" stroke-width="1.2"/>`;

    const il = cx - bW / 2 + cover;
    const ir = cx + bW / 2 - cover;
    const it = cy - bH / 2 + cover;
    const ib = cy + bH / 2 - cover;

    // Top steel: 2-16φ
    svg += rebarDot(il + 6, it + 6, 4.5);
    svg += rebarDot(ir - 6, it + 6, 4.5);

    // Bottom steel: 2-16φ
    svg += rebarDot(il + 6, ib - 6, 4.5);
    svg += rebarDot(ir - 6, ib - 6, 4.5);

    // Hanger bars: 2-12φ at mid-depth
    svg += rebarDot(il + 6, (it + ib) / 2, 3);
    svg += rebarDot(ir - 6, (it + ib) / 2, 3);

    // Dims
    svg += dimChain(cx - bW / 2, cy + bH / 2 + 10, cx + bW / 2, cy + bH / 2 + 10, '230', 0, true);
    svg += dimChain(cx + bW / 2 + 10, cy - bH / 2, cx + bW / 2 + 10, cy + bH / 2, '400', 0, false);

    // Labels
    svg += `<text x="${cx + bW / 2 + 25}" y="${it + 10}" font-size="5.5" fill="${C.steel}" font-family="sans-serif">2-16φ (top)</text>`;
    svg += `<line x1="${ir}" y1="${it + 6}" x2="${cx + bW / 2 + 24}" y2="${it + 8}" stroke="${C.dim}" stroke-width="0.4"/>`;
    svg += `<text x="${cx + bW / 2 + 25}" y="${(it + ib) / 2 + 3}" font-size="5.5" fill="${C.steel}" font-family="sans-serif">2-12φ (hanger)</text>`;
    svg += `<text x="${cx + bW / 2 + 25}" y="${ib - 2}" font-size="5.5" fill="${C.steel}" font-family="sans-serif">2-16φ (bottom)</text>`;
    svg += `<line x1="${ir}" y1="${ib - 6}" x2="${cx + bW / 2 + 24}" y2="${ib - 4}" stroke="${C.dim}" stroke-width="0.4"/>`;

    // Stirrup note
    svg += `<text x="${cx}" y="${cy + bH / 2 + 28}" font-size="6" fill="${C.text}" font-family="sans-serif" text-anchor="middle">8φ stirrups: 150 c/c (supports) / 200 c/c (midspan)</text>`;
  }

  // ========== 4. SLAB DETAIL (middle-right) ==========
  {
    const bx = startX + boxW + gap;
    const by = startY + boxH + gap;
    svg += detailBox(bx, by, boxW, boxH, 'SLAB SECTION');

    const cx = bx + boxW / 2;
    const cy = by + boxH / 2 + 15;
    const sW = 260;
    const sH = 45; // 150mm slab

    // Slab concrete section
    svg += `<rect x="${cx - sW / 2}" y="${cy - sH / 2}" width="${sW}" height="${sH}" fill="${C.slab}" fill-opacity="0.2" stroke="${C.wall}" stroke-width="2"/>`;
    svg += concreteHatch('slab-hatch', cx - sW / 2, cy - sH / 2, sW, sH, 6);

    // Bottom main bars (10φ@150)
    const botY = cy + sH / 2 - 8;
    const spacing = 22;
    for (let i = 0; i < 12; i++) {
      const rx = cx - sW / 2 + 10 + i * spacing;
      if (rx > cx + sW / 2 - 10) break;
      svg += rebarDot(rx, botY, 2.5);
    }

    // Top distribution bars (8φ@200)
    const topY = cy - sH / 2 + 8;
    for (let i = 0; i < 9; i++) {
      const rx = cx - sW / 2 + 15 + i * 30;
      if (rx > cx + sW / 2 - 10) break;
      svg += rebarDot(rx, topY, 2);
    }

    // Crank bar at supports
    const crankLeft = cx - sW / 2;
    svg += `<polyline points="${crankLeft + 5},${botY} ${crankLeft + 30},${botY} ${crankLeft + 45},${topY} ${crankLeft + 60},${topY}" fill="none" stroke="${C.steel}" stroke-width="1.5"/>`;
    const crankRight = cx + sW / 2;
    svg += `<polyline points="${crankRight - 60},${topY} ${crankRight - 45},${topY} ${crankRight - 30},${botY} ${crankRight - 5},${botY}" fill="none" stroke="${C.steel}" stroke-width="1.5"/>`;

    // Support triangles
    svg += `<polygon points="${crankLeft},${cy + sH / 2 + 12} ${crankLeft - 6},${cy + sH / 2 + 22} ${crankLeft + 6},${cy + sH / 2 + 22}" fill="none" stroke="${C.wall}" stroke-width="1"/>`;
    svg += `<polygon points="${crankRight},${cy + sH / 2 + 12} ${crankRight - 6},${cy + sH / 2 + 22} ${crankRight + 6},${cy + sH / 2 + 22}" fill="none" stroke="${C.wall}" stroke-width="1"/>`;

    // Dims
    svg += dimChain(cx + sW / 2 + 10, cy - sH / 2, cx + sW / 2 + 10, cy + sH / 2, '150', 0, false);

    // Labels
    svg += `<text x="${cx}" y="${botY + 18}" font-size="5.5" fill="${C.steel}" font-family="sans-serif" text-anchor="middle">10φ@150 main (bottom)</text>`;
    svg += `<text x="${cx}" y="${topY - 10}" font-size="5.5" fill="${C.steel}" font-family="sans-serif" text-anchor="middle">8φ@200 distribution (top)</text>`;
    svg += `<text x="${cx}" y="${cy + sH / 2 + 40}" font-size="5.5" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">20mm cover top &amp; bottom | Crank bars at supports</text>`;
  }

  // ========== 5. LINTEL DETAIL (bottom center) ==========
  {
    const lbW = boxW * 2 + gap;
    const lbH = 160;
    const bx = startX;
    const by = startY + (boxH + gap) * 2;
    svg += detailBox(bx, by, lbW, lbH, 'LINTEL DETAIL');

    const cx = bx + lbW / 2;
    const cy = by + lbH / 2 + 15;

    // Window opening symbolic
    const winW = 120;
    const winH = 60;
    svg += `<rect x="${cx - winW / 2}" y="${cy - 5}" width="${winW}" height="${winH}" fill="none" stroke="${C.wall}" stroke-width="1.5" stroke-dasharray="6,3"/>`;
    svg += `<text x="${cx}" y="${cy + winH / 2 + 3}" font-size="6" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">WINDOW OPENING</text>`;

    // Lintel above opening
    const linW = winW + 40; // bearing on each side
    const linH = 22; // 150mm
    const linY = cy - 5 - linH;
    svg += `<rect x="${cx - linW / 2}" y="${linY}" width="${linW}" height="${linH}" fill="${C.concrete}" fill-opacity="0.2" stroke="${C.wall}" stroke-width="2"/>`;
    svg += concreteHatch('lintel-hatch', cx - linW / 2, linY, linW, linH, 5);

    // Lintel section detail (right side)
    const sdX = cx + linW / 2 + 60;
    const sdY = cy - 30;
    const sdW = 55; // 230mm
    const sdH = 35; // 150mm
    svg += `<rect x="${sdX}" y="${sdY}" width="${sdW}" height="${sdH}" fill="${C.concrete}" fill-opacity="0.12" stroke="${C.wall}" stroke-width="2"/>`;
    // Stirrup
    svg += `<rect x="${sdX + 6}" y="${sdY + 5}" width="${sdW - 12}" height="${sdH - 10}" fill="none" stroke="${C.steel}" stroke-width="1.2" rx="1"/>`;
    // Top bars 2-12φ
    svg += rebarDot(sdX + 10, sdY + 8, 3);
    svg += rebarDot(sdX + sdW - 10, sdY + 8, 3);
    // Bottom bars 2-12φ
    svg += rebarDot(sdX + 10, sdY + sdH - 8, 3);
    svg += rebarDot(sdX + sdW - 10, sdY + sdH - 8, 3);

    // Dims
    svg += dimChain(sdX, sdY + sdH + 8, sdX + sdW, sdY + sdH + 8, '230', 0, true);
    svg += dimChain(sdX + sdW + 8, sdY, sdX + sdW + 8, sdY + sdH, '150', 0, false);

    svg += `<text x="${sdX + sdW / 2}" y="${sdY + sdH + 25}" font-size="5.5" fill="${C.text}" font-family="sans-serif" text-anchor="middle">2-12φ T &amp; B</text>`;
    svg += `<text x="${sdX + sdW / 2}" y="${sdY + sdH + 34}" font-size="5.5" fill="${C.text}" font-family="sans-serif" text-anchor="middle">6φ stirrups @150 c/c</text>`;

    // Bearing length labels
    svg += `<text x="${cx - linW / 2 + 10}" y="${linY - 4}" font-size="5.5" fill="${C.dim}" font-family="sans-serif">150mm bearing</text>`;
    svg += dimChain(cx - linW / 2, linY + linH + 8, cx + linW / 2, linY + linH + 8, `${Math.round(linW / 80 * 230 + 300)}mm`, 0, true);

    // Wall on sides
    svg += `<rect x="${cx - winW / 2 - 20}" y="${linY - 10}" width="20" height="${winH + linH + 15}" fill="${C.brick}" fill-opacity="0.15" stroke="${C.wall}" stroke-width="1"/>`;
    svg += `<rect x="${cx + winW / 2}" y="${linY - 10}" width="20" height="${winH + linH + 15}" fill="${C.brick}" fill-opacity="0.15" stroke="${C.wall}" stroke-width="1"/>`;
  }

  // --- Notes ---
  svg += `<text x="${MARGIN + 15}" y="${svgH - MARGIN - 35}" font-size="6.5" fill="${C.text}" font-family="sans-serif" font-weight="bold">NOTES:</text>`;
  svg += `<text x="${MARGIN + 15}" y="${svgH - MARGIN - 24}" font-size="6" fill="${C.text}" font-family="sans-serif">1. All steel Fe500D as per IS 1786. 2. Cover: 50mm footing, 40mm col/beam, 20mm slab.</text>`;
  svg += `<text x="${MARGIN + 15}" y="${svgH - MARGIN - 14}" font-size="6" fill="${C.text}" font-family="sans-serif">3. Lap length: 50d (tension), 40d (compression). 4. Hooks per IS 2502.</text>`;

  // --- Drawing border ---
  const border = drawingBorder(svgW, svgH, 'REINFORCEMENT DETAILS', `${requirements.city || 'Project'} - Residential Building`);

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${border}${svg}</svg>`;
}
