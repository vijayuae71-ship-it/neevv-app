/**
 * Layout generation entry point — adapter from the neevv Architect Planner to the app's Layout model.
 *
 * The planner (src/utils/planning/architect.ts) is the single source of the residential layout.
 * This file only converts its options into `Layout` objects used by every downstream view
 * (drawings, structure, BBS, BOQ, validation). No layout geometry is invented here.
 */
import type { Column, FloorLayout, FloorProgram, Layout, NBCIssue, OpeningsSchedule, ProjectRequirements } from '../types';
import { planHome, type Brief, type PlanOption, type PlanResult } from './planning/architect';
import { calculateVastuScore } from './vastuEngine';

const SQFT = 10.7639;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function briefFromRequirements(req: ProjectRequirements): Brief {
  const fromFloors = (req.floors ?? []).reduce((s, f) => s + (f.bedrooms || 0), 0);
  const bedrooms = Math.max(1, Math.min(4, Math.round(req.bedroomsTotal ?? (fromFloors || 2))));
  return {
    plotWidthFt: req.plotWidthFt, plotDepthFt: req.plotDepthFt, facing: req.facing, bedrooms,
    masterBath: req.masterBath ?? 'attached',
    pooja: req.wantsPuja ?? (req.floors ?? []).some((f) => f.hasPuja),
    study: !!req.wantsStudy,
    parking: req.parkingType ?? 'Open',
    vastu: req.vastuCompliance !== false,
    // FSI 1.0 is the assumed default; any other value is the customer's own entry
    fsi: req.fsi && Math.abs(req.fsi - 1) > 1e-9 ? req.fsi : undefined,
    setbacks: req.setbacks,
    floorsPreference: req.floorsPreference ?? 'auto',
  };
}

function openingsSchedule(opt: PlanOption): OpeningsSchedule {
  const openings = opt.openings.map((o) => ({ ...o }));
  const totalDoors = openings.filter((o) => o.type === 'door').length;
  const totalWindows = openings.filter((o) => o.type === 'window').length;
  const totalVentilators = openings.filter((o) => o.type === 'ventilator').length;
  const lines = openings.map((o) => `${o.id}: ${o.type.toUpperCase()} — ${o.room} (${o.floor === 0 ? 'GF' : 'FF'}), ${o.wall === 'internal' ? `internal, ${o.face} side` : `${o.wall} wall`} — ${o.widthMm}×${o.heightMm} mm, sill ${o.sillHeightMm} mm, ${o.material}`);
  return { openings, totalDoors, totalWindows, totalVentilators,
    scheduleText: `SCHEDULE OF OPENINGS (${totalDoors} doors, ${totalWindows} windows, ${totalVentilators} ventilators):\n${lines.join('\n')}` };
}

