import { C, MARGIN, SC, dimChain, concreteHatch, crossHatch, drawingBorder, legend, drawTable } from '../drawingHelpers';
import { Layout, ProjectRequirements } from '../../types';

export function renderSTP(layout: Layout, requirements: ProjectRequirements): string {
  const bedrooms = requirements.floors.reduce((sum, f) => sum + (f.bedrooms || 0), 0);
  const occupants = Math.max(4, bedrooms * 2);
  const sewageFlow = occupants * 120; // 120 lpcd sewage generation (80% of 150 lpcd)
  const peakFlow = sewageFlow * 2; // peak factor

  // Chamber sizing (for small residential STP)
  const barScreenW = 600; // mm
  const barScreenL = 800;
  const settlingL = 1500; // mm
  const settlingW = 1000;
  const settlingD = 1500; // mm
  const anaerobic = { l: 1500, w: 1200, d: 1800 };
  const filterL = 1200;
  const filterW = 1000;
  const filterD = 1500;
  const chlorineL = 800;
  const chlorineW = 600;
  const sludgeDryL = 1500;
  const sludgeDryW = 1000;

  const dSC = 0.08; // px per mm for plan
  const svgW = 950;
  const svgH = 950;

  const parts: string[] = [];
  parts.push(drawingBorder(svgW, svgH, 'SEWAGE TREATMENT PLANT (STP)',
    `${occupants} persons • ${sewageFlow} LPD sewage • Anaerobic + Filter Media • CPCB / NBC 2016 Part 9`));

  // ═══ PLAN VIEW ═══
  const planStartX = MARGIN + 50;
  const planStartY = MARGIN + 60;

  parts.push(`<text x="${planStartX}" y="${planStartY - 25}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">STP PLAN LAYOUT</text>`);
  parts.push(`<text x="${planStartX}" y="${planStartY - 13}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Flow: Inlet → Bar Screen → Settling → Anaerobic Baffled Reactor → Filter → Chlorination → Outlet</text>`);

  // Flow direction arrow at top
  const flowY = planStartY - 5;

  // 1. INLET MANHOLE
  const inletX = planStartX;
  const inletY = planStartY + 30;
  const inletR = 300 * dSC;
  parts.push(`<circle cx="${inletX + inletR}" cy="${inletY + inletR}" r="${inletR}" fill="#F5F0EB" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(`<circle cx="${inletX + inletR}" cy="${inletY + inletR}" r="${inletR * 0.6}" fill="none" stroke="${C.wall}" stroke-width="0.5"/>`);
  parts.push(`<text x="${inletX + inletR}" y="${inletY + inletR + 2}" text-anchor="middle" font-size="5.5" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">INLET</text>`);
  parts.push(`<text x="${inletX + inletR}" y="${inletY + inletR + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">MH φ600</text>`);

  // Arrow from inlet
  const arrowStartX = inletX + inletR * 2 + 5;
  const arrowY = inletY + inletR;
  const gap = 15;

  // 2. BAR SCREEN
  const bsX = arrowStartX + gap;
  const bsY = planStartY + 10;
  const bsW = barScreenL * dSC;
  const bsH = barScreenW * dSC;
  parts.push(`<rect x="${bsX}" y="${bsY}" width="${bsW}" height="${bsH}" fill="#E8E4E0" stroke="${C.wall}" stroke-width="1"/>`);
  // Bar screen bars
  for (let bx = bsX + 5; bx < bsX + bsW - 5; bx += 6) {
    parts.push(`<line x1="${bx}" y1="${bsY + 3}" x2="${bx}" y2="${bsY + bsH - 3}" stroke="${C.steel}" stroke-width="1"/>`);
  }
  parts.push(`<text x="${bsX + bsW / 2}" y="${bsY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">BAR SCREEN</text>`);
  parts.push(`<text x="${bsX + bsW / 2}" y="${bsY + bsH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${barScreenL}×${barScreenW}</text>`);

  // Flow arrows between chambers
  const drawFlowArrow = (x1: number, y1: number, x2: number, y2: number) => {
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2980B9" stroke-width="1.5" marker-end="url(#flowArrow)"/>`);
  };

  parts.push(`<defs><marker id="flowArrow" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0 0, 6 2.5, 0 5" fill="#2980B9"/></marker></defs>`);

  drawFlowArrow(arrowStartX, arrowY, bsX - 2, arrowY);

  // 3. SETTLING TANK
  const stX = bsX + bsW + gap;
  const stY = planStartY;
  const stW = settlingL * dSC;
  const stH = settlingW * dSC;
  parts.push(`<rect x="${stX}" y="${stY}" width="${stW}" height="${stH}" fill="#D4E8F7" stroke="${C.wall}" stroke-width="1.2"/>`);
  // Sludge zone
  parts.push(`<rect x="${stX + 3}" y="${stY + stH * 0.6}" width="${stW - 6}" height="${stH * 0.35}" fill="#A0C4DE" opacity="0.4" stroke="none"/>`);
  parts.push(`<text x="${stX + stW / 2}" y="${stY + stH * 0.8}" text-anchor="middle" font-size="4" font-family="'Courier New',monospace" fill="#2C6E99">SLUDGE ZONE</text>`);
  parts.push(`<text x="${stX + stW / 2}" y="${stY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">SETTLING TANK</text>`);
  parts.push(`<text x="${stX + stW / 2}" y="${stY + stH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${settlingL}×${settlingW}×${settlingD}</text>`);

  drawFlowArrow(bsX + bsW + 2, bsY + bsH / 2, stX - 2, stY + stH / 2);

  // 4. ANAEROBIC BAFFLED REACTOR (ABR)
  const abX = stX + stW + gap;
  const abY = planStartY - 10;
  const abW = anaerobic.l * dSC;
  const abH = anaerobic.w * dSC;
  parts.push(`<rect x="${abX}" y="${abY}" width="${abW}" height="${abH}" fill="#E8DDD0" stroke="${C.wall}" stroke-width="1.2"/>`);
  // Baffles
  const numBaffles = 4;
  for (let bi = 1; bi <= numBaffles; bi++) {
    const bx = abX + (bi / (numBaffles + 1)) * abW;
    const baffleGap = bi % 2 === 0;
    if (baffleGap) {
      parts.push(`<line x1="${bx}" y1="${abY + 3}" x2="${bx}" y2="${abY + abH * 0.75}" stroke="${C.wall}" stroke-width="1.5"/>`);
    } else {
      parts.push(`<line x1="${bx}" y1="${abY + abH * 0.25}" x2="${bx}" y2="${abY + abH - 3}" stroke="${C.wall}" stroke-width="1.5"/>`);
    }
  }
  // Flow path arrows inside ABR
  for (let bi = 0; bi <= numBaffles; bi++) {
    const x = abX + ((bi + 0.5) / (numBaffles + 1)) * abW;
    const goingDown = bi % 2 === 0;
    if (goingDown) {
      parts.push(`<line x1="${x}" y1="${abY + 8}" x2="${x}" y2="${abY + abH - 8}" stroke="#2980B9" stroke-width="0.5" stroke-dasharray="3,2"/>`);
    } else {
      parts.push(`<line x1="${x}" y1="${abY + abH - 8}" x2="${x}" y2="${abY + 8}" stroke="#2980B9" stroke-width="0.5" stroke-dasharray="3,2"/>`);
    }
  }
  parts.push(`<text x="${abX + abW / 2}" y="${abY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">ANAEROBIC BAFFLED</text>`);
  parts.push(`<text x="${abX + abW / 2}" y="${abY + abH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${anaerobic.l}×${anaerobic.w}×${anaerobic.d}</text>`);

  drawFlowArrow(stX + stW + 2, stY + stH / 2, abX - 2, abY + abH / 2);

  // Second row (below) — Filter + Chlorination + Outlet
  const row2Y = planStartY + Math.max(stH, abH) + 80;

  // 5. FILTER MEDIA CHAMBER
  const fmX = abX;
  const fmY = row2Y;
  const fmW = filterL * dSC;
  const fmH = filterW * dSC;
  parts.push(`<rect x="${fmX}" y="${fmY}" width="${fmW}" height="${fmH}" fill="#F0EDE8" stroke="${C.wall}" stroke-width="1.2"/>`);
  // Filter media dots
  for (let fx = fmX + 5; fx < fmX + fmW - 5; fx += 7) {
    for (let fy = fmY + 5; fy < fmY + fmH - 5; fy += 7) {
      parts.push(`<circle cx="${fx}" cy="${fy}" r="1.5" fill="#999" opacity="0.5"/>`);
    }
  }
  parts.push(`<text x="${fmX + fmW / 2}" y="${fmY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">FILTER MEDIA</text>`);
  parts.push(`<text x="${fmX + fmW / 2}" y="${fmY + fmH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${filterL}×${filterW}×${filterD}</text>`);

  drawFlowArrow(abX + abW / 2, abY + abH + 2, fmX + fmW / 2, fmY - 8);

  // 6. CHLORINATION TANK
  const clX = fmX - chlorineL * dSC - gap;
  const clY = row2Y + 5;
  const clW = chlorineL * dSC;
  const clH = chlorineW * dSC;
  parts.push(`<rect x="${clX}" y="${clY}" width="${clW}" height="${clH}" fill="#E8F8E8" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(`<text x="${clX + clW / 2}" y="${clY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">CHLORINATION</text>`);
  parts.push(`<text x="${clX + clW / 2}" y="${clY + clH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${chlorineL}×${chlorineW}</text>`);
  // Chlorine tablet indicator
  parts.push(`<circle cx="${clX + clW / 2}" cy="${clY + clH / 2}" r="8" fill="#4CAF50" opacity="0.3" stroke="#4CAF50" stroke-width="0.5"/>`);
  parts.push(`<text x="${clX + clW / 2}" y="${clY + clH / 2 + 2}" text-anchor="middle" font-size="4" font-family="'Courier New',monospace" fill="#2E7D32">Cl₂</text>`);

  drawFlowArrow(fmX - 2, fmY + fmH / 2, clX + clW + 2, clY + clH / 2);

  // 7. OUTLET MANHOLE
  const outX = clX - gap - inletR * 2;
  const outY = clY + (clH / 2) - inletR;
  parts.push(`<circle cx="${outX + inletR}" cy="${outY + inletR}" r="${inletR}" fill="#E8F8E8" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(`<text x="${outX + inletR}" y="${outY + inletR + 2}" text-anchor="middle" font-size="5.5" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">OUTLET</text>`);
  parts.push(`<text x="${outX + inletR}" y="${outY + inletR + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">MH φ600</text>`);
  parts.push(`<text x="${outX + inletR}" y="${outY + inletR * 2 + 12}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="#4CAF50" font-weight="600">TO SOAK PIT /</text>`);
  parts.push(`<text x="${outX + inletR}" y="${outY + inletR * 2 + 20}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="#4CAF50" font-weight="600">GARDEN REUSE</text>`);

  drawFlowArrow(clX - 2, clY + clH / 2, outX + inletR * 2 + 2, outY + inletR);

  // 8. SLUDGE DRYING BED (separate)
  const sdX = stX;
  const sdY = row2Y;
  const sdW = sludgeDryL * dSC;
  const sdH = sludgeDryW * dSC;
  parts.push(`<rect x="${sdX}" y="${sdY}" width="${sdW}" height="${sdH}" fill="#F5ECD0" stroke="${C.wall}" stroke-width="1" stroke-dasharray="4,2"/>`);
  // Sand layer
  parts.push(`<rect x="${sdX + 3}" y="${sdY + sdH * 0.6}" width="${sdW - 6}" height="${sdH * 0.35}" fill="#E8D8B0" stroke="none"/>`);
  for (let sx = sdX + 5; sx < sdX + sdW - 5; sx += 4) {
    parts.push(`<circle cx="${sx}" cy="${sdY + sdH * 0.75}" r="0.8" fill="#C4A060" opacity="0.6"/>`);
  }
  parts.push(`<text x="${sdX + sdW / 2}" y="${sdY - 5}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">SLUDGE DRYING BED</text>`);
  parts.push(`<text x="${sdX + sdW / 2}" y="${sdY + sdH + 10}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${sludgeDryL}×${sludgeDryW}</text>`);

  // Sludge pipe from settling tank
  parts.push(`<line x1="${stX + stW / 2}" y1="${stY + stH + 2}" x2="${sdX + sdW / 2}" y2="${sdY - 8}" stroke="#8B4513" stroke-width="1" stroke-dasharray="4,2"/>`);
  parts.push(`<text x="${stX + stW / 2 + 15}" y="${stY + stH + 20}" font-size="4.5" font-family="'Courier New',monospace" fill="#8B4513">SLUDGE PIPE</text>`);

  // ═══ SECTION VIEW (Simple cross-section of settling tank) ═══
  const secY = row2Y + Math.max(fmH, sdH) + 80;
  parts.push(`<text x="${planStartX}" y="${secY}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">SETTLING TANK — SECTION A-A</text>`);
  parts.push(`<text x="${planStartX}" y="${secY + 12}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Detention Time: 2 hrs • M25 Concrete • 200mm walls • IS 3370</text>`);

  const secDrawY = secY + 30;
  const secW = settlingL * 0.15; // section scale
  const secH = settlingD * 0.12;
  const secWallT = 200 * 0.12;

  // Tank outline
  parts.push(`<rect x="${planStartX}" y="${secDrawY}" width="${secW + secWallT * 2}" height="${secH + secWallT * 2}" fill="none" stroke="${C.wall}" stroke-width="1.5"/>`);
  // Walls
  parts.push(`<rect x="${planStartX}" y="${secDrawY}" width="${secWallT}" height="${secH + secWallT * 2}" fill="#DDD" stroke="${C.wall}" stroke-width="0.5"/>`);
  parts.push(`<rect x="${planStartX + secW + secWallT}" y="${secDrawY}" width="${secWallT}" height="${secH + secWallT * 2}" fill="#DDD" stroke="${C.wall}" stroke-width="0.5"/>`);
  // Base
  parts.push(`<rect x="${planStartX}" y="${secDrawY + secH + secWallT}" width="${secW + secWallT * 2}" height="${secWallT}" fill="#DDD" stroke="${C.wall}" stroke-width="0.5"/>`);

  // Water
  const waterH = secH * 0.8;
  parts.push(`<rect x="${planStartX + secWallT}" y="${secDrawY + secWallT + (secH - waterH)}" width="${secW}" height="${waterH}" fill="#D4E8F7" opacity="0.4"/>`);

  // Sludge hopper (bottom)
  const hopperW = secW * 0.4;
  const hopperX = planStartX + secWallT + (secW - hopperW) / 2;
  const hopperY = secDrawY + secH + secWallT;
  parts.push(`<polygon points="${hopperX},${hopperY} ${hopperX + hopperW},${hopperY} ${hopperX + hopperW / 2},${hopperY + 25}" fill="#A0C4DE" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<text x="${hopperX + hopperW / 2}" y="${hopperY + 35}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">SLUDGE OUTLET</text>`);

  // Weir plate
  const weirX = planStartX + secWallT + secW * 0.7;
  parts.push(`<line x1="${weirX}" y1="${secDrawY + secWallT}" x2="${weirX}" y2="${secDrawY + secWallT + secH * 0.6}" stroke="${C.wall}" stroke-width="1.5"/>`);
  parts.push(`<text x="${weirX + 5}" y="${secDrawY + secWallT + 10}" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">WEIR</text>`);

  // Dimensions
  parts.push(dimChain(planStartX, secDrawY + secH + secWallT * 2 + 15, planStartX + secW + secWallT * 2, secDrawY + secH + secWallT * 2 + 15, `${settlingL + 400}`, 10, true));
  parts.push(dimChain(planStartX + secW + secWallT * 2 + 15, secDrawY, planStartX + secW + secWallT * 2 + 15, secDrawY + secH + secWallT * 2, `${settlingD + 400}`, 10, false));

  // ═══ DESIGN DATA TABLE ═══
  const tblX = svgW - 280;
  const tblY = secY - 40;
  parts.push(drawTable(tblX, tblY,
    ['Parameter', 'Value'],
    [
      ['Occupants', `${occupants} persons`],
      ['Sewage Flow', `${sewageFlow} LPD`],
      ['Peak Flow', `${peakFlow} LPD`],
      ['BOD (assumed)', '250 mg/L inlet'],
      ['BOD (outlet)', '< 30 mg/L'],
      ['TSS (outlet)', '< 50 mg/L'],
      ['Settling HRT', '2 hours'],
      ['ABR HRT', '8–12 hours'],
      ['Filter Media', 'Gravel + Sand'],
      ['Chlorine Dose', '2–3 mg/L'],
      ['Concrete', 'M25 (IS 3370)'],
      ['Wall Thickness', '200mm'],
      ['Waterproofing', 'Internal coat'],
      ['Compliance', 'CPCB / NBC Part 9'],
    ],
    [80, 100]
  ));

  parts.push(legend(svgW, svgH, '▨ RCC M25 │ ○ Manhole │ ━ Baffle │ ● Filter Media │ ─→ Flow Dir │ CPCB / NBC 2016 │ All dims in mm'));

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}
