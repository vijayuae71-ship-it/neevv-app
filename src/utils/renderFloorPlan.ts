import { Layout, ProjectRequirements } from '../types';

// ============================================================================
// ARCHITECTURAL SVG FLOOR PLAN RENDERER
// IS 962:1989 / SP 46:2003 compliant drawing standards
// - External walls: 0.7mm weight (230mm double-line)
// - Internal partitions: 0.4mm weight (150mm)
// - Dimension chains with tick marks
// - 45° hatching for wet areas
// - Wall deduplication: shared walls drawn once
// ============================================================================

interface WallSeg {
  x1: number; y1: number; x2: number; y2: number;
}

export function renderFloorPlanSVG(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const setbacks = layout.setbacks;
  const buildW = layout.buildableWidthM;
  const buildD = layout.buildableDepthM;

  // SVG coordinate system: 1m = 50px for crisp detail
  const scale = 50;
  const padL = 90; // left padding for Y dimension chain
  const padT = 70; // top padding for X dimension chain
  const padR = 50;
  const padB = 50;
  const svgW = Math.round(plotW * scale + padL + padR);
  const svgH = Math.round(plotD * scale + padT + padB);

  // Origin offsets (plot top-left in SVG coords)
  const ox = padL;
  const oy = padT;

  // Buildable area rectangle in SVG coords
  const bx = ox + setbacks.left * scale;
  const by = oy + setbacks.front * scale;
  const bw = buildW * scale;
  const bh = buildD * scale;

  // Room colors
  const roomColors: Record<string, string> = {
    master_bedroom: '#C8E6C9',
    bedroom: '#BBDEFB',
    hall: '#FFE0B2',
    kitchen: '#F8BBD0',
    dining: '#E1BEE7',
    toilet: '#B2EBF2',
    puja: '#FFF9C4',
    staircase: '#CFD8DC',
    parking: '#EEEEEE',
    balcony: '#DCEDC8',
    store: '#D7CCC8',
    utility: '#D7CCC8',
    passage: '#F5F5F5',
    entrance: '#FFE0B2',
  };

  const groundFloor = layout.floors[0];
  const rooms = groundFloor?.rooms || [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="background:#fff;font-family:Arial,Helvetica,sans-serif">`;

  // --- DEFS: hatching pattern for wet areas ---
  svg += `<defs>`;
  svg += `<pattern id="wet-${layout.id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">`;
  svg += `<line x1="0" y1="0" x2="0" y2="6" stroke="#80DEEA" stroke-width="0.8" opacity="0.6"/>`;
  svg += `</pattern>`;
  svg += `</defs>`;

  // --- TITLE ---
  svg += `<text x="${svgW / 2}" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#1a1a1a">${layout.name}</text>`;
  svg += `<text x="${svgW / 2}" y="26" text-anchor="middle" font-size="7" fill="#666">${requirements.plotWidthFt}ft × ${requirements.plotDepthFt}ft | ${requirements.facing}-Facing | Ground Floor</text>`;

  // --- PLOT BOUNDARY (dashed) ---
  svg += `<rect x="${ox}" y="${oy}" width="${plotW * scale}" height="${plotD * scale}" fill="#FAFAFA" stroke="#BDBDBD" stroke-width="0.5" stroke-dasharray="6,3"/>`;

  // --- SETBACK LABELS ---
  if (setbacks.front > 0) {
    svg += `<text x="${ox + plotW * scale / 2}" y="${oy + setbacks.front * scale / 2 + 3}" text-anchor="middle" font-size="5" fill="#999" font-style="italic">Front setback ${(setbacks.front * 1000).toFixed(0)}mm</text>`;
  }

  // --- ROOM FILLS (no stroke — walls drawn separately) ---
  for (const room of rooms) {
    const rx = ox + room.x * scale;
    const ry = oy + room.y * scale;
    const rw = room.width * scale;
    const rd = room.depth * scale;
    const color = roomColors[room.type] || '#F5F5F5';
    const isWet = room.type === 'toilet';

    // Base fill
    svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="${color}"/>`;
    // Wet area hatching overlay
    if (isWet) {
      svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="url(#wet-${layout.id})"/>`;
    }
  }

  // --- WALL SEGMENTS: collect, deduplicate, classify, draw ---
  const segments: WallSeg[] = [];
  for (const room of rooms) {
    const x = room.x, y = room.y, w = room.width, d = room.depth;
    segments.push(
      { x1: x, y1: y, x2: x + w, y2: y },           // top
      { x1: x, y1: y + d, x2: x + w, y2: y + d },     // bottom
      { x1: x, y1: y, x2: x, y2: y + d },             // left
      { x1: x + w, y1: y, x2: x + w, y2: y + d },     // right
    );
  }

  // Snap and normalize for deduplication
  const snap = (n: number) => Math.round(n * 100) / 100;
  const segKey = (s: WallSeg): string => {
    let a = snap(s.x1), b = snap(s.y1), c = snap(s.x2), d = snap(s.y2);
    if (a > c || (a === c && b > d)) { [a, b, c, d] = [c, d, a, b]; }
    return `${a},${b},${c},${d}`;
  };

  // Count occurrences per segment
  const segCount = new Map<string, WallSeg>();
  const segOccurrences = new Map<string, number>();
  for (const seg of segments) {
    const key = segKey(seg);
    segCount.set(key, seg);
    segOccurrences.set(key, (segOccurrences.get(key) || 0) + 1);
  }

  // Classify: on buildable boundary = external wall, else = internal partition
  const bLeft = snap(setbacks.left);
  const bRight = snap(setbacks.left + buildW);
  const bTop = snap(setbacks.front);
  const bBottom = snap(setbacks.front + buildD);
  const tol = 0.08;

  const isOnBoundary = (s: WallSeg): boolean => {
    const isHoriz = Math.abs(s.y1 - s.y2) < 0.01;
    const isVert = Math.abs(s.x1 - s.x2) < 0.01;
    if (isHoriz) {
      return Math.abs(s.y1 - bTop) < tol || Math.abs(s.y1 - bBottom) < tol;
    }
    if (isVert) {
      return Math.abs(s.x1 - bLeft) < tol || Math.abs(s.x1 - bRight) < tol;
    }
    return false;
  };

  // Draw each unique wall segment once
  for (const [key, seg] of segCount) {
    const ext = isOnBoundary(seg);
    const sw = ext ? 2.5 : 1.0; // 0.7mm vs 0.4mm scaled
    const color = ext ? '#212121' : '#555';
    svg += `<line x1="${ox + seg.x1 * scale}" y1="${oy + seg.y1 * scale}" x2="${ox + seg.x2 * scale}" y2="${oy + seg.y2 * scale}" stroke="${color}" stroke-width="${sw}" stroke-linecap="square"/>`;
  }

  // --- STRUCTURAL COLUMNS ---
  for (const col of groundFloor?.columns || []) {
    const cx = ox + col.x * scale - 4;
    const cy = oy + col.y * scale - 4;
    svg += `<rect x="${cx}" y="${cy}" width="8" height="8" fill="#424242" stroke="#212121" stroke-width="0.5"/>`;
  }

  // --- ROOM LABELS at geometric centroid ---
  for (const room of rooms) {
    const rx = ox + room.x * scale;
    const ry = oy + room.y * scale;
    const rw = room.width * scale;
    const rd = room.depth * scale;
    const cx = rx + rw / 2;
    const cy = ry + rd / 2;
    const widthMM = Math.round(room.width * 1000);
    const depthMM = Math.round(room.depth * 1000);
    const areaSqM = (room.width * room.depth).toFixed(1);
    const displayName = room.name.length > 14 ? room.name.substring(0, 13) + '\u2026' : room.name;

    if (rw > 40 && rd > 30) {
      svg += `<text x="${cx}" y="${cy - 7}" text-anchor="middle" font-size="7" font-weight="600" fill="#1a1a1a">${displayName}</text>`;
      svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="5.5" fill="#555">${widthMM} × ${depthMM}</text>`;
      svg += `<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="5" fill="#777">${areaSqM} m²</text>`;
    } else if (rw > 25 && rd > 18) {
      svg += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="6" font-weight="600" fill="#1a1a1a">${displayName}</text>`;
      svg += `<text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="5" fill="#555">${areaSqM} m²</text>`;
    } else if (rw > 15 && rd > 12) {
      svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="5" font-weight="600" fill="#333">${displayName}</text>`;
    }
  }

  // --- DIMENSION CHAINS with tick marks ---
  // Top dimension chain: individual room spans along front row
  const frontY = rooms.length > 0 ? Math.min(...rooms.map(r => r.y)) : setbacks.front;
  const frontRooms = rooms.filter(r => Math.abs(r.y - frontY) < 0.15).sort((a, b) => a.x - b.x);

  // Collect unique X coordinates from front row for span dimensions
  const xCoords = new Set<number>();
  for (const r of frontRooms) {
    xCoords.add(snap(r.x));
    xCoords.add(snap(r.x + r.width));
  }
  const sortedX = Array.from(xCoords).sort((a, b) => a - b);

  const dimChainY = oy - 28;
  let spanSum = 0;
  const spanLabels: string[] = [];

  for (let i = 0; i < sortedX.length - 1; i++) {
    const x1 = ox + sortedX[i] * scale;
    const x2 = ox + sortedX[i + 1] * scale;
    const spanM = sortedX[i + 1] - sortedX[i];
    const spanMM = Math.round(spanM * 1000);
    spanSum += spanMM;
    spanLabels.push(String(spanMM));

    // Tick marks
    svg += `<line x1="${x1}" y1="${dimChainY - 4}" x2="${x1}" y2="${dimChainY + 4}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<line x1="${x2}" y1="${dimChainY - 4}" x2="${x2}" y2="${dimChainY + 4}" stroke="#333" stroke-width="0.6"/>`;
    // Dimension line
    svg += `<line x1="${x1}" y1="${dimChainY}" x2="${x2}" y2="${dimChainY}" stroke="#333" stroke-width="0.4"/>`;
    // Label
    if (x2 - x1 > 20) {
      svg += `<text x="${(x1 + x2) / 2}" y="${dimChainY - 5}" text-anchor="middle" font-size="5.5" fill="#333">${spanMM}</text>`;
    }
  }

  // Overall width dimension
  if (sortedX.length >= 2) {
    const totalDimY = oy - 45;
    const x1 = ox + sortedX[0] * scale;
    const x2 = ox + sortedX[sortedX.length - 1] * scale;
    svg += `<line x1="${x1}" y1="${totalDimY}" x2="${x2}" y2="${totalDimY}" stroke="#333" stroke-width="0.5"/>`;
    svg += `<line x1="${x1}" y1="${totalDimY - 4}" x2="${x1}" y2="${totalDimY + 4}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<line x1="${x2}" y1="${totalDimY - 4}" x2="${x2}" y2="${totalDimY + 4}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<text x="${(x1 + x2) / 2}" y="${totalDimY - 5}" text-anchor="middle" font-size="6" font-weight="600" fill="#333">${Math.round(plotW * 1000)}mm (${requirements.plotWidthFt}ft)</text>`;
  }

  // Left dimension chain: individual room depths along left column
  const leftX = rooms.length > 0 ? Math.min(...rooms.map(r => r.x)) : setbacks.left;
  const leftRooms = rooms.filter(r => Math.abs(r.x - leftX) < 0.15).sort((a, b) => a.y - b.y);

  const yCoords = new Set<number>();
  for (const r of leftRooms) {
    yCoords.add(snap(r.y));
    yCoords.add(snap(r.y + r.depth));
  }
  const sortedY = Array.from(yCoords).sort((a, b) => a - b);

  const dimChainX = ox - 30;
  let depthSum = 0;
  const depthLabels: string[] = [];

  for (let i = 0; i < sortedY.length - 1; i++) {
    const y1 = oy + sortedY[i] * scale;
    const y2 = oy + sortedY[i + 1] * scale;
    const spanM = sortedY[i + 1] - sortedY[i];
    const spanMM = Math.round(spanM * 1000);
    depthSum += spanMM;
    depthLabels.push(String(spanMM));

    // Tick marks
    svg += `<line x1="${dimChainX - 4}" y1="${y1}" x2="${dimChainX + 4}" y2="${y1}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<line x1="${dimChainX - 4}" y1="${y2}" x2="${dimChainX + 4}" y2="${y2}" stroke="#333" stroke-width="0.6"/>`;
    // Dimension line
    svg += `<line x1="${dimChainX}" y1="${y1}" x2="${dimChainX}" y2="${y2}" stroke="#333" stroke-width="0.4"/>`;
    // Label (rotated)
    if (y2 - y1 > 15) {
      svg += `<text x="${dimChainX - 6}" y="${(y1 + y2) / 2}" text-anchor="middle" font-size="5.5" fill="#333" transform="rotate(-90,${dimChainX - 6},${(y1 + y2) / 2})">${spanMM}</text>`;
    }
  }

  // Overall depth dimension
  if (sortedY.length >= 2) {
    const totalDimX = ox - 55;
    const y1 = oy + sortedY[0] * scale;
    const y2 = oy + sortedY[sortedY.length - 1] * scale;
    svg += `<line x1="${totalDimX}" y1="${y1}" x2="${totalDimX}" y2="${y2}" stroke="#333" stroke-width="0.5"/>`;
    svg += `<line x1="${totalDimX - 4}" y1="${y1}" x2="${totalDimX + 4}" y2="${y1}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<line x1="${totalDimX - 4}" y1="${y2}" x2="${totalDimX + 4}" y2="${y2}" stroke="#333" stroke-width="0.6"/>`;
    svg += `<text x="${totalDimX - 6}" y="${(y1 + y2) / 2}" text-anchor="middle" font-size="6" font-weight="600" fill="#333" transform="rotate(-90,${totalDimX - 6},${(y1 + y2) / 2})">${Math.round(plotD * 1000)}mm (${requirements.plotDepthFt}ft)</text>`;
  }

  // --- DIMENSION VERIFICATION TEXT ---
  const verifyY = svgH - 36;
  if (spanLabels.length > 0) {
    svg += `<text x="${ox}" y="${verifyY}" font-size="5" fill="#2E7D32" font-weight="600">VERIFY: ${spanLabels.join(' + ')} = ${spanSum}mm (buildable width ${Math.round(buildW * 1000)}mm)</text>`;
  }
  if (depthLabels.length > 0) {
    svg += `<text x="${ox}" y="${verifyY + 9}" font-size="5" fill="#2E7D32" font-weight="600">VERIFY: ${depthLabels.join(' + ')} = ${depthSum}mm (buildable depth ${Math.round(buildD * 1000)}mm)</text>`;
  }

  // --- NORTH ARROW ---
  const naX = svgW - 35;
  const naY = oy + 25;
  svg += `<polygon points="${naX},${naY - 14} ${naX - 6},${naY + 5} ${naX},${naY + 1} ${naX + 6},${naY + 5}" fill="#4f6f52" stroke="#333" stroke-width="0.5"/>`;
  svg += `<text x="${naX}" y="${naY + 16}" text-anchor="middle" font-size="8" font-weight="bold" fill="#333">N</text>`;
  // Compass circle
  svg += `<circle cx="${naX}" cy="${naY}" r="18" fill="none" stroke="#ccc" stroke-width="0.3"/>`;

  // --- COLOR LEGEND (bottom of SVG) ---
  const legendY = svgH - 14;
  const legendItems = [
    { color: '#FFE0B2', label: 'Living' },
    { color: '#C8E6C9', label: 'Master Bed' },
    { color: '#BBDEFB', label: 'Bedroom' },
    { color: '#F8BBD0', label: 'Kitchen' },
    { color: '#E1BEE7', label: 'Dining' },
    { color: '#B2EBF2', label: 'Toilet' },
    { color: '#FFF9C4', label: 'Puja' },
    { color: '#CFD8DC', label: 'Staircase' },
    { color: '#EEEEEE', label: 'Parking' },
  ];
  let lx = ox;
  for (const item of legendItems) {
    svg += `<rect x="${lx}" y="${legendY - 6}" width="8" height="8" fill="${item.color}" stroke="#aaa" stroke-width="0.3" rx="1"/>`;
    svg += `<text x="${lx + 10}" y="${legendY + 1}" font-size="5" fill="#666">${item.label}</text>`;
    lx += 10 + item.label.length * 3.5 + 6;
  }

  // --- FOOTER ---
  svg += `<text x="${svgW - padR}" y="${svgH - 4}" text-anchor="end" font-size="4.5" fill="#aaa">neevv | Architecture \u2022 Structure \u2022 MEP \u2022 Interiors | IS 962:1989</text>`;

  svg += '</svg>';
  return svg;
}
