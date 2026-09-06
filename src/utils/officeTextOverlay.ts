import { Layout, OfficeRequirements } from '../types';
import { OfficeDrawingType } from './officeDrawingPrompts';

type OfficeOverlaySection = {
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

function formatValue(value: unknown, unit?: string): string {
  const number = asNumber(value);
  return number === null ? '—' : `${number.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}

function formatInt(value: unknown, unit?: string): string {
  const number = asNumber(value);
  return number === null ? '—' : `${Math.round(number)}${unit ? ` ${unit}` : ''}`;
}

const SQM_TO_SQFT = 10.764;

/** Aggregate office program totals across floors (or the requested single floor). */
function programTotals(officeReq: OfficeRequirements, floor?: number) {
  const floors = typeof floor === 'number' && officeReq.floors[floor]
    ? [officeReq.floors[floor]]
    : officeReq.floors;

  return floors.reduce(
    (acc, f) => {
      acc.workstations += f.workstations || 0;
      acc.managerCabins += f.managerCabins || 0;
      acc.directorCabins += f.directorCabins || 0;
      acc.mdCabins += f.mdCabin ? 1 : 0;
      acc.conferenceSmall += f.conferenceSmall || 0;
      acc.conferenceLarge += f.conferenceLarge || 0;
      acc.boardRooms += f.boardRoom ? 1 : 0;
      acc.receptions += f.hasReception ? 1 : 0;
      acc.pantries += f.hasPantry ? 1 : 0;
      acc.cafeterias += f.hasCafeteria ? 1 : 0;
      acc.serverRooms += f.hasServerRoom ? 1 : 0;
      acc.breakRooms += f.hasBreakRoom ? 1 : 0;
      return acc;
    },
    {
      workstations: 0, managerCabins: 0, directorCabins: 0, mdCabins: 0,
      conferenceSmall: 0, conferenceLarge: 0, boardRooms: 0, receptions: 0,
      pantries: 0, cafeterias: 0, serverRooms: 0, breakRooms: 0,
    },
  );
}

function floorAreaSqFt(layout: Layout, floor?: number): number {
  const totalSqFt = (layout?.builtUpAreaSqM || 0) * SQM_TO_SQFT;
  const numFloors = layout?.numFloors || (Array.isArray(layout?.floors) ? layout.floors.length : 1) || 1;
  return typeof floor === 'number' ? totalSqFt / numFloors : totalSqFt;
}

/** Common building/floor identification section shown on every drawing. */
function buildingDimsSection(layout: Layout, officeReq: OfficeRequirements, floor?: number): OfficeOverlaySection {
  const areaSqFt = floorAreaSqFt(layout, floor);
  const numFloors = officeReq.floors.length || layout?.floors?.length || 1;
  return {
    heading: 'PROJECT DATA',
    rows: [
      ['Company', officeReq.companyName || '—'],
      ['Plot', `${formatValue(layout?.plotWidthM, 'm')} × ${formatValue(layout?.plotDepthM, 'm')}`],
      ['Floor', typeof floor === 'number' ? officeReq.floors[floor]?.floorLabel || `${floor + 1}` : 'All floors'],
      ['Floor area', `${formatInt(areaSqFt, 'sqft')}`],
      ['Total floors', `${numFloors}`],
      ['Employee count', `${officeReq.employeeCount || '—'}`],
    ],
  };
}

function makeOverlaySections(
  drawingType: OfficeDrawingType,
  layout: Layout,
  officeReq: OfficeRequirements,
  floor?: number,
): { title: string; sections: OfficeOverlaySection[] } | null {
  const dims = buildingDimsSection(layout, officeReq, floor);
  const totals = programTotals(officeReq, floor);
  const areaSqFt = floorAreaSqFt(layout, floor);
  const employeeCount = officeReq.employeeCount || totals.workstations || 1;

  switch (drawingType) {
    case 'floorPlan': {
      const circulationPct = 30; // typical open-plan circulation allowance
      const carpetAreaSqFt = Math.round(areaSqFt * (1 - circulationPct / 100));
      const density = totals.workstations > 0 ? +(areaSqFt / totals.workstations).toFixed(1) : null;
      return {
        title: 'FLOOR PLAN — ROOM SCHEDULE',
        sections: [
          dims,
          {
            heading: 'ROOM SCHEDULE',
            rows: [
              ['Workstations', formatInt(totals.workstations, 'nos')],
              ['Manager cabins', formatInt(totals.managerCabins, 'nos')],
              ['Director cabins', formatInt(totals.directorCabins, 'nos')],
              ['MD cabin', formatInt(totals.mdCabins, 'nos')],
              ['Conference (small/large)', `${totals.conferenceSmall} / ${totals.conferenceLarge}`],
              ['Board room', formatInt(totals.boardRooms, 'nos')],
              ['Reception / Pantry', `${totals.receptions} / ${totals.pantries}`],
            ],
          },
          {
            heading: 'AREA & DENSITY',
            rows: [
              ['Carpet area', `${carpetAreaSqFt} sqft`],
              ['Circulation', `${circulationPct}%`],
              ['Employee density', density !== null ? `${density} sqft/person` : '—'],
              ['Employee count', `${employeeCount}`],
            ],
          },
        ],
      };
    }

    case 'furniturePlan': {
      const seatingCapacity = totals.workstations + totals.managerCabins + totals.directorCabins +
        totals.mdCabins + totals.conferenceSmall * 8 + totals.conferenceLarge * 16 + totals.boardRooms * 20;
      const sqftPerPerson = seatingCapacity > 0 ? +(areaSqFt / seatingCapacity).toFixed(1) : null;
      return {
        title: 'FURNITURE LAYOUT',
        sections: [
          dims,
          {
            heading: 'FURNITURE COUNT',
            rows: [
              ['Workstation desks', formatInt(totals.workstations, 'nos')],
              ['Cabin furniture sets', formatInt(totals.managerCabins + totals.directorCabins + totals.mdCabins, 'sets')],
              ['Conference tables', formatInt(totals.conferenceSmall + totals.conferenceLarge + totals.boardRooms, 'nos')],
              ['Seating capacity', formatInt(seatingCapacity, 'persons')],
              ['Area per person', sqftPerPerson !== null ? `${sqftPerPerson} sqft/person` : '—'],
            ],
          },
        ],
      };
    }

    case 'partitionPlan': {
      const cabinCount = totals.managerCabins + totals.directorCabins + totals.mdCabins;
      const conferenceCount = totals.conferenceSmall + totals.conferenceLarge + totals.boardRooms;
      const glassRFT = Math.round(Math.sqrt(Math.max(cabinCount, 1)) * 40 + Math.sqrt(Math.max(conferenceCount, 1)) * 60);
      const gypsumRFT = Math.round(glassRFT * 0.6);
      return {
        title: 'PARTITION PLAN',
        sections: [
          dims,
          {
            heading: 'PARTITION DATA',
            rows: [
              ['Glass partition (12mm)', `${glassRFT} RFT`],
              ['Gypsum partition', `${gypsumRFT} RFT`],
              ['Glass doors', formatInt(cabinCount + conferenceCount + totals.receptions, 'nos')],
              ['Cabins enclosed', formatInt(cabinCount, 'nos')],
            ],
          },
        ],
      };
    }

    case 'rcp': {
      const gridTiles = Math.ceil((areaSqFt * 0.65) / (2 * 2));
      const lightFixtures = Math.ceil(areaSqFt / 80);
      const diffusers = Math.ceil(areaSqFt / 250);
      const sprinklers = Math.ceil(areaSqFt / 150);
      return {
        title: 'REFLECTED CEILING PLAN (RCP)',
        sections: [
          dims,
          {
            heading: 'CEILING DATA',
            rows: [
              ['Ceiling area', `${Math.round(areaSqFt)} sqft`],
              ['Grid tiles (600×600)', formatInt(gridTiles, 'nos')],
              ['Light fixtures (2×2 LED)', formatInt(lightFixtures, 'nos')],
              ['AC diffusers', formatInt(diffusers, 'nos')],
              ['Sprinkler heads', formatInt(sprinklers, 'nos')],
            ],
          },
        ],
      };
    }

    case 'electrical': {
      const totalLoadKW = +(areaSqFt * 0.03).toFixed(1); // ~30W/sqft commercial load estimate
      const dbCount = Math.max(2, (officeReq.floors.length || 1) * 2);
      const upsLoadKVA = +(totalLoadKW * 0.4).toFixed(1);
      const floorBoxes = Math.ceil(totals.workstations / 6);
      return {
        title: 'ELECTRICAL LAYOUT',
        sections: [
          dims,
          {
            heading: 'ELECTRICAL DATA',
            rows: [
              ['Total connected load', `${totalLoadKW} kW`],
              ['DB count', formatInt(dbCount, 'nos')],
              ['UPS load', `${upsLoadKVA} kVA`],
              ['Floor boxes', formatInt(floorBoxes, 'nos')],
            ],
          },
        ],
      };
    }

    case 'dataNetwork': {
      const dataPoints = totals.workstations + (totals.managerCabins + totals.directorCabins + totals.mdCabins) * 2 +
        (totals.conferenceSmall + totals.conferenceLarge + totals.boardRooms) * 3;
      const wifiAPs = Math.max(1, Math.ceil(areaSqFt / 1500));
      const cableTrayM = Math.round(areaSqFt * 0.08);
      return {
        title: 'DATA / NETWORK LAYOUT',
        sections: [
          dims,
          {
            heading: 'NETWORK DATA',
            rows: [
              ['Data points (CAT6A)', formatInt(dataPoints, 'nos')],
              ['WiFi access points', formatInt(wifiAPs, 'nos')],
              ['Cable tray run', `${cableTrayM} m`],
              ['Network racks', formatInt(officeReq.floors.length || 1, 'nos')],
            ],
          },
        ],
      };
    }

    case 'hvac': {
      const coolingLoadTR = +(areaSqFt / 130).toFixed(1);
      const outdoorUnits = Math.max(1, Math.ceil(coolingLoadTR / 9));
      const indoorUnits = Math.ceil(areaSqFt / 250);
      const freshAirCFM = Math.round(employeeCount * 20); // ~20 CFM/person per ASHRAE guidance
      return {
        title: 'HVAC LAYOUT',
        sections: [
          dims,
          {
            heading: 'HVAC DATA',
            rows: [
              ['Cooling load', `${coolingLoadTR} TR`],
              ['Outdoor units (VRV)', formatInt(outdoorUnits, 'nos')],
              ['Indoor units (cassette)', formatInt(indoorUnits, 'nos')],
              ['Fresh air supply', `${freshAirCFM} CFM`],
            ],
          },
        ],
      };
    }

    case 'fireSafety': {
      const sprinklers = Math.ceil(areaSqFt / 150);
      const detectors = Math.ceil(areaSqFt / 500);
      const maxTravelDistanceM = 30; // NBC max travel distance to exit
      const exitWidthMM = 1000; // min clear exit width per NBC
      return {
        title: 'FIRE SAFETY LAYOUT',
        sections: [
          dims,
          {
            heading: 'FIRE SAFETY DATA',
            rows: [
              ['Sprinkler heads', formatInt(sprinklers, 'nos')],
              ['Smoke detectors', formatInt(detectors, 'nos')],
              ['Max travel distance', `${maxTravelDistanceM} m (NBC)`],
              ['Min exit width', `${exitWidthMM} mm (NBC)`],
            ],
          },
        ],
      };
    }

    case 'plumbing': {
      const washrooms = 2 * (officeReq.floors.length || 1);
      return {
        title: 'PLUMBING LAYOUT',
        sections: [
          dims,
          {
            heading: 'PLUMBING DATA',
            rows: [
              ['Washrooms', formatInt(washrooms, 'nos')],
              ['Pantries', formatInt(totals.pantries, 'nos')],
              ['Water purifiers', formatInt(totals.pantries + totals.cafeterias, 'nos')],
              ['Geysers', formatInt(washrooms + totals.pantries, 'nos')],
            ],
          },
        ],
      };
    }

    case 'section':
    case 'elevation': {
      const numFloors = officeReq.floors.length || 1;
      const floorToFloorMM = 3600; // typical commercial slab-to-slab
      const totalHeightMM = numFloors * floorToFloorMM;
      return {
        title: drawingType === 'section' ? 'SECTION DRAWING' : 'ELEVATION',
        sections: [
          dims,
          {
            heading: 'VERTICAL DIMENSIONS',
            rows: [
              ['Floor-to-floor', `${floorToFloorMM} mm`],
              ['Raised floor + ceiling void', '450 mm'],
              ['Clear ceiling height', '2750 mm'],
              ['Total building height', `${totalHeightMM} mm`],
            ],
          },
        ],
      };
    }

    case 'signage': {
      const cabinCount = totals.managerCabins + totals.directorCabins + totals.mdCabins;
      const roomSigns = cabinCount + totals.conferenceSmall + totals.conferenceLarge + totals.boardRooms;
      const wayfinding = (officeReq.floors.length || 1) * 4;
      return {
        title: 'SIGNAGE PLAN',
        sections: [
          dims,
          {
            heading: 'SIGNAGE DATA',
            rows: [
              ['Room signs', formatInt(roomSigns, 'nos')],
              ['Wayfinding signs', formatInt(wayfinding, 'nos')],
              ['Branding elements', formatInt(totals.receptions, 'nos')],
            ],
          },
        ],
      };
    }

    default:
      return null;
  }
}

/**
 * Draw the computed-data overlay directly onto a canvas already holding an
 * AI-generated office drawing. Mirrors the residential applyTextOverlay()
 * pattern but operates in-place on a provided HTMLCanvasElement instead of
 * returning a new data-URI, and covers office-specific drawing types.
 */
export function applyOfficeTextOverlay(
  canvas: HTMLCanvasElement,
  drawingType: OfficeDrawingType,
  layout: Layout,
  officeReq: OfficeRequirements,
  floor?: number,
): void {
  const overlay = makeOverlaySections(drawingType, layout, officeReq, floor);
  if (!overlay) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const imageWidth = canvas.width;
  const imageHeight = canvas.height;

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

  // Section & elevation drawings: panel at TOP-RIGHT to avoid overlapping cross-section content.
  // All other drawings: panel at BOTTOM-RIGHT (standard position).
  const topRightTypes: OfficeDrawingType[] = ['section', 'elevation'];
  const placeTop = topRightTypes.includes(drawingType);

  const boxX = Math.max(0, imageWidth - boxWidth - margin);
  const boxY = placeTop ? margin : Math.max(0, imageHeight - boxHeight - margin);

  // Semi-transparent dark background for the data panel.
  context.fillStyle = 'rgba(26,26,46,0.92)'; // #1a1a2e @ 0.92
  context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.strokeStyle = '#4a4a6a';
  context.lineWidth = 1.5;
  context.strokeRect(boxX, boxY, boxWidth, boxHeight);

  let cursorY = boxY + verticalPadding;

  // Title bar
  context.fillStyle = '#0f0f23';
  context.fillRect(boxX, boxY, boxWidth, titleHeight);
  context.fillStyle = '#ffffff';
  context.font = 'bold 14px "Courier New", monospace';
  context.fillText(overlay.title, boxX + horizontalPadding, cursorY + 16);
  cursorY += titleHeight;

  // Sections
  for (const section of overlay.sections) {
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fillRect(boxX, cursorY, boxWidth, sectionHeadingHeight);
    context.fillStyle = '#c9c9e8';
    context.font = 'bold 11px "Courier New", monospace';
    context.fillText(section.heading, boxX + horizontalPadding, cursorY + 13);
    cursorY += sectionHeadingHeight;

    context.font = '11px "Courier New", monospace';
    for (const [label, value] of section.rows) {
      context.fillStyle = '#b0b0d0';
      context.fillText(label, boxX + horizontalPadding, cursorY + 16);
      context.fillStyle = '#ffffff';
      context.textAlign = 'right';
      context.fillText(value, boxX + boxWidth - horizontalPadding, cursorY + 16);
      context.textAlign = 'left';
      cursorY += rowHeight;
    }
  }

  // Watermark
  context.fillStyle = '#8a8ab0';
  context.font = '9px "Courier New", monospace';
  context.fillText('neevv — Computed data • Not AI-generated', boxX + horizontalPadding, cursorY + 12);
  cursorY += watermarkHeight;

  // Execution disclaimer — this must remain the final line in every data panel.
  context.fillStyle = '#8a8ab0';
  context.font = 'italic 8px "Courier New", monospace';
  context.textAlign = 'center';
  context.fillText(
    'PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION',
    boxX + boxWidth / 2,
    cursorY + 11,
  );
  context.textAlign = 'left';
}
