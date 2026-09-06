import { Layout, OfficeRequirements, CustomRateSheet } from '../types';

const SQM_TO_SQFT = 10.764;

export interface OfficeBOQLineItem {
  sno: number;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  category: 'civil' | 'furniture' | 'partitions' | 'ceiling' | 'flooring' | 'electrical' | 'data_network' | 'hvac' | 'fire_safety' | 'plumbing' | 'painting' | 'signage' | 'misc';
  remark?: string;
}

export interface OfficeBOQ {
  totalAreaSqFt: number;
  totalAreaSqM: number;
  numFloors: number;
  employeeCount: number;
  workstationCount: number;
  lineItems: OfficeBOQLineItem[];
  totalCost: number;
  costPerSqFt: number;
  costBreakdown: {
    civil: number;
    furniture: number;
    partitions: number;
    ceiling: number;
    flooring: number;
    electrical: number;
    dataNetwork: number;
    hvac: number;
    fireSafety: number;
    plumbing: number;
    painting: number;
    signage: number;
    misc: number;
  };
}

/**
 * Resolve a rate: use custom rate if provided, else default.
 * Matches by material/labour name (case-insensitive substring match).
 * Mirrors the residential resolveRate() pattern in boqCalculator.ts.
 */
function resolveRate(defaultRate: number, itemKey: string, customRates?: CustomRateSheet | null): number {
  if (!customRates) return defaultRate;

  for (const mat of customRates.materials) {
    if (mat.customRate !== undefined && mat.customRate !== null) {
      if (itemKey.toLowerCase().includes(mat.name.toLowerCase()) ||
          mat.name.toLowerCase().includes(itemKey.toLowerCase())) {
        return mat.customRate;
      }
    }
  }

  for (const lab of customRates.labour) {
    if (lab.customRate !== undefined && lab.customRate !== null) {
      if (itemKey.toLowerCase().includes(lab.trade.toLowerCase()) ||
          lab.trade.toLowerCase().includes(itemKey.toLowerCase())) {
        return lab.customRate;
      }
    }
  }

  return defaultRate;
}

/** Budget multipliers applied to furniture and finish-quality rates. */
function budgetMultiplier(budget: OfficeRequirements['budget']): number {
  switch (budget) {
    case 'economy': return 0.7;
    case 'standard': return 1.0;
    case 'premium': return 1.4;
    case 'luxury': return 1.8;
    default: return 1.0;
  }
}

/**
 * Full Office Fitout Bill of Quantities with itemized line items covering civil,
 * furniture, partitions, ceiling, flooring, MEP, fire safety, painting and signage.
 * Rates based on 2024-25 Indian commercial fitout market averages.
 * Pass customRates to override default rates; null/undefined uses defaults.
 */
