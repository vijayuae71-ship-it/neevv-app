import type { RoomInterior } from '../types';

/**
 * Interior finish specs with the room type's defaults, in one place: the interior sheets, the interior
 * BOQ and the material list all read these, so an edit (e.g. bath wall tiles to full height) changes
 * the drawing, the cost and the materials together.
 */
type Spec = Pick<RoomInterior, 'roomType' | 'ceilingHeight' | 'flooring' | 'wallFinish'> & Partial<Pick<RoomInterior, 'wallTileHeightMm' | 'floorTileSize' | 'skirtingHeightMm'>>;

/** Counter top level the kitchen dado starts from. */
export const KITCHEN_COUNTER_MM = 850;

/** Wall tile band in mm above the floor (kitchen: from the counter), or null when the walls are not tiled. */
export function wallTileBand(r: Spec): { fromMm: number; toMm: number; full: boolean } | null {
  const ceiling = r.ceilingHeight > 1500 ? r.ceilingHeight : 2700;
  const kitchen = r.roomType === 'kitchen';
  const from = kitchen ? KITCHEN_COUNTER_MM : 0;
  const def = r.roomType === 'bathroom' ? 2100 : kitchen ? 1500 : 0;
  const to = Math.min(ceiling, typeof r.wallTileHeightMm === 'number' ? r.wallTileHeightMm : def);
  if (!(to > from + 50)) return null;
  return { fromMm: from, toMm: to, full: to >= ceiling - 50 };
}

/** True when the room's chosen wall finish is itself the wall tile (baths, kitchens). */
export const wallFinishIsTile = (r: Spec) => r.roomType === 'bathroom' || r.roomType === 'kitchen' || /tile/i.test(r.wallFinish?.name ?? '');

/** Floor module in mm (tile or plank). */
export function floorModule(r: Spec): { w: number; h: number; plank: boolean; label: string } {
  const pick = (txt: string) => /(\d{3,4})\s*[x×]\s*(\d{2,4})/.exec(txt);
  const m = pick(r.floorTileSize ?? '') ?? pick(`${r.flooring?.name ?? ''} ${r.flooring?.finish ?? ''}`);
  const wood = /wood|laminate|plank|vinyl|spc|lvt/i.test(`${r.flooring?.name ?? ''} ${r.flooring?.finish ?? ''}`);
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : wood ? [1200, 200] : r.roomType === 'bathroom' || r.roomType === 'balcony' ? [300, 300] : [600, 600];
  return { w, h, plank: wood || Math.max(w, h) / Math.min(w, h) >= 4, label: `${w} × ${h} mm` };
}

/** Skirting height in mm (0 where the walls are tiled down to the floor). */
export function skirtingMm(r: Spec): number {
  const band = wallTileBand(r);
  if (band && band.fromMm === 0) return 0;
  return typeof r.skirtingHeightMm === 'number' ? Math.max(0, r.skirtingHeightMm) : 100;
}

export const WALL_TILE_PRESETS: { label: string; mm: number | 'full' }[] = [
  { label: 'No wall tiles', mm: 0 },
  { label: '4 ft (1200 mm)', mm: 1200 },
  { label: '7 ft (2100 mm)', mm: 2100 },
  { label: '8 ft (2400 mm)', mm: 2400 },
  { label: 'Full height (to ceiling)', mm: 'full' },
];
export const FLOOR_TILE_PRESETS = ['300x300', '600x600', '800x800', '1200x600', '1200x1200', '1200x200'];

/** Material name without a built-in height note such as "(up to 7 ft)", which the edit may have changed. */
export const cleanFinishName = (name: string) => name.replace(/\s*\((?:up to|upto|till)[^)]*\)/i, '').trim();
