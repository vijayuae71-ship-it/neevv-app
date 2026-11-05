import type { BOQ, Layout, RoomInterior, FurnitureItem } from '../types';
import type { Takeoff } from './quantityTakeoff';
import { wallTileBand, floorModule, skirtingMm, wallFinishIsTile, cleanFinishName } from './interiorSpecs';

/**
 * Material list: what to buy, in purchase units (bags, boxes, sheets, litres, coils), with wastage and a
 * material-only rate. Quantities come from the same take-off as the BOQ, so the list and the BOQ agree;
 * the difference between the two totals is labour, fixing and the contractor's margin.
 * Rates are typical 2025 Indian market prices (material only) and are editable on screen.
 */
export interface MaterialLine { group: string; item: string; qty: number; unit: string; rate: number; basis: string }

const M2_PER_SQFT = 0.092903;
const ceil = (v: number, step = 1) => Math.ceil(v / step - 1e-9) * step;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Merges lines with the same group + item (summing quantities), keeping first-seen order. */
function merge(lines: MaterialLine[], discrete: (l: MaterialLine) => boolean): MaterialLine[] {
  const map = new Map<string, MaterialLine>();
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const k = `${l.group}|${l.item}|${l.unit}|${l.rate}`;
    const prev = map.get(k);
    if (prev) prev.qty += l.qty; else map.set(k, { ...l });
  }
  return [...map.values()].map(l => ({ ...l, qty: discrete(l) ? ceil(l.qty) : r1(l.qty) }));
}
const DISCRETE = /bag|box|sheet|nos|coil|board|set|pair|litre|tin|kg|pcs|roll/i;
const isDiscrete = (l: MaterialLine) => DISCRETE.test(l.unit);

/* ── tiles ── */
function tileBoxCoverageM2(w: number, h: number): number {
  const a = (w * h) / 1e6;
  const perBox = a >= 1.4 ? 1 : a >= 0.7 ? 2 : a >= 0.5 ? 3 : a >= 0.3 ? 4 : a >= 0.17 ? 8 : a >= 0.08 ? 11 : 16;
  return Math.max(a, a * perBox);
}
function tileLines(group: string, label: string, areaM2: number, w: number, h: number, ratePerM2: number, wet: boolean, plank: boolean): MaterialLine[] {
  if (!(areaM2 > 0)) return [];
  const cov = tileBoxCoverageM2(w, h), withWaste = areaM2 * (plank ? 1.05 : 1.08);
  const out: MaterialLine[] = [{ group, item: `${label} ${w}×${h} mm`, qty: withWaste / cov, unit: plank ? 'box (pack)' : 'box', rate: Math.round(ratePerM2 * cov), basis: `${r1(areaM2)} m² + ${plank ? 5 : 8}% cutting, ${r1(cov)} m²/box` }];
  if (!plank) {
    out.push({ group, item: 'Tile adhesive (polymer, 20 kg)', qty: areaM2 / 3.5, unit: 'bag', rate: 380, basis: `${r1(areaM2)} m² @ 3.5 m²/bag` });
    out.push({ group, item: wet ? 'Epoxy grout' : 'Cement grout', qty: areaM2 * (wet ? 0.35 : 0.3), unit: 'kg', rate: wet ? 450 : 90, basis: `${wet ? 0.35 : 0.3} kg/m²` });
  } else out.push({ group, item: 'Underlay foam 2 mm', qty: withWaste, unit: 'm²', rate: 45, basis: 'under planks' });
  return out;
}