export function calculateOfficeBOQ(
  layout: Layout,
  officeReq: OfficeRequirements,
  customRates?: CustomRateSheet | null,
): OfficeBOQ {
  const totalAreaSqM = layout.builtUpAreaSqM;
  const totalAreaSqFt = +(totalAreaSqM * SQM_TO_SQFT).toFixed(0);
  const numFloors = officeReq.floors.length || layout.floors.length || 1;
  const areaPerFloorSqFt = totalAreaSqFt / numFloors;

  const mult = budgetMultiplier(officeReq.budget);

  // ────── PROGRAM TOTALS (sum across floors) ──────
  const workstationCount = officeReq.floors.reduce((s, f) => s + (f.workstations || 0), 0);
  const managerCabins = officeReq.floors.reduce((s, f) => s + (f.managerCabins || 0), 0);
  const directorCabins = officeReq.floors.reduce((s, f) => s + (f.directorCabins || 0), 0);
  const mdCabins = officeReq.floors.reduce((s, f) => s + (f.mdCabin ? 1 : 0), 0);
  const conferenceSmall = officeReq.floors.reduce((s, f) => s + (f.conferenceSmall || 0), 0);
  const conferenceLarge = officeReq.floors.reduce((s, f) => s + (f.conferenceLarge || 0), 0);
  const boardRooms = officeReq.floors.reduce((s, f) => s + (f.boardRoom ? 1 : 0), 0);
  const receptions = officeReq.floors.reduce((s, f) => s + (f.hasReception ? 1 : 0), 0);
  const pantries = officeReq.floors.reduce((s, f) => s + (f.hasPantry ? 1 : 0), 0);
  const cafeterias = officeReq.floors.reduce((s, f) => s + (f.hasCafeteria ? 1 : 0), 0);
  const serverRooms = officeReq.floors.reduce((s, f) => s + (f.hasServerRoom ? 1 : 0), 0);
  const breakRooms = officeReq.floors.reduce((s, f) => s + (f.hasBreakRoom ? 1 : 0), 0);
  const cabinCount = managerCabins + directorCabins + mdCabins;
  const employeeCount = officeReq.employeeCount || workstationCount || 1;

  // Room area estimates (sqft) used to size partitions/ceiling/flooring per zone.
  const washrooms = 2 * numFloors; // male + female per floor (assumed)
  const wetAreaSqFt = pantries * 120 + cafeterias * 300 + washrooms * 80;
  const cabinAreaSqFt = managerCabins * 100 + directorCabins * 150 + mdCabins * 250;
  const conferenceAreaSqFt = conferenceSmall * 150 + conferenceLarge * 350 + boardRooms * 500;
  const openAreaSqFt = Math.max(0, areaPerFloorSqFt * numFloors - wetAreaSqFt - cabinAreaSqFt - conferenceAreaSqFt);

  // Glass partition run: perimeter of each cabin + conference room (approx via sqrt(area)*4*0.6 usable wall run)
  const glassPartitionRFT = +((Math.sqrt(cabinAreaSqFt || 1) * 4 * (cabinCount || 1) * 0.5) +
    (Math.sqrt(conferenceAreaSqFt || 1) * 4 * (conferenceSmall + conferenceLarge + boardRooms || 1) * 0.5)).toFixed(0);
  const gypsumPartitionRFT = +(glassPartitionRFT * 0.6).toFixed(0);
  const glassDoors = cabinCount + conferenceSmall + conferenceLarge + boardRooms + receptions;

  // MEP sizing
  const electricalPointsPerWorkstation = 4; // power + data provision
  const electricalPoints = workstationCount * electricalPointsPerWorkstation + cabinCount * 6 +
    (conferenceSmall + conferenceLarge + boardRooms) * 8 + receptions * 6;
  const dataPoints = workstationCount + cabinCount * 2 + (conferenceSmall + conferenceLarge + boardRooms) * 3;
  const floorBoxes = Math.ceil(workstationCount / 6);
  const ledPanels = Math.ceil(totalAreaSqFt / 80);
  const sprinklerHeads = Math.ceil(totalAreaSqFt / 150);
  const smokeDetectors = Math.ceil(totalAreaSqFt / 500);
  const fireExtinguishers = Math.max(numFloors * 4, Math.ceil(totalAreaSqFt / 1000) * 2);
  const exitSignage = numFloors * 4;
  const wifiAPs = Math.ceil(totalAreaSqFt / 1500);
  const coolingLoadTR = +(totalAreaSqFt / 130).toFixed(1); // ~130 sqft/TR commercial rule of thumb
  const vrvOutdoorUnits = Math.max(1, Math.ceil(coolingLoadTR / 9));
  const cassetteIndoorUnits = Math.ceil(totalAreaSqFt / 250);

  const lineItems: OfficeBOQLineItem[] = [];
  let sno = 0;

  const add = (
    desc: string,
    qty: number,
    unit: string,
    rate: number,
    cat: OfficeBOQLineItem['category'],
    remark?: string,
  ) => {
    const resolvedRate = resolveRate(rate, desc, customRates);
    sno++;
    lineItems.push({
      sno,
      description: desc,
      quantity: +qty.toFixed(2),
      unit,
      rate: resolvedRate,
      amount: +(qty * resolvedRate).toFixed(0),
      category: cat,
      remark,
    });
  };

  // ═══════════ A. CIVIL / SITE PREP ═══════════
  add('Demolition & Civil Prep (existing partitions/finishes removal)', totalAreaSqFt, 'sqft', 8, 'civil', 'Strip-out to shell');
  add('Wall Levelling & Surface Prep', totalAreaSqFt * 0.3, 'sqft', 12, 'civil', 'Plaster patch + primer prep');
  add('Raised Access Flooring (pedestal system, 600×600 panels)', workstationCount > 0 ? openAreaSqFt : 0, 'sqft', 220, 'civil', '150mm height, cable routing below');
  add('False Flooring Pedestal Adjustment / Leveling', serverRooms * 200, 'sqft', 350, 'civil', 'Higher load rating for server room');
  add('Core Cutting & Structural Openings', numFloors, 'LS', 8000, 'civil', 'For riser/shaft penetrations');

  // ═══════════ B. FURNITURE ═══════════
  add('Workstation Desk (120° / linear bench system)', workstationCount, 'nos', +(11000 * mult).toFixed(0), 'furniture', 'Laminate top, cable management');
  add('Ergonomic Task Chair', workstationCount, 'nos', +(8500 * mult).toFixed(0), 'furniture', 'Mesh back, adjustable arms');
  add('Manager Desk + Chair Set', managerCabins, 'set', +(28000 * mult).toFixed(0), 'furniture', 'Executive desk 1500×750mm');
  add('Director Desk + Chair Set', directorCabins, 'set', +(45000 * mult).toFixed(0), 'furniture', 'Executive desk 1800×900mm + visitor chairs');
  add('MD Cabin Furniture Set', mdCabins, 'set', +(85000 * mult).toFixed(0), 'furniture', 'Premium desk, credenza, seating');
  add('Conference Table (Small, 6-8 seater)', conferenceSmall, 'nos', +(35000 * mult).toFixed(0), 'furniture', 'Veneer finish + cable grommets');
  add('Conference Table (Large, 12-16 seater)', conferenceLarge, 'nos', +(75000 * mult).toFixed(0), 'furniture', 'Veneer finish + AV integration');
  add('Board Room Table (Premium, 20+ seater)', boardRooms, 'nos', +(150000 * mult).toFixed(0), 'furniture', 'Premium veneer / stone top');
  add('Conference / Meeting Chairs', (conferenceSmall * 8 + conferenceLarge * 16 + boardRooms * 20), 'nos', +(6500 * mult).toFixed(0), 'furniture', 'Visitor / meeting chair');
  add('Reception Desk', receptions, 'nos', +(65000 * mult).toFixed(0), 'furniture', 'Custom branded, backlit logo panel');
  add('Reception Waiting Lounge Seating', receptions * 6, 'nos', +(9000 * mult).toFixed(0), 'furniture', 'Sofa / lounge chairs');
  add('Pantry Counter & Cabinets', pantries, 'set', +(60000 * mult).toFixed(0), 'furniture', 'Modular counter, overhead + base units');
  add('Cafeteria / Break Room Tables & Chairs', (cafeterias + breakRooms) * 10, 'set', +(7000 * mult).toFixed(0), 'furniture', 'Table + 4 chair sets');
  add('Storage Cabinets / Filing Units', Math.ceil(employeeCount / 8), 'nos', +(9500 * mult).toFixed(0), 'furniture', 'Lockable, laminate finish');

  // ═══════════ C. PARTITIONS ═══════════
  add('Glass Partition (12mm toughened, framed)', glassPartitionRFT, 'sqft', 3500, 'partitions', 'Cabins + conference rooms');
  add('Gypsum Board Partition (double-skin, 75mm frame)', gypsumPartitionRFT, 'sqft', 180, 'partitions', 'Non-glazed internal partitions');
  add('Glass Doors (frameless / semi-framed, with hardware)', glassDoors, 'nos', 22000, 'partitions', 'Floor spring + patch fittings');
  add('Manifestation Film / Frosting on Glass', glassPartitionRFT * 0.2, 'sqft', 150, 'partitions', 'Privacy band at eye level');

  // ═══════════ D. CEILING ═══════════
  add('Grid False Ceiling (600×600 mineral fibre)', openAreaSqFt, 'sqft', 85, 'ceiling', 'Open workstation areas');
  add('Gypsum False Ceiling (plain, for cabins)', cabinAreaSqFt + conferenceAreaSqFt, 'sqft', 120, 'ceiling', 'Cabins & conference rooms');
  add('Ceiling Tile Replacement / Grid Repair', totalAreaSqFt * 0.05, 'sqft', 60, 'ceiling', 'Damaged tile allowance');
  add('Acoustic Ceiling Panels (Conference/Board Room)', conferenceAreaSqFt * 0.3, 'sqft', 220, 'ceiling', 'NRC-rated acoustic tiles');

  // ═══════════ E. FLOORING ═══════════
  add('Carpet Tiles (modular, 500×500)', +(openAreaSqFt * mult / mult).toFixed(0), 'sqft', +(120 * mult).toFixed(0), 'flooring', 'Open office & cabins');
  add('Vitrified Tile Flooring (Pantry/Washroom)', wetAreaSqFt, 'sqft', 90, 'flooring', 'Anti-skid, matt finish');
  add('Vinyl / LVT Flooring (Server Room / IT areas)', serverRooms * 200, 'sqft', 150, 'flooring', 'Anti-static vinyl');
  add('Floor Skirting (carpet/vinyl edge trim)', +(Math.sqrt(totalAreaSqFt) * 4 * numFloors).toFixed(0), 'rft', 45, 'flooring', 'Aluminium / rubber trim');

  // ═══════════ F. ELECTRICAL ═══════════
  add('Electrical Wiring per Point (power/data provision)', electricalPoints, 'points', 1800, 'electrical', 'Concealed copper, FR-LSH');
  add('MCB Distribution Board', numFloors * 2, 'nos', 15000, 'electrical', 'Per floor, power + light DB');
  add('UPS Wiring & Distribution', workstationCount, 'points', 900, 'electrical', 'Dedicated UPS line to desks');
  add('Floor Boxes (power + data, raised/carpet floor)', floorBoxes, 'nos', 2500, 'electrical', '4/6 module floor box');
  add('LED Panel Lights (2×2 recessed)', ledPanels, 'nos', 2200, 'electrical', '40W, 4000K, grid mount');
  add('Track / Accent Lighting (Reception & Cabins)', receptions * 6 + cabinCount * 3, 'nos', 1800, 'electrical', 'Spotlights on track');
  add('Earthing & Lightning Protection', numFloors, 'nos', 8000, 'electrical', 'Pipe + plate earthing per floor');
  add('DB Room Wiring & Cable Termination', numFloors, 'LS', 12000, 'electrical', 'Main + sub DB wiring');

  // ═══════════ G. DATA / NETWORK ═══════════
  add('CAT6A Structured Cabling per Point', dataPoints, 'points', 1500, 'data_network', 'Data + I/O box + termination');
  add('Patch Panel (24-port, rack mounted)', Math.ceil(dataPoints / 24), 'nos', 8000, 'data_network', '24-port CAT6A patch panel');
  add('Network Rack (42U, with accessories)', numFloors, 'nos', 45000, 'data_network', 'Includes PDU, cable manager');
  add('Cable Trays (GI, ceiling mounted)', +(totalAreaSqFt * 0.08).toFixed(0), 'rmt', 350, 'data_network', 'Perforated GI tray + supports');
  add('WiFi Access Points (Enterprise)', wifiAPs, 'nos', 5000, 'data_network', 'Ceiling mounted, PoE');
  add('Structured Cabling Testing & Certification', 1, 'LS', 15000, 'data_network', 'Fluke test report per point');

  // ═══════════ H. HVAC ═══════════
  add('VRV/VRF Outdoor Unit (8-10 TR)', vrvOutdoorUnits, 'nos', 350000, 'hvac', 'Heat pump, energy efficient');
  add('Cassette Indoor Unit (4-way, ceiling)', cassetteIndoorUnits, 'nos', 45000, 'hvac', '1.5-2 TR per unit');
  add('Ducting & Diffusers (Fresh Air / AHU)', totalAreaSqFt * 0.02, 'rmt', 1200, 'hvac', 'GI/PUF insulated duct');
  add('Copper Piping & Insulation (Refrigerant lines)', vrvOutdoorUnits * 25, 'rmt', 850, 'hvac', 'Copper with nitrile insulation');
  add('Thermostat / Zone Controller', cassetteIndoorUnits, 'nos', 3500, 'hvac', 'Wall-mounted digital controller');
  add('Fresh Air / Exhaust Fan System', numFloors, 'nos', 45000, 'hvac', 'Ducted exhaust for washrooms/pantry');

  // ═══════════ I. FIRE SAFETY ═══════════
  add('Sprinkler Heads (ceiling mounted)', sprinklerHeads, 'nos', 800, 'fire_safety', 'Pendant type, as per NBC');
  add('Smoke Detectors', smokeDetectors, 'nos', 1200, 'fire_safety', 'Photoelectric, addressable');
  add('Fire Extinguishers (ABC / CO2)', fireExtinguishers, 'nos', 2500, 'fire_safety', 'Wall mounted with signage');
  add('Exit / Emergency Signage', exitSignage, 'nos', 1500, 'fire_safety', 'LED illuminated, battery backup');
  add('Fire Alarm Panel & Hooters', numFloors, 'nos', 35000, 'fire_safety', 'Addressable main fire alarm panel');
  add('Fire Hose Reel Cabinet', numFloors, 'nos', 18000, 'fire_safety', 'As per local fire code');

  // ═══════════ J. PLUMBING ═══════════
  add('CP Fixtures for Washrooms', washrooms, 'set', 25000, 'plumbing', 'EWC, wash basin, fittings per washroom');
  add('Pantry Sink & Fittings', pantries, 'set', 8500, 'plumbing', 'SS sink + mixer tap');
  add('Water Purifier (RO, commercial capacity)', pantries + cafeterias, 'nos', 22000, 'plumbing', '25-50 LPH commercial RO');
  add('Geyser / Instant Water Heater', washrooms + pantries, 'nos', 6500, 'plumbing', '3-6L instant heater');

  // ═══════════ K. PAINTING ═══════════
  add('Wall Putty + Emulsion Paint (2 coats)', totalAreaSqFt * 1.5, 'sqft', 35, 'painting', 'Premium acrylic emulsion');
  add('Ceiling Paint (exposed / service areas)', totalAreaSqFt * 0.15, 'sqft', 22, 'painting', 'White ceiling paint, exposed grid areas');
  add('Accent Wall / Branding Paint Finish', receptions * 200, 'sqft', 65, 'painting', 'Textured / branded feature wall');

  // ═══════════ L. SIGNAGE ═══════════
  add('Room / Cabin Signage', cabinCount + conferenceSmall + conferenceLarge + boardRooms, 'nos', 1500, 'signage', 'Acrylic / SS nameplates');
  add('Wayfinding Signage', numFloors * 4, 'nos', 2000, 'signage', 'Directional signage per floor');
  add('Company Branding (Reception Logo Wall)', receptions, 'nos', 45000, 'signage', 'Backlit acrylic / metal letters');

  // ═══════════ M. MISCELLANEOUS ═══════════
  add('Housekeeping Setup (equipment & supplies)', 1, 'LS', 25000, 'misc', 'Initial housekeeping equipment');
  add('Pest Control (pre-occupancy treatment)', totalAreaSqFt, 'sqft', 5, 'misc', 'Anti-termite / pest treatment');

  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const contingency = +(subtotal * 0.05).toFixed(0);
  add('Contingency (5% of subtotal)', 1, 'LS', contingency, 'misc', 'Design & execution contingency buffer');

  const totalCost = lineItems.reduce((s, li) => s + li.amount, 0);
  const costPerSqFt = totalAreaSqFt > 0 ? Math.round(totalCost / totalAreaSqFt) : 0;

  const costBreakdown = {
    civil: 0,
    furniture: 0,
    partitions: 0,
    ceiling: 0,
    flooring: 0,
    electrical: 0,
    dataNetwork: 0,
    hvac: 0,
    fireSafety: 0,
    plumbing: 0,
    painting: 0,
    signage: 0,
    misc: 0,
  };

  for (const li of lineItems) {
    switch (li.category) {
      case 'civil': costBreakdown.civil += li.amount; break;
      case 'furniture': costBreakdown.furniture += li.amount; break;
      case 'partitions': costBreakdown.partitions += li.amount; break;
      case 'ceiling': costBreakdown.ceiling += li.amount; break;
      case 'flooring': costBreakdown.flooring += li.amount; break;
      case 'electrical': costBreakdown.electrical += li.amount; break;
      case 'data_network': costBreakdown.dataNetwork += li.amount; break;
      case 'hvac': costBreakdown.hvac += li.amount; break;
      case 'fire_safety': costBreakdown.fireSafety += li.amount; break;
      case 'plumbing': costBreakdown.plumbing += li.amount; break;
      case 'painting': costBreakdown.painting += li.amount; break;
      case 'signage': costBreakdown.signage += li.amount; break;
      case 'misc': costBreakdown.misc += li.amount; break;
    }
  }

  return {
    totalAreaSqFt,
    totalAreaSqM: +totalAreaSqM.toFixed(2),
    numFloors,
    employeeCount,
    workstationCount,
    lineItems,
    totalCost: Math.round(totalCost),
    costPerSqFt,
    costBreakdown,
  };
}
