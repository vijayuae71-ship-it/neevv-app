import type { InteriorPlan, PlacedFurniture } from './drawingEngine';
import type { RoomInterior } from '../types';

/**
 * Furnished room in 3D from the same placement the interior sheets draw (I-101 … I-601), so the
 * 3D view, the drawings and the BOQ show the same pieces at the same sizes. Units: metres,
 * x along the room's front wall, z away from it, y up. THREE is the global three.js (r128).
 */
const WALL_H = 2.85, WALL_T = 0.115;

export function buildRoomScene(THREE: any, scene: any, plan: InteriorPlan, interior?: RoomInterior, opts: { cutaway?: boolean } = {}): { w: number; d: number } {
  const cl = plan.clear, w = cl.w / 1000, d = cl.h / 1000;
  const X = (mm: number) => (mm - cl.x) / 1000, Z = (mm: number) => (mm - cl.y) / 1000;
  const mat = (c: string, o: Record<string, unknown> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.02, ...o });
  const box = (x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, m: any) => {
    if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  const pal = (interior?.palette ?? {}) as Record<string, string>;
  const wallC = pal.wall ?? pal.secondary ?? '#f2efe9', woodC = pal.accent ?? pal.primary ?? '#8a6a4a';
  const fl = `${interior?.flooring?.name ?? ''} ${interior?.flooring?.finish ?? ''}`;
  const floorC = /wood|laminate|plank|teak|oak/i.test(fl) ? '#b08a62' : /marble|granite/i.test(fl) ? '#ece8e1' : plan.roomType === 'toilet' ? '#b9c4cc' : '#cfc6b6';

  // lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f887c, 0.5));
  const sun = new THREE.DirectionalLight(0xfff4e5, 0.6); sun.position.set(w * 0.2 - 3, 6, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);

  // floor + skirting
  box(-WALL_T, -0.05, -WALL_T, w + 2 * WALL_T, 0.05, d + 2 * WALL_T, mat(floorC, { roughness: 0.5 }));
  // walls with their door and window openings (front and left kept low in the cut-away view)
  const sides: ['front' | 'rear' | 'left' | 'right', number][] = [['front', w], ['rear', w], ['left', d], ['right', d]];
  const glass = mat('#9cc7dd', { transparent: true, opacity: 0.35, roughness: 0.1 }), frame = mat('#ffffff'), doorM = mat(woodC);
  for (const [side, len] of sides) {
    const H = opts.cutaway && (side === 'front' || side === 'left') ? 1.0 : WALL_H, wm = mat(wallC);
    const ops = plan.openings.filter((o) => o.side === side).map((o) => ({ ...o, u0: (o.a - (side === 'front' || side === 'rear' ? cl.x : cl.y)) / 1000, u1: (o.b - (side === 'front' || side === 'rear' ? cl.x : cl.y)) / 1000 }))
      .filter((o) => o.u1 > 0 && o.u0 < len).sort((a, b) => a.u0 - b.u0);
    // wall piece from u0 to u1 between heights y0 and y1, on this side
    const piece = (u0: number, u1: number, y0: number, y1: number, m: any, thick = WALL_T) => {
      if (u1 - u0 < 0.005 || y1 - y0 < 0.005) return;
      if (side === 'front') box(u0, y0, -thick, u1 - u0, y1 - y0, thick, m);
      else if (side === 'rear') box(u0, y0, d, u1 - u0, y1 - y0, thick, m);
      else if (side === 'left') box(-thick, y0, u0, thick, y1 - y0, u1 - u0, m);
      else box(w, y0, u0, thick, y1 - y0, u1 - u0, m);
    };
    let at = -WALL_T;
    for (const o of ops) {
      const u0 = Math.max(0, o.u0), u1 = Math.min(len, o.u1), sill = o.sill / 1000, head = Math.min(H, (o.sill + o.height) / 1000);
      piece(at, u0, 0, H, wm);
      piece(u0, u1, 0, Math.min(sill, H), wm); piece(u0, u1, head, H, wm);
      if (head > sill) {
        if (o.type === 'door') piece(u0 + 0.02, u1 - 0.02, 0, head - 0.02, doorM, 0.04);
        else { piece(u0, u1, sill, head, glass, 0.02); piece(u0, u1, sill - 0.04, sill, frame, WALL_T + 0.04); }
      }
      at = u1;
    }
    piece(at, len + WALL_T, 0, H, wm);
    piece(-WALL_T, len + WALL_T, 0, 0.1, mat('#d9d2c5'), 0.012); // skirting on the room face
  }
  for (const it of plan.items) addItem(it);
  return { w, d };

  function addItem(it: PlacedFurniture): void {
    const x0 = X(it.x), z0 = Z(it.y), sx = it.w / 1000, sz = it.d / 1000, h = Math.max(0.05, it.h / 1000);
    const c = it.color && /^#?[0-9a-f]{6}$/i.test(it.color.replace('#', '')) ? (it.color.startsWith('#') ? it.color : `#${it.color}`) : null;
    const wood = mat(c ?? woodC), soft = mat(c ?? '#8f9aa6'), white = mat('#f7f7f5', { roughness: 0.3 }), steel = mat('#b9c0c6', { metalness: 0.6, roughness: 0.3 });
    // the edge strip along the wall the item backs onto (for headboards, sofa backs)
    const back = (t: number): [number, number, number, number] => it.side === 'front' ? [x0, z0, sx, t] : it.side === 'rear' ? [x0, z0 + sz - t, sx, t] : it.side === 'left' ? [x0, z0, t, sz] : it.side === 'right' ? [x0 + sx - t, z0, t, sz] : [x0, z0, sx, t];
    if (it.kind === 'upper') { box(x0, 1.5, z0, sx, 0.7, sz, wood); return; }
    if (it.kind === 'counter') { box(x0, 0.1, z0, sx, 0.75, sz, wood); box(x0, 0, z0, sx, 0.1, sz, mat('#3a3a3a')); box(x0 - 0.01, 0.85, z0 - 0.01, sx + 0.02, 0.04, sz + 0.02, mat('#2f2f33', { roughness: 0.35 })); return; }
    if (it.kind === 'fixture') {
      if (/shower/i.test(it.name)) { box(x0, 0, z0, sx, 0.03, sz, white); const [bx, bz, bw, bd] = back(0.01); box(bx, 0, bz, bw, 2.0, bd, glass); return; }
      if (/^wc/i.test(it.name)) { box(x0 + sx * 0.15, 0, z0 + sz * 0.15, sx * 0.7, 0.4, sz * 0.7, white); const [bx, bz, bw, bd] = back(0.18); box(bx, 0.4, bz, bw, 0.35, bd, white); return; }
      if (/hob/i.test(it.name)) { box(x0, 0.89, z0, sx, 0.02, sz, mat('#111111', { roughness: 0.2 })); return; }
      if (/sink/i.test(it.name)) { box(x0, 0.86, z0, sx, 0.03, sz, steel); return; }
      if (/basin|vanity|wash counter/i.test(it.name)) { box(x0, 0.75, z0, sx, 0.1, sz, white); if (/vanity|counter/i.test(it.name)) box(x0, 0.15, z0, sx, 0.6, sz, wood); return; }
      box(x0, 0, z0, sx, h, sz, white); return;
    }
    switch (it.category) {
      case 'bed': {
        box(x0, 0.1, z0, sx, 0.3, sz, wood); box(x0 + 0.03, 0.4, z0 + 0.03, sx - 0.06, 0.2, sz - 0.06, mat('#f3f1ec'));
        const [bx, bz, bw, bd] = back(0.08); box(bx, 0.1, bz, bw, 1.05, bd, soft); return;
      }
      case 'sofa': {
        box(x0, 0.1, z0, sx, 0.35, sz, soft); const [bx, bz, bw, bd] = back(0.22); box(bx, 0.45, bz, bw, 0.4, bd, soft); return;
      }
      case 'dining_table': case 'study_table': {
        box(x0, 0.72, z0, sx, 0.04, sz, wood);
        for (const [ax, az] of [[0.04, 0.04], [sx - 0.08, 0.04], [0.04, sz - 0.08], [sx - 0.08, sz - 0.08]]) box(x0 + ax, 0, z0 + az, 0.04, 0.72, 0.04, wood);
        return;
      }
      case 'tv_unit': {
        box(x0, 0.3, z0, sx, 0.45, sz, wood); const [bx, bz, bw, bd] = back(0.04);
        const tvw = Math.min(1.45, (it.side === 'left' || it.side === 'right' ? sz : sx) * 0.75);
        if (it.side === 'left' || it.side === 'right') box(bx, 1.0, bz + (bd - tvw) / 2, bw, 0.82, tvw, mat('#151515', { roughness: 0.2 }));
        else box(bx + (bw - tvw) / 2, 1.0, bz, tvw, 0.82, bd, mat('#151515', { roughness: 0.2 }));
        return;
      }
      case 'console': box(x0, 0, z0, sx, Math.min(h, 0.45), sz, wood); return;
      default: box(x0, 0, z0, sx, h, sz, wood);
    }
  }
}