export function optionToLayout(opt: PlanOption, result: PlanResult, req: ProjectRequirements): Layout {
  const env = result.envelope;
  const W = opt.widthM, D = opt.depthM;
  const left = r2(env.setbacks.left + Math.max(0, env.envW - W) / 2);
  const setbacks = { front: opt.frontOpenM, rear: r2(env.plotDm - opt.frontOpenM - D), left, right: r2(env.plotWm - left - W) };
  const columns: Column[] = opt.structuralGrid.xs.flatMap((x) => opt.structuralGrid.ys.map((y) => ({ x, y, widthMM: 230, depthMM: 300 })));
  const floors: FloorLayout[] = opt.floors.map((f) => ({ floor: f.floor, floorLabel: f.floor === 0 ? 'Ground Floor' : 'First Floor', rooms: f.rooms, columns }));
  const allRooms = floors.flatMap((f) => f.rooms);
  const vastu = req.vastuCompliance !== false ? calculateVastuScore(allRooms, W, D, req.facing) : { score: -1, details: [] as Layout['vastuDetails'] };
  const nbcIssues: NBCIssue[] = opt.checks.filter((c) => c.status === 'WARNING' || c.status === 'UNVERIFIED' || c.status === 'ERROR').map((c) => ({
    room: c.item.split(':')[0], issue: `${c.item} — ${c.detail}`, severity: c.status === 'ERROR' ? 'error' : c.status === 'WARNING' ? 'warning' : 'info',
  }));
  const perFloor = r2(W * D);
  return {
    id: opt.id, name: opt.title, strategy: opt.id, description: opt.notes.join(' '),
    floors, vastuScore: vastu.score, vastuDetails: vastu.details,
    nbcCompliant: !opt.checks.some((c) => c.status === 'ERROR'), nbcIssues,
    builtUpAreaSqM: opt.builtUpSqm, builtUpAreaSqFt: opt.builtUpSqft,
    setbacks, plotWidthM: env.plotWm, plotDepthM: env.plotDm, buildableWidthM: W, buildableDepthM: D,
    buildingWidthMm: Math.round(W * 1000), buildingDepthMm: Math.round(D * 1000), buildingFootprintSqM: perFloor,
    effectivePerFloorSqM: perFloor, effectivePerFloorSqFt: Math.round(perFloor * SQFT),
    totalBuiltUpSqM: opt.builtUpSqm, totalBuiltUpSqFt: opt.builtUpSqft,
    fsiValue: env.fsi, numFloors: opt.storeys, plotWidthFt: req.plotWidthFt, plotDepthFt: req.plotDepthFt,
    constraintBrief: [
      `BUILDING FOOTPRINT: ${Math.round(W * 1000)}mm × ${Math.round(D * 1000)}mm.`,
      `PLOT SIZE: ${Math.round(env.plotWm * 1000)}mm × ${Math.round(env.plotDm * 1000)}mm.`,
      `BUILDING OFFSETS ON PLOT: front ${setbacks.front}m, rear ${setbacks.rear}m, left ${setbacks.left}m, right ${setbacks.right}m (required setbacks ${env.setbackSource}: F${env.setbacks.front}/R${env.setbacks.rear}/L${env.setbacks.left}/R${env.setbacks.right} m).`,
      `FLOORS: ${opt.storeys === 1 ? 'Ground only' : 'G+1'}. PER FLOOR: ${Math.round(perFloor * SQFT)} sqft. TOTAL BUILT-UP: ${opt.builtUpSqft} sqft. FSI used ${opt.fsiUsed} of ${env.fsi}.`,
    ].join(' '),
    openingsSchedule: openingsSchedule(opt),
    plannerVersion: result.version, requiredSetbacks: env.setbacks, setbackSource: env.setbackSource, fsiSource: env.fsiSource,
    fsiUsed: opt.fsiUsed, parkingNote: opt.parkingNote, plannerNotes: opt.notes, plannerChecks: opt.checks, structuralGridM: opt.structuralGrid,
    revision: 1,
  };
}

export interface LayoutGenerationOutcome { result: PlanResult; layouts: Layout[] }

export function generateLayoutsDetailed(req: ProjectRequirements): LayoutGenerationOutcome {
  const result = planHome(briefFromRequirements(req));
  return { result, layouts: result.options.map((o) => optionToLayout(o, result, req)) };
}

export function generateLayouts(req: ProjectRequirements): Layout[] {
  return generateLayoutsDetailed(req).layouts;
}

/** Requirements aligned with the chosen layout (floor count and per-floor programme come from the plan). */
export function requirementsForLayout(req: ProjectRequirements, layout: Layout): ProjectRequirements {
  const floors: FloorProgram[] = layout.floors.map((f) => ({
    floorLabel: f.floorLabel,
    bedrooms: f.rooms.filter((r) => r.type === 'bedroom' || r.type === 'master_bedroom').length,
    halls: f.rooms.filter((r) => r.type === 'hall').length,
    kitchens: f.rooms.filter((r) => r.type === 'kitchen').length,
    hasDining: f.rooms.some((r) => r.type === 'dining') || f.rooms.some((r) => r.type === 'hall' && /dining/i.test(r.name)),
    hasPuja: f.rooms.some((r) => r.type === 'puja'),
  }));
  const bedroomsTotal = floors.reduce((s, f) => s + f.bedrooms, 0);
  return { ...req, floors, bedroomsTotal };
}
