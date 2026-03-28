import { C, MARGIN, SC, dimChain, crossHatch, drawingBorder, legend, drawTable } from '../drawingHelpers';
import { Layout, ProjectRequirements } from '../../types';

export function renderWaterproofing(layout: Layout, requirements: ProjectRequirements): string {
  const svgW = 950;
  const svgH = 900;
  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'WATERPROOFING DETAILS',
    'Roof Terrace + Bathroom + Basement Waterproofing • IS 3067 • NBC 2016 Part 7'));

  // ═══ SECTION 1: ROOF TERRACE WATERPROOFING ═══
  const sec1X = MARGIN + 30;
  const sec1Y = MARGIN + 50;
  const layerScale = 3.0; // px per mm for layer detail

  parts.push(`<text x="${sec1X}" y="${sec1Y - 20}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">ROOF TERRACE WATERPROOFING — SECTION</text>`);
  parts.push(`<text x="${sec1X}" y="${sec1Y - 8}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Slope: 1:100 towards RWP • Brick Bat Coba + APP Membrane • IS 3067</text>`);

  // Draw layered section (bottom to top)
  const layerW = 350; // px width of section
  const layers = [
    { name: 'RCC Roof Slab', thick: 150, color: '#C0C0C0', hatch: true },
    { name: 'Primer Coat (Bitumen)', thick: 3, color: '#333', hatch: false },
    { name: 'APP Membrane (3mm)', thick: 10, color: '#444', hatch: false },
    { name: 'Cement Slurry Bond', thick: 3, color: '#999', hatch: false },
    { name: 'Brick Bat Coba (Avg)', thick: 100, color: '#D4956A', hatch: false },
    { name: 'Cement Mortar Screed (1:4)', thick: 25, color: '#B0A090', hatch: false },
    { name: 'IPS Finish (1:2:4)', thick: 25, color: '#A0A0A0', hatch: false },
  ];

  let currentY = sec1Y + 20;
  const layerStartX = sec1X + 30;
  const calloutX = layerStartX + layerW + 20;

  // Draw a zoomed-in detail circle reference
  layers.forEach((layer, i) => {
    const h = Math.max(layer.thick * layerScale * 0.15, 8); // min 8px visible
    const y = currentY;

    // Layer rectangle
    parts.push(`<rect x="${layerStartX}" y="${y}" width="${layerW}" height="${h}" fill="${layer.color}" stroke="${C.wall}" stroke-width="${i === 0 ? 1.2 : 0.6}" opacity="0.8"/>`);

    if (layer.hatch) {
      // Concrete hatch for slab
      for (let hx = layerStartX; hx < layerStartX + layerW; hx += 10) {
        parts.push(`<line x1="${hx}" y1="${y}" x2="${hx + 5}" y2="${y + h}" stroke="#888" stroke-width="0.3" opacity="0.4"/>`);
      }
    }

    // Brick bat coba pattern
    if (layer.name.includes('Brick Bat')) {
      for (let bx = layerStartX + 5; bx < layerStartX + layerW - 10; bx += 18) {
        const by = y + 2;
        const bw = 12 + Math.random() * 6;
        const bh = h - 4;
        parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#C4855A" stroke="#A06040" stroke-width="0.3" rx="1"/>`);
      }
    }

    // Callout line + label
    const labelY = y + h / 2 + 2;
    parts.push(`<line x1="${layerStartX + layerW}" y1="${labelY}" x2="${calloutX}" y2="${labelY}" stroke="${C.dim}" stroke-width="0.4"/>`);
    parts.push(`<circle cx="${calloutX}" cy="${labelY}" r="1.5" fill="${C.dim}"/>`);
    parts.push(`<text x="${calloutX + 5}" y="${labelY + 2}" font-size="5.5" font-family="'Courier New',monospace" fill="${C.text}">${layer.name} — ${layer.thick}mm</text>`);

    // Dimension on left
    if (h > 12) {
      parts.push(dimChain(layerStartX - 15, y, layerStartX - 15, y + h, `${layer.thick}`, 8, false));
    }

    currentY += h;
  });

  // Total depth dimension
  parts.push(dimChain(layerStartX - 40, sec1Y + 20, layerStartX - 40, currentY, 'TOTAL', 10, false));

  // Slope indicator
  const slopeEndY = sec1Y + 20 + 5; // slight slope
  parts.push(`<line x1="${layerStartX}" y1="${currentY}" x2="${layerStartX + layerW}" y2="${currentY - 5}" stroke="#E74C3C" stroke-width="1" stroke-dasharray="4,2"/>`);
  parts.push(`<text x="${layerStartX + layerW / 2}" y="${currentY + 12}" text-anchor="middle" font-size="5" font-family="'Courier New',monospace" fill="#E74C3C">↗ SLOPE 1:100 TOWARDS RWP</text>`);

  // Parapet junction detail
  const parX = layerStartX + layerW - 5;
  const parY = sec1Y + 20;
  const parH = currentY - sec1Y - 20 + 40;
  parts.push(`<rect x="${parX}" y="${parY - 40}" width="${25}" height="${parH + 40}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(`<text x="${parX + 12}" y="${parY - 45}" text-anchor="middle" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">PARAPET</text>`);
  // Membrane turn-up
  parts.push(`<line x1="${parX}" y1="${currentY - 30}" x2="${parX}" y2="${parY}" stroke="#444" stroke-width="2"/>`);
  parts.push(`<text x="${parX - 35}" y="${parY + 10}" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">MEMBRANE</text>`);
  parts.push(`<text x="${parX - 35}" y="${parY + 17}" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">TURN-UP 150mm</text>`);

  // ═══ SECTION 2: BATHROOM WATERPROOFING ═══
  const sec2X = MARGIN + 30;
  const sec2Y = currentY + 80;

  parts.push(`<text x="${sec2X}" y="${sec2Y - 20}" font-size="10" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">BATHROOM/WET AREA WATERPROOFING — SECTION</text>`);
  parts.push(`<text x="${sec2X}" y="${sec2Y - 8}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">Floor sunken 200mm • Integral waterproof + membrane • NBC Part 7</text>`);

  const bathW = 300; // px
  const bathStartX = sec2X + 50;
  const bathBaseY = sec2Y + 20;

  // Surrounding slab (reference level)
  parts.push(`<rect x="${bathStartX - 60}" y="${bathBaseY}" width="60" height="20" fill="#C0C0C0" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(`<rect x="${bathStartX + bathW}" y="${bathBaseY}" width="60" height="20" fill="#C0C0C0" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(`<text x="${bathStartX - 30}" y="${bathBaseY - 3}" text-anchor="middle" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">FFL</text>`);

  // Sunken portion
  const sunkDepth = 50; // px representing 200mm
  parts.push(`<rect x="${bathStartX}" y="${bathBaseY}" width="${bathW}" height="${sunkDepth}" fill="#F5F0EB" stroke="${C.wall}" stroke-width="1"/>`);

  // Bathroom layers (bottom to top within sunken area)
  const bathLayers = [
    { name: 'RCC Slab (sunken 200mm)', thick: 15, color: '#C0C0C0' },
    { name: 'PCC Fill 1:4:8', thick: 8, color: '#E0D8C8' },
    { name: 'APP Membrane 2mm', thick: 3, color: '#444' },
    { name: 'Cement Screed 1:4', thick: 6, color: '#B0A090' },
    { name: 'Adhesive Bed', thick: 3, color: '#CCC' },
    { name: 'Anti-Skid Tile', thick: 6, color: '#8B9DC3' },
  ];

  let bathLayerY = bathBaseY + sunkDepth;
  const bathCalloutX = bathStartX + bathW + 15;

  // Draw from bottom up
  for (let i = bathLayers.length - 1; i >= 0; i--) {
    const layer = bathLayers[i];
    const h = layer.thick;
    bathLayerY -= h;

    parts.push(`<rect x="${bathStartX + 2}" y="${bathLayerY}" width="${bathW - 4}" height="${h}" fill="${layer.color}" stroke="${C.wall}" stroke-width="0.4" opacity="0.85"/>`);

    // Callout
    parts.push(`<line x1="${bathStartX + bathW}" y1="${bathLayerY + h / 2}" x2="${bathCalloutX}" y2="${bathLayerY + h / 2}" stroke="${C.dim}" stroke-width="0.3"/>`);
    parts.push(`<text x="${bathCalloutX + 5}" y="${bathLayerY + h / 2 + 2}" font-size="5" font-family="'Courier New',monospace" fill="${C.text}">${layer.name}</text>`);
  }

  // Wall tile turn-up
  const wallTileH = 80; // px representing wall tile height
  parts.push(`<rect x="${bathStartX}" y="${bathBaseY - wallTileH}" width="8" height="${wallTileH}" fill="#8B9DC3" stroke="${C.wall}" stroke-width="0.6"/>`);
  parts.push(`<rect x="${bathStartX + bathW - 8}" y="${bathBaseY - wallTileH}" width="8" height="${wallTileH}" fill="#8B9DC3" stroke="${C.wall}" stroke-width="0.6"/>`);
  // Wall behind tiles
  parts.push(`<rect x="${bathStartX - 5}" y="${bathBaseY - wallTileH - 10}" width="5" height="${wallTileH + sunkDepth + 30}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<rect x="${bathStartX + bathW}" y="${bathBaseY - wallTileH - 10}" width="5" height="${wallTileH + sunkDepth + 30}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.8"/>`);

  parts.push(`<line x1="${bathStartX + 4}" y1="${bathBaseY - wallTileH}" x2="${bathStartX - 30}" y2="${bathBaseY - wallTileH - 15}" stroke="${C.dim}" stroke-width="0.4"/>`);
  parts.push(`<text x="${bathStartX - 32}" y="${bathBaseY - wallTileH - 18}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">WALL TILE UP TO</text>`);
  parts.push(`<text x="${bathStartX - 32}" y="${bathBaseY - wallTileH - 11}" text-anchor="end" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">CEILING (2100mm)</text>`);

  // Floor drain
  const drainX = bathStartX + bathW / 2;
  const drainY = bathBaseY + sunkDepth - 6;
  parts.push(`<rect x="${drainX - 8}" y="${drainY}" width="16" height="6" fill="#666" stroke="${C.wall}" stroke-width="0.8" rx="1"/>`);
  parts.push(`<line x1="${drainX}" y1="${drainY + 6}" x2="${drainX}" y2="${drainY + 20}" stroke="#666" stroke-width="1.5"/>`);
  parts.push(`<text x="${drainX}" y="${drainY + 30}" text-anchor="middle" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">FLOOR DRAIN</text>`);

  // Slope arrows
  parts.push(`<line x1="${bathStartX + 20}" y1="${drainY - 8}" x2="${drainX - 12}" y2="${drainY - 4}" stroke="#E74C3C" stroke-width="0.8" marker-end="url(#arrowR)"/>`);
  parts.push(`<line x1="${bathStartX + bathW - 20}" y1="${drainY - 8}" x2="${drainX + 12}" y2="${drainY - 4}" stroke="#E74C3C" stroke-width="0.8" marker-end="url(#arrowR)"/>`);
  parts.push(`<text x="${drainX}" y="${drainY - 12}" text-anchor="middle" font-size="4" font-family="'Courier New',monospace" fill="#E74C3C">SLOPE 1:60</text>`);
  parts.push(`<defs><marker id="arrowR" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto"><polygon points="0 0, 5 2, 0 4" fill="#E74C3C"/></marker></defs>`);

  // ═══ SCHEDULE TABLE ═══
  const tblX = svgW - 300;
  const tblY = sec2Y - 10;
  parts.push(drawTable(tblX, tblY,
    ['Location', 'System', 'Standard'],
    [
      ['Roof Terrace', 'APP Membrane + BBC', 'IS 3067'],
      ['Bathroom Floor', 'Sunken + Membrane', 'IS 3067'],
      ['Bathroom Wall', 'Cementitious Coat', 'IS 3067'],
      ['Water Tanks', 'Integral WP + Coat', 'IS 3370'],
      ['Basement Walls', 'Ext. Membrane', 'IS 3067'],
      ['Balconies', 'Screed + WP Coat', 'IS 3067'],
      ['Plinth Protection', 'DPC + APM', 'NBC 7.2'],
      ['Chajja/Sunshade', 'Drip mould + WP', 'IS 3067'],
    ],
    [80, 100, 60]
  ));

  // Notes
  const notesX = tblX;
  const notesY = tblY + 140;
  parts.push(`<text x="${notesX}" y="${notesY}" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">NOTES:</text>`);
  const notes = [
    '1. All surfaces to be clean, dry & free of loose material before WP application.',
    '2. Membrane overlap: min 100mm with hot-air welded seams.',
    '3. Internal corners: extra 300mm strip reinforcement.',
    '4. Curing: 7 days minimum for cementitious WP coats.',
    '5. Water ponding test: 72 hours on roof, 24 hours for bathrooms.',
    '6. Warranty: 10 years for roof membrane, 5 years for wet areas.',
  ];
  notes.forEach((n, i) => {
    parts.push(`<text x="${notesX}" y="${notesY + 12 + i * 9}" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">${n}</text>`);
  });

  parts.push(legend(svgW, svgH, '▨ RCC │ ■ APP Membrane │ ▤ Tiles │ □ Screed │ ▧ Brick Bat Coba │ IS 3067 / NBC 2016 │ All dims in mm'));

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}
