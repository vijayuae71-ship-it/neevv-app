import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, crossHatch, brickHatch, drawingBorder, northArrow, legend, gridLabels, drawTable } from '../drawingHelpers';
import { Layout, Column, Room, ProjectRequirements } from '../../types';

export function renderBarBending(layout: Layout, requirements: ProjectRequirements): string {
  const svgW = 900;

  const cols = layout.floors[0]?.columns || [];
  const nCols = cols.length || 6;
  const nFloors = layout.floors.length || 1;
  const bW = layout.buildableWidthM;
  const bD = layout.buildableDepthM;

  // Derive grid dimensions
  const colXs = [...new Set(cols.map(c => c.x))].sort((a, b) => a - b);
  const colYs = [...new Set(cols.map(c => c.y))].sort((a, b) => a - b);
  const nColsX = colXs.length || 3;
  const nColsY = colYs.length || 3;

  // Calculate beam counts
  const nBeamsX = (nColsX - 1) * nColsY; // beams along X
  const nBeamsY = nColsX * (nColsY - 1); // beams along Y
  const nPlinthBeams = nBeamsX + nBeamsY;
  const nFloorBeams = nPlinthBeams * (nFloors);

  // Slab area
  const slabAreaM2 = bW * bD;

  // Unit weights (kg/m)
  const UW: Record<number, number> = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.889, 16: 1.580 };

  // Floor height assumption
  const floorHt = 3.0; // meters
  const colHt = floorHt * nFloors;

  // Number of windows & doors estimate
  const rooms = layout.floors[0]?.rooms || [];
  const nLintels = Math.max(rooms.length * 2, 8);

  // Build BBS rows: [SNo, Member, BarMark, Dia, ShapeCode, NoOfBars, CuttingLen, TotalLen, UnitWt, TotalWt]
  type BBSRow = [string, string, string, number, string, number, number, number, number, number];
  const rows: BBSRow[] = [];
  let sno = 1;

  // Helper
  function addRow(member: string, mark: string, dia: number, shape: string, count: number, cutLen: number) {
    const totalLen = Math.round(count * cutLen) / 1000; // m
    const uw = UW[dia] || 0;
    const totalWt = Math.round(totalLen * uw * 100) / 100;
    rows.push([String(sno++), member, mark, dia, shape, count, cutLen, Math.round(totalLen * 100) / 100, uw, totalWt]);
  }

  // --- Footing ---
  const footSize = 1200; // mm
  const footBarSpacing = 150;
  const footBarsPerDir = Math.floor(footSize / footBarSpacing) + 1; // ~9
  addRow('Footing', 'F1', 12, '51', nCols * footBarsPerDir, footSize + 100); // main (+hooks)
  addRow('Footing', 'F2', 12, '51', nCols * footBarsPerDir, footSize + 100); // distribution

  // --- Column ---
  const colCutLen = Math.round(colHt * 1000 + 500); // lap allowance
  addRow('Column', 'C1', 12, '20', nCols * 4, colCutLen); // 4 corner bars
  addRow('Column', 'C2', 10, '20', nCols * 4, colCutLen); // 4 mid-face
  const stirrupPerCol = Math.ceil(colHt * 1000 / 150);
  const stirrupCutLen = 2 * (230 + 300) - 8 * 40 + 20 * 8; // perimeter - bends + hooks ~900
  addRow('Column', 'C3', 8, '60', nCols * stirrupPerCol, 900);

  // --- Plinth Beam ---
  // Avg beam span
  const avgSpanX = nColsX > 1 ? Math.round(bW / (nColsX - 1) * 1000) : 3000;
  const avgSpanY = nColsY > 1 ? Math.round(bD / (nColsY - 1) * 1000) : 3000;
  const avgSpan = Math.round((avgSpanX + avgSpanY) / 2);
  addRow('Plinth Beam', 'PB1', 12, '20', nPlinthBeams * 2, avgSpan + 300); // top
  addRow('Plinth Beam', 'PB2', 12, '20', nPlinthBeams * 2, avgSpan + 300); // bottom
  const pbStirrups = Math.ceil(avgSpan / 150);
  const pbStLen = 2 * (230 + 300) - 8 * 40 + 20 * 8;
  addRow('Plinth Beam', 'PB3', 8, '60', nPlinthBeams * pbStirrups, 900);

  // --- Floor Beam ---
  addRow('Floor Beam', 'FB1', 16, '38', nFloorBeams * 2, avgSpan + 400); // top (crank)
  addRow('Floor Beam', 'FB2', 16, '20', nFloorBeams * 2, avgSpan + 400); // bottom
  addRow('Floor Beam', 'FB3', 12, '20', nFloorBeams * 2, avgSpan + 200); // hanger
  const fbStSupport = Math.ceil(avgSpan * 0.3 / 150) * 2;
  const fbStMid = Math.ceil(avgSpan * 0.4 / 200);
  addRow('Floor Beam', 'FB4', 8, '60', nFloorBeams * (fbStSupport + fbStMid), 900);

  // --- Slab ---
  const slabMainCount = Math.round(slabAreaM2 / 0.15 * nFloors); // bars @ 150 spacing per m²
  const slabMainLen = Math.round(Math.max(bW, bD) * 1000 + 200);
  addRow('Slab', 'S1', 10, '38', slabMainCount, slabMainLen); // main (crank at supports)
  const slabDistCount = Math.round(slabAreaM2 / 0.20 * nFloors);
  const slabDistLen = Math.round(Math.min(bW, bD) * 1000 + 200);
  addRow('Slab', 'S2', 8, '20', slabDistCount, slabDistLen); // distribution

  // --- Lintel ---
  addRow('Lintel', 'L1', 12, '20', nLintels * 2 * nFloors, 1500); // top
  addRow('Lintel', 'L2', 12, '20', nLintels * 2 * nFloors, 1500); // bottom
  const lintelStPerUnit = Math.ceil(1200 / 150);
  addRow('Lintel', 'L3', 6, '60', nLintels * lintelStPerUnit * nFloors, 700); // stirrups

  // --- Staircase ---
  if (nFloors > 1) {
    const waistLen = Math.round(floorHt / Math.sin(Math.PI / 6) * 1000 + 500); // ~6500
    const waistBars = Math.ceil(1200 / 150);
    addRow('Staircase', 'ST1', 12, '38', waistBars * (nFloors - 1), Math.min(waistLen, 6500));
    const stDistBars = Math.ceil(1200 / 200);
    addRow('Staircase', 'ST2', 8, '20', stDistBars * (nFloors - 1), 3500);
  }

  // Calculate totals by diameter
  const totByDia: Record<number, number> = {};
  let grandTotal = 0;
  for (const r of rows) {
    const dia = r[3];
    const wt = r[9];
    totByDia[dia] = (totByDia[dia] || 0) + wt;
    grandTotal += wt;
  }

  // --- Render SVG ---
  const headerH = 65;
  const rowH = 18;
  const tableStartY = MARGIN + headerH + 10;
  const tableRows = rows.length;
  const summaryRows = Object.keys(totByDia).length + 2;
  const notesH = 70;
  const svgH = tableStartY + (tableRows + summaryRows + 3) * rowH + notesH + MARGIN + 40;

  const colWidths = [30, 75, 40, 35, 50, 45, 65, 55, 50, 55];
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const tableX = (svgW - tableW) / 2;

  let svg = '';

  // Title block
  svg += `<text x="${svgW / 2}" y="${MARGIN + 22}" font-size="14" fill="${C.text}" font-family="sans-serif" font-weight="bold" text-anchor="middle">BAR BENDING SCHEDULE</text>`;
  svg += `<text x="${svgW / 2}" y="${MARGIN + 38}" font-size="9" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">As per IS 2502 | ${requirements.city || 'Project'} - Residential Building</text>`;
  svg += `<text x="${svgW / 2}" y="${MARGIN + 52}" font-size="8" fill="${C.dim}" font-family="sans-serif" text-anchor="middle">Plot: ${layout.plotWidthM}m × ${layout.plotDepthM}m | Floors: ${nFloors} | Columns: ${nCols}</text>`;
  svg += `<line x1="${tableX}" y1="${MARGIN + 58}" x2="${tableX + tableW}" y2="${MARGIN + 58}" stroke="${C.wall}" stroke-width="1"/>`;

  // Table header
  const headers = ['S.No', 'Member', 'Bar Mark', 'Dia\n(mm)', 'Shape\nCode', 'No. of\nBars', 'Cut Len\n(mm)', 'Total L\n(m)', 'Unit Wt\n(kg/m)', 'Total Wt\n(kg)'];
  let hx = tableX;
  const hy = tableStartY;

  // Header background
  svg += `<rect x="${tableX}" y="${hy}" width="${tableW}" height="${rowH + 4}" fill="${C.concrete}" fill-opacity="0.2" stroke="${C.wall}" stroke-width="1"/>`;

  for (let i = 0; i < headers.length; i++) {
    svg += `<line x1="${hx}" y1="${hy}" x2="${hx}" y2="${hy + rowH + 4}" stroke="${C.wall}" stroke-width="0.8"/>`;
    svg += `<text x="${hx + colWidths[i] / 2}" y="${hy + 13}" font-size="6.5" fill="${C.text}" font-family="monospace" font-weight="bold" text-anchor="middle">${headers[i].split('\n')[0]}</text>`;
    if (headers[i].includes('\n')) {
      svg += `<text x="${hx + colWidths[i] / 2}" y="${hy + 20}" font-size="5.5" fill="${C.dim}" font-family="monospace" text-anchor="middle">${headers[i].split('\n')[1]}</text>`;
    }
    hx += colWidths[i];
  }
  svg += `<line x1="${hx}" y1="${hy}" x2="${hx}" y2="${hy + rowH + 4}" stroke="${C.wall}" stroke-width="0.8"/>`;
  svg += `<line x1="${tableX}" y1="${hy + rowH + 4}" x2="${tableX + tableW}" y2="${hy + rowH + 4}" stroke="${C.wall}" stroke-width="1"/>`;

  // Data rows
  let cy = hy + rowH + 4;
  let prevMember = '';
  for (const r of rows) {
    // Alternate row color
    const rowIdx = rows.indexOf(r);
    if (rowIdx % 2 === 0) {
      svg += `<rect x="${tableX}" y="${cy}" width="${tableW}" height="${rowH}" fill="${C.bg}" stroke="none"/>`;
    }

    // Member separator
    if (r[1] !== prevMember && prevMember !== '') {
      svg += `<line x1="${tableX}" y1="${cy}" x2="${tableX + tableW}" y2="${cy}" stroke="${C.wall}" stroke-width="0.8"/>`;
    }
    prevMember = r[1];

    let rx = tableX;
    const vals = [r[0], r[1], r[2], String(r[3]), r[4], String(r[5]), String(r[6]), String(r[7]), String(r[8]), r[9].toFixed(1)];
    for (let i = 0; i < vals.length; i++) {
      svg += `<line x1="${rx}" y1="${cy}" x2="${rx}" y2="${cy + rowH}" stroke="${C.grid}" stroke-width="0.4"/>`;
      const align = i <= 2 || i === 4 ? 'middle' : 'middle';
      svg += `<text x="${rx + colWidths[i] / 2}" y="${cy + 13}" font-size="6" fill="${C.text}" font-family="monospace" text-anchor="${align}">${vals[i]}</text>`;
      rx += colWidths[i];
    }
    svg += `<line x1="${rx}" y1="${cy}" x2="${rx}" y2="${cy + rowH}" stroke="${C.grid}" stroke-width="0.4"/>`;
    svg += `<line x1="${tableX}" y1="${cy + rowH}" x2="${tableX + tableW}" y2="${cy + rowH}" stroke="${C.grid}" stroke-width="0.3"/>`;
    cy += rowH;
  }

  // Bottom border of data
  svg += `<line x1="${tableX}" y1="${cy}" x2="${tableX + tableW}" y2="${cy}" stroke="${C.wall}" stroke-width="1"/>`;

  // Summary section
  cy += 5;
  svg += `<text x="${tableX}" y="${cy + 12}" font-size="8" fill="${C.text}" font-family="sans-serif" font-weight="bold">SUMMARY BY DIAMETER:</text>`;
  cy += 20;

  svg += `<rect x="${tableX}" y="${cy}" width="${tableW}" height="${rowH}" fill="${C.concrete}" fill-opacity="0.15" stroke="${C.wall}" stroke-width="0.8"/>`;
  svg += `<text x="${tableX + 10}" y="${cy + 13}" font-size="7" fill="${C.text}" font-family="monospace" font-weight="bold">Diameter (mm)</text>`;
  svg += `<text x="${tableX + 200}" y="${cy + 13}" font-size="7" fill="${C.text}" font-family="monospace" font-weight="bold">Unit Wt (kg/m)</text>`;
  svg += `<text x="${tableX + 350}" y="${cy + 13}" font-size="7" fill="${C.text}" font-family="monospace" font-weight="bold">Total Weight (kg)</text>`;
  cy += rowH;

  const dias = Object.keys(totByDia).map(Number).sort((a, b) => a - b);
  for (const dia of dias) {
    svg += `<text x="${tableX + 40}" y="${cy + 13}" font-size="6.5" fill="${C.text}" font-family="monospace" text-anchor="middle">${dia}φ</text>`;
    svg += `<text x="${tableX + 230}" y="${cy + 13}" font-size="6.5" fill="${C.text}" font-family="monospace" text-anchor="middle">${UW[dia]}</text>`;
    svg += `<text x="${tableX + 380}" y="${cy + 13}" font-size="6.5" fill="${C.text}" font-family="monospace" text-anchor="middle">${totByDia[dia].toFixed(1)}</text>`;
    svg += `<line x1="${tableX}" y1="${cy + rowH}" x2="${tableX + tableW}" y2="${cy + rowH}" stroke="${C.grid}" stroke-width="0.3"/>`;
    cy += rowH;
  }

  // Grand total
  svg += `<rect x="${tableX}" y="${cy}" width="${tableW}" height="${rowH + 2}" fill="${C.steel}" fill-opacity="0.1" stroke="${C.wall}" stroke-width="1"/>`;
  svg += `<text x="${tableX + 200}" y="${cy + 14}" font-size="8" fill="${C.text}" font-family="sans-serif" font-weight="bold">GRAND TOTAL:</text>`;
  svg += `<text x="${tableX + 380}" y="${cy + 14}" font-size="8" fill="${C.text}" font-family="monospace" font-weight="bold" text-anchor="middle">${grandTotal.toFixed(1)} kg</text>`;
  svg += `<text x="${tableX + 450}" y="${cy + 14}" font-size="7" fill="${C.dim}" font-family="sans-serif">(${(grandTotal / 1000).toFixed(2)} MT)</text>`;
  cy += rowH + 10;

  // Shape code legend
  svg += `<text x="${tableX}" y="${cy + 12}" font-size="7.5" fill="${C.text}" font-family="sans-serif" font-weight="bold">SHAPE CODES (IS 2502):</text>`;
  cy += 20;

  // Shape 20 - Straight
  svg += `<line x1="${tableX + 10}" y1="${cy}" x2="${tableX + 50}" y2="${cy}" stroke="${C.steel}" stroke-width="2"/>`;
  svg += `<text x="${tableX + 55}" y="${cy + 4}" font-size="6" fill="${C.text}" font-family="monospace">20 - Straight</text>`;

  // Shape 38 - Crank
  svg += `<polyline points="${tableX + 160},${cy} ${tableX + 180},${cy} ${tableX + 190},${cy - 8} ${tableX + 210},${cy - 8}" fill="none" stroke="${C.steel}" stroke-width="2"/>`;
  svg += `<text x="${tableX + 215}" y="${cy + 4}" font-size="6" fill="${C.text}" font-family="monospace">38 - Crank</text>`;

  // Shape 51 - L-shape/hook
  svg += `<polyline points="${tableX + 330},${cy - 8} ${tableX + 330},${cy} ${tableX + 360},${cy}" fill="none" stroke="${C.steel}" stroke-width="2"/>`;
  svg += `<circle cx="${tableX + 330}" cy="${cy - 8}" r="2" fill="${C.steel}"/>`;
  svg += `<text x="${tableX + 365}" y="${cy + 4}" font-size="6" fill="${C.text}" font-family="monospace">51 - L-hook</text>`;

  // Shape 60 - Stirrup
  svg += `<rect x="${tableX + 460}" y="${cy - 10}" width="20" height="14" fill="none" stroke="${C.steel}" stroke-width="2" rx="1"/>`;
  svg += `<line x1="${tableX + 460}" y1="${cy - 5}" x2="${tableX + 466}" y2="${cy}" stroke="${C.steel}" stroke-width="1.5"/>`;
  svg += `<text x="${tableX + 485}" y="${cy + 4}" font-size="6" fill="${C.text}" font-family="monospace">60 - Stirrup</text>`;
  cy += 20;

  // Notes
  svg += `<line x1="${tableX}" y1="${cy}" x2="${tableX + tableW}" y2="${cy}" stroke="${C.wall}" stroke-width="0.8"/>`;
  cy += 5;
  svg += `<text x="${tableX}" y="${cy + 12}" font-size="7.5" fill="${C.text}" font-family="sans-serif" font-weight="bold">NOTES:</text>`;
  const notes = [
    '1. All steel Fe500D conforming to IS 1786.',
    '2. Lap length: 50d for tension zones, 40d for compression zones.',
    '3. Clear cover: 50mm (footing), 40mm (column/beam), 20mm (slab), 25mm (lintel).',
    '4. All dimensions in mm unless noted otherwise.',
    '5. Quantities are approximate and subject to site verification.',
    '6. Wastage allowance of 3-5% to be added during procurement.',
  ];
  for (let i = 0; i < notes.length; i++) {
    svg += `<text x="${tableX + 5}" y="${cy + 24 + i * 12}" font-size="6.5" fill="${C.text}" font-family="sans-serif">${notes[i]}</text>`;
  }

  const finalH = Math.max(svgH, cy + 24 + notes.length * 12 + MARGIN + 20);

  // Drawing border
  const border = drawingBorder(svgW, finalH, 'BAR BENDING SCHEDULE', `${requirements.city || 'Project'} - As per IS 2502`);

  return `<svg viewBox="0 0 ${svgW} ${finalH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${border}${svg}</svg>`;
}
