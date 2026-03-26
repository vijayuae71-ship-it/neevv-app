import { Layout, Room, ProjectRequirements } from '../types';

const FLOOR_HEIGHT = 3.0;
const SLAB_THICKNESS = 0.15;
const WALL_THICKNESS = 0.23;
const WALL_HEIGHT = FLOOR_HEIGHT - SLAB_THICKNESS; // 2.85m
const DOOR_W = 0.9;
const DOOR_H = 2.1;
const WIN_W = 1.5;
const WIN_H = 1.4;
const WIN_SILL = 0.9;
const RAILING_H = 1.0;

const ROOM_FLOOR_COLORS: Record<string, string> = {
  bedroom: '#D4885C',       // warm terracotta
  master_bedroom: '#C87848', // deeper terracotta
  hall: '#E8CC78',           // golden oak
  dining: '#D4B860',         // amber
  kitchen: '#7BC87B',        // green tile
  toilet: '#68B8D8',         // sky blue tile
  puja: '#F0C040',           // bright saffron
  staircase: '#909090',      // neutral gray
  parking: '#606060',        // dark concrete
  balcony: '#E0A060',        // warm sandstone
  passage: '#C8B898',        // light wood
  entrance: '#D8C8A0',       // cream stone
  store: '#A89878',          // khaki
  utility: '#88B888',        // sage green
};

const FURNITURE_COLORS: Record<string, string> = {
  bedroom: '#8B6914',
  master_bedroom: '#7A5C12',
  hall: '#6B5A3A',
  dining: '#6B5A3A',
  kitchen: '#B0A090',
  toilet: '#FFFFFF',
  puja: '#C8A050',
  parking: '#3A4A5A',
};