/* ── paint ── */
function paintLines(group: string, wallM2: number, ceilingM2: number, exteriorM2 = 0): MaterialLine[] {
  const inner = wallM2 + ceilingM2;
  const out: MaterialLine[] = [];
  if (inner > 0) {
    out.push({ group, item: 'Wall putty (40 kg)', qty: (inner * 1.0) / 40, unit: 'bag', rate: 750, basis: `${r1(inner)} m² @ 1 kg/m² (2 coats)` });
    out.push({ group, item: 'Interior primer', qty: inner / 10, unit: 'litre', rate: 180, basis: '10 m²/litre' });
    if (wallM2 > 0) out.push({ group, item: 'Interior emulsion (walls)', qty: wallM2 * 0.14, unit: 'litre', rate: 320, basis: '2 coats, 0.14 L/m²' });
    if (ceilingM2 > 0) out.push({ group, item: 'Ceiling white emulsion', qty: ceilingM2 * 0.12, unit: 'litre', rate: 220, basis: '2 coats, 0.12 L/m²' });
  }
  if (exteriorM2 > 0) {
    out.push({ group, item: 'Exterior primer', qty: exteriorM2 / 8, unit: 'litre', rate: 220, basis: '8 m²/litre' });
    out.push({ group, item: 'Exterior emulsion', qty: exteriorM2 * 0.18, unit: 'litre', rate: 400, basis: '2 coats, 0.18 L/m²' });
  }
  return out;
}

/* ── electrical ── */
function wiringLines(group: string, light: number, socket: number, ac: number, data: number, boards: number): MaterialLine[] {
  const pts = light + socket + ac + data;
  if (!(pts > 0)) return [];
  return [
    { group, item: 'FRLS Cu wire 1.5 sq mm (lights, fans)', qty: (light * 10) / 90, unit: 'coil 90 m', rate: 2200, basis: '10 m per point' },
    { group, item: 'FRLS Cu wire 2.5 sq mm (sockets)', qty: (socket * 12) / 90, unit: 'coil 90 m', rate: 3500, basis: '12 m per point' },
    { group, item: 'FRLS Cu wire 4 sq mm (AC)', qty: (ac * 15) / 90, unit: 'coil 90 m', rate: 5200, basis: '15 m per AC point' },
    { group, item: 'Cat6 cable', qty: data * 15, unit: 'm', rate: 28, basis: '15 m per data point' },
    { group, item: 'PVC conduit 25 mm', qty: pts * 6, unit: 'm', rate: 18, basis: '6 m per point' },
    { group, item: 'Modular switches & sockets', qty: light + socket + ac + data, unit: 'nos', rate: 140, basis: 'one module per point' },
    { group, item: 'Switch boxes + cover plates', qty: Math.max(boards, Math.ceil(pts / 4)), unit: 'set', rate: 260, basis: 'one per board' },
  ];
}

/* ── woodwork ── */
const BUILT_IN = new Set(['wardrobe', 'kitchen_cabinet', 'tv_unit', 'crockery', 'bookshelf', 'shoe_rack', 'pooja_unit', 'bar_unit', 'dressing']);
const BOUGHT = /sink|chimney|hob|cooktop|countertop|mirror|towel|rack holder|faucet|appliance|refrigerator/i;
function builtInLines(group: string, f: FurnitureItem): MaterialLine[] {
  const w = f.widthMM / 1000, d = f.depthMM / 1000, h = f.heightMM / 1000;
  const shelves = Math.max(1, Math.floor(h / 0.4) - 1), parts = Math.max(0, Math.ceil(w / 0.9) - 1);
  const carcass = 2 * d * h + 2 * w * d + shelves * w * d + parts * d * h, shutters = w * h;
  const ply18 = (carcass + shutters) * 1.12, nShut = Math.max(1, Math.ceil(w / 0.5)), hingesPer = h > 1.5 ? 3 : 2;
  const drawers = f.category === 'kitchen_cabinet' && h < 1.2 ? Math.floor(w / 0.6) : f.category === 'wardrobe' ? 2 : f.category === 'tv_unit' ? 2 : 0;
  const tag = f.name.replace(/\s*[—–-]\s.*$/, '');
  return [
    { group, item: '18 mm BWP plywood (8×4 ft)', qty: ply18 / 2.97, unit: 'sheet', rate: 3200, basis: `${tag}: carcass + shutters ${r1(ply18)} m²` },
    { group, item: '6 mm plywood back (8×4 ft)', qty: (w * h * 1.1) / 2.97, unit: 'sheet', rate: 1300, basis: tag },
    { group, item: '1 mm decorative laminate (8×4 ft)', qty: ((shutters + d * h) * 1.15) / 2.97, unit: 'sheet', rate: 1600, basis: `${tag}: shutters + exposed side` },
    { group, item: '0.8 mm inner liner laminate (8×4 ft)', qty: (carcass * 1.6 * 1.1) / 2.97, unit: 'sheet', rate: 700, basis: tag },
    { group, item: 'Edge banding tape', qty: ply18 * 2.5, unit: 'm', rate: 18, basis: tag },
    { group, item: 'Soft-close hinges', qty: nShut * hingesPer, unit: 'nos', rate: 180, basis: `${tag}: ${nShut} shutters` },
    { group, item: 'Handles / knobs', qty: nShut + drawers, unit: 'nos', rate: 250, basis: tag },
    ...(drawers ? [{ group, item: 'Telescopic channels (pair)', qty: drawers, unit: 'pair', rate: 650, basis: `${tag}: ${drawers} drawers` }] : []),
    { group, item: 'Fevicol / screws / sundries', qty: 1, unit: 'lot', rate: Math.round(350 + ply18 * 120), basis: tag },
  ];
}

