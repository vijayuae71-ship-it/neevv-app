import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, crossHatch, brickHatch, drawingBorder, northArrow, legend, gridLabels, drawTable } from '../drawingHelpers';
import { Layout, Column, Room, ProjectRequirements } from '../../types';

export function renderExcavation(layout: Layout, requirements: ProjectRequirements): string {
  const pW = layout.plotWidthM;
  const pD = layout.plotDepthM;
  const svgW = Math.round((pW + 9) * SC); // extra width for notes panel on right
  const svgH = Math.round((pD + 5) * SC);

  const ox = MARGIN + 2 * SC; // plot origin x
  const oy = MARGIN + 1.5 * SC; // plot origin y
  const plotW = pW * SC;
  const plotH = pD * SC;

  const cols = layout.floors[0]?.columns || [];

  // Derive unique X and Y positions from columns
  const colXs = [...new Set(cols.map(c => c.x))].sort((a, b) => a - b);
  const colYs = [...new Set(cols.map(c => c.y))].sort((a, b) => a - b);

  // If no columns, create a default grid
  const gridXs = colXs.length > 0 ? colXs : [0.5, layout.buildableWidthM / 2, layout.buildableWidthM - 0.5];
  const gridYs = colYs.length > 0 ? colYs : [0.5, layout.buildableDepthM / 2, layout.buildableDepthM - 0.5];

  const sb = layout.setbacks;
  const bx = ox + sb.left * SC; // buildable origin x
  const by = oy + sb.front * SC; // buildable origin y

  // Trench params
  const trenchWidthM = 1.8; // 1200mm footing + 300mm each side
  const trenchHalf = (trenchWidthM / 2) * SC;
  const excDepth = 1200; // mm
  const pccLevel = 1100; // mm

  let svg = '';

  // --- Plot boundary (chain-dotted) ---
  svg += `<rect x="${ox}" y="${oy}" width="${plotW}" height="${plotH}" fill="none" stroke="${C.dim}" stroke-width="1.2" stroke-dasharray="12,4,3,4"/>`;

  // --- Setback lines (dashed) ---
  const bW = layout.buildableWidthM * SC;
  const bD = layout.buildableDepthM * SC;
  svg += `<rect x="${bx}" y="${by}" width="${bW}" height="${bD}" fill="none" stroke="${C.grid}" stroke-width="0.6" stroke-dasharray="6,3"/>`;

  // --- Trench lines along column grid ---
  let trenchParts = '';
  let totalTrenchAreaSqM = 0;

  // Horizontal trenches (connecting columns along each Y row)
  for (const cy of gridYs) {
    const py = by + cy * SC;
    const leftX = bx + Math.min(...gridXs) * SC;
    const rightX = bx + Math.max(...gridXs) * SC;
    trenchParts += `<rect x="${leftX - trenchHalf}" y="${py - trenchHalf}" width="${rightX - leftX + trenchHalf * 2}" height="${trenchHalf * 2}" fill="${C.earth}" fill-opacity="0.25" stroke="${C.earth}" stroke-width="1"/>`;
    // Slope hatch on sides
    const tw = rightX - leftX + trenchHalf * 2;
    for (let hx = 0; hx < tw; hx += 8) {
      trenchParts += `<line x1="${leftX - trenchHalf + hx}" y1="${py - trenchHalf}" x2="${leftX - trenchHalf + hx + 4}" y2="${py - trenchHalf - 4}" stroke="${C.earth}" stroke-width="0.4" opacity="0.5"/>`;
      trenchParts += `<line x1="${leftX - trenchHalf + hx}" y1="${py + trenchHalf}" x2="${leftX - trenchHalf + hx + 4}" y2="${py + trenchHalf + 4}" stroke="${C.earth}" stroke-width="0.4" opacity="0.5"/>`;
    }
    const lenM = (Math.max(...gridXs) - Math.min(...gridXs)) + trenchWidthM;
    totalTrenchAreaSqM += lenM * trenchWidthM;
  }

  // Vertical trenches (connecting columns along each X column)
  for (const cx of gridXs) {
    const px = bx + cx * SC;
    const topY = by + Math.min(...gridYs) * SC;
    const botY = by + Math.max(...gridYs) * SC;
    trenchParts += `<rect x="${px - trenchHalf}" y="${topY - trenchHalf}" width="${trenchHalf * 2}" height="${botY - topY + trenchHalf * 2}" fill="${C.earth}" fill-opacity="0.2" stroke="${C.earth}" stroke-width="1"/>`;
    const lenM = (Math.max(...gridYs) - Math.min(...gridYs)) + trenchWidthM;
    totalTrenchAreaSqM += lenM * trenchWidthM;
  }

  // Remove double-counted overlap at intersections
  totalTrenchAreaSqM -= gridXs.length * gridYs.length * trenchWidthM * trenchWidthM;
  totalTrenchAreaSqM = Math.max(totalTrenchAreaSqM, 0);
  const volumeCuM = (totalTrenchAreaSqM * excDepth / 1000).toFixed(2);

  svg += trenchParts;

  // --- Center line pegs at column intersections ---
  for (const cx of gridXs) {
    for (const cy of gridYs) {
      const px = bx + cx * SC;
      const py = by + cy * SC;
      const cs = 5;
      svg += `<line x1="${px - cs}" y1="${py}" x2="${px + cs}" y2="${py}" stroke="${C.text}" stroke-width="1.2"/>`;
      svg += `<line x1="${px}" y1="${py - cs}" x2="${px}" y2="${py + cs}" stroke="${C.text}" stroke-width="1.2"/>`;
      svg += `<circle cx="${px}" cy="${py}" r="3" fill="none" stroke="${C.text}" stroke-width="0.6"/>`;
      svg += `<text x="${px + 7}" y="${py - 6}" font-size="6" fill="${C.text}" font-family="monospace">CL PEG</text>`;
    }
  }

  // --- Bench mark near front-left corner ---
  const bmX = ox + 15;
  const bmY = oy + plotH - 15;
  svg += levelMark(bmX, bmY, 'BM', 'RL +100.000');

  // --- Trench depth annotations ---
  const annotX = ox + plotW + 12;
  const annotY = oy + 30;
  svg += `<rect x="${annotX}" y="${annotY}" width="130" height="48" fill="${C.bg}" stroke="${C.dim}" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${annotX + 6}" y="${annotY + 14}" font-size="7.5" fill="${C.text}" font-family="sans-serif" font-weight="bold">EXCAVATION NOTES</text>`;
  svg += `<text x="${annotX + 6}" y="${annotY + 26}" font-size="6.5" fill="${C.text}" font-family="sans-serif">Exc. Depth: ${excDepth}mm below GL</text>`;
  svg += `<text x="${annotX + 6}" y="${annotY + 37}" font-size="6.5" fill="${C.text}" font-family="sans-serif">PCC Level: -${pccLevel}mm</text>`;

  // --- Earth removal volume note box ---
  const volBoxX = annotX;
  const volBoxY = annotY + 58;
  svg += `<rect x="${volBoxX}" y="${volBoxY}" width="130" height="38" fill="#FFFDE7" stroke="${C.earth}" stroke-width="1" rx="2"/>`;
  svg += `<text x="${volBoxX + 6}" y="${volBoxY + 14}" font-size="7.5" fill="${C.text}" font-family="sans-serif" font-weight="bold">EARTH REMOVAL</text>`;
  svg += `<text x="${volBoxX + 6}" y="${volBoxY + 26}" font-size="6.5" fill="${C.text}" font-family="sans-serif">Trench Area: ${totalTrenchAreaSqM.toFixed(2)} m²</text>`;
  svg += `<text x="${volBoxX + 6}" y="${volBoxY + 35}" font-size="6.5" fill="${C.text}" font-family="sans-serif">Volume: ${volumeCuM} m³ (approx)</text>`;

  // --- Access path (dashed rectangle along left side) ---
  const apX = ox - 1.2 * SC;
  const apY = oy + 1 * SC;
  const apW = 1 * SC;
  const apH = plotH - 2 * SC;
  svg += `<rect x="${apX}" y="${apY}" width="${apW}" height="${apH}" fill="none" stroke="${C.dim}" stroke-width="1" stroke-dasharray="8,4"/>`;
  svg += `<text x="${apX + apW / 2}" y="${apY + apH / 2}" font-size="7" fill="${C.dim}" font-family="sans-serif" text-anchor="middle" transform="rotate(-90,${apX + apW / 2},${apY + apH / 2})">ACCESS PATH</text>`;

  // --- Dump yard near rear of plot ---
  const dumpX = ox + plotW * 0.6;
  const dumpY = oy - 1.2 * SC;
  svg += `<rect x="${dumpX}" y="${dumpY}" width="${2.5 * SC}" height="${0.9 * SC}" fill="${C.earth}" fill-opacity="0.15" stroke="${C.earth}" stroke-width="1" stroke-dasharray="5,3"/>`;
  svg += `<text x="${dumpX + 1.25 * SC}" y="${dumpY + 0.45 * SC + 3}" font-size="7" fill="${C.earth}" font-family="sans-serif" text-anchor="middle" font-weight="bold">DUMP YARD</text>`;

  // --- Dimensions ---
  // Plot width dim
  svg += dimChain(ox, oy + plotH + 18, ox + plotW, oy + plotH + 18, `${pW.toFixed(2)}m`, 0, true);
  // Plot depth dim
  svg += dimChain(ox - 18, oy, ox - 18, oy + plotH, `${pD.toFixed(2)}m`, 0, false);

  // Setback dims
  svg += dimChain(ox, oy + plotH + 35, ox + sb.left * SC, oy + plotH + 35, `${sb.left.toFixed(1)}m`, 0, true);
  svg += dimChain(ox + plotW - sb.right * SC, oy + plotH + 35, ox + plotW, oy + plotH + 35, `${sb.right.toFixed(1)}m`, 0, true);

  // Trench width dim (first horizontal trench)
  if (gridYs.length > 0) {
    const ty = by + gridYs[0] * SC;
    const tx1 = bx + Math.min(...gridXs) * SC - trenchHalf;
    svg += dimChain(tx1, ty - trenchHalf - 12, tx1 + trenchHalf * 2, ty - trenchHalf - 12, '1800', 0, true);
  }

  // Spacing between trenches (first two Y rows)
  if (gridYs.length >= 2) {
    const ty1 = by + gridYs[0] * SC;
    const ty2 = by + gridYs[1] * SC;
    const tx = bx + Math.max(...gridXs) * SC + trenchHalf + 20;
    svg += dimChain(tx, ty1, tx, ty2, `${(gridYs[1] - gridYs[0]).toFixed(2)}m`, 0, false);
  }

  // --- Grid references ---
  const gxPx = gridXs.map(gx => bx + gx * SC);
  const gyPx = gridYs.map(gy => by + gy * SC);
  svg += gridLabels(gxPx, gyPx, plotW, plotH);

  // --- North arrow ---
  const facing = requirements.facing || 'North';
  svg += northArrow(ox + plotW - 30, oy + 30);

  // --- Legend ---
  svg += legend(svgW, svgH, `EXCAVATION PLAN | Plot: ${pW}m × ${pD}m | Facing: ${facing} | Scale 1:${Math.round(1000 / SC)}`);

  // --- Drawing border ---
  const border = drawingBorder(svgW, svgH, 'EXCAVATION LAYOUT PLAN', `${requirements.city || 'Project'} - Residential Building`);

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${border}${svg}</svg>`;
}
