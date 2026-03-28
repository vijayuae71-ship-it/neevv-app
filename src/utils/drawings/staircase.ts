import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, drawingBorder, legend, drawTable } from '../drawingHelpers';
import { Layout, ProjectRequirements } from '../../types';

export function renderStaircase(layout: Layout, requirements: ProjectRequirements): string {
  const numFloors = requirements.floors.length;
  const floorH = 3000; // mm floor-to-floor
  const riserH = 150; // mm
  const treadW = 250; // mm
  const risersPerFlight = Math.ceil((floorH / 2) / riserH); // ~10 risers per flight
  const landingW = 1200; // mm (NBC minimum)
  const stairWidth = 1000; // mm clear width (NBC minimum for residential)
  const waistSlab = 150; // mm
  const handrailH = 1000; // mm

  // Drawing scale: 1px = 5mm for detail drawing
  const dSC = 0.2; // px per mm
  const toX = (mm: number) => MARGIN + 60 + mm * dSC;
  const toY = (baseY: number, mm: number) => baseY - mm * dSC;

  // Section view dimensions
  const sectionW = (risersPerFlight * treadW + landingW * 2) * dSC + 200;
  const sectionH = (floorH + 800) * dSC + 100;

  // Plan view dimensions
  const planW = (stairWidth * 2 + 230) * dSC + 200; // two flights + wall
  const planH = (risersPerFlight * treadW + landingW) * dSC + 100;

  const svgW = Math.max(sectionW, planW) + 300;
  const svgH = sectionH + planH + 200;

  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'STAIRCASE DETAIL',
    `Dog-Leg Staircase • ${risersPerFlight * 2} Risers/Floor • Riser: ${riserH}mm • Tread: ${treadW}mm • Width: ${stairWidth}mm • IS 456 / NBC 2016`));

  // ═══ SECTION VIEW ═══
  const secBaseY = sectionH - 40;
  const secLabelY = MARGIN + 15;
  parts.push(`<text x="${MARGIN + 60}" y="${secLabelY}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">SECTION X-X</text>`);
  parts.push(`<text x="${MARGIN + 60}" y="${secLabelY + 12}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Scale 1:${Math.round(1 / (dSC * 2))} • Floor-to-Floor: ${floorH}mm • ${numFloors} Storey(s)</text>`);

  // Ground line
  const glY = secBaseY;
  parts.push(`<line x1="${MARGIN}" y1="${glY}" x2="${svgW - MARGIN}" y2="${glY}" stroke="${C.earth}" stroke-width="2"/>`);
  for (let hx = MARGIN; hx < svgW - MARGIN; hx += 8) {
    parts.push(`<line x1="${hx}" y1="${glY + 1}" x2="${hx + 5}" y2="${glY + 8}" stroke="${C.earth}" stroke-width="0.3" opacity="0.5"/>`);
  }
  parts.push(levelMark(MARGIN + 10, glY, 'GL', '±0.000'));

  // Draw one full floor section (flight up + landing + flight up)
  const startX = toX(0);

  // First flight (going up)
  for (let i = 0; i < risersPerFlight; i++) {
    const sx = startX + i * treadW * dSC;
    const sy = toY(glY, i * riserH);
    const nx = sx + treadW * dSC;
    const ny = toY(glY, (i + 1) * riserH);

    // Tread and riser lines
    parts.push(`<line x1="${sx}" y1="${sy}" x2="${nx}" y2="${sy}" stroke="${C.wall}" stroke-width="1"/>`);
    parts.push(`<line x1="${nx}" y1="${sy}" x2="${nx}" y2="${ny}" stroke="${C.wall}" stroke-width="1"/>`);

    // Nosing
    parts.push(`<circle cx="${nx}" cy="${sy}" r="1.5" fill="${C.wall}"/>`);
  }

  // Mid-landing
  const landingStartX = startX + risersPerFlight * treadW * dSC;
  const midLandingY = toY(glY, risersPerFlight * riserH);
  parts.push(`<rect x="${landingStartX}" y="${midLandingY}" width="${landingW * dSC}" height="${waistSlab * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('mlanding', landingStartX, midLandingY, landingW * dSC, waistSlab * dSC));
  parts.push(`<text x="${landingStartX + landingW * dSC / 2}" y="${midLandingY + waistSlab * dSC + 12}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">MID LANDING</text>`);
  parts.push(levelMark(landingStartX - 35, midLandingY, 'ML', `+${(risersPerFlight * riserH / 1000).toFixed(3)}`));

  // Second flight (going up from landing)
  const flight2StartX = landingStartX + landingW * dSC;
  for (let i = 0; i < risersPerFlight; i++) {
    const sx = flight2StartX + i * treadW * dSC;
    const baseH = risersPerFlight * riserH;
    const sy = toY(glY, baseH + i * riserH);
    const nx = sx + treadW * dSC;
    const ny = toY(glY, baseH + (i + 1) * riserH);

    parts.push(`<line x1="${sx}" y1="${sy}" x2="${nx}" y2="${sy}" stroke="${C.wall}" stroke-width="1"/>`);
    parts.push(`<line x1="${nx}" y1="${sy}" x2="${nx}" y2="${ny}" stroke="${C.wall}" stroke-width="1"/>`);
    parts.push(`<circle cx="${nx}" cy="${sy}" r="1.5" fill="${C.wall}"/>`);
  }

  // Floor slab at top
  const topSlabX = flight2StartX + risersPerFlight * treadW * dSC;
  const topSlabY = toY(glY, floorH);
  parts.push(`<rect x="${topSlabX}" y="${topSlabY}" width="${landingW * dSC}" height="${waistSlab * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(concreteHatch('topslab', topSlabX, topSlabY, landingW * dSC, waistSlab * dSC));
  parts.push(levelMark(topSlabX + landingW * dSC + 10, topSlabY, 'FFL', `+${(floorH / 1000).toFixed(3)}`));

  // Waist slab (underneath stairs) — flight 1
  const waistAngle1 = Math.atan2(risersPerFlight * riserH * dSC, risersPerFlight * treadW * dSC);
  const wOffX = waistSlab * dSC * Math.sin(waistAngle1);
  const wOffY = waistSlab * dSC * Math.cos(waistAngle1);
  parts.push(`<line x1="${startX}" y1="${glY}" x2="${startX}" y2="${glY + wOffY}" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<line x1="${startX}" y1="${glY + wOffY}" x2="${landingStartX - wOffX}" y2="${midLandingY + wOffY}" stroke="${C.wall}" stroke-width="0.8" stroke-dasharray="4,2"/>`);

  // Handrail
  for (let i = 0; i <= risersPerFlight; i += risersPerFlight) {
    if (i === 0) {
      // Flight 1 handrail
      parts.push(`<line x1="${startX}" y1="${toY(glY, handrailH)}" x2="${landingStartX}" y2="${toY(glY, risersPerFlight * riserH + handrailH)}" stroke="${C.steel}" stroke-width="1.5"/>`);
      // Balusters
      for (let b = 0; b < risersPerFlight; b += 2) {
        const bx = startX + b * treadW * dSC;
        const by = toY(glY, b * riserH);
        parts.push(`<line x1="${bx}" y1="${by}" x2="${bx}" y2="${toY(glY, b * riserH + handrailH)}" stroke="${C.steel}" stroke-width="0.5"/>`);
      }
    }
  }

  // Dimension chains — section
  // Riser height
  parts.push(dimChain(startX - 25, glY, startX - 25, midLandingY, `${risersPerFlight * riserH}`, 20, false));
  // Full floor height
  parts.push(dimChain(startX - 55, glY, startX - 55, topSlabY, `${floorH}`, 20, false));
  // Tread width span
  parts.push(dimChain(startX, glY + 25, landingStartX, glY + 25, `${risersPerFlight} T × ${treadW} = ${risersPerFlight * treadW}`, 15, true));
  // Landing width
  parts.push(dimChain(landingStartX, glY + 25, landingStartX + landingW * dSC, glY + 25, `${landingW}`, 15, true));

  // ═══ PLAN VIEW ═══
  const planStartY = sectionH + 40;
  parts.push(`<text x="${MARGIN + 60}" y="${planStartY}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">PLAN VIEW</text>`);
  parts.push(`<text x="${MARGIN + 60}" y="${planStartY + 12}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Dog-Leg Type • Clear Width: ${stairWidth}mm • NBC Clause 7.4</text>`);

  const planOX = MARGIN + 80;
  const planOY = planStartY + 30;
  const planSC = 0.15; // slightly smaller scale for plan
  const totalPlanW = stairWidth * 2 + 230; // two flights + middle wall
  const totalPlanH = risersPerFlight * treadW + landingW;

  // Stairwell outline
  parts.push(`<rect x="${planOX}" y="${planOY}" width="${totalPlanW * planSC}" height="${totalPlanH * planSC}" fill="#FAFAF5" stroke="${C.wall}" stroke-width="1.5"/>`);

  // Middle wall
  const midWallX = planOX + stairWidth * planSC;
  parts.push(`<rect x="${midWallX}" y="${planOY}" width="${230 * planSC}" height="${risersPerFlight * treadW * planSC}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.8"/>`);

  // Flight 1 (left side, going up)
  for (let i = 0; i < risersPerFlight; i++) {
    const ty = planOY + i * treadW * planSC;
    parts.push(`<line x1="${planOX}" y1="${ty}" x2="${midWallX}" y2="${ty}" stroke="${C.wall}" stroke-width="0.5"/>`);
    // Arrow direction (UP)
    if (i === Math.floor(risersPerFlight / 2)) {
      const arrowY = ty + treadW * planSC / 2;
      const arrowX = planOX + stairWidth * planSC / 2;
      parts.push(`<line x1="${arrowX}" y1="${arrowY + 30}" x2="${arrowX}" y2="${arrowY - 30}" stroke="${C.text}" stroke-width="1" marker-end="url(#arrowhead)"/>`);
      parts.push(`<text x="${arrowX + 10}" y="${arrowY}" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">UP</text>`);
    }
  }

  // Flight 2 (right side, going up opposite direction)
  const flight2X = midWallX + 230 * planSC;
  for (let i = 0; i < risersPerFlight; i++) {
    const ty = planOY + (risersPerFlight - 1 - i) * treadW * planSC;
    parts.push(`<line x1="${flight2X}" y1="${ty}" x2="${planOX + totalPlanW * planSC}" y2="${ty}" stroke="${C.wall}" stroke-width="0.5"/>`);
    if (i === Math.floor(risersPerFlight / 2)) {
      const arrowY = ty + treadW * planSC / 2;
      const arrowX = flight2X + stairWidth * planSC / 2;
      parts.push(`<line x1="${arrowX}" y1="${arrowY - 30}" x2="${arrowX}" y2="${arrowY + 30}" stroke="${C.text}" stroke-width="1" marker-end="url(#arrowhead)"/>`);
      parts.push(`<text x="${arrowX + 10}" y="${arrowY}" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="600">UP</text>`);
    }
  }

  // Landing areas
  const landingY = planOY + risersPerFlight * treadW * planSC;
  parts.push(`<rect x="${planOX}" y="${landingY}" width="${totalPlanW * planSC}" height="${landingW * planSC}" fill="#F0EDE8" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<text x="${planOX + totalPlanW * planSC / 2}" y="${landingY + landingW * planSC / 2 + 3}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="600">LANDING ${landingW}×${totalPlanW}</text>`);

  // Arrow marker definition
  parts.push(`<defs><marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto"><polygon points="0 0, 6 2, 0 4" fill="${C.text}"/></marker></defs>`);

  // Plan dimensions
  parts.push(dimChain(planOX, planOY - 15, planOX + stairWidth * planSC, planOY - 15, `${stairWidth}`, 10, true));
  parts.push(dimChain(midWallX, planOY - 15, midWallX + 230 * planSC, planOY - 15, '230', 10, true));
  parts.push(dimChain(flight2X, planOY - 15, planOX + totalPlanW * planSC, planOY - 15, `${stairWidth}`, 10, true));
  parts.push(dimChain(planOX - 20, planOY, planOX - 20, landingY + landingW * planSC, `${totalPlanH}`, 15, false));

  // ═══ STAIRCASE SCHEDULE TABLE ═══
  const tblX = svgW - 260;
  const tblY = planStartY + 20;
  parts.push(drawTable(tblX, tblY,
    ['Parameter', 'Value', 'NBC Ref'],
    [
      ['Floor Height', `${floorH} mm`, 'Cl. 7.4'],
      ['No. of Risers/Floor', `${risersPerFlight * 2}`, 'Cl. 7.4.2'],
      ['Riser Height', `${riserH} mm ≤ 190`, 'Cl. 7.4.2'],
      ['Tread Width', `${treadW} mm ≥ 250`, 'Cl. 7.4.2'],
      ['Clear Width', `${stairWidth} mm ≥ 1000`, 'Cl. 7.4.1'],
      ['Landing Width', `${landingW} mm ≥ 1000`, 'Cl. 7.4.3'],
      ['Headroom', '2100 mm min', 'Cl. 7.4.4'],
      ['Handrail Height', `${handrailH} mm`, 'Cl. 7.4.6'],
      ['Waist Slab', `${waistSlab} mm M20`, 'IS 456'],
      ['Main Steel', '12φ@150 c/c', 'IS 456'],
      ['Dist. Steel', '8φ@200 c/c', 'IS 456'],
    ],
    [80, 80, 50]
  ));

  parts.push(legend(svgW, svgH, '▨ RCC M20 │ ─── Handrail MS │ ○ Nosing │ ┈┈ Waist Slab │ All dims in mm │ IS 456 / NBC 2016'));

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}