/* ───────────────────────── interior ───────────────────────── */
export function interiorMaterialList(rooms: RoomInterior[], layout: Layout, clear?: Record<string, { width: number; depth: number }>): MaterialLine[] {
  const lines: MaterialLine[] = [];
  const dims = (id: string) => clear?.[id] ?? (() => { for (const f of layout.floors) for (const r of f.rooms) if (r.id === id) return { width: r.width, depth: r.depth }; return { width: 3.5, depth: 3.2 }; })();
  for (const room of rooms) {
    const { width, depth } = dims(room.roomId), area = width * depth, perim = 2 * (width + depth), wallFactor = 0.85; // openings
    const ceilM = (room.ceilingHeight > 1500 ? room.ceilingHeight : 2700) / 1000;
    const wet = room.roomType === 'bathroom' || room.roomType === 'kitchen';
    // floor
    const mod = floorModule(room), floorMatM2 = room.flooring.ratePerUnit / M2_PER_SQFT * 0.62;
    lines.push(...tileLines('Flooring & wall tiles', mod.plank ? 'Wood-look planks' : 'Floor tiles', area, mod.w, mod.h, floorMatM2, wet, mod.plank));
    const sk = skirtingMm(room);
    if (sk > 0) lines.push({ group: 'Flooring & wall tiles', item: `Skirting ${sk} mm (cut from floor tile)`, qty: perim * 3.281, unit: 'rft', rate: 40, basis: 'room perimeter' });
    // wall tiles
    const band = wallTileBand(room);
    const tileM2 = band ? perim * wallFactor * ((Math.min(band.toMm / 1000, ceilM) - band.fromMm / 1000)) : 0;
    if (band && tileM2 > 0) {
      const tileRate = (wallFinishIsTile(room) ? room.wallFinish.ratePerUnit : 110) / M2_PER_SQFT * 0.62;
      lines.push(...tileLines('Flooring & wall tiles', `Wall tiles — ${wallFinishIsTile(room) ? cleanFinishName(room.wallFinish.name) : 'ceramic'}`, tileM2, 300, 600, tileRate, true, false));
    }
    if (room.roomType === 'bathroom') lines.push({ group: 'Waterproofing', item: 'Polymer cementitious waterproofing', qty: (area + perim * 0.3) * 1.6, unit: 'kg', rate: 140, basis: 'floor + 300 mm up walls, 2 coats @ 1.6 kg/m²' });
    // paint
    const wallM2 = Math.max(0, perim * ceilM * wallFactor - tileM2);
    lines.push(...paintLines('Paint', wallM2, area));
    // ceiling
    if (room.ceilingType !== 'plain') {
      const fc = room.ceilingType === 'false_ceiling_peripheral' ? area * 0.6 : area;
      if (room.ceilingType === 'wooden_ceiling') lines.push({ group: 'False ceiling', item: 'Wooden ceiling panels (veneered MDF)', qty: fc * 1.1, unit: 'm²', rate: 950, basis: `${r1(fc)} m² + 10%` });
      else lines.push({ group: 'False ceiling', item: 'Gypsum board 12.5 mm (1.8×1.2 m)', qty: (fc * 1.1) / 2.16, unit: 'board', rate: 520, basis: `${r1(fc)} m² + 10%` });
      lines.push({ group: 'False ceiling', item: 'GI framing (perimeter, ceiling & intermediate channels)', qty: fc * 2.6, unit: 'm', rate: 45, basis: '2.6 m per m²' });
      lines.push({ group: 'False ceiling', item: 'Jointing compound + tape', qty: fc * 0.4, unit: 'kg', rate: 30, basis: '0.4 kg/m²' });
      lines.push({ group: 'False ceiling', item: 'Drywall screws (box of 1000)', qty: (fc * 15) / 1000, unit: 'box', rate: 450, basis: '15 per m²' });
    }
    // woodwork and bought items (only what is selected, as in the drawings and BOQ)
    for (const f of room.furniture.filter(x => x.defaultSelected === true)) {
      if (BUILT_IN.has(f.category) && !BOUGHT.test(f.name)) lines.push(...builtInLines('Woodwork (built-in)', f));
      else lines.push({ group: 'Furniture & fittings (bought)', item: f.name.replace(/\s*[—–-]\s.*$/, ''), qty: 1, unit: 'nos', rate: Math.round(f.estimatedCost), basis: `${room.roomName}; ${f.material ?? ''}`.slice(0, 60) });
    }
    // electrical
    const ep = room.electricalPoints;
    lines.push(...wiringLines('Electrical', ep.lightPoints + ep.fanPoints, ep.sockets, ep.acPoints, ep.dataPoints, ep.switches));
    // plumbing (as the interior BOQ)
    if (room.roomType === 'bathroom') lines.push({ group: 'Plumbing fittings', item: 'CP fittings & fixtures set (bath)', qty: 1, unit: 'set', rate: 25000, basis: room.roomName });
    if (room.roomType === 'kitchen') lines.push({ group: 'Plumbing fittings', item: 'Kitchen sink + fittings', qty: 1, unit: 'set', rate: 12000, basis: room.roomName });
  }
  return merge(lines, isDiscrete);
}

