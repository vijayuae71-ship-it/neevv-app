import type { Layout, ProjectRequirements, BOQ, RoomInterior } from '../types';
import { generateVectorDrawing, sheetIndex, INTERIOR_SHEET_TYPES, sheetNumber } from './drawingEngine';
import { isOfficeLayout } from './officeServices';
import { sheetsToPDF, sheetToDXF, dxfBytes, zipFiles } from './vectorExport';
import type { VectorSheet } from './vectorCanvas';

const README = `neevv CAD set
=============
One DXF per sheet (AutoCAD R12 DXF, Windows-1252 text).

Opening in AutoCAD / BricsCAD / DraftSight / LibreCAD: open the .dxf directly.
To get DWG: open the .dxf in AutoCAD and use Save As > DWG (or the free ODA File Converter).

Units: each file is the A3 sheet in paper millimetres (420 x 297), exactly as printed.
Each view is drawn at the scale shown in its title (1:100, 1:50 ...): to measure in real
millimetres, multiply by that scale (e.g. 10 mm on a 1:100 view = 1000 mm), or SCALE the
view by 100 about any point.

Layers: NV-CUT (cut walls / thick), NV-LINES, NV-THIN, NV-HATCH, NV-CENTRE-HIDDEN (dashed),
NV-SERVICES (electrical / plumbing), NV-FILL (solid fills), NV-TEXT.

PRELIMINARY DESIGN - VERIFY WITH A LICENSED PROFESSIONAL BEFORE EXECUTION.
`;

function save(data: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';

/** Every sheet of the building set as vector data, in register order. */
export function buildingSheets(layout: Layout, req: ProjectRequirements, structural: unknown, boq: BOQ | null): VectorSheet[] {
  return sheetIndex(Math.max(1, req.floors?.length || layout.floors.length), isOfficeLayout(layout)).map((s) => generateVectorDrawing(s.type, layout, req, structural, boq, s.level === 1 ? 'FF' : 'GF'));
}
/** The six interior sheets of one room, in the chosen arrangement. */
export function interiorSheets(layout: Layout, req: ProjectRequirements, roomId: string, interior: RoomInterior | undefined, option: number): VectorSheet[] {
  return INTERIOR_SHEET_TYPES.map((t) => generateVectorDrawing(t, layout, req, undefined, null, 'GF', { roomId, interior, option }));
}

export async function downloadVectorPDF(sheets: VectorSheet[], name: string, title: string): Promise<void> {
  save(await sheetsToPDF(sheets, title), `${slug(name)}.pdf`, 'application/pdf');
}
export function downloadCADSet(sheets: VectorSheet[], name: string): void {
  const files = sheets.map((s, i) => ({ name: `${s.sheetNo ?? String(i + 1).padStart(2, '0')}_${slug(s.title ?? 'sheet')}.dxf`, data: dxfBytes(sheetToDXF(s)) }));
  save(zipFiles([{ name: 'README.txt', data: README }, ...files]), `${slug(name)}-cad-dxf.zip`, 'application/zip');
}
export { sheetNumber };
