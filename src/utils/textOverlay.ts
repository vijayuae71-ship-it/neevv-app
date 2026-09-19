import { Layout, BOQ } from '../types';

/** Drawing types for which computed project data is rendered on the image.
 *  Extended to ALL 17 drawings — every drawing gets a computed data panel
 *  so no AI-hallucinated numbers reach the customer. */
export const OVERLAY_DRAWING_TYPES = [
  'column_detail', 'rcc', 'bbs', 'foundation_detail', 'footing_detail', 'staircase_detail',
  'structural', 'rccDetail', 'barBending', 'foundation',
  'excavation', 'footingDetail', 'reinforcement', 'section',
  'elevation', 'brickwork', 'electrical', 'plumbing',
  'tiling', 'staircase', 'waterTank', 'waterproofing', 'stp',
] as const;

type OverlayDrawingType = (typeof OVERLAY_DRAWING_TYPES)[number];

/** Engineered values used in drawing data panels when a structural design is available. */
export interface StructuralOverlayData {
  concreteGrade: string;
  steelGrade: string;
  columnWidth: number;
  columnDepth: number;
  columnMainBars: string;
  columnTies: string;
  beamWidth: number;
  beamDepth: number;
  beamTensionBars: string;
  beamStirrupsNear: string;
  beamStirrupsMid: string;
  slabThickness: number;
  slabMainBars: string;
  slabDistBars: string;
  footingSize: number;
  footingDepth: number;
  footingBars: string;
  pccSize: number;
  waistSlabThickness: number;
  staircaseMainBars: string;
  staircaseDistBars: string;
  riserMm: number;
  treadMm: number;
  totalConcreteM3: number;
  totalSteelMT: number;
  steelKgPerSqFt: number;
  seismicZone: string;
  windSpeed: number;
  soilType: string;
  sbc: number;
}

