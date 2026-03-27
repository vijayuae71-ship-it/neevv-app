import { Layout, ProjectRequirements } from '../../types';

export function renderFootingDetail(layout: Layout, requirements: ProjectRequirements): string {
  // Get column data from layout
  const floor = layout.floors[0];
  const col = floor?.columns?.[0];
  const colSize = col ? `${col.width}x${col.depth}` : '300x300';
  const colW = col?.width || 300;
  const colD = col?.depth || 300;

  // Calculate footing dimensions based on column size
  const footingW = Math.max(colW * 4, 1200);  // typically 3-4x column width
  const footingD = Math.max(colD * 4, 1200);
  const footingThk = 300;
  const pedestalH = 300;
  const pccThk = 150;
  const colH = 900; // shown portion of column above
  const lapLength = 900;
  const kicker = 75;

  // Rebar specs
  const colBars = '10-20 #';
  const footingBarsLong = `${Math.ceil(footingW / 150)}-16 #`;
  const footingBarsShort = `${Math.ceil(footingD / 150)}-16 #`;
  const starterBars = '10-20 #';

  // ===== SVG LAYOUT =====
  // Full width drawing, stacked: Title → Elevation → Plan → Notes
  const svgW = 720;
  const margin = 60;
  const drawAreaW = svgW - margin * 2;

  // --- ELEVATION DRAWING ---
  // Scale to fit drawing area
  const elevTotalH = pccThk + footingThk + pedestalH + colH + lapLength;
  const elevScale = Math.min(drawAreaW * 0.55 / footingW, 320 / elevTotalH);
  const eW = footingW * elevScale;   // drawn footing width
  const ePcc = pccThk * elevScale;
  const eFtg = footingThk * elevScale;
  const ePed = pedestalH * elevScale;
  const eCol = colH * elevScale;
  const eLap = lapLength * elevScale;
  const eColW = colW * elevScale;
  const ePedW = (colW + 100) * elevScale; // pedestal slightly wider
  const eKicker = kicker * elevScale;

  // Elevation center and vertical positions
  const elevCx = svgW / 2;
  const elevTop = 80; // below title
  const glY = elevTop + eLap + eCol + 20; // ground level
  const pedTopY = glY + 10;
  const pedBotY = pedTopY + ePed;
  const ftgTopY = pedBotY;
  const ftgBotY = ftgTopY + eFtg;
  const pccTopY = ftgBotY;
  const pccBotY = pccTopY + ePcc;
  const colTopY = glY - eCol;
  const colBotY = glY;

  // Elevation section end
  const elevEndY = pccBotY + 50;

  // --- PLAN DRAWING ---
  const planTop = elevEndY + 60;
  const planScale = Math.min(drawAreaW * 0.6 / footingW, drawAreaW * 0.6 / footingD);
  const pW = footingW * planScale;
  const pD = footingD * planScale;
  const pColW = colW * planScale;
  const pColD = colD * planScale;
  const planCx = svgW / 2;
  const planCy = planTop + pD / 2 + 30;
  const planEndY = planCy + pD / 2 + 80;

  // Notes section
  const notesTop = planEndY + 20;
  const svgH = notesTop + 160;

  // ===== BUILD SVG =====
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%"
    style="background:#fff;font-family:'Courier New',monospace">
  <style>
    .title { font-size:14px; font-weight:bold; text-anchor:middle; fill:#000 }
    .subtitle { font-size:11px; font-weight:bold; text-anchor:middle; fill:#000 }
    .dim { font-size:9px; text-anchor:middle; fill:#000 }
    .label { font-size:9px; fill:#000 }
    .note { font-size:8px; fill:#333 }
    .thick { stroke:#000; stroke-width:2; fill:none }
    .medium { stroke:#000; stroke-width:1.2; fill:none }
    .thin { stroke:#000; stroke-width:0.6; fill:none }
    .dashed { stroke:#000; stroke-width:0.6; fill:none; stroke-dasharray:4,3 }
    .rebar { stroke:#d00; stroke-width:1.5; fill:none }
    .rebar-dot { fill:#d00 }
    .hatch { stroke:#666; stroke-width:0.4; fill:none }
    .concrete { fill:#e8e8e8; stroke:#000; stroke-width:1.2 }
    .pcc { fill:#ddd; stroke:#000; stroke-width:1 }
    .ground-hatch { stroke:#000; stroke-width:0.6 }
  </style>`;

  // ===== TITLE =====
  svg += `
  <text x="${svgW/2}" y="30" class="title">ISOLATED FOOTING DETAIL</text>
  <text x="${svgW/2}" y="48" class="subtitle">Column Size: ${colSize} mm | Footing: ${footingW}x${footingD}x${footingThk} mm</text>
  <line x1="60" y1="55" x2="${svgW-60}" y2="55" class="thin"/>`;

  // ===== (a) ELEVATION / SECTION VIEW =====
  svg += `<text x="${svgW/2}" y="${elevTop - 5}" class="subtitle">(a) Elevation</text>`;

  // --- PCC (lean concrete) ---
  svg += `<rect x="${elevCx - eW/2 - 10}" y="${pccTopY}" width="${eW + 20}" height="${ePcc}" class="pcc"/>`;
  // PCC hatching
  for (let i = 0; i < eW + 20; i += 8) {
    const hx = elevCx - eW/2 - 10 + i;
    svg += `<line x1="${hx}" y1="${pccTopY}" x2="${hx + 6}" y2="${pccBotY}" class="hatch"/>`;
  }

  // --- Footing (trapezoidal) ---
  // Footing as rectangle with sloped top edges to pedestal
  const ftgL = elevCx - eW/2;
  const ftgR = elevCx + eW/2;
  const pedL = elevCx - ePedW/2;
  const pedR = elevCx + ePedW/2;
  svg += `<path d="M${ftgL},${ftgBotY} L${ftgL},${ftgTopY} L${ftgR},${ftgTopY} L${ftgR},${ftgBotY} Z" class="concrete"/>`;

  // Concrete hatching in footing
  for (let i = 0; i < eW; i += 12) {
    const hx = ftgL + i;
    svg += `<line x1="${hx}" y1="${ftgTopY + 2}" x2="${hx + 8}" y2="${ftgBotY - 2}" class="hatch"/>`;
  }

  // Bottom rebar in footing (red line)
  svg += `<line x1="${ftgL + 8}" y1="${ftgBotY - 8}" x2="${ftgR - 8}" y2="${ftgBotY - 8}" class="rebar"/>`;
  // Top rebar in footing
  svg += `<line x1="${ftgL + 8}" y1="${ftgTopY + 8}" x2="${ftgR - 8}" y2="${ftgTopY + 8}" class="rebar"/>`;

  // --- Pedestal ---
  svg += `<rect x="${pedL}" y="${pedTopY}" width="${ePedW}" height="${ePed}" class="concrete"/>`;
  // Stirrups in pedestal (horizontal dashes)
  for (let y = pedTopY + 10; y < pedBotY; y += 15) {
    svg += `<rect x="${pedL + 4}" y="${y}" width="${ePedW - 8}" height="0.5" class="rebar"/>`;
  }

  // --- Column ---
  svg += `<rect x="${elevCx - eColW/2}" y="${colTopY}" width="${eColW}" height="${colBotY - colTopY}" 
    fill="#fff" stroke="#000" stroke-width="1.5"/>`;
  // Column bars (vertical red lines)
  const cBarSpacing = eColW / 5;
  for (let i = 1; i <= 4; i++) {
    const bx = elevCx - eColW/2 + i * cBarSpacing;
    svg += `<line x1="${bx}" y1="${colTopY}" x2="${bx}" y2="${colBotY + ePed}" class="rebar"/>`;
  }

  // Starter bars extending up from footing through pedestal into column
  svg += `<line x1="${elevCx - eColW/2 + cBarSpacing}" y1="${ftgTopY + 5}" 
    x2="${elevCx - eColW/2 + cBarSpacing}" y2="${colTopY}" class="rebar" stroke-dasharray="3,2"/>`;
  svg += `<line x1="${elevCx + eColW/2 - cBarSpacing}" y1="${ftgTopY + 5}" 
    x2="${elevCx + eColW/2 - cBarSpacing}" y2="${colTopY}" class="rebar" stroke-dasharray="3,2"/>`;

  // Stirrups in column
  for (let y = colTopY + 12; y < colBotY; y += 18) {
    svg += `<rect x="${elevCx - eColW/2 + 3}" y="${y}" width="${eColW - 6}" height="0.5" stroke="#d00" stroke-width="0.8" fill="none"/>`;
  }

  // --- Kicker ---
  svg += `<rect x="${elevCx - ePedW/2 - 2}" y="${pedTopY - eKicker}" width="${ePedW + 4}" height="${eKicker}" 
    fill="none" stroke="#000" stroke-width="0.8"/>`;

  // --- Ground Level Line with hatching ---
  svg += `<line x1="${margin}" y1="${glY}" x2="${svgW - margin}" y2="${glY}" stroke="#000" stroke-width="1.5"/>`;
  // GL hatching (diagonal lines above)
  for (let x = margin; x < svgW - margin; x += 10) {
    svg += `<line x1="${x}" y1="${glY}" x2="${x + 6}" y2="${glY - 8}" class="ground-hatch"/>`;
  }
  svg += `<text x="${margin + 5}" y="${glY - 10}" class="label" font-weight="bold">GL</text>`;

  // --- Lap length indicator ---
  svg += `<line x1="${elevCx + eColW/2 + 15}" y1="${colTopY}" x2="${elevCx + eColW/2 + 15}" y2="${colTopY + eLap}" 
    class="thin" marker-start="url(#arrowUp)" marker-end="url(#arrowDown)"/>`;
  svg += `<text x="${elevCx + eColW/2 + 20}" y="${colTopY + eLap/2}" class="label">${lapLength} mm lap</text>`;

  // ===== DIMENSION CHAINS - LEFT SIDE =====
  const dimXL = ftgL - 35;
  // PCC thickness
  svg += drawDimV(dimXL, pccTopY, pccBotY, `${pccThk}`);
  // Footing thickness
  svg += drawDimV(dimXL, ftgTopY, ftgBotY, `${footingThk}`);
  // Pedestal height
  svg += drawDimV(dimXL, pedTopY, pedBotY, `${pedestalH}`);
  // Column height shown
  svg += drawDimV(dimXL - 30, colTopY, glY, `${colH}`);

  // ===== DIMENSION CHAINS - BOTTOM =====
  const dimYB = pccBotY + 20;
  // Overall footing width
  svg += drawDimH(ftgL, ftgR, dimYB, `${footingW}`);
  // PCC overhang
  svg += drawDimH(ftgL - 10, ftgL, dimYB + 18, `${pccThk}`);
  svg += drawDimH(ftgR, ftgR + 10, dimYB + 18, `${pccThk}`);
  // Column width at top
  svg += drawDimH(elevCx - eColW/2, elevCx + eColW/2, colTopY - 12, `${colW}`);

  // ===== CALLOUT LABELS - RIGHT SIDE =====
  const callX = ftgR + 20;
  // Column bars callout
  svg += drawCallout(elevCx + eColW/2, colTopY + 30, callX, colTopY + 15, `${colBars} Column bars`);
  // Starter bars
  svg += drawCallout(elevCx + eColW/2 - cBarSpacing, ftgTopY + 20, callX, ftgTopY + 30, `${starterBars} Starter bars`);
  // Kicker
  svg += drawCallout(elevCx + ePedW/2, pedTopY - eKicker/2, callX, pedTopY - eKicker/2, `Kicker ${kicker} mm`);
  // Footing bars
  svg += drawCallout(ftgR - 10, ftgBotY - 8, callX, ftgBotY - 5, `${footingBarsLong} bottom`);
  // PCC label
  svg += drawCallout(ftgR + 5, pccTopY + ePcc/2, callX, pccTopY + ePcc/2 + 15, `M10 lean concrete`);

  // ===== ARROW MARKERS =====
  svg += `
  <defs>
    <marker id="arrowUp" markerWidth="6" markerHeight="6" refX="3" refY="6" orient="auto">
      <path d="M0,6 L3,0 L6,6" fill="#000"/>
    </marker>
    <marker id="arrowDown" markerWidth="6" markerHeight="6" refX="3" refY="0" orient="auto">
      <path d="M0,0 L3,6 L6,0" fill="#000"/>
    </marker>
    <marker id="arrowLeft" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M6,0 L0,3 L6,6" fill="#000"/>
    </marker>
    <marker id="arrowRight" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6" fill="#000"/>
    </marker>
  </defs>`;

  // ===== (b) PLAN VIEW =====
  svg += `<text x="${svgW/2}" y="${planTop}" class="subtitle">(b) Plan</text>`;

  const pL = planCx - pW/2;
  const pR = planCx + pW/2;
  const pT = planCy - pD/2;
  const pB = planCy + pD/2;

  // PCC outline (dashed, slightly larger)
  svg += `<rect x="${pL - 8}" y="${pT - 8}" width="${pW + 16}" height="${pD + 16}" class="dashed"/>`;

  // Footing outline
  svg += `<rect x="${pL}" y="${pT}" width="${pW}" height="${pD}" class="thick"/>`;

  // Diagonal lines from corners to column (showing slope)
  const pcL = planCx - pColW/2;
  const pcR = planCx + pColW/2;
  const pcT = planCy - pColD/2;
  const pcB = planCy + pColD/2;
  svg += `<line x1="${pL}" y1="${pT}" x2="${pcL}" y2="${pcT}" class="thin"/>`;
  svg += `<line x1="${pR}" y1="${pT}" x2="${pcR}" y2="${pcT}" class="thin"/>`;
  svg += `<line x1="${pL}" y1="${pB}" x2="${pcL}" y2="${pcB}" class="thin"/>`;
  svg += `<line x1="${pR}" y1="${pB}" x2="${pcR}" y2="${pcB}" class="thin"/>`;

  // Column (filled dark)
  svg += `<rect x="${pcL}" y="${pcT}" width="${pColW}" height="${pColD}" fill="#333" stroke="#000" stroke-width="1.5"/>`;

  // Rebar in plan - bottom layer (parallel to longer side)
  const rebarCount1 = Math.ceil(footingD / 150);
  const rebarSpacing1 = pD / (rebarCount1 + 1);
  for (let i = 1; i <= rebarCount1; i++) {
    const ry = pT + i * rebarSpacing1;
    svg += `<line x1="${pL + 5}" y1="${ry}" x2="${pR - 5}" y2="${ry}" class="rebar"/>`;
  }

  // Rebar - top layer (parallel to shorter side) - shown dashed
  const rebarCount2 = Math.ceil(footingW / 150);
  const rebarSpacing2 = pW / (rebarCount2 + 1);
  for (let i = 1; i <= rebarCount2; i++) {
    const rx = pL + i * rebarSpacing2;
    svg += `<line x1="${rx}" y1="${pT + 5}" x2="${rx}" y2="${pB - 5}" stroke="#d00" stroke-width="1" stroke-dasharray="4,3" fill="none"/>`;
  }

  // Plan dimensions
  svg += drawDimH(pL, pR, pB + 25, `${footingW}`);
  svg += drawDimV(pL - 25, pT, pB, `${footingD}`);
  // PCC dimensions
  svg += drawDimH(pL - 8, pR + 8, pB + 43, `${footingW + pccThk * 2}`);

  // Plan callouts - right side
  svg += drawCallout(pR - 5, planCy - pD/4, pR + 30, planCy - pD/4 - 15, 
    `${footingBarsLong} parallel to`);
  svg += `<text x="${pR + 30}" y="${planCy - pD/4}" class="label">longer side (first layer)</text>`;

  svg += drawCallout(planCx + pW/4, pT + 5, pR + 30, planCy + pD/4 - 5, 
    `${footingBarsShort} parallel to`);
  svg += `<text x="${pR + 30}" y="${planCy + pD/4 + 10}" class="label">shorter side (second layer)</text>`;

  // Plan dimension labels for PCC overhang
  svg += `<text x="${pL - 12}" y="${pB + 43}" class="dim" text-anchor="end">${pccThk}</text>`;
  svg += `<text x="${pR + 12}" y="${pB + 43}" class="dim" text-anchor="start">${pccThk}</text>`;

  // ===== GENERAL NOTES =====
  svg += `
  <line x1="60" y1="${notesTop}" x2="${svgW - 60}" y2="${notesTop}" class="thin"/>
  <text x="65" y="${notesTop + 15}" class="label" font-weight="bold">General Notes:</text>
  <text x="65" y="${notesTop + 30}" class="note">1. All dimensions in mm unless noted otherwise.</text>
  <text x="65" y="${notesTop + 43}" class="note">2. Concrete grade: M25 for footing, M10 for PCC (lean concrete).</text>
  <text x="65" y="${notesTop + 56}" class="note">3. Steel: Fe500D TMT bars as per IS 1786. Clear cover: 50mm (footing), 40mm (column).</text>
  <text x="65" y="${notesTop + 69}" class="note">4. Footing rebar: Longer bars placed first (bottom), shorter bars on top. Lap = 50d.</text>
  <text x="65" y="${notesTop + 82}" class="note">5. SBC assumed ≥ 150 kN/m². Verify with soil test report before construction.</text>
  <text x="65" y="${notesTop + 95}" class="note">6. Starter bars: Min 900mm lap with column bars. Kicker: 75mm above pedestal top.</text>
  <text x="65" y="${notesTop + 108}" class="note">7. PCC bed to extend 150mm beyond footing on all sides.</text>
  <text x="65" y="${notesTop + 121}" class="note">8. For plot area &gt;150 m² or weak soil (SBC &lt; 100 kN/m²), consider raft foundation per IS 2950.</text>`;

  // Title block
  svg += `
  <rect x="60" y="${notesTop + 130}" width="${svgW - 120}" height="20" fill="#f5f5f5" stroke="#000" stroke-width="0.8"/>
  <text x="${svgW/2}" y="${notesTop + 143}" class="dim" font-weight="bold">IS 456:2000 | IS 2502 | IS 1786 | NBC 2016</text>`;

  svg += `</svg>`;
  return svg;
}

// ===== HELPER FUNCTIONS =====

function drawDimV(x: number, y1: number, y2: number, label: string): string {
  const mid = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#000" stroke-width="0.5"/>
    <line x1="${x - 3}" y1="${y1}" x2="${x + 3}" y2="${y1}" stroke="#000" stroke-width="0.5"/>
    <line x1="${x - 3}" y1="${y2}" x2="${x + 3}" y2="${y2}" stroke="#000" stroke-width="0.5"/>
    <text x="${x - 3}" y="${mid + 3}" class="dim" text-anchor="end" transform="rotate(-90,${x - 3},${mid + 3})">${label}</text>`;
}

function drawDimH(x1: number, x2: number, y: number, label: string): string {
  const mid = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#000" stroke-width="0.5"/>
    <line x1="${x1}" y1="${y - 3}" x2="${x1}" y2="${y + 3}" stroke="#000" stroke-width="0.5"/>
    <line x1="${x2}" y1="${y - 3}" x2="${x2}" y2="${y + 3}" stroke="#000" stroke-width="0.5"/>
    <text x="${mid}" y="${y - 4}" class="dim">${label}</text>`;
}

function drawCallout(fromX: number, fromY: number, toX: number, toY: number, label: string): string {
  return `
    <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="#000" stroke-width="0.4"/>
    <circle cx="${fromX}" cy="${fromY}" r="1.5" fill="#000"/>
    <text x="${toX + 3}" y="${toY + 3}" class="label">${label}</text>`;
}