export function buildScene(
  scene: any,
  layout: Layout,
  requirements: ProjectRequirements,
  options: { showFloor: number | 'all'; cutaway: boolean }
): void {
  const THREE = (window as any).THREE;
  if (!THREE) return;

  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const setbacks = layout.setbacks;

  // ── Lighting ──
  const ambient = new THREE.AmbientLight(0xFFF5E6, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x4A7C59, 0.3);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xFFFFFF, 1.0);
  sun.position.set(plotW * 2, FLOOR_HEIGHT * 6, plotW * 2);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  const shadowExtent = Math.max(plotW, plotD) * 1.5;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = shadowExtent * 4;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // ── Helper functions ──
  function makeMat(color: string, opts?: { transparent?: boolean; opacity?: number; roughness?: number; metalness?: number; side?: any }) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts?.roughness ?? 0.8,
      metalness: opts?.metalness ?? 0.05,
      transparent: opts?.transparent ?? false,
      opacity: opts?.opacity ?? 1.0,
      side: opts?.side ?? THREE.FrontSide,
    });
  }

  function addBox(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    material: any,
    shadows = true
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    return mesh;
  }

  function addCylinder(
    x: number, y: number, z: number,
    radiusTop: number, radiusBottom: number, height: number,
    segments: number, material: any, shadows = true
  ) {
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    return mesh;
  }

  // ── Wall segmentation helper ──
  function buildWallWithOpening(
    wallX: number, wallY: number, wallZ: number,
    wallLength: number,
    wallHeight: number,
    wallThick: number,
    material: any,
    opening?: { offset: number; width: number; height: number; sillHeight: number; type: 'door' | 'window' },
    isAlongX: boolean = true
  ) {
    if (!opening) {
      if (isAlongX) {
        addBox(wallX, wallY, wallZ, wallLength, wallHeight, wallThick, material);
      } else {
        addBox(wallX, wallY, wallZ, wallThick, wallHeight, wallLength, material);
      }
      return;
    }

    const oCenter = opening.offset;
    const oHalfW = opening.width / 2;
    const oStart = oCenter - oHalfW;
    const oEnd = oCenter + oHalfW;
    const oBottom = opening.sillHeight;
    const oTop = opening.sillHeight + opening.height;

    if (isAlongX) {
      if (oStart > 0.01) {
        addBox(wallX, wallY, wallZ, oStart, wallHeight, wallThick, material);
      }
      if (wallLength - oEnd > 0.01) {
        addBox(wallX + oEnd, wallY, wallZ, wallLength - oEnd, wallHeight, wallThick, material);
      }
      if (wallHeight - oTop > 0.01) {
        addBox(wallX + oStart, wallY + oTop, wallZ, opening.width, wallHeight - oTop, wallThick, material);
      }
      if (opening.type === 'window' && oBottom > 0.01) {
        addBox(wallX + oStart, wallY, wallZ, opening.width, oBottom, wallThick, material);
      }
    } else {
      if (oStart > 0.01) {
        addBox(wallX, wallY, wallZ, wallThick, wallHeight, oStart, material);
      }
      if (wallLength - oEnd > 0.01) {
        addBox(wallX, wallY, wallZ + oEnd, wallThick, wallHeight, wallLength - oEnd, material);
      }
      if (wallHeight - oTop > 0.01) {
        addBox(wallX, wallY + oTop, wallZ + oStart, wallThick, wallHeight - oTop, opening.width, material);
      }
      if (opening.type === 'window' && oBottom > 0.01) {
        addBox(wallX, wallY, wallZ + oStart, wallThick, oBottom, opening.width, material);
      }
    }
  }

  // ── A. Ground Plane & Plot ──
  const groundGeo = new THREE.PlaneGeometry(plotW * 3, plotD * 3);
  const groundMat = makeMat('#5A8A4A', { roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(plotW / 2, -0.02, plotD / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Plot platform
  const plotGeo = new THREE.BoxGeometry(plotW, 0.05, plotD);
  const plotMat = makeMat('#D8D0C4', { roughness: 0.9 });
  const plotMesh = new THREE.Mesh(plotGeo, plotMat);
  plotMesh.position.set(plotW / 2, 0.025, plotD / 2);
  plotMesh.receiveShadow = true;
  plotMesh.castShadow = true;
  scene.add(plotMesh);

  // Setback areas
  const sbMat = makeMat('#C8D4B8', { roughness: 0.95 });
  if (setbacks.front > 0.1) {
    const g = new THREE.BoxGeometry(plotW, 0.02, setbacks.front);
    const m = new THREE.Mesh(g, sbMat);
    m.position.set(plotW / 2, 0.06, setbacks.front / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  if (setbacks.rear > 0.1) {
    const g = new THREE.BoxGeometry(plotW, 0.02, setbacks.rear);
    const m = new THREE.Mesh(g, sbMat);
    m.position.set(plotW / 2, 0.06, plotD - setbacks.rear / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  if (setbacks.left > 0.1) {
    const g = new THREE.BoxGeometry(setbacks.left, 0.02, plotD);
    const m = new THREE.Mesh(g, sbMat);
    m.position.set(setbacks.left / 2, 0.06, plotD / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  if (setbacks.right > 0.1) {
    const g = new THREE.BoxGeometry(setbacks.right, 0.02, plotD);
    const m = new THREE.Mesh(g, sbMat);
    m.position.set(plotW - setbacks.right / 2, 0.06, plotD / 2);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Lawn in front setback
  if (setbacks.front > 0.5) {
    const lawnMat = makeMat('#48A838', { roughness: 0.95 });
    const lawnGeo = new THREE.BoxGeometry(plotW - 0.3, 0.04, setbacks.front - 0.1);
    const lawn = new THREE.Mesh(lawnGeo, lawnMat);
    lawn.position.set(plotW / 2, 0.07, setbacks.front / 2);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  // Driveway — paver style
  const gateX = plotW / 2;
  const driveW = 2.0;
  const driveMat = makeMat('#B8A898', { roughness: 0.8 });
  const driveGeo = new THREE.BoxGeometry(driveW, 0.05, setbacks.front + 0.1);
  const drive = new THREE.Mesh(driveGeo, driveMat);
  drive.position.set(gateX, 0.075, setbacks.front / 2);
  drive.receiveShadow = true;
  scene.add(drive);
  // Paver edge strips
  const edgeMat = makeMat('#908070', { roughness: 0.7 });
  addBox(gateX - driveW / 2 - 0.08, 0.05, 0, 0.08, 0.06, setbacks.front, edgeMat);
  addBox(gateX + driveW / 2, 0.05, 0, 0.08, 0.06, setbacks.front, edgeMat);

  // ── Compound Wall — Proper Boundary Wall ──
  const cwMat = makeMat('#E8E0D0', { roughness: 0.85 });
  const cwCopingMat = makeMat('#A09080', { roughness: 0.75 });
  const cwPillarMat = makeMat('#C0B8A8', { roughness: 0.7 });
  const cwH = 1.5, cwT = 0.15;
  const gateW = 2.5;
  const gateLeft = gateX - gateW / 2;
  const gateRight = gateX + gateW / 2;

  // Front wall — left of gate
  if (gateLeft > 0.2) {
    addBox(0, 0.05, -cwT / 2, gateLeft, cwH, cwT, cwMat);
    // Coping on top
    addBox(-0.025, 0.05 + cwH, -cwT / 2 - 0.025, gateLeft + 0.05, 0.06, cwT + 0.05, cwCopingMat);
    // Pillars every 3m
    const segLen = gateLeft;
    const pillarCount = Math.max(1, Math.floor(segLen / 3));
    for (let i = 0; i <= pillarCount; i++) {
      const px = i * (segLen / pillarCount);
      addBox(px - 0.10, 0.05, -cwT / 2 - 0.025, 0.20, 1.6, cwT + 0.05, cwPillarMat);
      // Pillar cap
      addBox(px - 0.125, 0.05 + 1.6, -cwT / 2 - 0.05, 0.25, 0.08, cwT + 0.10, cwPillarMat);
    }
  }
  // Front wall — right of gate
  if (plotW - gateRight > 0.2) {
    addBox(gateRight, 0.05, -cwT / 2, plotW - gateRight, cwH, cwT, cwMat);
    addBox(gateRight - 0.025, 0.05 + cwH, -cwT / 2 - 0.025, plotW - gateRight + 0.05, 0.06, cwT + 0.05, cwCopingMat);
    const segLen = plotW - gateRight;
    const pillarCount = Math.max(1, Math.floor(segLen / 3));
    for (let i = 0; i <= pillarCount; i++) {
      const px = gateRight + i * (segLen / pillarCount);
      addBox(px - 0.10, 0.05, -cwT / 2 - 0.025, 0.20, 1.6, cwT + 0.05, cwPillarMat);
      addBox(px - 0.125, 0.05 + 1.6, -cwT / 2 - 0.05, 0.25, 0.08, cwT + 0.10, cwPillarMat);
    }
  }

  // Gate pillars
  const gatePillarMat = makeMat('#807060', { roughness: 0.65 });
  addBox(gateLeft - 0.25, 0.05, -0.15, 0.25, 1.8, 0.35, gatePillarMat);
  addBox(gateRight, 0.05, -0.15, 0.25, 1.8, 0.35, gatePillarMat);
  // Gate pillar caps
  addBox(gateLeft - 0.30, 0.05 + 1.8, -0.20, 0.35, 0.08, 0.45, gatePillarMat);
  addBox(gateRight - 0.05, 0.05 + 1.8, -0.20, 0.35, 0.08, 0.45, gatePillarMat);

  // Gate — simple iron gate panel with horizontal bars
  const gatePanelMat = makeMat('#2A2A2A', { roughness: 0.4, metalness: 0.5 });
  addBox(gateLeft, 0.05, -0.03, gateW, 1.3, 0.04, gatePanelMat);
  // Gate horizontal bars
  for (let i = 0; i < 5; i++) {
    const barY = 0.05 + 0.15 + i * 0.28;
    addBox(gateLeft + 0.05, barY, -0.05, gateW - 0.10, 0.04, 0.06, gatePanelMat);
  }

  // Left side wall
  addBox(-cwT / 2, 0.05, 0, cwT, cwH, plotD, cwMat);
  addBox(-cwT / 2 - 0.025, 0.05 + cwH, -0.025, cwT + 0.05, 0.06, plotD + 0.05, cwCopingMat);
  { // Left wall pillars
    const pillarCount = Math.max(1, Math.floor(plotD / 3));
    for (let i = 0; i <= pillarCount; i++) {
      const pz = i * (plotD / pillarCount);
      addBox(-cwT / 2 - 0.025, 0.05, pz - 0.10, cwT + 0.05, 1.6, 0.20, cwPillarMat);
      addBox(-cwT / 2 - 0.05, 0.05 + 1.6, pz - 0.125, cwT + 0.10, 0.08, 0.25, cwPillarMat);
    }
  }

  // Right side wall
  addBox(plotW - cwT / 2, 0.05, 0, cwT, cwH, plotD, cwMat);
  addBox(plotW - cwT / 2 - 0.025, 0.05 + cwH, -0.025, cwT + 0.05, 0.06, plotD + 0.05, cwCopingMat);
  { // Right wall pillars
    const pillarCount = Math.max(1, Math.floor(plotD / 3));
    for (let i = 0; i <= pillarCount; i++) {
      const pz = i * (plotD / pillarCount);
      addBox(plotW - cwT / 2 - 0.025, 0.05, pz - 0.10, cwT + 0.05, 1.6, 0.20, cwPillarMat);
      addBox(plotW - cwT / 2 - 0.05, 0.05 + 1.6, pz - 0.125, cwT + 0.10, 0.08, 0.25, cwPillarMat);
    }
  }

  // Rear wall
  addBox(0, 0.05, plotD - cwT / 2, plotW, cwH, cwT, cwMat);
  addBox(-0.025, 0.05 + cwH, plotD - cwT / 2 - 0.025, plotW + 0.05, 0.06, cwT + 0.05, cwCopingMat);
  { // Rear wall pillars
    const pillarCount = Math.max(1, Math.floor(plotW / 3));
    for (let i = 0; i <= pillarCount; i++) {
      const px = i * (plotW / pillarCount);
      addBox(px - 0.10, 0.05, plotD - cwT / 2 - 0.025, 0.20, 1.6, cwT + 0.05, cwPillarMat);
      addBox(px - 0.125, 0.05 + 1.6, plotD - cwT / 2 - 0.05, 0.25, 0.08, cwT + 0.10, cwPillarMat);
    }
  }

  // ── Trees ──
  const treeTrunkMat = makeMat('#8B7355', { roughness: 0.9 });
  const treeCanopyMat = makeMat('#4A8A3A', { roughness: 0.9 });

  function addTree(tx: number, tz: number) {
    addCylinder(tx, 0.05, tz, 0.08, 0.12, 1.5, 8, treeTrunkMat);
    const canopyGeo = new THREE.SphereGeometry(0.7, 8, 6);
    const canopy = new THREE.Mesh(canopyGeo, treeCanopyMat);
    canopy.position.set(tx, 1.85, tz);
    canopy.castShadow = true;
    scene.add(canopy);
  }

  function addPalmTree(tx: number, tz: number) {
    const palmTrunkMat = makeMat('#A08050', { roughness: 0.85 });
    addCylinder(tx, 0.05, tz, 0.05, 0.08, 2.5, 8, palmTrunkMat);
    // Fronds — 5 elongated angled boxes
    const frondMat = makeMat('#3A8A2A', { roughness: 0.9 });
    const frondW = 0.12, frondH = 0.04, frondL = 1.2;
    const topY = 2.55;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const geo = new THREE.BoxGeometry(frondW, frondH, frondL);
      const mesh = new THREE.Mesh(geo, frondMat);
      mesh.position.set(
        tx + Math.cos(angle) * 0.5,
        topY + 0.1,
        tz + Math.sin(angle) * 0.5
      );
      mesh.rotation.x = Math.sin(angle) * 0.5;
      mesh.rotation.z = -Math.cos(angle) * 0.5;
      mesh.castShadow = true;
      scene.add(mesh);
    }
  }

  function addBushyTree(tx: number, tz: number) {
    const bushTrunkMat = makeMat('#6B5030', { roughness: 0.9 });
    addCylinder(tx, 0.05, tz, 0.06, 0.09, 0.8, 8, bushTrunkMat);
    const bushCanopyMat = makeMat('#2A6A1A', { roughness: 0.95 });
    const canopyGeo = new THREE.SphereGeometry(1.0, 10, 8);
    const canopy = new THREE.Mesh(canopyGeo, bushCanopyMat);
    canopy.position.set(tx, 1.35, tz);
    canopy.castShadow = true;
    scene.add(canopy);
  }

  // Place trees
  if (setbacks.left > 0.8 && setbacks.rear > 0.8)
    addTree(setbacks.left * 0.4, plotD - setbacks.rear * 0.4);
  if (setbacks.right > 0.8 && setbacks.rear > 0.8)
    addBushyTree(plotW - setbacks.right * 0.4, plotD - setbacks.rear * 0.4);
  if (setbacks.left > 0.8 && setbacks.front > 1.5)
    addPalmTree(setbacks.left * 0.4, setbacks.front * 0.4);
  if (setbacks.right > 0.8 && setbacks.front > 1.5)
    addTree(plotW - setbacks.right * 0.4, setbacks.front * 0.35);

  // ── Potted Plants ──
  const potMat = makeMat('#C06030', { roughness: 0.75 });
  const potPlantMat = makeMat('#3A9030', { roughness: 0.9 });

  function addPottedPlant(px: number, pz: number) {
    addCylinder(px, 0.05, pz, 0.13, 0.15, 0.3, 10, potMat);
    const sphereGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const plant = new THREE.Mesh(sphereGeo, potPlantMat);
    plant.position.set(px, 0.53, pz);
    plant.castShadow = true;
    scene.add(plant);
  }

  // Pots flanking entrance
  const buildMinX = setbacks.left;
  const buildMaxX = plotW - setbacks.right;
  const buildMinZ = setbacks.front;
  const buildMaxZ = plotD - setbacks.rear;
  const bldgCenterX = (buildMinX + buildMaxX) / 2;

  addPottedPlant(bldgCenterX - 0.8, buildMinZ - 0.3);
  addPottedPlant(bldgCenterX + 0.8, buildMinZ - 0.3);

  // Pots along driveway
  if (setbacks.front > 1.5) {
    addPottedPlant(gateX - driveW / 2 - 0.4, setbacks.front * 0.3);
    addPottedPlant(gateX + driveW / 2 + 0.4, setbacks.front * 0.3);
    addPottedPlant(gateX - driveW / 2 - 0.4, setbacks.front * 0.6);
  }

  // ── Garden Stepping Stones ──
  if (setbacks.front > 1.0) {
    const stoneMat = makeMat('#B0A898', { roughness: 0.85 });
    const stoneCount = Math.floor(setbacks.front / 0.6);
    for (let i = 0; i < stoneCount; i++) {
      const sz = 0.3 + i * 0.6;
      if (sz < setbacks.front - 0.2) {
        addCylinder(gateX, 0.08, sz, 0.25, 0.25, 0.03, 12, stoneMat);
      }
    }
  }

  // ── Flower Beds (along front of building) ──
  if (setbacks.front > 0.6) {
    const bedSoilMat = makeMat('#8B6840', { roughness: 0.95 });
    const flowerRedMat = makeMat('#E04080', { roughness: 0.9 });
    const flowerYellowMat = makeMat('#E8C020', { roughness: 0.9 });

    // Left flower bed
    const fbLeftW = Math.min((bldgCenterX - buildMinX) * 0.6, 2.5);
    if (fbLeftW > 0.5) {
      addBox(buildMinX, 0.06, buildMinZ - 0.6, fbLeftW, 0.3, 0.5, bedSoilMat);
      // Flowers on top
      for (let i = 0; i < Math.floor(fbLeftW / 0.5); i++) {
        const fx = buildMinX + 0.25 + i * 0.5;
        const fMat = i % 2 === 0 ? flowerRedMat : flowerYellowMat;
        const fGeo = new THREE.SphereGeometry(0.12, 6, 5);
        const fMesh = new THREE.Mesh(fGeo, fMat);
        fMesh.position.set(fx, 0.48, buildMinZ - 0.35);
        scene.add(fMesh);
      }
    }

    // Right flower bed
    const fbRightStart = bldgCenterX + 1.5;
    const fbRightW = Math.min(buildMaxX - fbRightStart, 2.5);
    if (fbRightW > 0.5) {
      addBox(fbRightStart, 0.06, buildMinZ - 0.6, fbRightW, 0.3, 0.5, bedSoilMat);
      for (let i = 0; i < Math.floor(fbRightW / 0.5); i++) {
        const fx = fbRightStart + 0.25 + i * 0.5;
        const fMat = i % 2 === 0 ? flowerYellowMat : flowerRedMat;
        const fGeo = new THREE.SphereGeometry(0.12, 6, 5);
        const fMesh = new THREE.Mesh(fGeo, fMat);
        fMesh.position.set(fx, 0.48, buildMinZ - 0.35);
        scene.add(fMesh);
      }
    }
  }

  // ── Garden Bench (in side setback if space allows) ──
  if (setbacks.left > 1.2) {
    const benchMat = makeMat('#6B5030', { roughness: 0.7 });
    const benchX = setbacks.left * 0.35;
    const benchZ = buildMinZ + (buildMaxZ - buildMinZ) * 0.4;
    // Seat
    addBox(benchX - 0.5, 0.05, benchZ - 0.2, 1.0, 0.05, 0.4, benchMat);
    // Supports
    addBox(benchX - 0.45, 0.05, benchZ - 0.15, 0.08, 0.45, 0.30, benchMat);
    addBox(benchX + 0.35, 0.05, benchZ - 0.15, 0.08, 0.45, 0.30, benchMat);
    // Seat on supports
    addBox(benchX - 0.5, 0.50, benchZ - 0.2, 1.0, 0.05, 0.4, benchMat);
  }

  // ── Materials ──
  const frontExtMat = makeMat('#D49428', { roughness: 0.6 });
  const sideExtMat = makeMat('#70B8D8', { roughness: 0.65 });
  const rearExtMat = makeMat('#E0D4C0', { roughness: 0.8 });
  const woodCladdingMat = makeMat('#6B4B2A', { roughness: 0.5 });
  const accentGreenMat = makeMat('#88C898', { roughness: 0.65 });

  const intWallColorMap: Record<string, string> = {
    bedroom: '#A0CFF0',
    master_bedroom: '#88B4E0',
    kitchen: '#F0DC80',
    hall: '#A8D8B8',
    living: '#A8D8B8',
    dining: '#C8E0A8',
    toilet: '#70C8C0',
    bathroom: '#70C8C0',
    puja: '#F0C060',
    staircase: '#D8D4D0',
    parking: '#D0CCC8',
    balcony: '#E8DCC0',
    passage: '#D8E0C8',
    store: '#D8D0C0',
    utility: '#B0D8A8',
    entrance: '#D8E0C8',
  };
  const intWallMatCache: Record<string, any> = {};
  function getIntWallMat(roomType: string) {
    if (!intWallMatCache[roomType]) {
      const c = intWallColorMap[roomType] || '#F0ECE4';
      intWallMatCache[roomType] = makeMat(c, { roughness: 0.85 });
    }
    return intWallMatCache[roomType];
  }

  const wetWallMat = makeMat('#60B8B0', { roughness: 0.4, metalness: 0.1 });
  const slabMat = makeMat('#C8C0B4', { roughness: 0.85 });
  const doorMat = makeMat('#5A3A1A', { roughness: 0.7 });
  const doorFrameMat = makeMat('#3A2510', { roughness: 0.6 });
  // Enhanced glass and window materials
  const glassMat = makeMat('#40A8E0', { transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide });
  const winFrameMat = makeMat('#E8E8F0', { roughness: 0.4, metalness: 0.2 }); // white UPVC frame
  const railMat = makeMat('#666666', { roughness: 0.4, metalness: 0.4 });
  const colMat = makeMat('#D0C8BC', { roughness: 0.7 });

  let staircaseRoom: Room | undefined;
  const floorCount = layout.floors.length;

  function getWallMat(isExterior: boolean, roomType: string, direction?: 'front' | 'rear' | 'left' | 'right') {
    if (isExterior) {
      if (roomType === 'toilet' || roomType === 'utility') return wetWallMat;
      if (direction === 'front') return frontExtMat;
      if (direction === 'rear') return rearExtMat;
      if (direction === 'left') return sideExtMat;
      if (direction === 'right') return accentGreenMat;
      return sideExtMat;
    }
    if (roomType === 'kitchen' || roomType === 'toilet' || roomType === 'utility') return wetWallMat;
    return getIntWallMat(roomType);
  }

  function addRailing(startX: number, baseY: number, startZ: number, length: number, isAlongX: boolean) {
    const postCount = Math.max(2, Math.floor(length / 0.8) + 1);
    const spacing = length / (postCount - 1);
    const postSize = 0.04;

    for (let i = 0; i < postCount; i++) {
      if (isAlongX) {
        const px = startX + i * spacing;
        addBox(px - postSize / 2, baseY, startZ - postSize / 2, postSize, RAILING_H, postSize, railMat);
      } else {
        const pz = startZ + i * spacing;
        addBox(startX - postSize / 2, baseY, pz - postSize / 2, postSize, RAILING_H, postSize, railMat);
      }
    }

    if (isAlongX) {
      addBox(startX, baseY + RAILING_H - 0.03, startZ - 0.025, length, 0.03, 0.05, railMat);
      addBox(startX, baseY + RAILING_H * 0.5 - 0.015, startZ - 0.02, length, 0.025, 0.04, railMat);
    } else {
      addBox(startX - 0.025, baseY + RAILING_H - 0.03, startZ, 0.05, 0.03, length, railMat);
      addBox(startX - 0.02, baseY + RAILING_H * 0.5 - 0.015, startZ, 0.04, 0.025, length, railMat);
    }
  }

  // ── Window helper — bright cyan-blue glass with white UPVC frame + mullions + chajja + sill ──
  function addWindowInOpening(
    ox: number, oy: number, oz: number,
    oWidth: number, oHeight: number,
    wallThick: number,
    isAlongX: boolean,
    isExterior: boolean = true
  ) {
    const frameT = 0.05;
    const glassThick = 0.10;
    const surround = 0.06;
    const chajjaDepth = 0.40;
    const chajjaThick = 0.10;
    const sillDepth = 0.18;
    const mullionW = 0.05;
    const surroundMat = makeMat('#E8E8F0', { roughness: 0.4, metalness: 0.2 }); // white surround
    const sillMat = makeMat('#D0C4B0', { roughness: 0.7 });
    const chajjaMat = makeMat('#C8B8A0', { roughness: 0.7 });

    if (isAlongX) {
      const gz = oz + wallThick / 2 - glassThick / 2;
      // Glass pane
      addBox(ox, oy, gz, oWidth, oHeight, glassThick, glassMat, false);
      // Frame: 4 sides
      addBox(ox, oy + oHeight - frameT, gz - 0.01, oWidth, frameT, glassThick + 0.02, winFrameMat);
      addBox(ox, oy, gz - 0.01, oWidth, frameT, glassThick + 0.02, winFrameMat);
      addBox(ox, oy, gz - 0.01, frameT, oHeight, glassThick + 0.02, winFrameMat);
      addBox(ox + oWidth - frameT, oy, gz - 0.01, frameT, oHeight, glassThick + 0.02, winFrameMat);
      // Mullion cross — prominent white bars dividing into 4 panes
      addBox(ox + oWidth / 2 - mullionW / 2, oy, gz - 0.015, mullionW, oHeight, glassThick + 0.03, winFrameMat);
      addBox(ox, oy + oHeight / 2 - mullionW / 2, gz - 0.015, oWidth, mullionW, glassThick + 0.03, winFrameMat);

      if (isExterior) {
        // White surround frame protruding from wall face
        const extZ = oz - surround;
        addBox(ox - surround, oy + oHeight, extZ, oWidth + surround * 2, surround, surround + 0.04, surroundMat);
        addBox(ox - surround, oy - surround, extZ, oWidth + surround * 2, surround, surround + 0.04, surroundMat);
        addBox(ox - surround, oy, extZ, surround, oHeight, surround + 0.04, surroundMat);
        addBox(ox + oWidth, oy, extZ, surround, oHeight, surround + 0.04, surroundMat);
        // Chajja (sunshade) above window
        addBox(ox - 0.1, oy + oHeight + surround, oz - chajjaDepth, oWidth + 0.2, chajjaThick, chajjaDepth + wallThick / 2, chajjaMat);
        // Window sill projecting outward
        addBox(ox - 0.05, oy - 0.08, oz - sillDepth, oWidth + 0.1, 0.08, sillDepth + wallThick / 2, sillMat);
      }
    } else {
      const gx = ox + wallThick / 2 - glassThick / 2;
      addBox(gx, oy, oz, glassThick, oHeight, oWidth, glassMat, false);
      // Frame: 4 sides
      addBox(gx - 0.01, oy + oHeight - frameT, oz, glassThick + 0.02, frameT, oWidth, winFrameMat);
      addBox(gx - 0.01, oy, oz, glassThick + 0.02, frameT, oWidth, winFrameMat);
      addBox(gx - 0.01, oy, oz, glassThick + 0.02, oHeight, frameT, winFrameMat);
      addBox(gx - 0.01, oy, oz + oWidth - frameT, glassThick + 0.02, oHeight, frameT, winFrameMat);
      // Mullion cross
      addBox(gx - 0.015, oy, oz + oWidth / 2 - mullionW / 2, glassThick + 0.03, oHeight, mullionW, winFrameMat);
      addBox(gx - 0.015, oy + oHeight / 2 - mullionW / 2, oz, glassThick + 0.03, mullionW, oWidth, winFrameMat);

      if (isExterior) {
        const extX = ox - surround;
        addBox(extX, oy + oHeight, oz - surround, surround + 0.04, surround, oWidth + surround * 2, surroundMat);
        addBox(extX, oy - surround, oz - surround, surround + 0.04, surround, oWidth + surround * 2, surroundMat);
        addBox(extX, oy, oz - surround, surround + 0.04, oHeight, surround, surroundMat);
        addBox(extX, oy, oz + oWidth, surround + 0.04, oHeight, surround, surroundMat);
        // Chajja — projects on correct axis for Z-walls
        addBox(ox - chajjaDepth, oy + oHeight + surround, oz - 0.1, chajjaDepth + wallThick / 2, chajjaThick, oWidth + 0.2, chajjaMat);
        // Sill
        addBox(ox - sillDepth, oy - 0.08, oz - 0.05, sillDepth + wallThick / 2, 0.08, oWidth + 0.1, sillMat);
      }
    }
  }

  // ── Door helper ──
  function addDoorInOpening(
    ox: number, oy: number, oz: number,
    dWidth: number, dHeight: number,
    wallThick: number,
    isAlongX: boolean,
    isExterior: boolean = false
  ) {
    const frameT = 0.06;
    const panelThick = 0.06;
    const surroundMat = makeMat('#4A3020', { roughness: 0.5 });
    const thresholdMat = makeMat('#808080', { roughness: 0.8 });

    if (isAlongX) {
      const dz = oz + wallThick / 2 - panelThick / 2;
      addBox(ox + 0.03, oy, dz, dWidth - 0.06, dHeight, panelThick, doorMat);
      addBox(ox - 0.03, oy + dHeight, dz - 0.02, dWidth + 0.06, frameT, panelThick + 0.04, doorFrameMat);
      addBox(ox - 0.03, oy, dz - 0.02, frameT, dHeight + frameT, panelThick + 0.04, doorFrameMat);
      addBox(ox + dWidth - 0.03, oy, dz - 0.02, frameT, dHeight + frameT, panelThick + 0.04, doorFrameMat);
      // Raised panel details
      const panelInset = 0.08;
      const detailMat = makeMat('#7B5A2A', { roughness: 0.5 });
      addBox(ox + panelInset, oy + 0.15, dz - 0.005, dWidth - panelInset * 2, dHeight * 0.35, panelThick + 0.01, detailMat);
      addBox(ox + panelInset, oy + dHeight * 0.55, dz - 0.005, dWidth - panelInset * 2, dHeight * 0.35, panelThick + 0.01, detailMat);
      // Threshold
      addBox(ox - 0.05, oy - 0.03, oz - 0.05, dWidth + 0.1, 0.03, wallThick + 0.1, thresholdMat);

      if (isExterior) {
        const extZ = oz - 0.06;
        addBox(ox - 0.06, oy + dHeight, extZ, dWidth + 0.12, 0.08, 0.08, surroundMat);
        addBox(ox - 0.06, oy, extZ, 0.06, dHeight + 0.08, 0.08, surroundMat);
        addBox(ox + dWidth, oy, extZ, 0.06, dHeight + 0.08, 0.08, surroundMat);
      }
    } else {
      const dx = oz + wallThick / 2 - panelThick / 2;
      // Fix: use ox for X-position context for Z-axis doors
      const dzx = ox + wallThick / 2 - panelThick / 2;
      addBox(dzx, oy, oz + 0.03, panelThick, dHeight, dWidth - 0.06, doorMat);
      addBox(dzx - 0.02, oy + dHeight, oz - 0.03, panelThick + 0.04, frameT, dWidth + 0.06, doorFrameMat);
      addBox(dzx - 0.02, oy, oz - 0.03, panelThick + 0.04, dHeight + frameT, frameT, doorFrameMat);
      addBox(dzx - 0.02, oy, oz + dWidth - 0.03, panelThick + 0.04, dHeight + frameT, frameT, doorFrameMat);
      const panelInset = 0.08;
      const detailMat = makeMat('#7B5A2A', { roughness: 0.5 });
      addBox(dzx - 0.005, oy + 0.15, oz + panelInset, panelThick + 0.01, dHeight * 0.35, dWidth - panelInset * 2, detailMat);
      addBox(dzx - 0.005, oy + dHeight * 0.55, oz + panelInset, panelThick + 0.01, dHeight * 0.35, dWidth - panelInset * 2, detailMat);
      // Threshold
      addBox(ox - 0.05, oy - 0.03, oz - 0.05, wallThick + 0.1, 0.03, dWidth + 0.1, thresholdMat);

      if (isExterior) {
        const extX = ox - 0.06;
        addBox(extX, oy + dHeight, oz - 0.06, 0.08, 0.08, dWidth + 0.12, surroundMat);
        addBox(extX, oy, oz - 0.06, 0.08, dHeight + 0.08, 0.06, surroundMat);
        addBox(extX, oy, oz + dWidth, 0.08, dHeight + 0.08, 0.06, surroundMat);
      }
    }
  }

  // Track which rooms are front-facing for facade projection
  const frontFacadeRooms: Array<{ rx: number; rz: number; rw: number; rd: number; floorY: number; type: string }> = [];

  // ── Text sprite helper for room labels with dimensions ──
  function makeTextSprite(text: string, position: { x: number; y: number; z: number }, opts?: { fontSize?: number; bgColor?: string; textColor?: string; scale?: number }) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = opts?.fontSize || 28;
    const padding = 8;
    canvas.width = 512;
    canvas.height = 128;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = opts?.bgColor || 'rgba(0,0,0,0.65)';
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const bgW = textWidth + padding * 2;
    const bgH = fontSize + padding * 2;
    const bgX = (canvas.width - bgW) / 2;
    const bgY = (canvas.height - bgH) / 2;

    // Rounded rect background
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(bgX + r, bgY);
    ctx.lineTo(bgX + bgW - r, bgY);
    ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r);
    ctx.lineTo(bgX + bgW, bgY + bgH - r);
    ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH);
    ctx.lineTo(bgX + r, bgY + bgH);
    ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r);
    ctx.lineTo(bgX, bgY + r);
    ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text
    ctx.fillStyle = opts?.textColor || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(position.x, position.y, position.z);
    const sc = opts?.scale || 2.5;
    sprite.scale.set(sc, sc * 0.25, 1);
    scene.add(sprite);
    return sprite;
  }

  // ── Dimension line helper (3D line with end ticks) ──
  function addDimensionLine(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }, label: string) {
    const points = [
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z)
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xFF4444, linewidth: 2 });
    const line = new THREE.Line(geom, mat);
    scene.add(line);

    // End ticks (small vertical lines)
    const tickH = 0.15;
    [[start.x, start.y, start.z], [end.x, end.y, end.z]].forEach(([tx, ty, tz]) => {
      const tickPts = [
        new THREE.Vector3(tx, ty - tickH, tz),
        new THREE.Vector3(tx, ty + tickH, tz)
      ];
      const tickGeom = new THREE.BufferGeometry().setFromPoints(tickPts);
      const tickLine = new THREE.Line(tickGeom, mat);
      scene.add(tickLine);
    });

    // Label at midpoint
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2 + 0.2;
    const midZ = (start.z + end.z) / 2;
    makeTextSprite(label, { x: midX, y: midY, z: midZ }, { fontSize: 22, bgColor: 'rgba(200,30,30,0.75)', scale: 1.8 });
  }

  // ── Building floors ──
  layout.floors.forEach((fl) => {
    if (options.showFloor !== 'all' && fl.floor !== options.showFloor) return;

    const floorY = fl.floor * FLOOR_HEIGHT;

    // Floor slab
    const bW = layout.buildableWidthM;
    const bD = layout.buildableDepthM;
    addBox(buildMinX, floorY, buildMinZ, bW, SLAB_THICKNESS, bD, slabMat);

    fl.rooms.forEach((room) => {
      const rx = room.x + setbacks.left;
      const rz = room.y + setbacks.front;
      const rw = room.width;
      const rd = room.depth;
      const roomBaseY = floorY + SLAB_THICKNESS;

      // Floor coloring
      const floorColor = ROOM_FLOOR_COLORS[room.type] || '#C8C0B0';
      const roomFloorMat = makeMat(floorColor, { roughness: 0.7 });
      const floorThick = 0.05;
      const fpm = addBox(
        rx + WALL_THICKNESS, roomBaseY, rz + WALL_THICKNESS,
        rw - WALL_THICKNESS * 2, floorThick, rd - WALL_THICKNESS * 2,
        roomFloorMat
      );
      fpm.receiveShadow = true;

      // ── Room name + dimension label (floating sprite) ──
      const roomNameMap: Record<string, string> = {
        master_bedroom: 'Master Bed', bedroom: 'Bedroom', hall: 'Living',
        kitchen: 'Kitchen', dining: 'Dining', toilet: 'Toilet',
        balcony: 'Balcony', puja: 'Puja', passage: 'Passage',
        staircase: 'Staircase', parking: 'Parking', entrance: 'Entrance',
        utility: 'Utility', store: 'Store', living: 'Living'
      };
      const rName = roomNameMap[room.type] || room.name || room.type;
      const widthFt = (rw * 3.281).toFixed(1);
      const depthFt = (rd * 3.281).toFixed(1);
      const areaSqFt = (rw * rd * 10.764).toFixed(0);
      const labelText = `${rName} ${widthFt}'×${depthFt}' (${areaSqFt} sqft)`;
      const labelY = roomBaseY + WALL_HEIGHT * 0.45;
      const labelX = rx + rw / 2;
      const labelZ = rz + rd / 2;
      makeTextSprite(labelText, { x: labelX, y: labelY, z: labelZ }, {
        fontSize: 20, bgColor: 'rgba(0,0,0,0.55)', textColor: '#FFFFFF', scale: Math.min(rw, rd) * 0.7
      });

      // Determine exterior walls
      const isLeftExterior = Math.abs(rx - buildMinX) < 0.1;
      const isRightExterior = Math.abs(rx + rw - buildMaxX) < 0.1;
      const isFrontExterior = Math.abs(rz - buildMinZ) < 0.1;
      const isRearExterior = Math.abs(rz + rd - buildMaxZ) < 0.1;
      const isBalcony = room.type === 'balcony';

      // Track front facade rooms for projection
      if (isFrontExterior && (room.type === 'hall' || room.type === 'entrance')) {
        frontFacadeRooms.push({ rx, rz, rw, rd, floorY, type: room.type });
      }

      const hasFrontDoor = (room.type === 'hall' || room.type === 'entrance' || room.type === 'parking') && isFrontExterior;
      const hasFrontWindow = isFrontExterior && !hasFrontDoor && room.type !== 'passage' && room.type !== 'balcony' && rw > 1.5;
      const hasRearWindow = isRearExterior && room.type !== 'toilet' && room.type !== 'passage' && room.type !== 'balcony' && rw > 1.5;
      const hasLeftWindow = isLeftExterior && room.type !== 'toilet' && room.type !== 'kitchen' && room.type !== 'balcony' && rd > 1.5;
      const hasRightWindow = isRightExterior && room.type !== 'toilet' && room.type !== 'kitchen' && room.type !== 'balcony' && rd > 1.5;

      const hasInteriorDoor = !isFrontExterior && !hasFrontDoor && (
        room.type === 'bedroom' || room.type === 'master_bedroom' ||
        room.type === 'kitchen' || room.type === 'toilet' ||
        room.type === 'puja' || room.type === 'dining' ||
        room.type === 'store' || room.type === 'utility'
      );

      // ── Build 4 walls with openings ──

      // FRONT wall
      const isFrontCutaway = options.cutaway && isFrontExterior;
      if (!isFrontCutaway) {
        if (isBalcony && isFrontExterior) {
          addRailing(rx, roomBaseY, rz + 0.05, rw, true);
        } else {
          const fMat = getWallMat(isFrontExterior, room.type, 'front');
          let frontOpening: { offset: number; width: number; height: number; sillHeight: number; type: 'door' | 'window' } | undefined;

          if (hasFrontDoor) {
            frontOpening = { offset: rw / 2, width: DOOR_W, height: DOOR_H, sillHeight: 0, type: 'door' };
          } else if (hasFrontWindow) {
            frontOpening = { offset: rw / 2, width: WIN_W, height: WIN_H, sillHeight: WIN_SILL, type: 'window' };
          } else if (hasInteriorDoor && !isFrontExterior) {
            frontOpening = { offset: rw / 2, width: DOOR_W, height: DOOR_H, sillHeight: 0, type: 'door' };
          }

          buildWallWithOpening(rx, roomBaseY, rz, rw, WALL_HEIGHT, WALL_THICKNESS, fMat, frontOpening, true);

          if (frontOpening) {
            const oStartX = rx + frontOpening.offset - frontOpening.width / 2;
            if (frontOpening.type === 'door') {
              addDoorInOpening(oStartX, roomBaseY, rz, frontOpening.width, frontOpening.height, WALL_THICKNESS, true, isFrontExterior);
            } else {
              addWindowInOpening(oStartX, roomBaseY + frontOpening.sillHeight, rz, frontOpening.width, frontOpening.height, WALL_THICKNESS, true, isFrontExterior);
            }
          }
        }
      }

      // REAR wall
      if (isBalcony && isRearExterior) {
        addRailing(rx, roomBaseY, rz + rd - 0.05, rw, true);
      } else {
        const rMat = getWallMat(isRearExterior, room.type, 'rear');
        let rearOpening: { offset: number; width: number; height: number; sillHeight: number; type: 'door' | 'window' } | undefined;

        if (hasRearWindow) {
          rearOpening = { offset: rw / 2, width: WIN_W, height: WIN_H, sillHeight: WIN_SILL, type: 'window' };
        }

        buildWallWithOpening(rx, roomBaseY, rz + rd - WALL_THICKNESS, rw, WALL_HEIGHT, WALL_THICKNESS, rMat, rearOpening, true);

        if (rearOpening) {
          const oStartX = rx + rearOpening.offset - rearOpening.width / 2;
          addWindowInOpening(oStartX, roomBaseY + rearOpening.sillHeight, rz + rd - WALL_THICKNESS, rearOpening.width, rearOpening.height, WALL_THICKNESS, true, isRearExterior);
        }
      }

      // LEFT wall
      if (isBalcony && isLeftExterior) {
        addRailing(rx + 0.05, roomBaseY, rz, rd, false);
      } else {
        const lMat = getWallMat(isLeftExterior, room.type, 'left');
        let leftOpening: { offset: number; width: number; height: number; sillHeight: number; type: 'door' | 'window' } | undefined;

        if (hasLeftWindow) {
          leftOpening = { offset: rd / 2, width: WIN_W, height: WIN_H, sillHeight: WIN_SILL, type: 'window' };
        }

        buildWallWithOpening(rx, roomBaseY, rz, rd, WALL_HEIGHT, WALL_THICKNESS, lMat, leftOpening, false);

        if (leftOpening) {
          const oStartZ = rz + leftOpening.offset - leftOpening.width / 2;
          addWindowInOpening(rx, roomBaseY + leftOpening.sillHeight, oStartZ, leftOpening.width, leftOpening.height, WALL_THICKNESS, false, isLeftExterior);
        }
      }

      // RIGHT wall
      if (isBalcony && isRightExterior) {
        addRailing(rx + rw - 0.05, roomBaseY, rz, rd, false);
      } else {
        const riMat = getWallMat(isRightExterior, room.type, 'right');
        let rightOpening: { offset: number; width: number; height: number; sillHeight: number; type: 'door' | 'window' } | undefined;

        if (hasRightWindow) {
          rightOpening = { offset: rd / 2, width: WIN_W, height: WIN_H, sillHeight: WIN_SILL, type: 'window' };
        }

        buildWallWithOpening(rx + rw - WALL_THICKNESS, roomBaseY, rz, rd, WALL_HEIGHT, WALL_THICKNESS, riMat, rightOpening, false);

        if (rightOpening) {
          const oStartZ = rz + rightOpening.offset - rightOpening.width / 2;
          addWindowInOpening(rx + rw - WALL_THICKNESS, roomBaseY + rightOpening.sillHeight, oStartZ, rightOpening.width, rightOpening.height, WALL_THICKNESS, false, isRightExterior);
        }
      }

      // ── Furniture ──
      const ix = rx + WALL_THICKNESS;
      const iz = rz + WALL_THICKNESS;
      const iw = rw - WALL_THICKNESS * 2;
      const id = rd - WALL_THICKNESS * 2;
      const fy = roomBaseY + 0.03;

      addFurniture(room, ix, iz, iw, id, fy, roomBaseY);

      if (room.type === 'staircase') {
        staircaseRoom = room;
      }
    });

    // Columns
    fl.columns.forEach((col) => {
      const cx = col.x + setbacks.left;
      const cz = col.y + setbacks.front;
      const cw = (col.widthMM / 1000) * 0.9;
      const cd = (col.depthMM / 1000) * 0.9;
      addBox(cx - cw / 2, floorY, cz - cd / 2, cw, FLOOR_HEIGHT, cd, colMat);
    });
  });

  // ── Exterior facade details: plinth band, slab bands, accent strips ──
  const bW = layout.buildableWidthM;
  const bD = layout.buildableDepthM;
  const bandMat = makeMat('#604020', { roughness: 0.6 });
  const plinthMat = makeMat('#606060', { roughness: 0.8 });

  // Plinth band
  const plinthH = 0.3, plinthP = 0.04;
  addBox(buildMinX - plinthP, 0.05, buildMinZ - plinthP, bW + plinthP * 2, plinthH, plinthP, plinthMat);
  addBox(buildMinX - plinthP, 0.05, buildMaxZ, bW + plinthP * 2, plinthH, plinthP, plinthMat);
  addBox(buildMinX - plinthP, 0.05, buildMinZ, plinthP, plinthH, bD + plinthP * 2, plinthMat);
  addBox(buildMaxX, 0.05, buildMinZ, plinthP, plinthH, bD + plinthP * 2, plinthMat);

  // Slab band at each floor level
  for (let f = 1; f <= floorCount; f++) {
    const bandY = f * FLOOR_HEIGHT - 0.02;
    const bandH = 0.12;
    const bandP = 0.03;
    addBox(buildMinX - bandP, bandY, buildMinZ - bandP, bW + bandP * 2, bandH, bandP, bandMat);
    addBox(buildMinX - bandP, bandY, buildMaxZ, bW + bandP * 2, bandH, bandP, bandMat);
    addBox(buildMinX - bandP, bandY, buildMinZ, bandP, bandH, bD + bandP * 2, bandMat);
    addBox(buildMaxX, bandY, buildMinZ, bandP, bandH, bD + bandP * 2, bandMat);
  }

  // ── Front facade projection (cantilever effect for living/hall) ──
  frontFacadeRooms.forEach(fr => {
    const projDepth = 0.30;
    const projY = fr.floorY + SLAB_THICKNESS;
    // Projected front wall panel
    addBox(fr.rx, projY, fr.rz - projDepth, fr.rw, WALL_HEIGHT, projDepth, frontExtMat);
    // Slab projection below
    addBox(fr.rx, fr.floorY, fr.rz - projDepth, fr.rw, SLAB_THICKNESS, projDepth, slabMat);
  });

  // ── Recessed panels on side walls (reduce boxy look) ──
  const totalBuildingH = floorCount * FLOOR_HEIGHT;
  const recessDepth = 0.03;
  const recessDarkerMat = makeMat('#5898B8', { roughness: 0.7 }); // darker shade of sky blue
  const recessGreenMat = makeMat('#70A880', { roughness: 0.7 });  // darker shade of green

  // Left side recess
  const recessStartZ = buildMinZ + bD * 0.33;
  const recessLenZ = bD * 0.34;
  addBox(buildMinX - recessDepth - 0.01, SLAB_THICKNESS + 0.5, recessStartZ, recessDepth, totalBuildingH - 1.0, recessLenZ, recessDarkerMat);
  // Right side recess
  addBox(buildMaxX + 0.01, SLAB_THICKNESS + 0.5, recessStartZ, recessDepth, totalBuildingH - 1.0, recessLenZ, recessGreenMat);

  // ── Wood cladding accent on front facade ──
  const claddingW = Math.min(bW * 0.35, 3.0);
  const claddingX = buildMinX + bW * 0.1;
  addBox(claddingX, SLAB_THICKNESS + 0.35, buildMinZ - 0.06, claddingW, totalBuildingH - 0.5, 0.05, woodCladdingMat);
  for (let s = 0; s < 5; s++) {
    const slatY = SLAB_THICKNESS + 0.4 + s * (totalBuildingH - 0.6) / 5;
    addBox(claddingX + 0.02, slatY, buildMinZ - 0.09, claddingW - 0.04, 0.06, 0.03, makeMat('#604828', { roughness: 0.5 }));
  }

  // Second accent color panel on front
  const accentW2 = Math.min(bW * 0.25, 2.5);
  const accent2Mat = makeMat('#E07030', { roughness: 0.6 });
  addBox(buildMaxX - accentW2, SLAB_THICKNESS + 0.35, buildMinZ - 0.04, accentW2, totalBuildingH - 0.5, 0.03, accent2Mat);

  // ── Name plate on front facade ──
  const namePlateMat = makeMat('#2A2A2A', { roughness: 0.3, metalness: 0.4 });
  const npW = Math.min(bW * 0.25, 1.5);
  const npH = 0.25;
  addBox(bldgCenterX - npW / 2, SLAB_THICKNESS + DOOR_H + 0.3, buildMinZ - 0.06, npW, npH, 0.03, namePlateMat);

  // ── Entrance porch with steps ──
  const porchW = Math.min(bW * 0.4, 3.5);
  const porchX = buildMinX + (bW - porchW) / 2;
  const porchD = Math.min(setbacks.front * 0.5, 1.2);
  const porchZ = buildMinZ - porchD;
  if (setbacks.front > 0.5) {
    const porchMat = makeMat('#C0A080', { roughness: 0.75 });
    addBox(porchX, 0.05, porchZ, porchW, 0.35, porchD + 0.1, porchMat);
    const numSteps = 3;
    const stepD = porchD / numSteps;
    for (let i = 0; i < numSteps; i++) {
      const sy = 0.05 + (i + 1) * 0.35 / numSteps;
      addBox(porchX + 0.1, 0.05, porchZ - stepD * (numSteps - i), porchW - 0.2, sy, stepD, porchMat);
    }
    const canopyMat = makeMat('#606068', { roughness: 0.6 });
    addBox(porchX - 0.2, SLAB_THICKNESS + FLOOR_HEIGHT * 0.35, porchZ - 0.3, porchW + 0.4, 0.08, porchD + 0.6, canopyMat);
  }

  // ── Overall building & plot dimension lines ──
  const plotWm = layout.plotWidthM;
  const plotDm = layout.plotDepthM;
  const plotWft = (plotWm * 3.281).toFixed(0);
  const plotDft = (plotDm * 3.281).toFixed(0);
  const bldgWft = (bW * 3.281).toFixed(0);
  const bldgDft = (bD * 3.281).toFixed(0);
  const dimY = -0.3; // just below ground

  // Plot width (front)
  addDimensionLine(
    { x: 0, y: dimY, z: plotDm + 0.8 },
    { x: plotWm, y: dimY, z: plotDm + 0.8 },
    `PLOT: ${plotWft}' (${plotWm.toFixed(1)}m)`
  );
  // Plot depth (side)
  addDimensionLine(
    { x: -0.8, y: dimY, z: 0 },
    { x: -0.8, y: dimY, z: plotDm },
    `PLOT: ${plotDft}' (${plotDm.toFixed(1)}m)`
  );
  // Building width (front)
  addDimensionLine(
    { x: buildMinX, y: dimY - 0.15, z: buildMaxZ + 0.5 },
    { x: buildMaxX, y: dimY - 0.15, z: buildMaxZ + 0.5 },
    `BLDG: ${bldgWft}' (${bW.toFixed(1)}m)`
  );
  // Building height
  const totalFloors = layout.floors.length;
  const totalH = totalFloors * FLOOR_HEIGHT;
  addDimensionLine(
    { x: buildMaxX + 0.8, y: 0, z: buildMaxZ },
    { x: buildMaxX + 0.8, y: totalH, z: buildMaxZ },
    `HT: ${(totalH * 3.281).toFixed(0)}' (${totalH.toFixed(1)}m)`
  );

  // ── Landscaping — hedges ──
  const hedgeMat = makeMat('#2A7A2A', { roughness: 0.95 });

  // Side hedges along left setback
  if (setbacks.left > 0.6) {
    addBox(setbacks.left * 0.15, 0.06, buildMinZ + 0.5, 0.4, 0.4, bD * 0.3, hedgeMat);
  }
  if (setbacks.right > 0.6) {
    addBox(plotW - setbacks.right * 0.6, 0.06, buildMinZ + 0.5, 0.4, 0.4, bD * 0.3, hedgeMat);
  }

  // ── Roof/Terrace ──
  const topFloorNum = Math.max(...layout.floors.map(f => f.floor));
  const roofY = (topFloorNum + 1) * FLOOR_HEIGHT;
  if (options.showFloor === 'all' || options.showFloor === topFloorNum) {
    // Top slab
    addBox(buildMinX, roofY, buildMinZ, bW, SLAB_THICKNESS, bD, slabMat);

    // Varying parapet heights — front taller, sides medium, rear short
    const pFrontH = 1.2, pSideH = 0.9, pRearH = 0.8;
    const pT = 0.1;
    const pY = roofY + SLAB_THICKNESS;
    const parFrontMat = makeMat('#D49428', { roughness: 0.65 });
    const parLeftMat = makeMat('#70B8D8', { roughness: 0.7 });
    const parRightMat = makeMat('#88C898', { roughness: 0.7 });
    const parRearMat = makeMat('#E0D4C0', { roughness: 0.8 });
    addBox(buildMinX, pY, buildMinZ, bW, pFrontH, pT, parFrontMat);      // front — tallest
    addBox(buildMinX, pY, buildMaxZ - pT, bW, pRearH, pT, parRearMat);   // rear — shortest
    addBox(buildMinX, pY, buildMinZ, pT, pSideH, bD, parLeftMat);        // left
    addBox(buildMaxX - pT, pY, buildMinZ, pT, pSideH, bD, parRightMat);  // right

    // ── Decorative planters on front parapet ──
    const planterMat = makeMat('#C06030', { roughness: 0.75 });
    const planterPlantMat = makeMat('#3A8A2A', { roughness: 0.9 });
    const planterCount = Math.max(2, Math.floor(bW / 2.0));
    const planterSpacing = bW / (planterCount + 1);
    for (let i = 1; i <= planterCount; i++) {
      const ppx = buildMinX + i * planterSpacing;
      addBox(ppx - 0.15, pY + pFrontH, buildMinZ - 0.05, 0.30, 0.25, 0.30, planterMat);
      const pGeo = new THREE.SphereGeometry(0.14, 6, 5);
      const pMesh = new THREE.Mesh(pGeo, planterPlantMat);
      pMesh.position.set(ppx, pY + pFrontH + 0.35, buildMinZ + 0.10);
      pMesh.castShadow = true;
      scene.add(pMesh);
    }

    // Water tank
    const wtMat = makeMat('#5588BB', { roughness: 0.4, metalness: 0.2 });
    addBox(buildMaxX - 1.5, pY, buildMaxZ - 1.2, 1.2, 1.0, 0.8, wtMat);

    // ── Staircase Mumty — proper headroom enclosure ──
    if (staircaseRoom) {
      const sr = staircaseRoom;
      const sx = sr.x + setbacks.left;
      const sz = sr.y + setbacks.front;
      const mumtyH = 2.7;

      // Determine which faces are exterior for color assignment
      const mIsLeft = Math.abs(sx - buildMinX) < 0.1;
      const mIsRight = Math.abs(sx + sr.width - buildMaxX) < 0.1;
      const mIsFront = Math.abs(sz - buildMinZ) < 0.1;
      const mIsRear = Math.abs(sz + sr.depth - buildMaxZ) < 0.1;

      // Mumty walls — match building exterior
      const mFrontMat = mIsFront ? frontExtMat : sideExtMat;
      const mRearMat = mIsRear ? rearExtMat : sideExtMat;
      const mLeftMat = mIsLeft ? sideExtMat : frontExtMat;
      const mRightMat = mIsRight ? accentGreenMat : rearExtMat;

      // Front wall of mumty
      addBox(sx, pY, sz, sr.width, mumtyH, WALL_THICKNESS, mFrontMat);
      // Rear wall
      addBox(sx, pY, sz + sr.depth - WALL_THICKNESS, sr.width, mumtyH, WALL_THICKNESS, mRearMat);
      // Left wall
      addBox(sx, pY, sz, WALL_THICKNESS, mumtyH, sr.depth, mLeftMat);
      // Right wall
      addBox(sx + sr.width - WALL_THICKNESS, pY, sz, WALL_THICKNESS, mumtyH, sr.depth, mRightMat);

      // Mumty slab on top
      addBox(sx, pY + mumtyH, sz, sr.width, SLAB_THICKNESS, sr.depth, slabMat);

      // Small parapet on mumty
      const mParH = 0.3;
      const mParT = 0.08;
      addBox(sx, pY + mumtyH + SLAB_THICKNESS, sz, sr.width, mParH, mParT, mFrontMat);
      addBox(sx, pY + mumtyH + SLAB_THICKNESS, sz + sr.depth - mParT, sr.width, mParH, mParT, mRearMat);
      addBox(sx, pY + mumtyH + SLAB_THICKNESS, sz, mParT, mParH, sr.depth, mLeftMat);
      addBox(sx + sr.width - mParT, pY + mumtyH + SLAB_THICKNESS, sz, mParT, mParH, sr.depth, mRightMat);

      // Door opening (dark rectangle on front face)
      const mumtyDoorMat = makeMat('#2A1A0A', { roughness: 0.8 });
      addBox(sx + sr.width / 2 - 0.4, pY, sz - 0.02, 0.8, 2.0, 0.04, mumtyDoorMat);

      // Weathering course strip on top
      const wcMat2 = makeMat('#707070', { roughness: 0.6 });
      addBox(sx - 0.02, pY + mumtyH + SLAB_THICKNESS + mParH, sz - 0.02, sr.width + 0.04, 0.04, sr.depth + 0.04, wcMat2);
    }
  }

  // ── Furniture helper ──
  function addFurniture(room: Room, ix: number, iz: number, iw: number, id: number, fy: number, roomBaseY: number) {
    const bedMat = makeMat('#6B3A0A', { roughness: 0.6 });
    const mattressMat = makeMat('#FFFFFF', { roughness: 0.9 });
    const bedsheetMat = makeMat('#3A6EA5', { roughness: 0.85 });
    const bedsheetMat2 = makeMat('#8B4A6B', { roughness: 0.85 });
    const sofaMat = makeMat('#3A7A5A', { roughness: 0.7 });
    const tableMat = makeMat('#5A3A10', { roughness: 0.6 });
    const counterMat = makeMat('#E8E0D0', { roughness: 0.4, metalness: 0.1 });
    const cabinetMat = makeMat('#604020', { roughness: 0.6 });
    const wcMat = makeMat('#FFFFFF', { roughness: 0.2, metalness: 0.15 });
    const carMat = makeMat('#2A3A5A', { roughness: 0.3, metalness: 0.4 });
    const stepMat = makeMat('#A09888', { roughness: 0.75 });

    switch (room.type) {
      case 'bedroom': {
        const bw = Math.min(iw * 0.65, 2.0), bd = Math.min(id * 0.65, 2.2);
        const bx = ix + (iw - bw) / 2, bz = iz + id - bd - 0.15;
        addBox(bx, fy, bz, bw, 0.4, bd, bedMat);
        addBox(bx, fy, bz + bd - 0.08, bw, 0.9, 0.08, bedMat);
        addBox(bx + 0.05, fy + 0.4, bz + 0.05, bw - 0.1, 0.18, bd - 0.15, mattressMat);
        addBox(bx + 0.08, fy + 0.58, bz + 0.08, bw - 0.16, 0.04, bd * 0.55, bedsheetMat);
        const pillowMat = makeMat('#F8F8FF', { roughness: 0.95 });
        addBox(bx + 0.15, fy + 0.58, bz + bd - 0.45, bw * 0.35, 0.1, 0.3, pillowMat);
        addBox(bx + bw * 0.55, fy + 0.58, bz + bd - 0.45, bw * 0.35, 0.1, 0.3, pillowMat);
        if (bx + bw + 0.6 < ix + iw) {
          addBox(bx + bw + 0.1, fy, bz + bd - 0.5, 0.45, 0.55, 0.45, tableMat);
        }
        break;
      }
      case 'master_bedroom': {
        const bw = Math.min(iw * 0.65, 2.2), bd = Math.min(id * 0.65, 2.2);
        const bx = ix + (iw - bw) / 2, bz = iz + id - bd - 0.15;
        addBox(bx, fy, bz, bw, 0.4, bd, bedMat);
        addBox(bx, fy, bz + bd - 0.08, bw, 0.9, 0.08, bedMat);
        addBox(bx + 0.05, fy + 0.4, bz + 0.05, bw - 0.1, 0.18, bd - 0.15, mattressMat);
        addBox(bx + 0.08, fy + 0.58, bz + 0.08, bw - 0.16, 0.04, bd * 0.55, bedsheetMat2);
        const pillowMatM = makeMat('#E8C840', { roughness: 0.9 });
        addBox(bx + 0.15, fy + 0.58, bz + bd - 0.45, bw * 0.35, 0.1, 0.3, pillowMatM);
        addBox(bx + bw * 0.55, fy + 0.58, bz + bd - 0.45, bw * 0.35, 0.1, 0.3, pillowMatM);
        addBox(ix + 0.1, fy, iz + 0.1, Math.min(iw * 0.4, 1.8), 2.1, 0.6, cabinetMat);
        const wardDoorMat = makeMat('#A08060', { roughness: 0.6 });
        addBox(ix + 0.12, fy + 0.1, iz + 0.1, Math.min(iw * 0.4, 1.8) - 0.04, 1.9, 0.02, wardDoorMat);
        break;
      }
      case 'hall': {
        const sofaW = Math.min(iw * 0.65, 2.5), sofaD = 0.85;
        const sx = ix + 0.15, sz = iz + id - sofaD - 0.15;
        addBox(sx, fy, sz, sofaW, 0.42, sofaD, sofaMat);
        addBox(sx, fy + 0.42, sz + sofaD - 0.15, sofaW, 0.3, 0.15, sofaMat);
        addBox(sx, fy, sz - 1.0, 0.85, 0.42, 1.0, sofaMat);
        addBox(sx, fy + 0.42, sz - 1.0, 0.15, 0.3, 1.0, sofaMat);
        const cushionMat = makeMat('#CC4444', { roughness: 0.9 });
        addBox(sx + 0.2, fy + 0.42, sz + 0.15, 0.5, 0.12, 0.5, cushionMat);
        addBox(sx + sofaW * 0.5, fy + 0.42, sz + 0.15, 0.5, 0.12, 0.5, cushionMat);
        addBox(sx + sofaW * 0.3, fy, sz - 0.3, 1.0, 0.38, 0.55, tableMat);
        addBox(ix + iw * 0.15, fy, iz + 0.1, iw * 0.6, 0.6, 0.4, cabinetMat);
        const tvMat = makeMat('#1A1A2E', { roughness: 0.1, metalness: 0.5 });
        addBox(ix + iw * 0.2, fy + 0.65, iz + 0.15, iw * 0.5, iw * 0.3, 0.04, tvMat);
        break;
      }
      case 'kitchen': {
        const cDepth = 0.6, cH = 0.9;
        addBox(ix, fy, iz + id - cDepth, iw, cH, cDepth, counterMat);
        addBox(ix + iw - cDepth, fy, iz, cDepth, cH, id - cDepth, counterMat);
        const graniteMat = makeMat('#2A2A2A', { roughness: 0.3, metalness: 0.15 });
        addBox(ix, fy + cH, iz + id - cDepth, iw, 0.04, cDepth, graniteMat);
        addBox(ix + iw - cDepth, fy + cH, iz, cDepth, 0.04, id - cDepth, graniteMat);
        const ohY = roomBaseY + 2.0;
        addBox(ix, ohY, iz + id - 0.38, iw, 0.65, 0.38, cabinetMat);
        const sinkMat = makeMat('#C0C0C8', { roughness: 0.2, metalness: 0.5 });
        addBox(ix + iw * 0.3, fy + cH + 0.02, iz + id - cDepth + 0.1, 0.6, 0.08, 0.45, sinkMat);
        const stoveMat = makeMat('#333333', { roughness: 0.3, metalness: 0.3 });
        addBox(ix + iw - cDepth + 0.1, fy + cH + 0.02, iz + id * 0.4, 0.45, 0.04, 0.55, stoveMat);
        break;
      }
      case 'dining': {
        const tw = Math.min(iw * 0.5, 1.5), td = Math.min(id * 0.4, 1.0);
        const tx = ix + (iw - tw) / 2, tz = iz + (id - td) / 2;
        addBox(tx, fy, tz, tw, 0.75, td, tableMat);
        const cs = 0.35, chairH = 0.45;
        const chairMat = makeMat('#6B5A3A', { roughness: 0.8 });
        addBox(tx + tw * 0.25 - cs / 2, fy, tz - cs - 0.1, cs, chairH, cs, chairMat);
        addBox(tx + tw * 0.75 - cs / 2, fy, tz - cs - 0.1, cs, chairH, cs, chairMat);
        addBox(tx + tw * 0.25 - cs / 2, fy, tz + td + 0.1, cs, chairH, cs, chairMat);
        addBox(tx + tw * 0.75 - cs / 2, fy, tz + td + 0.1, cs, chairH, cs, chairMat);
        break;
      }
      case 'toilet': {
        addBox(ix + iw * 0.35, fy, iz + id - 0.7, 0.45, 0.42, 0.6, wcMat);
        addBox(ix + iw * 0.38, fy + 0.42, iz + id - 0.3, 0.38, 0.35, 0.2, wcMat);
        addBox(ix + 0.1, fy + 0.75, iz + 0.15, 0.55, 0.12, 0.45, wcMat);
        addBox(ix + 0.25, fy, iz + 0.25, 0.25, 0.75, 0.25, wcMat);
        const mirrorMat = makeMat('#AAD4E8', { roughness: 0.05, metalness: 0.8 });
        addBox(ix + 0.12, roomBaseY + 1.1, iz + 0.16, 0.5, 0.6, 0.03, mirrorMat);
        const showerMat = makeMat('#A0B8C8', { roughness: 0.4 });
        if (iw > 1.5) {
          addBox(ix + iw - 1.0, fy, iz + 0.1, 0.9, 0.05, id * 0.5, showerMat);
          addBox(ix + iw - 0.6, roomBaseY + 0.15, iz + 0.12, 0.03, 2.0, 0.03, railMat);
        }
        break;
      }
      case 'parking': {
        const cw = Math.min(iw * 0.6, 1.8), cd = Math.min(id * 0.7, 4.0);
        const cx = ix + (iw - cw) / 2, cz = iz + (id - cd) / 2;
        addBox(cx, fy, cz, cw, 0.8, cd, carMat);
        const cabinMat = makeMat('#88AACC', { transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.4 });
        addBox(cx + 0.15, fy + 0.8, cz + cd * 0.25, cw - 0.3, 0.5, cd * 0.45, cabinMat);
        break;
      }
      case 'staircase': {
        const numSteps = 16;
        const stepH = WALL_HEIGHT / numSteps;
        const isLong = id >= iw;
        const stepLen = isLong ? id / numSteps : iw / numSteps;

        for (let i = 0; i < numSteps; i++) {
          const sy = roomBaseY + SLAB_THICKNESS + (i + 1) * stepH;
          if (isLong) {
            const sz = iz + i * stepLen;
            addBox(ix, roomBaseY + SLAB_THICKNESS, sz, iw, sy - roomBaseY - SLAB_THICKNESS, stepLen, stepMat);
          } else {
            const sxPos = ix + i * stepLen;
            addBox(sxPos, roomBaseY + SLAB_THICKNESS, iz, stepLen, sy - roomBaseY - SLAB_THICKNESS, id, stepMat);
          }
        }
        break;
      }
      case 'puja': {
        const mw = Math.min(iw * 0.6, 1.0), md = 0.35;
        const mx = ix + (iw - mw) / 2, mz = iz + id - md - 0.1;
        const altarMat = makeMat('#C8A050', { roughness: 0.6 });
        addBox(mx, fy + 0.6, mz, mw, 0.08, md, altarMat);
        addBox(mx - 0.05, fy, mz - 0.05, mw + 0.1, 0.15, md + 0.1, altarMat);
        break;
      }
      default:
        break;
    }
  }
}
