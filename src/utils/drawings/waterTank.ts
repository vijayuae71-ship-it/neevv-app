import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, crossHatch, drawingBorder, legend, drawTable } from '../drawingHelpers';
import { Layout, ProjectRequirements } from '../../types';

export function renderWaterTank(layout: Layout, requirements: ProjectRequirements): string {
  const numFloors = requirements.floors.length;
  // Water demand: 135 lpcd (NBC) × occupants × 2 days storage
  const bedrooms = requirements.floors.reduce((sum, f) => sum + (f.bedrooms || 0), 0);
  const occupants = Math.max(4, bedrooms * 2);
  const dailyDemand = occupants * 135; // liters
  const storageDays = 2;
  const totalLiters = dailyDemand * storageDays;

  // Underground sump: full storage; Overhead: 50% of daily
  const sumpLiters = totalLiters;
  const ohtLiters = Math.ceil(dailyDemand * 0.5);

  // Tank sizing (rectangular)
  const sumpL = 2000; // mm
  const sumpW = 1500; // mm
  const sumpD = Math.ceil(sumpLiters / (sumpL / 1000 * sumpW / 1000) / 1000) * 1000; // mm depth
  const sumpDepth = Math.max(1500, Math.min(2500, sumpD));

  const ohtL = 1200; // mm
  const ohtW = 1000; // mm
  const ohtD = Math.ceil(ohtLiters / (ohtL / 1000 * ohtW / 1000) / 1000) * 1000;
  const ohtDepth = Math.max(800, Math.min(1500, ohtD));

  const wallT = 200; // mm wall thickness
  const baseT = 200; // mm base slab
  const topSlabT = 150; // mm

  const dSC = 0.12; // px per mm
  const svgW = 900;
  const svgH = 850;

  const parts: string[] = [];
  parts.push(drawingBorder(svgW, svgH, 'WATER TANK DETAILS',
    `Underground Sump + Overhead Tank • ${occupants} persons • ${totalLiters}L storage • IS 3370 / NBC 2016`));

  // ═══ SECTION A: UNDERGROUND SUMP ═══
  const sumpSecX = MARGIN + 40;
  const sumpSecY = MARGIN + 50;

  parts.push(`<text x="${sumpSecX}" y="${sumpSecY - 20}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">UNDERGROUND SUMP — SECTION</text>`);
  parts.push(`<text x="${sumpSecX}" y="${sumpSecY - 8}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Capacity: ${sumpLiters}L • Internal: ${sumpL}×${sumpW}×${sumpDepth}mm • M25 Concrete • IS 3370-2</text>`);

  // Ground level line
  const glY = sumpSecY + 30;
  parts.push(`<line x1="${sumpSecX - 20}" y1="${glY}" x2="${sumpSecX + (sumpL + wallT * 2 + 400) * dSC}" y2="${glY}" stroke="${C.earth}" stroke-width="2"/>`);
  parts.push(levelMark(sumpSecX - 30, glY, 'GL', '±0.000'));

  // Earth fill (hatched)
  const tankOuterW = (sumpL + wallT * 2) * dSC;
  const tankOuterH = (sumpDepth + baseT + topSlabT) * dSC;

  // Tank walls
  const tankX = sumpSecX + 100 * dSC;
  const tankTopY = glY - topSlabT * dSC;
  const tankBotY = glY + (sumpDepth + baseT) * dSC;

  // Top slab
  parts.push(`<rect x="${tankX}" y="${tankTopY}" width="${tankOuterW}" height="${topSlabT * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('sumpTop', tankX, tankTopY, tankOuterW, topSlabT * dSC));

  // Left wall
  parts.push(`<rect x="${tankX}" y="${glY}" width="${wallT * dSC}" height="${(sumpDepth + baseT) * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('sumpLW', tankX, glY, wallT * dSC, (sumpDepth + baseT) * dSC));

  // Right wall
  const rwX = tankX + (sumpL + wallT) * dSC;
  parts.push(`<rect x="${rwX}" y="${glY}" width="${wallT * dSC}" height="${(sumpDepth + baseT) * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('sumpRW', rwX, glY, wallT * dSC, (sumpDepth + baseT) * dSC));

  // Base slab
  const baseY = glY + sumpDepth * dSC;
  parts.push(`<rect x="${tankX}" y="${baseY}" width="${tankOuterW}" height="${baseT * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(concreteHatch('sumpBase', tankX, baseY, tankOuterW, baseT * dSC));

  // PCC bed below base
  const pccH = 100; // mm
  parts.push(`<rect x="${tankX - 50 * dSC}" y="${baseY + baseT * dSC}" width="${tankOuterW + 100 * dSC}" height="${pccH * dSC}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.5"/>`);
  parts.push(`<text x="${tankX + tankOuterW / 2}" y="${baseY + (baseT + pccH / 2) * dSC + 2}" text-anchor="middle" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">PCC 1:4:8 − 100mm</text>`);

  // Water level indicator
  const waterLevel = sumpDepth * 0.75; // 75% full
  const waterY = glY + (sumpDepth - waterLevel) * dSC;
  parts.push(`<rect x="${tankX + wallT * dSC + 2}" y="${waterY}" width="${sumpL * dSC - 4}" height="${waterLevel * dSC}" fill="#D4E8F7" opacity="0.4" stroke="none"/>`);
  for (let wy = waterY; wy < baseY; wy += 8) {
    parts.push(`<line x1="${tankX + wallT * dSC + 5}" y1="${wy}" x2="${rwX - 5}" y2="${wy}" stroke="#8BB8D6" stroke-width="0.3" opacity="0.5"/>`);
  }
  parts.push(`<text x="${rwX + wallT * dSC + 10}" y="${waterY + 3}" font-size="5" font-family="'Courier New',monospace" fill="#2980B9" font-weight="600">WL (75%)</text>`);

  // Reinforcement indicators
  // Vertical bars in walls
  for (let vy = glY + 10; vy < baseY - 5; vy += 15) {
    parts.push(`<circle cx="${tankX + wallT * dSC / 2}" cy="${vy}" r="1.5" fill="${C.steel}"/>`);
    parts.push(`<circle cx="${rwX + wallT * dSC / 2}" cy="${vy}" r="1.5" fill="${C.steel}"/>`);
  }
  // Horizontal bars in base
  parts.push(`<line x1="${tankX + 3}" y1="${baseY + baseT * dSC * 0.3}" x2="${tankX + tankOuterW - 3}" y2="${baseY + baseT * dSC * 0.3}" stroke="${C.steel}" stroke-width="0.8"/>`);
  parts.push(`<line x1="${tankX + 3}" y1="${baseY + baseT * dSC * 0.7}" x2="${tankX + tankOuterW - 3}" y2="${baseY + baseT * dSC * 0.7}" stroke="${C.steel}" stroke-width="0.8"/>`);

  // Inlet/outlet pipes
  const pipeR = 25 * dSC;
  // Inlet pipe (top left)
  parts.push(`<circle cx="${tankX + wallT * dSC / 2}" cy="${glY + 50 * dSC}" r="${pipeR}" fill="none" stroke="#2980B9" stroke-width="1.5"/>`);
  parts.push(`<text x="${tankX - 20}" y="${glY + 50 * dSC + 2}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="#2980B9">INLET 25φ</text>`);

  // Outlet pipe (bottom right)
  parts.push(`<circle cx="${rwX + wallT * dSC / 2}" cy="${baseY - 100 * dSC}" r="${pipeR}" fill="none" stroke="#E74C3C" stroke-width="1.5"/>`);
  parts.push(`<text x="${rwX + wallT * dSC + 20}" y="${baseY - 100 * dSC + 2}" font-size="5" font-family="'Courier New',monospace" fill="#E74C3C">OUTLET 25φ → PUMP</text>`);

  // Overflow
  parts.push(`<circle cx="${rwX + wallT * dSC / 2}" cy="${glY + 30 * dSC}" r="${pipeR}" fill="none" stroke="#F39C12" stroke-width="1.5"/>`);
  parts.push(`<text x="${rwX + wallT * dSC + 20}" y="${glY + 30 * dSC + 2}" font-size="5" font-family="'Courier New',monospace" fill="#F39C12">OVERFLOW 32φ</text>`);

  // Manhole cover
  const mhW = 600 * dSC;
  const mhX = tankX + (tankOuterW - mhW) / 2;
  parts.push(`<rect x="${mhX}" y="${tankTopY - 3}" width="${mhW}" height="3" fill="#888" stroke="${C.wall}" stroke-width="0.8" rx="1"/>`);
  parts.push(`<text x="${mhX + mhW / 2}" y="${tankTopY - 6}" text-anchor="middle" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">CI MANHOLE COVER 600×600</text>`);

  // Dimensions
  parts.push(dimChain(tankX + wallT * dSC, tankBotY + 20, rwX, tankBotY + 20, `${sumpL}`, 12, true));
  parts.push(dimChain(tankX, tankBotY + 35, rwX + wallT * dSC, tankBotY + 35, `${sumpL + wallT * 2}`, 12, true));
  parts.push(dimChain(rwX + wallT * dSC + 30, glY, rwX + wallT * dSC + 30, baseY, `${sumpDepth}`, 15, false));
  parts.push(dimChain(rwX + wallT * dSC + 50, tankTopY, rwX + wallT * dSC + 50, baseY + baseT * dSC, `${sumpDepth + baseT + topSlabT}`, 15, false));

  // Waterproof coating callout
  parts.push(`<line x1="${tankX + wallT * dSC + 2}" y1="${glY + sumpDepth * dSC * 0.5}" x2="${tankX - 50}" y2="${glY + sumpDepth * dSC * 0.3}" stroke="${C.dim}" stroke-width="0.5"/>`);
  parts.push(`<text x="${tankX - 52}" y="${glY + sumpDepth * dSC * 0.3 - 3}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">WATERPROOF</text>`);
  parts.push(`<text x="${tankX - 52}" y="${glY + sumpDepth * dSC * 0.3 + 4}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">PLASTER 20mm</text>`);

  // ═══ SECTION B: OVERHEAD TANK ═══
  const ohtSecX = MARGIN + 40;
  const ohtSecY = svgH / 2 + 40;

  parts.push(`<text x="${ohtSecX}" y="${ohtSecY - 20}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">OVERHEAD TANK — SECTION</text>`);
  parts.push(`<text x="${ohtSecX}" y="${ohtSecY - 8}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Capacity: ${ohtLiters}L • Internal: ${ohtL}×${ohtW}×${ohtDepth}mm • M25 Concrete • Placed at Terrace +${(numFloors * 3).toFixed(1)}m</text>`);

  const ohtTankOuterW = (ohtL + wallT * 2) * dSC;
  const ohtTankX = ohtSecX + 80 * dSC;

  // OHT base slab
  const ohtBaseY = ohtSecY + 40;
  parts.push(`<rect x="${ohtTankX}" y="${ohtBaseY}" width="${ohtTankOuterW}" height="${baseT * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(concreteHatch('ohtBase', ohtTankX, ohtBaseY, ohtTankOuterW, baseT * dSC));

  // OHT walls
  const ohtWallTop = ohtBaseY - ohtDepth * dSC;
  // Left wall
  parts.push(`<rect x="${ohtTankX}" y="${ohtWallTop}" width="${wallT * dSC}" height="${ohtDepth * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('ohtLW', ohtTankX, ohtWallTop, wallT * dSC, ohtDepth * dSC));
  // Right wall
  const ohtRW = ohtTankX + (ohtL + wallT) * dSC;
  parts.push(`<rect x="${ohtRW}" y="${ohtWallTop}" width="${wallT * dSC}" height="${ohtDepth * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('ohtRW', ohtRW, ohtWallTop, wallT * dSC, ohtDepth * dSC));

  // Top slab
  parts.push(`<rect x="${ohtTankX}" y="${ohtWallTop - topSlabT * dSC}" width="${ohtTankOuterW}" height="${topSlabT * dSC}" fill="#DDD" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('ohtTop', ohtTankX, ohtWallTop - topSlabT * dSC, ohtTankOuterW, topSlabT * dSC));

  // Water inside OHT
  const ohtWaterH = ohtDepth * 0.7;
  const ohtWaterY = ohtBaseY - ohtWaterH * dSC;
  parts.push(`<rect x="${ohtTankX + wallT * dSC + 2}" y="${ohtWaterY}" width="${ohtL * dSC - 4}" height="${ohtWaterH * dSC}" fill="#D4E8F7" opacity="0.4"/>`);

  // OHT inlet/outlet
  parts.push(`<circle cx="${ohtTankX + wallT * dSC / 2}" cy="${ohtWallTop + ohtDepth * dSC * 0.2}" r="${pipeR}" fill="none" stroke="#2980B9" stroke-width="1.5"/>`);
  parts.push(`<text x="${ohtTankX - 15}" y="${ohtWallTop + ohtDepth * dSC * 0.2 + 2}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="#2980B9">INLET 25φ</text>`);

  parts.push(`<circle cx="${ohtRW + wallT * dSC / 2}" cy="${ohtBaseY - 50 * dSC}" r="${pipeR}" fill="none" stroke="#E74C3C" stroke-width="1.5"/>`);
  parts.push(`<text x="${ohtRW + wallT * dSC + 15}" y="${ohtBaseY - 50 * dSC + 2}" font-size="5" font-family="'Courier New',monospace" fill="#E74C3C">OUTLET 25φ → DIST.</text>`);

  // OHT dimensions
  parts.push(dimChain(ohtTankX + wallT * dSC, ohtBaseY + baseT * dSC + 15, ohtRW, ohtBaseY + baseT * dSC + 15, `${ohtL}`, 10, true));
  parts.push(dimChain(ohtRW + wallT * dSC + 25, ohtWallTop, ohtRW + wallT * dSC + 25, ohtBaseY, `${ohtDepth}`, 12, false));

  // ═══ SCHEDULE TABLE ═══
  const tblX = svgW - 280;
  const tblY = ohtSecY - 10;
  parts.push(drawTable(tblX, tblY,
    ['Parameter', 'Sump', 'OHT'],
    [
      ['Internal Size', `${sumpL}×${sumpW}`, `${ohtL}×${ohtW}`],
      ['Depth', `${sumpDepth}mm`, `${ohtDepth}mm`],
      ['Capacity', `${sumpLiters}L`, `${ohtLiters}L`],
      ['Wall Thick.', `${wallT}mm`, `${wallT}mm`],
      ['Base Slab', `${baseT}mm M25`, `${baseT}mm M25`],
      ['Top Slab', `${topSlabT}mm`, `${topSlabT}mm`],
      ['Main Steel', '10φ@150 c/c', '10φ@150 c/c'],
      ['Dist. Steel', '8φ@200 c/c', '8φ@200 c/c'],
      ['Waterproof', 'Int. 20mm', 'Int. 20mm'],
      ['Grade', 'M25 (IS 3370)', 'M25 (IS 3370)'],
      ['Occupants', `${occupants}`, `${occupants}`],
      ['Daily Demand', `${dailyDemand}L`, `${dailyDemand}L`],
    ],
    [70, 75, 75]
  ));

  parts.push(legend(svgW, svgH, '▨ RCC M25 │ ● Rebar │ ○ Pipe │ ≈ Water │ □ PCC 1:4:8 │ IS 3370 / NBC 2016 │ All dims in mm'));

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}
