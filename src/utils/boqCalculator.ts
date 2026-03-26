import { BOQ, BOQLineItem, DoorScheduleItem, WindowScheduleItem, Layout } from '../types';

const SQM_TO_SQFT = 10.764;

/**
 * Full Bill of Quantities with itemized costs, door/window schedules,
 * and concrete breakdown. Rates based on 2024-25 Indian market averages.
 */
export function calculateBOQ(layout: Layout, numFloors: number): BOQ {
  const builtUpPerFloor = layout.builtUpAreaSqM;
  const totalBuiltUpSqM = builtUpPerFloor * numFloors;
  const totalBuiltUpSqFt = totalBuiltUpSqM * SQM_TO_SQFT;
  const perimeter = 2 * (layout.buildableWidthM + layout.buildableDepthM);
  const wallHeight = 3.0;
  const allRooms = layout.floors.flatMap(f => f.rooms);

  // ────── CONCRETE BREAKDOWN ──────
  const foundationConcrete = +(builtUpPerFloor * SQM_TO_SQFT * 0.04).toFixed(2);
  const numColumnsPerFloor = Math.ceil(builtUpPerFloor / 12);
  const columnConcrete = +(numColumnsPerFloor * numFloors * 0.23 * 0.30 * 3.0).toFixed(2);
  const beamRun = perimeter * 1.5;
  const beamConcrete = +(beamRun * 0.23 * 0.40 * numFloors).toFixed(2);
  const slabConcrete = +(builtUpPerFloor * 0.125 * numFloors).toFixed(2);
  const stairFloors = numFloors - 1 > 0 ? numFloors - 1 : 0.5;
  const stairConcrete = +(0.15 * 16 * stairFloors).toFixed(2);
  const lintelConcrete = +(slabConcrete * 0.05).toFixed(2);
  const totalConcrete = +(foundationConcrete + columnConcrete + beamConcrete + slabConcrete + stairConcrete + lintelConcrete).toFixed(2);

  // ────── STEEL ──────
  const steelKg = totalBuiltUpSqFt * 4.5;
  const steelMT = +(steelKg / 1000).toFixed(2);

  // ────── MASONRY ──────
  const externalWallArea = perimeter * wallHeight * numFloors;
  const internalWallArea = externalWallArea * 0.7;
  const totalWallArea = externalWallArea + internalWallArea;
  const netWallArea = totalWallArea * 0.85; // 15% openings deduction
  const brickCount = Math.ceil((netWallArea / 10) * 480);

  // ────── CEMENT / SAND / AGGREGATE ──────
  const cementForConcrete = totalConcrete * 8;
  const cementForBrickwork = brickCount / 500;
  const plasteringArea = +(netWallArea * 2).toFixed(0); // both sides
  const cementForPlastering = plasteringArea * 0.5;
  const totalCement = Math.ceil(cementForConcrete + cementForBrickwork + cementForPlastering);
  const sandCuM = +(totalCement * 0.04).toFixed(1);
  const aggregateCuM = +(totalConcrete * 0.8).toFixed(1);

  // ────── FINISHING ──────
  const paintArea = Math.round(netWallArea * 2 + totalBuiltUpSqM);
  const flooringArea = Math.round(totalBuiltUpSqM * 0.85);

  // ────── WATERPROOFING ──────
  const toilets = allRooms.filter(r => r.type === 'toilet');
  const kitchens = allRooms.filter(r => r.type === 'kitchen');
  const toiletArea = toilets.reduce((s, r) => s + r.width * r.depth, 0);
  const kitchenArea = kitchens.reduce((s, r) => s + r.width * r.depth, 0);
  const terrace = builtUpPerFloor;
  const waterproofingArea = +(toiletArea + kitchenArea + terrace).toFixed(1);

  // ────── MEP ──────
  const plumbingPoints = toilets.length * 5 + kitchens.length * 3;
  const pointMap: Record<string, number> = {
    master_bedroom: 8, bedroom: 6, hall: 10, kitchen: 6,
    toilet: 3, dining: 4, puja: 2, passage: 2,
    balcony: 2, store: 2, utility: 3, parking: 2, entrance: 2, staircase: 2,
  };
  const electricalPoints = allRooms.reduce((sum, r) => sum + (pointMap[r.type] || 2), 0);

  // ────── DOOR SCHEDULE ──────
  const doorSchedule: DoorScheduleItem[] = [];
  let dIdx = 1;
  // Main entrance
  doorSchedule.push({ mark: `D${dIdx++}`, location: 'Main Entrance', type: 'Teak Panel', widthMM: 1050, heightMM: 2100, qty: 1, material: 'Teak Wood' });
  // Bedrooms
  const bedrooms = allRooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom');
  bedrooms.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' });
  });
  // Toilets
  toilets.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'FRP/PVC', widthMM: 600, heightMM: 2000, qty: 1, material: 'FRP' });
  });
  // Kitchen
  kitchens.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Flush', widthMM: 900, heightMM: 2100, qty: 1, material: 'BWR Plywood' });
  });
  // Puja
  const pujas = allRooms.filter(r => r.type === 'puja');
  pujas.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Glass Panel', widthMM: 750, heightMM: 2100, qty: 1, material: 'Teak + Glass' });
  });
  // Balcony sliding
  const balconies = allRooms.filter(r => r.type === 'balcony');
  balconies.forEach(r => {
    doorSchedule.push({ mark: `D${dIdx++}`, location: r.name, type: 'Sliding UPVC', widthMM: 1800, heightMM: 2100, qty: 1, material: 'UPVC + Glass' });
  });

  // ────── WINDOW SCHEDULE ──────
  const windowSchedule: WindowScheduleItem[] = [];
  let wIdx = 1;
  bedrooms.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' });
  });
  const halls = allRooms.filter(r => r.type === 'hall');
  halls.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 3-Track', widthMM: 1800, heightMM: 1500, qty: 1, material: 'UPVC + Glass' });
  });
  kitchens.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Casement', widthMM: 900, heightMM: 900, qty: 1, material: 'UPVC' });
  });
  toilets.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Ventilator', widthMM: 600, heightMM: 450, qty: 1, material: 'UPVC' });
  });
  const dinings = allRooms.filter(r => r.type === 'dining');
  dinings.forEach(r => {
    windowSchedule.push({ mark: `W${wIdx++}`, location: r.name, type: 'Sliding 2-Track', widthMM: 1200, heightMM: 1200, qty: 1, material: 'UPVC + Glass' });
  });

  // ────── LINE ITEMS WITH RATES (2024-25 avg.) ──────
  const lineItems: BOQLineItem[] = [];
  let sno = 0;

  const add = (desc: string, qty: number, unit: string, rate: number, cat: BOQLineItem['category'], remark?: string) => {
    sno++;
    lineItems.push({ sno, description: desc, quantity: +qty.toFixed(2), unit, rate, amount: +(qty * rate).toFixed(0), category: cat, remark });
  };

  // Structural
  add('Excavation for Foundation (1.2m depth)', +(builtUpPerFloor * 1.2).toFixed(2), 'm³', 350, 'structural', 'Mechanical excavation');
  add('PCC (1:4:8) – Foundation Bed', +(builtUpPerFloor * 0.075).toFixed(2), 'm³', 5500, 'structural', '75mm thick');
  add('RCC Foundation (M20)', foundationConcrete, 'm³', 7500, 'structural', 'Isolated footings');
  add('RCC Columns (M20)', columnConcrete, 'm³', 8000, 'structural', '230×300mm');
  add('RCC Beams (M20)', beamConcrete, 'm³', 8000, 'structural', '230×400mm');
  add('RCC Slab (M20, 125mm)', slabConcrete, 'm³', 7500, 'structural', '125mm thick');
  add('RCC Staircase (M20)', stairConcrete, 'm³', 9000, 'structural', 'Waist slab type');
  add('RCC Lintels & Chajjas', lintelConcrete, 'm³', 8000, 'structural');
  add('Reinforcement Steel (Fe500D)', steelMT, 'MT', 72000, 'structural', 'Incl. binding wire');

  // Masonry
  add('Brick Masonry (230mm, CM 1:6)', brickCount, 'nos', 12, 'masonry', 'AAC/Clay');
  add('Internal Plastering (CM 1:4, 12mm)', plasteringArea * 0.5, 'm²', 45, 'masonry', 'Internal walls');
  add('External Plastering (CM 1:4, 20mm)', +(externalWallArea * 0.85).toFixed(0), 'm²', 55, 'masonry', 'External walls');

  // Finishing
  add('Vitrified Tile Flooring (600×600)', flooringArea, 'm²', 120, 'finishing', 'Double charge');
  add('Anti-Skid Tiles – Toilets', +toiletArea.toFixed(1), 'm²', 90, 'finishing');
  add('Kitchen Wall Dado Tiles (up to 600mm)', +(kitchenArea * 0.6).toFixed(1), 'm²', 85, 'finishing', 'Ceramic');
  add('Toilet Wall Tiles (full ht)', +(toiletArea * 2.4).toFixed(1), 'm²', 90, 'finishing', 'Ceramic 300×600');
  add('Interior Painting (Acrylic)', paintArea, 'm²', 30, 'finishing', '2 coats + primer');
  add('Exterior Painting (Apex/Weather Shield)', +(externalWallArea * 0.85).toFixed(0), 'm²', 40, 'finishing', '2 coats');
  add('Waterproofing (Toilets + Terrace)', waterproofingArea, 'm²', 85, 'misc', 'APP membrane');
  add('Parapet Wall (100mm, 1m ht)', +(perimeter * 1.0).toFixed(1), 'm²', 350, 'masonry', 'Terrace level');

  // Doors & Windows
  doorSchedule.forEach(d => {
    const unitRate = d.material === 'Teak Wood' ? 18000 :
                     d.material === 'FRP' ? 3500 :
                     d.material === 'UPVC + Glass' ? 15000 :
                     d.material === 'Teak + Glass' ? 12000 : 8000;
    add(`Door ${d.mark}: ${d.type} (${d.widthMM}×${d.heightMM})`, d.qty, 'nos', unitRate, 'doors_windows', d.location);
  });
  windowSchedule.forEach(w => {
    const unitRate = w.type === 'Ventilator' ? 2500 :
                     w.widthMM >= 1800 ? 12000 : 8000;
    add(`Window ${w.mark}: ${w.type} (${w.widthMM}×${w.heightMM})`, w.qty, 'nos', unitRate, 'doors_windows', w.location);
  });

  // MEP
  add('Plumbing – Supply + Drainage', plumbingPoints, 'points', 3500, 'mep', 'CPVC + SWR');
  add('Electrical Wiring + Points', electricalPoints, 'points', 2200, 'mep', 'Finolex/Polycab');
  add('Electrical Panel Board (MCB/RCCB)', numFloors, 'nos', 8000, 'mep', 'Per floor');
  add('Overhead Water Tank (Syntax)', 1, 'nos', 12000, 'mep', '1000L');
  add('Sump (RCC, 2000L)', 1, 'nos', 25000, 'mep', 'Underground');

  // Misc
  add('MS Staircase Railing', +(3.0 * (numFloors - 1 > 0 ? numFloors - 1 : 1) * 2).toFixed(1), 'Rmt', 1800, 'misc', 'MS + SS top rail');
  add('MS Main Gate (5ft wide)', 1, 'nos', 35000, 'misc', 'Fabricated');
  add('Compound Wall (1.5m ht)', +(perimeter * 0.7).toFixed(1), 'Rmt', 2800, 'misc', 'Brick + plaster');

  const totalCost = lineItems.reduce((s, li) => s + li.amount, 0);
  const costPerSqFt = +(totalCost / totalBuiltUpSqFt).toFixed(0);

  return {
    totalBuiltUpAreaSqFt: Math.round(totalBuiltUpSqFt),
    totalBuiltUpAreaSqM: +(totalBuiltUpSqM).toFixed(2),
    numFloors,
    concreteVolumeM3: totalConcrete,
    steelWeightMT: steelMT,
    brickCount,
    cementBags: totalCement,
    sandCuM,
    aggregateCuM,
    paintAreaSqM: paintArea,
    flooringAreaSqM: flooringArea,
    plumbingPoints,
    electricalPoints,
    lineItems,
    doorSchedule,
    windowSchedule,
    totalCost,
    costPerSqFt,
    concreteBreakdown: {
      foundation: foundationConcrete,
      columns: columnConcrete,
      beams: beamConcrete,
      slabs: slabConcrete,
      staircase: stairConcrete,
      lintels: lintelConcrete,
    },
    waterproofingAreaSqM: waterproofingArea,
    plasteringAreaSqM: plasteringArea,
  };
}
