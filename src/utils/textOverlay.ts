import { Layout, BOQ } from '../types';

/** Drawing types for which computed project data is rendered on the image.
 *  Extended to ALL 17 drawings — every drawing gets a computed data panel
 *  so no AI-hallucinated numbers reach the customer. */
export const OVERLAY_DRAWING_TYPES = [
  'structural', 'rccDetail', 'barBending', 'foundation',
  'excavation', 'footingDetail', 'reinforcement', 'section',
  'elevation', 'brickwork', 'electrical', 'plumbing',
  'tiling', 'staircase', 'waterTank', 'waterproofing', 'stp',
] as const;

type OverlayDrawingType = (typeof OVERLAY_DRAWING_TYPES)[number];
type OverlaySection = {
  heading: string;
  rows: Array<[string, string]>;
};

/** Return a finite numeric value, including when API data arrives as a numeric string. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Format every computed number consistently to two decimal places. */
function formatNumber(value: unknown): string {
  const number = asNumber(value);
  return number === null ? '—' : number.toFixed(2);
}

function formatValue(value: unknown, unit?: string): string {
  const number = asNumber(value);
  return number === null ? '—' : `${number.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}

function sumIfComplete(...values: unknown[]): number | null {
  const numbers = values.map(asNumber);
  if (numbers.some((n) => n === null)) return null;
  return (numbers as number[]).reduce((a, b) => a + b, 0);
}

function columnCount(layout: Layout): number | null {
  const builtUpArea = asNumber(layout?.builtUpAreaSqM);
  const floors = Array.isArray(layout?.floors) ? layout.floors.length : 0;
  if (builtUpArea === null || floors === 0) return null;
  return Math.max(6, Math.ceil(builtUpArea / 12));
}

/** Common building dimensions section shown on every drawing. */
function buildingDimsSection(layout: Layout): OverlaySection {
  const plotW = formatValue(layout?.plotWidthM, 'm');
  const plotD = formatValue(layout?.plotDepthM, 'm');
  const buildW = formatValue(layout?.buildableWidthM, 'm');
  const buildD = formatValue(layout?.buildableDepthM, 'm');
  const buildWmm = layout?.buildingWidthMm ? `${layout.buildingWidthMm}mm` : buildW;
  const buildDmm = layout?.buildingDepthMm ? `${layout.buildingDepthMm}mm` : buildD;
  const perFloor = layout?.effectivePerFloorSqFt
    ? `${layout.effectivePerFloorSqFt} sqft`
    : formatValue(layout?.builtUpAreaSqFt, 'sqft');
  const nFloors = layout?.numFloors || (Array.isArray(layout?.floors) ? layout.floors.length : 1);
  return {
    heading: 'BUILDING DIMENSIONS',
    rows: [
      ['Plot', `${plotW} × ${plotD}`],
      ['Building', `${buildWmm} × ${buildDmm}`],
      ['Setbacks', 'F:1.5m R:1.5m L:1.0m R:1.0m'],
      ['Per floor', perFloor],
      ['Total built-up', layout?.totalBuiltUpSqFt ? `${layout.totalBuiltUpSqFt} sqft` : ''],
      ['Floors', `${nFloors}`],
    ],
  };
}

function makeOverlaySections(
  drawingType: string,
  layout: Layout,
  boq: BOQ,
  floor?: 'GF' | 'FF',
): { title: string; sections: OverlaySection[] } | null {
  const concrete = (boq?.concreteBreakdown || {}) as Partial<BOQ['concreteBreakdown']>;
  const columns = columnCount(layout);
  const dims = buildingDimsSection(layout);
  const floorPrefix = floor === 'FF' ? 'FIRST FLOOR ' : 'GROUND FLOOR ';

  switch (drawingType as OverlayDrawingType) {
    case 'structural':
      return {
        title: 'COLUMN SCHEDULE',
        sections: [
          dims,
          {
            heading: 'REINFORCEMENT',
            rows: [
              ['Main bars', '4 nos – 12mm Fe500'],
              ['Stirrups', '8mm @ 150mm c/c'],
              ['Clear cover', '40mm'],
              ['Columns / floor', formatValue(columns, 'nos')],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Concrete (columns)', formatValue(concrete.columns, 'm³')],
              ['Grade', 'M25 concrete'],
            ],
          },
        ],
      };

    case 'rccDetail': {
      const totalRcc = sumIfComplete(concrete.slabs, concrete.beams, concrete.lintels);
      return {
        title: 'RCC SLAB & BEAM DETAILS',
        sections: [
          dims,
          {
            heading: 'MEMBER SIZES',
            rows: [
              ['Slab thickness', '125mm'],
              ['Beam size', '230mm × 400mm'],
            ],
          },
          {
            heading: 'CONCRETE QUANTITIES',
            rows: [
              ['Concrete (slabs)', formatValue(concrete.slabs, 'm³')],
              ['Concrete (beams)', formatValue(concrete.beams, 'm³')],
              ['Concrete (lintels)', formatValue(concrete.lintels, 'm³')],
              ['Total RCC concrete', formatValue(totalRcc, 'm³')],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Total steel', formatValue(boq?.steelWeightMT, 'MT')],
              ['Grade', 'M25 / Fe500'],
            ],
          },
        ],
      };
    }

    case 'barBending': {
      const steel = asNumber(boq?.steelWeightMT);
      const steelSummary = steel === null
        ? '—'
        : `${formatNumber(steel)} MT (${formatNumber(steel * 1000)} kg)`;
      return {
        title: 'BAR BENDING SCHEDULE (BBS)',
        sections: [
          dims,
          {
            heading: 'PROJECT TOTALS',
            rows: [
              ['Total steel', steelSummary],
              ['Steel rate', '4.50 kg/sqft'],
              ['Built-up area', formatValue(boq?.totalBuiltUpAreaSqFt, 'sqft')],
            ],
          },
          {
            heading: 'STEEL ALLOCATION',
            rows: [
              ['Foundation steel', formatValue(asNumber(concrete.foundation) === null ? null : asNumber(concrete.foundation)! * 80, 'kg')],
              ['Column steel', formatValue(asNumber(concrete.columns) === null ? null : asNumber(concrete.columns)! * 120, 'kg')],
              ['Beam steel', formatValue(asNumber(concrete.beams) === null ? null : asNumber(concrete.beams)! * 100, 'kg')],
              ['Slab steel', formatValue(asNumber(concrete.slabs) === null ? null : asNumber(concrete.slabs)! * 60, 'kg')],
            ],
          },
        ],
      };
    }

    case 'foundation':
      return {
        title: 'FOUNDATION DETAIL',
        sections: [
          dims,
          {
            heading: 'FOUNDATION DATA',
            rows: [
              ['Foundation type', 'Isolated Footing'],
              ['Footing size', '1200mm × 1200mm × 300mm'],
              ['PCC bed', '1350mm × 1350mm × 150mm (M10)'],
              ['Foundation depth', '1.50m below GL'],
              ['SBC assumed', '150 kN/m²'],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Foundation concrete', formatValue(concrete.foundation, 'm³')],
              ['Columns on foundation', formatValue(columns, 'nos')],
              ['Grade', 'M25 concrete'],
            ],
          },
        ],
      };

    case 'excavation':
      return {
        title: 'EXCAVATION LAYOUT',
        sections: [
          dims,
          {
            heading: 'EXCAVATION DATA',
            rows: [
              ['Foundation depth', '1.50m below GL'],
              ['Working space', '150mm each side'],
              ['PCC bed', '150mm thick M10'],
              ['Footing pits', formatValue(columns, 'nos')],
            ],
          },
          {
            heading: 'SOIL',
            rows: [
              ['SBC assumed', '150 kN/m²'],
              ['Excavation type', 'Open excavation'],
            ],
          },
        ],
      };

    case 'footingDetail':
      return {
        title: 'FOOTING DETAIL',
        sections: [
          dims,
          {
            heading: 'ISOLATED FOOTING',
            rows: [
              ['Footing size', '1200mm × 1200mm × 300mm'],
              ['PCC bed', '1350mm × 1350mm × 150mm'],
              ['Reinforcement', '12mm @ 150 c/c both ways'],
              ['Clear cover', '50mm (foundation)'],
              ['Foundation depth', '1.50m below GL'],
            ],
          },
          {
            heading: 'PEDESTAL',
            rows: [
              ['Pedestal size', '300mm × 450mm'],
              ['Dowels', '4–12mm into footing'],
              ['Lap length', '50d = 600mm'],
            ],
          },
        ],
      };

    case 'reinforcement':
      return {
        title: 'REINFORCEMENT DETAIL',
        sections: [
          dims,
          {
            heading: 'COLUMN REINFORCEMENT',
            rows: [
              ['Main bars', '4–12mm Fe500'],
              ['Stirrups', '8mm @ 150mm c/c'],
              ['Lap length', '50d = 600mm'],
            ],
          },
          {
            heading: 'BEAM REINFORCEMENT',
            rows: [
              ['Top bars', '2–12mm (continuous)'],
              ['Bottom bars', '2–16mm (at mid-span)'],
              ['Stirrups', '8mm @ 150mm c/c (near support), 200mm c/c (mid)'],
            ],
          },
          {
            heading: 'SLAB REINFORCEMENT',
            rows: [
              ['Main bars', '10mm @ 150mm c/c'],
              ['Dist. bars', '8mm @ 200mm c/c'],
              ['Clear cover', '20mm'],
            ],
          },
        ],
      };

    case 'section': {
      const nFloors = layout?.numFloors || (Array.isArray(layout?.floors) ? layout.floors.length : 1);
      const totalH = 450 + nFloors * 3000 + 900; // plinth + floors + parapet
      return {
        title: 'SECTION DRAWING',
        sections: [
          dims,
          {
            heading: 'VERTICAL DIMENSIONS',
            rows: [
              ['Plinth height', '450mm above GL'],
              ['Floor-to-floor', '3000mm'],
              ['Parapet', '900mm above roof'],
              ['Total height', `${totalH}mm`],
              ['Slab thickness', '125mm'],
              ['Beam depth', '400mm'],
            ],
          },
          {
            heading: 'WALL CONSTRUCTION',
            rows: [
              ['External wall', '230mm (double line)'],
              ['Internal wall', '150mm'],
              ['Plaster (each side)', '12mm'],
            ],
          },
        ],
      };
    }

    case 'elevation': {
      const nFloors = layout?.numFloors || (Array.isArray(layout?.floors) ? layout.floors.length : 1);
      const totalH = 450 + nFloors * 3000 + 900;
      return {
        title: 'ELEVATION',
        sections: [
          dims,
          {
            heading: 'HEIGHT DATA',
            rows: [
              ['Plinth', '+450mm'],
              ['GF Floor-to-ceiling', '3000mm'],
              ['Parapet', '900mm'],
              ['Total height', `${totalH}mm`],
            ],
          },
          {
            heading: 'FACADE',
            rows: [
              ['External finish', 'As per specification'],
              ['Window sill', '900mm from FFL'],
              ['Lintel level', '2100mm from FFL'],
            ],
          },
        ],
      };
    }

    case 'brickwork':
      return {
        title: `${floorPrefix}BRICKWORK DETAIL`,
        sections: [
          dims,
          {
            heading: 'MASONRY DATA',
            rows: [
              ['External wall', '230mm (9\") English bond'],
              ['Internal wall', '115mm (4.5\") stretcher bond'],
              ['Brick count', formatValue(boq?.brickCount, 'nos')],
              ['Cement (masonry)', formatValue(boq?.cementBags, 'bags')],
            ],
          },
          {
            heading: 'MORTAR & FINISH',
            rows: [
              ['Mortar ratio', 'CM 1:6 (brick), 1:4 (plaster)'],
              ['Plaster', '12mm internal, 20mm external'],
              ['Sand', formatValue(boq?.sandCuM, 'm³')],
            ],
          },
        ],
      };

    case 'electrical':
      return {
        title: `${floorPrefix}ELECTRICAL LAYOUT`,
        sections: [
          dims,
          {
            heading: 'ELECTRICAL DATA',
            rows: [
              ['Total points', formatValue(boq?.electricalPoints, 'nos')],
              ['Wiring', 'Concealed copper FR-LSH'],
              ['DB location', 'Near entrance'],
              ['Earthing', 'Pipe + plate earthing'],
            ],
          },
          {
            heading: 'CIRCUIT DESIGN',
            rows: [
              ['MCB rating', '32A (power), 16A (light)'],
              ['ELCB', '63A 30mA (main)'],
              ['Conduit', '25mm PVC concealed'],
            ],
          },
        ],
      };

    case 'plumbing':
      return {
        title: `${floorPrefix}PLUMBING LAYOUT`,
        sections: [
          dims,
          {
            heading: 'PLUMBING DATA',
            rows: [
              ['Total points', formatValue(boq?.plumbingPoints, 'nos')],
              ['Supply pipe', 'CPVC / PPR 20mm–25mm'],
              ['Drain pipe', 'PVC SWR 110mm (soil), 75mm (waste)'],
              ['Vent pipe', 'PVC 75mm'],
            ],
          },
          {
            heading: 'FIXTURES',
            rows: [
              ['WC type', 'Wall-mounted / Floor-mounted EWC'],
              ['Water heater', 'Provision in each toilet'],
              ['Floor trap', '110mm Nahani in wet areas'],
            ],
          },
        ],
      };

    case 'tiling':
      return {
        title: `${floorPrefix}TILING LAYOUT`,
        sections: [
          dims,
          {
            heading: 'TILING DATA',
            rows: [
              ['Floor tiles', 'Vitrified 600×600mm'],
              ['Wall tiles (wet)', 'Ceramic 300×450mm dado to 2100mm'],
              ['Flooring area', formatValue(boq?.flooringAreaSqM, 'm²')],
              ['Adhesive', 'Tile adhesive (20mm bed)'],
            ],
          },
          {
            heading: 'SPECIFICATION',
            rows: [
              ['Skirting', '100mm vitrified'],
              ['Anti-skid', 'In toilets & balcony'],
              ['Threshold', 'Granite / marble'],
            ],
          },
        ],
      };

    case 'staircase': {
      const floorHeight = 3000; // mm
      const riser = 175; // max 190 per NBC
      const tread = 250; // min 250 per NBC
      const steps = Math.ceil(floorHeight / riser);
      return {
        title: 'STAIRCASE DETAIL',
        sections: [
          dims,
          {
            heading: 'STAIRCASE DATA',
            rows: [
              ['Floor height', `${floorHeight}mm`],
              ['Riser', `${riser}mm (max 190mm NBC)`],
              ['Tread', `${tread}mm (min 250mm NBC)`],
              ['Steps per flight', `${Math.ceil(steps / 2)}`],
              ['Total risers', `${steps}`],
              ['Width', '1000mm clear (min 900mm NBC)'],
            ],
          },
          {
            heading: 'CONSTRUCTION',
            rows: [
              ['Waist slab', '150mm RCC'],
              ['Landing', '125mm RCC slab'],
              ['Handrail', '1000mm height, SS / MS'],
            ],
          },
        ],
      };
    }

    case 'waterTank':
      return {
        title: 'WATER TANK DETAIL',
        sections: [
          dims,
          {
            heading: 'UNDERGROUND TANK',
            rows: [
              ['Capacity', '5000L (typical)'],
              ['Walls', '200mm RCC M25'],
              ['Base slab', '200mm RCC on PCC bed'],
              ['Waterproofing', 'Integral + external coat'],
            ],
          },
          {
            heading: 'OVERHEAD TANK',
            rows: [
              ['Capacity', '2000L (typical)'],
              ['Type', 'Syntax / RCC'],
              ['Support', 'RCC columns from roof'],
              ['Pump', '0.5 HP monoblock'],
            ],
          },
        ],
      };

    case 'waterproofing':
      return {
        title: 'WATERPROOFING DETAIL',
        sections: [
          dims,
          {
            heading: 'WATERPROOFING DATA',
            rows: [
              ['Roof area', formatValue(boq?.waterproofingAreaSqM, 'm²')],
              ['System', 'APP membrane + protective screed'],
              ['Toilet', 'Polymer-modified cementitious coat'],
              ['Plinth', 'DPC (1:2:4 cement concrete 50mm)'],
            ],
          },
          {
            heading: 'SPECIFICATION',
            rows: [
              ['Membrane', '3mm APP modified bitumen'],
              ['Screed over', '50mm M15 with slope'],
              ['China mosaic', 'Optional (terrace)'],
            ],
          },
        ],
      };

    case 'stp':
      return {
        title: 'SEPTIC TANK / STP DETAIL',
        sections: [
          dims,
          {
            heading: 'SEPTIC TANK',
            rows: [
              ['Capacity', '2000L (2–5 users)'],
              ['Internal size', '1500mm × 750mm × 1500mm'],
              ['Walls', '230mm brick CM 1:4 plastered'],
              ['Cover', 'RCC 100mm with frame'],
            ],
          },
          {
            heading: 'SOAK PIT',
            rows: [
              ['Diameter', '900mm'],
              ['Depth', '1500mm below invert'],
              ['Fill', 'Broken brick / aggregate'],
              ['Distance from building', 'Min 3m'],
            ],
          },
        ],
      };

    default:
      return null;
  }
}

function loadImage(imageDataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = (error: unknown) => reject(error instanceof Error ? error : new Error('Image load failed'));
    image.src = imageDataUri;
  });
}

/**
 * Render the computed-data overlay on top of an AI-generated drawing image.
 * Returns a data-URI (PNG) of the composited result.
 */
export async function applyTextOverlay(
  imageDataUri: string,
  drawingType: string,
  layout: Layout,
  boq: BOQ,
  floor?: 'GF' | 'FF',
): Promise<string> {
  const overlay = makeOverlaySections(drawingType, layout, boq, floor);
  if (!overlay) return imageDataUri;

  const image = await loadImage(imageDataUri);
  const canvas = document.createElement('canvas');
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  canvas.width = imageWidth;
  canvas.height = imageHeight;

  const context = canvas.getContext('2d');
  if (!context) return imageDataUri;

  const rowHeight = 22;
  const sectionHeadingHeight = 18;
  const titleHeight = 32;
  const watermarkHeight = 20;
  const horizontalPadding = 14;
  const verticalPadding = 10;
  const rowCount = overlay.sections.reduce((total, section) => total + section.rows.length, 0);
  const boxHeight = verticalPadding + titleHeight
    + overlay.sections.length * sectionHeadingHeight
    + rowCount * rowHeight
    + watermarkHeight + verticalPadding;
  const boxWidth = Math.min(380, Math.max(1, imageWidth - 40));
  const margin = 20;

  // Section & elevation drawings: panel at TOP-RIGHT to avoid overlapping the cross-section content.
  // All other drawings: panel at BOTTOM-RIGHT (standard position).
  const topRightTypes: string[] = ['section', 'elevation'];
  const placeTop = topRightTypes.includes(drawingType);

  const boxX = Math.max(0, imageWidth - boxWidth - margin);
  const boxY = placeTop ? margin : Math.max(0, imageHeight - boxHeight - margin);

  // Draw the original image
  context.drawImage(image, 0, 0, imageWidth, imageHeight);

  // Semi-transparent background for data panel
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.strokeStyle = '#333';
  context.lineWidth = 1.5;
  context.strokeRect(boxX, boxY, boxWidth, boxHeight);

  let cursorY = boxY + verticalPadding;

  // Title bar
  context.fillStyle = '#1a3a1a';
  context.fillRect(boxX, boxY, boxWidth, titleHeight);
  context.fillStyle = '#ffffff';
  context.font = 'bold 14px "Courier New", monospace';
  context.fillText(overlay.title, boxX + horizontalPadding, cursorY + 16);
  cursorY += titleHeight;

  // Sections
  for (const section of overlay.sections) {
    context.fillStyle = '#e8e8e8';
    context.fillRect(boxX, cursorY, boxWidth, sectionHeadingHeight);
    context.fillStyle = '#333';
    context.font = 'bold 11px "Courier New", monospace';
    context.fillText(section.heading, boxX + horizontalPadding, cursorY + 13);
    cursorY += sectionHeadingHeight;

    context.font = '11px "Courier New", monospace';
    for (const [label, value] of section.rows) {
      context.fillStyle = '#444';
      context.fillText(label, boxX + horizontalPadding, cursorY + 16);
      context.fillStyle = '#000';
      context.textAlign = 'right';
      context.fillText(value, boxX + boxWidth - horizontalPadding, cursorY + 16);
      context.textAlign = 'left';
      cursorY += rowHeight;
    }
  }

  // Watermark
  context.fillStyle = '#999';
  context.font = '9px "Courier New", monospace';
  context.fillText('neevv — Computed data • Not AI-generated', boxX + horizontalPadding, cursorY + 14);

  return canvas.toDataURL('image/png');
}
