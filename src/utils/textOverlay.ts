import { Layout, BOQ } from '../types';

/** Drawing types for which computed project data is rendered on the image. */
export const OVERLAY_DRAWING_TYPES = ['structural', 'rccDetail', 'barBending', 'foundation'] as const;

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
  return numbers.every((value): value is number => value !== null)
    ? numbers.reduce((sum, value) => sum + value, 0)
    : null;
}

function columnCount(layout: Layout): number | null {
  const builtUpArea = asNumber(layout?.builtUpAreaSqM);
  const floors = Array.isArray(layout?.floors) ? layout.floors.length : 0;
  return builtUpArea !== null && floors > 0 ? Math.ceil(builtUpArea / floors / 12) : null;
}

function makeOverlaySections(
  drawingType: string,
  layout: Layout,
  boq: BOQ,
): { title: string; sections: OverlaySection[] } | null {
  const concrete = (boq?.concreteBreakdown || {}) as Partial<BOQ['concreteBreakdown']>;
  const columns = columnCount(layout);

  switch (drawingType as OverlayDrawingType) {
    case 'structural':
      return {
        title: 'COLUMN SCHEDULE',
        sections: [
          {
            heading: 'LAYOUT',
            rows: [
              ['Plot', `${formatValue(layout?.plotWidthM, 'm')} × ${formatValue(layout?.plotDepthM, 'm')}`],
              ['Columns / floor', formatValue(columns, 'nos')],
              ['Column size', '230mm × 300mm'],
            ],
          },
          {
            heading: 'REINFORCEMENT',
            rows: [
              ['Main bars', '4 nos – 12mm Fe500'],
              ['Stirrups', '8mm @ 150mm c/c'],
              ['Clear cover', '40mm'],
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
          {
            heading: 'BAR SPECIFICATION',
            rows: [['Bar diameters', '8, 10, 12, 16mm Fe500']],
          },
        ],
      };
    }

    case 'foundation':
      return {
        title: 'FOUNDATION DETAIL',
        sections: [
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
            heading: 'MATERIALS & LAYOUT',
            rows: [
              ['Foundation concrete', formatValue(concrete.foundation, 'm³')],
              ['Columns on foundation', formatValue(columns, 'nos')],
              ['Grade', 'M25 concrete'],
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
    image.onerror = () => reject(new Error('Unable to load drawing image for text overlay'));
    image.src = imageDataUri;

    // A cached data URI can complete before the load callback is dispatched.
    if (image.complete && image.naturalWidth > 0) resolve(image);
  });
}

/**
 * Render computed project quantities over an AI-generated architectural drawing.
 * The utility intentionally uses browser Canvas APIs and therefore must run client-side.
 */
export async function applyTextOverlay(
  imageDataUri: string,
  drawingType: string,
  layout: Layout,
  boq: BOQ,
): Promise<string> {
  const overlay = makeOverlaySections(drawingType, layout, boq);
  if (!overlay) return imageDataUri;

  const image = await loadImage(imageDataUri);
  const canvas = document.createElement('canvas');
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) throw new Error('Drawing image has no usable dimensions');

  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.drawImage(image, 0, 0, imageWidth, imageHeight);

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
  const boxX = Math.max(0, imageWidth - boxWidth - margin);
  const boxY = Math.max(0, imageHeight - boxHeight - margin);

  context.save();
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.fillRect(boxX, boxY, boxWidth, boxHeight);
  context.strokeStyle = '#333';
  context.lineWidth = 1;
  context.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = '#2d5016';
  context.font = 'bold 14px monospace';
  context.fillText(overlay.title, boxX + horizontalPadding, boxY + verticalPadding + titleHeight / 2);

  let currentY = boxY + verticalPadding + titleHeight;
  for (const section of overlay.sections) {
    context.strokeStyle = '#ccc';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(boxX + horizontalPadding, currentY);
    context.lineTo(boxX + boxWidth - horizontalPadding, currentY);
    context.stroke();

    context.fillStyle = '#555';
    context.font = 'bold 10px monospace';
    context.fillText(section.heading, boxX + horizontalPadding, currentY + sectionHeadingHeight / 2);
    currentY += sectionHeadingHeight;

    context.fillStyle = '#333';
    context.font = '12px monospace';
    for (const [label, value] of section.rows) {
      context.fillText(`${label}: ${value}`, boxX + horizontalPadding, currentY + rowHeight / 2);
      currentY += rowHeight;
    }
  }

  context.fillStyle = '#4f6f52';
  context.font = '10px monospace';
  context.fillText('neevv', boxX + horizontalPadding, boxY + boxHeight - verticalPadding - watermarkHeight / 2);
  context.restore();

  return canvas.toDataURL('image/png');
}
