/**
 * Items a customer can replace with their own sample (photo + quoted price), shared by the render
 * editor (what to change in the picture) and the interior BOQ (how the price is applied).
 */
export type SampleUnit = 'sqft' | 'rft' | 'nos' | 'set';
export interface SampleItem {
  key: string; label: string;
  /** what the image model replaces */
  change: string;
  unit: SampleUnit;
  /** words for the price box */
  priceLabel: string;
  /** how the BOQ uses the price, shown under the box */
  boqNote: string;
  /** default quantity for per-piece items */
  defaultQty?: number;
}

export const SAMPLE_ITEMS: SampleItem[] = [
  { key: 'floor', label: 'Floor tiles', change: 'the floor tiles / flooring on the whole floor', unit: 'sqft', priceLabel: '₹ per sq ft (supplied & laid)', boqNote: 'Replaces the flooring rate for the whole floor area.' },
  { key: 'wall_tiles', label: 'Wall tiles', change: 'the wall tiles (dado / bathroom / kitchen backsplash tiles) wherever walls are tiled', unit: 'sqft', priceLabel: '₹ per sq ft (supplied & laid)', boqNote: 'Replaces the wall-tile rate over the tiled wall area.' },
  { key: 'feature_wall', label: 'Feature wall / wallpaper', change: 'the finish of the main feature wall (behind the bed / TV / sofa)', unit: 'sqft', priceLabel: '₹ per sq ft (supplied & fixed)', boqNote: 'Adds the feature wall: one long wall of the room × ceiling height.' },
  { key: 'paint', label: 'Wall paint colour', change: 'the paint colour of the painted walls (match the colour shade in the photo)', unit: 'sqft', priceLabel: '₹ per sq ft (paint + labour)', boqNote: 'Replaces the wall paint rate over the painted wall area.' },
  { key: 'ceiling', label: 'False ceiling', change: 'the false ceiling design (shape, profile, cove and finish)', unit: 'sqft', priceLabel: '₹ per sq ft (supplied & fixed)', boqNote: 'Replaces the false-ceiling rate (adds a full ceiling if the room had none).' },
  { key: 'lights', label: 'Lights / chandelier', change: 'the decorative light fittings (pendant, chandelier, wall lights) — same positions', unit: 'nos', priceLabel: '₹ per piece', boqNote: 'Adds the fittings at this price × quantity.', defaultQty: 1 },
  { key: 'cp', label: 'Taps & shower (CP fittings)', change: 'the taps, mixers and shower fittings (match the design and finish: chrome, matte black, gold…)', unit: 'set', priceLabel: '₹ per set (all taps + shower)', boqNote: 'Replaces the CP fittings set price.' },
  { key: 'sanitary', label: 'WC / basin (sanitaryware)', change: 'the WC and wash basin (match the product design and colour)', unit: 'set', priceLabel: '₹ per set (WC + basin)', boqNote: 'Adds WC + basin at this price × quantity.', defaultQty: 1 },
  { key: 'wood', label: 'Wood / laminate', change: 'the wood or laminate finish of wardrobes, cabinets and panelling', unit: 'sqft', priceLabel: '₹ per sq ft of finish', boqNote: 'Adds the finish over the front faces of the selected furniture.' },
  { key: 'counter', label: 'Countertop / stone', change: 'the countertop / vanity top stone', unit: 'rft', priceLabel: '₹ per running ft', boqNote: 'Adds the counter at this price × length.', defaultQty: 10 },
  { key: 'fabric', label: 'Curtains / fabric', change: 'the curtains and soft-furnishing fabric', unit: 'sqft', priceLabel: '₹ per sq ft (stitched & fixed)', boqNote: 'Replaces the curtain rate.' },
];

export const sampleItem = (key: string) => SAMPLE_ITEMS.find((s) => s.key === key);
export const UNIT_LABEL: Record<SampleUnit, string> = { sqft: 'sq ft', rft: 'rft', nos: 'pcs', set: 'sets' };