type OverlaySection = {
  heading: string;
  rows: Array<[string, string]> | Array<string[]>;
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

/** Convert a structural-engine result into the compact values used by overlays.
 * The engine has had more than one result shape, so this deliberately accepts `any`
 * and checks common member/summary names while retaining safe defaults. */
export function toOverlayData(structResult: any): StructuralOverlayData {
  const root = structResult || {};
  const first = (value: any): any => Array.isArray(value) ? (value[0] || {}) : (value || {});
  const pick = (...values: any[]): any => values.find((v) => v !== undefined && v !== null && v !== '') ?? '';
  const num = (fallback: number, ...values: any[]): number => {
    const value = pick(...values);
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const text = (fallback: string, ...values: any[]): string => String(pick(...values) || fallback);
  const columns = first(pick(root.columns, root.columnDesigns, root.columnMembers, root.members?.columns));
  const beams = first(pick(root.beams, root.beamDesigns, root.beamMembers, root.members?.beams));
  const slabs = first(pick(root.slabs, root.slabDesigns, root.slabMembers, root.members?.slabs));
  const footings = first(pick(root.footings, root.foundation, root.foundationDesign, root.members?.footings));
  const stairs = first(pick(root.staircase, root.stairs, root.stairDesign));
  const env = root.site || root.siteData || root.environment || root.buildingParameters || {};
  const totals = root.totals || root.summary || root.quantities || {};
  return {
    concreteGrade: text('M25', root.concreteGrade, root.parameters?.concreteGrade, root.grade, root.materials?.concreteGrade, columns.concreteGrade),
    steelGrade: text('Fe500', root.steelGrade, root.parameters?.steelGrade, root.materials?.steelGrade, columns.steelGrade),
    columnWidth: num(230, columns.width, columns.widthMm, columns.widthMM, columns.columnWidth, columns.size?.width),
    columnDepth: num(300, columns.depth, columns.depthMm, columns.depthMM, columns.columnDepth, columns.size?.depth),
    columnMainBars: text('4-12mm', columns.mainBars, columns.reinforcement?.mainBars, columns.reinforcement?.longitudinal),
    columnTies: text('8mm @ 150mm c/c', columns.ties, columns.tieDiaMm ? `${columns.tieDiaMm}mm @ ${columns.tieSpacingMm}mm c/c` : undefined, columns.stirrups, columns.reinforcement?.ties),
    beamWidth: num(230, beams.width, beams.widthMm, beams.beamWidth, beams.size?.width),
    beamDepth: num(400, beams.depth, beams.depthMm, beams.beamDepth, beams.size?.depth),
    beamTensionBars: text('2-16mm', beams.tensionBars, beams.bottomBars, beams.reinforcement?.tensionBars),
    beamStirrupsNear: text('8mm @ 150mm c/c', beams.stirrupsNear, beams.stirrupDiaMm ? `${beams.stirrupDiaMm}mm @ ${beams.stirrupSpacingNearSupportMm}mm c/c` : undefined, beams.stirrups?.nearSupport, beams.reinforcement?.stirrupsNear),
    beamStirrupsMid: text('8mm @ 200mm c/c', beams.stirrupsMid, beams.stirrupDiaMm ? `${beams.stirrupDiaMm}mm @ ${beams.stirrupSpacingMidSpanMm}mm c/c` : undefined, beams.stirrups?.midSpan, beams.reinforcement?.stirrupsMid),
    slabThickness: num(125, slabs.thickness, slabs.thicknessMm, slabs.slabThickness),
    slabMainBars: text('10mm @ 150mm c/c', slabs.mainBars, slabs.mainBarDiaMm ? `${slabs.mainBarDiaMm}mm @ ${slabs.mainBarSpacingMm}mm c/c` : undefined, slabs.reinforcement?.mainBars),
    slabDistBars: text('8mm @ 200mm c/c', slabs.distBars, slabs.distBarDiaMm ? `${slabs.distBarDiaMm}mm @ ${slabs.distBarSpacingMm}mm c/c` : undefined, slabs.distributionBars, slabs.reinforcement?.distBars),
    footingSize: num(1200, footings.size, footings.footingSize, footings.footingSizeMm, footings.width),
    footingDepth: num(300, footings.depth, footings.footingDepth, footings.footingDepthMm, footings.thickness),
    footingBars: text('12mm @ 150 c/c both ways', footings.bars, footings.barDiaMm ? `${footings.barDiaMm}mm @ ${footings.barSpacingMm} c/c both ways` : undefined, footings.reinforcement, footings.mainBars),
    pccSize: num(1350, footings.pccSize, footings.pccSizeMm, footings.pcc?.size),
    waistSlabThickness: num(150, stairs.waistSlabThickness, stairs.waistSlabThicknessMm, stairs.waistThickness),
    staircaseMainBars: text('10mm @ 150mm c/c', stairs.mainBars, stairs.mainBarDiaMm ? `${stairs.mainBarDiaMm}mm @ ${stairs.mainBarSpacingMm}mm c/c` : undefined, stairs.reinforcement?.mainBars),
    staircaseDistBars: text('8mm @ 200mm c/c', stairs.distBars, stairs.distBarDiaMm ? `${stairs.distBarDiaMm}mm @ ${stairs.distBarSpacingMm}mm c/c` : undefined, stairs.distributionBars, stairs.reinforcement?.distBars),
    riserMm: num(175, stairs.riserMm, stairs.riser),
    treadMm: num(250, stairs.treadMm, stairs.tread),
    totalConcreteM3: num(0, totals.totalConcreteM3, root.summary?.totalConcreteM3, root.totalConcreteM3, root.concrete?.total),
    totalSteelMT: num(0, totals.totalSteelMT, root.summary?.totalSteelMT, root.totalSteelMT, root.steelWeightMT),
    steelKgPerSqFt: num(0, totals.steelKgPerSqFt, root.steelKgPerSqFt,
      (Number(root.summary?.totalSteelKg) > 0 && Number(root.parameters?.buildingWidthM) > 0 && Number(root.parameters?.buildingDepthM) > 0
        ? Number(root.summary.totalSteelKg) / (Number(root.parameters.buildingWidthM) * Number(root.parameters.buildingDepthM) * (Number(root.parameters.numFloors) || 1) * 10.7639) : undefined)),
    seismicZone: text('—', root.seismicZone, root.parameters?.seismicZone, env.seismicZone),
    windSpeed: num(0, root.windSpeed, root.parameters?.windSpeed, env.windSpeed),
    soilType: text('—', root.soilType, root.parameters?.soilType, env.soilType),
    sbc: num(0, root.sbc, root.parameters?.sbc, env.sbc, root.soilBearingCapacity),
  };
}

function makeOverlaySections(
  drawingType: string,
  layout: Layout,
  boq: BOQ | null,
  floor?: 'GF' | 'FF',
  structuralData?: StructuralOverlayData,
): { title: string; sections: OverlaySection[] } | null {
  const concrete = (boq?.concreteBreakdown || {}) as Partial<BOQ['concreteBreakdown']>;
  const columns = columnCount(layout);
  const dims = buildingDimsSection(layout);
  const d = structuralData;
  const floorPrefix = floor === 'FF' ? 'FIRST FLOOR ' : 'GROUND FLOOR ';

  switch (drawingType as OverlayDrawingType) {
    case 'structural':
    case 'column_detail':
      return {
        title: 'COLUMN SCHEDULE',
        sections: [
          dims,
          ...(d ? [{
            heading: 'SITE & DESIGN PARAMETERS',
            rows: [
              ['Seismic zone', d.seismicZone],
              ['Wind speed', `${d.windSpeed} m/s`],
              ['Soil type', d.soilType],
              ['SBC assumed', `${d.sbc} kN/m²`],
            ],
          }] : []),
          {
            heading: 'REINFORCEMENT',
            rows: [
              ['Column size', d ? `${d.columnWidth}mm × ${d.columnDepth}mm` : '230mm × 300mm'],
              ['Main bars', d?.columnMainBars ? `${d.columnMainBars} ${d.steelGrade}` : '4 nos – 12mm Fe500'],
              ['Stirrups', d?.columnTies || '8mm @ 150mm c/c'],
              ['Clear cover', '40mm'],
              ['Columns / floor', formatValue(columns, 'nos')],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Concrete (columns)', formatValue(concrete.columns, 'm³')],
              ['Grade', d ? `${d.concreteGrade} concrete` : 'M25 concrete'],
            ],
          },
        ],
      };

    case 'rcc':
    case 'rccDetail': {
      const totalRcc = sumIfComplete(concrete.slabs, concrete.beams, concrete.lintels);
      return {
        title: 'RCC SLAB & BEAM DETAILS',
        sections: [
          dims,
          {
            heading: 'MEMBER SIZES',
            rows: [
              ['Slab thickness', d ? `${d.slabThickness}mm` : '125mm'],
              ['Beam size', d ? `${d.beamWidth}mm × ${d.beamDepth}mm` : '230mm × 400mm'],
              ...(d ? ([['Beam tension bars', d.beamTensionBars], ['Beam stirrups', `${d.beamStirrupsNear} near / ${d.beamStirrupsMid} mid`], ['Slab main bars', d.slabMainBars], ['Slab dist. bars', d.slabDistBars]] as Array<[string, string]>) : []),
            ],
          },
          {
            heading: 'CONCRETE QUANTITIES',
            rows: [
              ['Concrete (slabs)', formatValue(concrete.slabs, 'm³')],
              ['Concrete (beams)', formatValue(concrete.beams, 'm³')],
              ['Concrete (lintels)', formatValue(concrete.lintels, 'm³')],
              ['Total RCC concrete', formatValue(d ? d.totalConcreteM3 : totalRcc, 'm³')],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Total steel', formatValue(d ? d.totalSteelMT : boq?.steelWeightMT, 'MT')],
              ['Grade', d ? `${d.concreteGrade} / ${d.steelGrade}` : 'M25 / Fe500'],
            ],
          },
        ],
      };
    }

    case 'bbs':
    case 'barBending': {
      const steel = d ? asNumber(d.totalSteelMT) : asNumber(boq?.steelWeightMT);
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
              ['Steel rate', d ? `${formatNumber(d.steelKgPerSqFt)} kg/sqft` : '4.50 kg/sqft'],
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
    case 'foundation_detail':
      return {
        title: 'FOUNDATION DETAIL',
        sections: [
          dims,
          {
            heading: 'FOUNDATION DATA',
            rows: [
              ['Foundation type', 'Isolated Footing'],
              ['Footing size', d ? `${d.footingSize}mm × ${d.footingSize}mm × ${d.footingDepth}mm` : '1200mm × 1200mm × 300mm'],
              ['PCC bed', d ? `${d.pccSize}mm × ${d.pccSize}mm × 150mm (M10)` : '1350mm × 1350mm × 150mm (M10)'],
              ['Foundation depth', '1.50m below GL'],
              ['SBC assumed', d ? `${d.sbc} kN/m²` : '150 kN/m²'],
            ],
          },
          {
            heading: 'MATERIALS',
            rows: [
              ['Foundation concrete', formatValue(concrete.foundation, 'm³')],
              ['Columns on foundation', formatValue(columns, 'nos')],
              ['Grade', d ? `${d.concreteGrade} concrete` : 'M25 concrete'],
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

    case 'footing_detail':
    case 'footingDetail':
      return {
        title: 'FOOTING DETAIL',
        sections: [
          dims,
          {
            heading: 'ISOLATED FOOTING',
            rows: [
              ['Footing size', d ? `${d.footingSize}mm × ${d.footingSize}mm × ${d.footingDepth}mm` : '1200mm × 1200mm × 300mm'],
              ['PCC bed', d ? `${d.pccSize}mm × ${d.pccSize}mm × 150mm` : '1350mm × 1350mm × 150mm'],
              ['Reinforcement', d?.footingBars || '12mm @ 150 c/c both ways'],
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
              ['Stirrups', d?.columnTies || '8mm @ 150mm c/c'],
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
              ['Main bars', d?.slabMainBars || '10mm @ 150mm c/c'],
              ['Dist. bars', d?.slabDistBars || '8mm @ 200mm c/c'],
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
              ['Slab thickness', d ? `${d.slabThickness}mm` : '125mm'],
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

    case 'staircase':
    case 'staircase_detail': {
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
              ['Riser', `${d?.riserMm ?? riser}mm (max 190mm NBC)`],
              ['Tread', `${d?.treadMm ?? tread}mm (min 250mm NBC)`],
              ['Steps per flight', `${Math.ceil(steps / 2)}`],
              ['Total risers', `${steps}`],
              ['Width', '1000mm clear (min 900mm NBC)'],
            ],
          },
          {
            heading: 'CONSTRUCTION',
            rows: [
              ['Waist slab', `${d?.waistSlabThickness ?? 150}mm RCC`],
              ['Main bars', d?.staircaseMainBars || '10mm @ 150mm c/c'],
              ['Distribution bars', d?.staircaseDistBars || '8mm @ 200mm c/c'],
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
  boq: BOQ | null,
  floor?: 'GF' | 'FF',
  structuralData?: StructuralOverlayData,
): Promise<string> {
  const overlay = makeOverlaySections(drawingType, layout, boq, floor, structuralData);
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
  const disclaimerHeight = 18;
  const horizontalPadding = 14;
  const verticalPadding = 10;
  const rowCount = overlay.sections.reduce((total, section) => total + section.rows.length, 0);
  const boxHeight = verticalPadding + titleHeight
    + overlay.sections.length * sectionHeadingHeight
    + rowCount * rowHeight
    + watermarkHeight + disclaimerHeight + verticalPadding;
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
  context.fillText('neevv — Computed data • Not AI-generated', boxX + horizontalPadding, cursorY + 12);
  cursorY += watermarkHeight;

  // Execution disclaimer — this must remain the final line in every data panel.
  context.fillStyle = '#888';
  context.font = 'italic 8px \"Courier New\", monospace';
  context.textAlign = 'center';
  context.fillText(
    'PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION',
    boxX + boxWidth / 2,
    cursorY + 11,
  );
  context.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