/* ───────────────────────── building ───────────────────────── */
export function buildingMaterialList(boq: BOQ, steelByDia?: { diaMm: number; totalWeightKg: number }[]): MaterialLine[] {
  const t = (boq as BOQ & { takeoff?: Takeoff }).takeoff, lines: MaterialLine[] = [];
  const G = { str: 'Structure & masonry', fin: 'Flooring & wall tiles', wp: 'Waterproofing', paint: 'Paint', el: 'Electrical', items: 'Doors, windows & fixtures (supply as BOQ)' };
  lines.push({ group: G.str, item: 'Cement OPC 53 / PPC (50 kg)', qty: boq.cementBags, unit: 'bag', rate: 380, basis: 'concrete, mortar, plaster (BOQ)' });
  if (steelByDia?.length) for (const s of steelByDia) lines.push({ group: G.str, item: `TMT steel Fe500D ${s.diaMm} mm`, qty: s.totalWeightKg, unit: 'kg', rate: 72, basis: 'bar bending schedule' });
  else lines.push({ group: G.str, item: 'TMT steel Fe500D', qty: boq.steelWeightMT * 1000, unit: 'kg', rate: 72, basis: 'BOQ steel' });
  lines.push({ group: G.str, item: 'Binding wire (18 gauge)', qty: boq.steelWeightMT * 9, unit: 'kg', rate: 75, basis: '9 kg per tonne of steel' });
  lines.push({ group: G.str, item: 'Bricks (red clay, class A)', qty: boq.brickCount, unit: 'nos', rate: 8, basis: 'masonry (BOQ)' });
  lines.push({ group: G.str, item: 'Sand (M-sand / river)', qty: boq.sandCuM, unit: 'm³', rate: 2200, basis: 'concrete, mortar, plaster (BOQ)' });
  lines.push({ group: G.str, item: 'Coarse aggregate 20 mm', qty: boq.aggregateCuM, unit: 'm³', rate: 1600, basis: 'concrete (BOQ)' });
  if (t) {
    lines.push(...tileLines(G.fin, 'Vitrified floor tiles', t.floorFinish.vitrifiedSqM, 600, 600, 550, false, false));
    lines.push(...tileLines(G.fin, 'Anti-skid floor tiles', t.floorFinish.antiSkidSqM + t.floorFinish.balconySqM, 300, 300, 450, true, false));
    lines.push(...tileLines(G.fin, `Bath wall tiles (to ${t.bathTileHeightM} m)`, t.bathWallTileSqM, 300, 600, 420, true, false));
    lines.push(...tileLines(G.fin, 'Kitchen dado tiles', t.kitchenDadoSqM, 300, 600, 420, true, false));
    if (t.floorFinish.stairTreads > 0) lines.push({ group: G.fin, item: 'Granite stair treads (polished)', qty: t.floorFinish.stairTreads, unit: 'nos', rate: 1200, basis: 'stair (BOQ)' });
    if (t.kitchenCounterRmt > 0) lines.push({ group: G.fin, item: 'Granite kitchen counter 20 mm', qty: t.kitchenCounterRmt, unit: 'rmt', rate: 2800, basis: 'kitchen counter (BOQ)' });
    lines.push(...paintLines(G.paint, Math.max(0, t.internalPlasterSqM - t.bathWallTileSqM - t.kitchenDadoSqM), t.ceilingSqM, t.externalPlasterSqM));
  }
  if (boq.waterproofingAreaSqM > 0) lines.push({ group: G.wp, item: 'Polymer cementitious waterproofing', qty: boq.waterproofingAreaSqM * 1.6, unit: 'kg', rate: 140, basis: `${r1(boq.waterproofingAreaSqM)} m² @ 1.6 kg/m²` });
  const pts = boq.electricalPoints || 0;
  lines.push(...wiringLines(G.el, Math.round(pts * 0.55), Math.round(pts * 0.35), Math.round(pts * 0.06), Math.round(pts * 0.04), Math.ceil(pts / 5)));
  // supply items priced as in the BOQ (doors, windows, sanitary and electrical fixtures)
  const FIX = /EWC|wash basin|kitchen sink|shower|tap|bib|health faucet|geyser|water heater|exhaust fan|ceiling fan|light fitting|DB|MCB|pump|tank|door|window|ventilator|shutter|grill|railing|gate/i;
  for (const li of boq.lineItems.filter(l => l.category === 'doors_windows' || ((l.category === 'mep' || l.category === 'misc') && FIX.test(l.description))))
    lines.push({ group: G.items, item: li.description, qty: li.quantity, unit: li.unit, rate: li.rate, basis: 'BOQ rate (supply + fixing)' });
  return merge(lines, isDiscrete);
}

export function materialTotal(lines: MaterialLine[]): number { return lines.reduce((s, l) => s + l.qty * l.rate, 0); }

export function materialCSV(lines: MaterialLine[], title: string): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [[title], ['Group', 'Material', 'Quantity', 'Unit', 'Rate (INR)', 'Amount (INR)', 'Basis'], ...lines.map(l => [l.group, l.item, l.qty, l.unit, l.rate, Math.round(l.qty * l.rate), l.basis]), ['', 'TOTAL (materials)', '', '', '', Math.round(materialTotal(lines)), '']];
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
