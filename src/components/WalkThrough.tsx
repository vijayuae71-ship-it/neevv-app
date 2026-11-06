'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, ProjectRequirements, Room } from '../types';
import { buildScene } from '../utils/sceneBuilder';
import { FLOOR_TO_FLOOR_MM, PLINTH_HEIGHT_MM, mainDoorCentreM } from '../utils/buildingModel';
import { Footprints, Maximize, Compass, ArrowUp, ArrowDown, DoorOpen } from 'lucide-react';

/**
 * Walk inside the house at eye level — the same model as Interactive 3D / AR, built from the locked plan.
 * Phone: joystick to walk, drag to look (or turn the phone). Computer: W/A/S/D or arrows, drag to look.
 * Walls, windows and tall furniture are solid; doors let you through; stairs take you between floors.
 */
interface Props { layout: Layout; requirements: ProjectRequirements }

const EYE = 1.6, RADIUS = 0.28, WALK = 1.4, RUN = 2.6;
const PL = PLINTH_HEIGHT_MM / 1000, FH = FLOOR_TO_FLOOR_MM / 1000;
const floorLevel = (f: number) => PL + f * FH;
const SKIP = (r: Room) => r.type === 'puja' && /niche/i.test(r.name);

export const WalkThrough: React.FC<Props> = ({ layout, requirements }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  // mutable walk state shared with the render loop
  const st = useRef({ x: 0, z: 0, y: 0, yaw: Math.PI, pitch: 0, floor: 0, move: { f: 0, s: 0 }, keys: new Set<string>(), run: false, gyro: null as null | { a0: number; yaw0: number } });
  const jump = useRef<(room: Room, floor: number) => void>(() => {});
  const [here, setHere] = useState<{ name: string; floor: number; stair: boolean }>({ name: 'Outside, at the front door', floor: 0, stair: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gyroOn, setGyroOn] = useState(false);
  const [hint, setHint] = useState(true);

  const sb = layout.setbacks;
  const rooms = useMemo(() => layout.floors.map(f => ({ floor: f.floor, label: f.floorLabel, rooms: f.rooms.filter(r => !SKIP(r)) })), [layout]);

  useEffect(() => {
    let raf = 0, disposed = false, cleanup = () => {};
    const start = () => {
      const THREE = (window as any).THREE, host = hostRef.current;
      if (!THREE || !host) return false;
      const w = host.clientWidth || 800, h = host.clientHeight || 500;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#cfe3f3');
      const camera = new THREE.PerspectiveCamera(70, w / h, 0.05, 300);
      camera.rotation.order = 'YXZ';
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = false; // shadows inside rooms read as darkness at eye level
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = 'none';

      buildScene(scene, layout, requirements, { showFloor: 'all', cutaway: false });
      // labels and dimension lines are for the overview; inside they float in your face
      const drop: any[] = [];
      scene.traverse((o: any) => { if (o.isSprite || o.isLine) drop.push(o); else if (o.isMesh && o.userData.passable) o.visible = false; }); // doorways shown open
      drop.forEach(o => o.parent?.remove(o));
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const lamp = new THREE.PointLight(0xfff4e0, 0.7, 9); scene.add(lamp); // interior light that goes with you

      // solid things: anything taller than half a metre that is not a door
      const solids: any[] = [];
      const box = new THREE.Box3();
      scene.traverse((o: any) => {
        if (!o.isMesh || o.userData.passable) return;
        box.setFromObject(o);
        const sz = box.getSize(new THREE.Vector3());
        if (sz.y > 0.5 && (sz.x < 25 && sz.z < 25)) solids.push(o);
      });
      const ray = new THREE.Raycaster();
      const blocked = (x: number, z: number, dx: number, dz: number, dist: number) => {
        const len = Math.hypot(dx, dz); if (len < 1e-6) return false;
        const dir = new THREE.Vector3(dx / len, 0, dz / len);
        for (const hgt of [1.1, 1.75]) {
          ray.set(new THREE.Vector3(x, st.current.y - EYE + hgt, z), dir); ray.far = dist + RADIUS;
          if (ray.intersectObjects(solids, false).length) return true;
        }
        return false;
      };

      const bMinX = sb.left, bMinZ = sb.front, bW = layout.buildableWidthM, bD = layout.buildableDepthM;
      const inside = (x: number, z: number) => x > bMinX && x < bMinX + bW && z > bMinZ && z < bMinZ + bD;
      const roomAt = (f: number, x: number, z: number) => (layout.floors.find(fl => fl.floor === f)?.rooms ?? [])
        .filter(r => !SKIP(r)).find(r => x - sb.left >= r.x && x - sb.left <= r.x + r.width && z - sb.front >= r.y && z - sb.front <= r.y + r.depth);

      // start on the path, two steps outside the main door, facing the house
      const s = st.current;
      s.x = bMinX + (mainDoorCentreM(layout) ?? bW / 2); s.z = Math.max(0.6, bMinZ - 2); s.floor = 0; s.yaw = Math.PI; s.pitch = -0.05; s.y = EYE;
      jump.current = (r, f) => { s.floor = f; s.x = sb.left + r.x + r.width / 2; s.z = sb.front + r.y + r.depth / 2; s.y = floorLevel(f) + EYE; };

      const clock = new THREE.Clock();
      let lastRoom = '';
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        const k = s.keys;
        const f = s.move.f + (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
        const sd = s.move.s + (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
        if (k.has('arrowleft')) s.yaw += 1.8 * dt;
        if (k.has('arrowright')) s.yaw -= 1.8 * dt;
        const speed = (s.run || k.has('shift') ? RUN : WALK) * dt;
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
        const dx = (fx * f + rx * sd) * speed, dz = (fz * f + rz * sd) * speed;
        // slide along walls: try each axis on its own
        if (dx && !blocked(s.x, s.z, dx, 0, Math.abs(dx))) s.x += dx;
        if (dz && !blocked(s.x, s.z, 0, dz, Math.abs(dz))) s.z += dz;
        s.x = Math.min(layout.plotWidthM - 0.3, Math.max(0.3, s.x)); s.z = Math.min(layout.plotDepthM - 0.3, Math.max(0.3, s.z));
        // eye height: ground outside, finished floor inside
        const target = (inside(s.x, s.z) || s.floor > 0 ? floorLevel(s.floor) : 0) + EYE;
        s.y += (target - s.y) * Math.min(1, dt * 8);
        camera.position.set(s.x, s.y, s.z);
        camera.rotation.set(s.pitch, s.yaw, 0);
        lamp.position.set(s.x, s.y + 0.6, s.z);
        renderer.render(scene, camera);
        const r = inside(s.x, s.z) ? roomAt(s.floor, s.x, s.z) : undefined;
        const name = r ? r.name : inside(s.x, s.z) ? 'Passage' : 'Outside';
        const key = `${name}|${s.floor}`;
        if (key !== lastRoom) { lastRoom = key; setHere({ name, floor: s.floor, stair: r?.type === 'staircase' }); }
      };
      loop();

      // keyboard (ignored while typing in a form field)
      const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; const key = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { s.keys.add(key); setHint(false); if (key.startsWith('arrow')) e.preventDefault(); } };
      const ku = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
      // drag to look
      let drag: { id: number; x: number; y: number } | null = null;
      const el = renderer.domElement as HTMLCanvasElement;
      const pd = (e: PointerEvent) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); setHint(false); };
      const pm = (e: PointerEvent) => {
        if (!drag || drag.id !== e.pointerId) return;
        s.yaw += (e.clientX - drag.x) * 0.005; s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch + (e.clientY - drag.y) * 0.004));
        if (s.gyro) s.gyro.yaw0 += (e.clientX - drag.x) * 0.005;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      };
      const pu = () => { drag = null; };
      el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm); el.addEventListener('pointerup', pu); el.addEventListener('pointercancel', pu);
      const onResize = () => { const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
      const ro = new ResizeObserver(onResize); ro.observe(host);

      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
        scene.traverse((o: any) => { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m?.dispose?.()); });
        renderer.dispose(); try { host.removeChild(renderer.domElement); } catch { /* already gone */ }
      };
      return true;
    };
    let tries = 0;
    const wait = () => { if (disposed) return; if (start()) return; if (++tries > 100) { setError('3D engine did not load. Please refresh the page.'); return; } setTimeout(wait, 100); };
    wait();
    return () => { disposed = true; cleanup(); };
  }, [layout, requirements]); // eslint-disable-line react-hooks/exhaustive-deps

  // on-screen joystick (phones)
  useEffect(() => {
    const pad = stickRef.current, knob = knobRef.current;
    if (!pad || !knob) return;
    let id: number | null = null;
    const set = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let x = e.clientX - r.left - R, y = e.clientY - r.top - R; const l = Math.hypot(x, y);
      if (l > R) { x *= R / l; y *= R / l; }
      knob.style.transform = `translate(${x}px, ${y}px)`;
      st.current.move = { f: -y / R, s: x / R }; st.current.run = l > R * 0.95;
    };
    const down = (e: PointerEvent) => { id = e.pointerId; pad.setPointerCapture(e.pointerId); set(e); setHint(false); e.preventDefault(); };
    const move = (e: PointerEvent) => { if (e.pointerId === id) set(e); };
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; knob.style.transform = 'translate(0,0)'; st.current.move = { f: 0, s: 0 }; st.current.run = false; };
    pad.addEventListener('pointerdown', down); pad.addEventListener('pointermove', move); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    return () => { pad.removeEventListener('pointerdown', down); pad.removeEventListener('pointermove', move); pad.removeEventListener('pointerup', up); pad.removeEventListener('pointercancel', up); };
  }, [ready]);

  // look by turning the phone
  useEffect(() => {
    if (!gyroOn) { st.current.gyro = null; return; }
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      const s = st.current;
      if (!s.gyro) s.gyro = { a0: e.alpha, yaw0: s.yaw };
      s.yaw = s.gyro.yaw0 + ((e.alpha - s.gyro.a0) * Math.PI) / 180;
      s.pitch = Math.max(-1.2, Math.min(1.2, ((e.beta - 90) * Math.PI) / 180));
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [gyroOn]);

  const toggleGyro = async () => {
    if (gyroOn) { setGyroOn(false); return; }
    const D = (window as any).DeviceOrientationEvent;
    try { if (D?.requestPermission && (await D.requestPermission()) !== 'granted') return; } catch { return; }
    setGyroOn(true);
  };
  const fullscreen = () => { const el = wrapRef.current as any; if (document.fullscreenElement) document.exitFullscreen(); else (el?.requestFullscreen ?? el?.webkitRequestFullscreen)?.call(el); };
  const stairs = (dir: 1 | -1) => {
    const f = here.floor + dir, fl = rooms.find(x => x.floor === f); if (!fl) return;
    // land in the lobby next to the stair (not inside the flight), else at the stair
    const st2 = fl.rooms.find(r => r.type === 'passage') ?? fl.rooms.find(r => r.type === 'staircase') ?? fl.rooms[0]; if (st2) jump.current(st2, f);
  };

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[460px] rounded-lg overflow-hidden bg-gray-200 select-none" style={{ touchAction: 'none' }}>
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">Preparing the walk-through…</div>}
      {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700 p-6 text-center">{error}</div>}

      {/* where you are */}
      <div className="absolute top-2 left-2 right-2 flex items-start gap-2 pointer-events-none">
        <div className="bg-black/60 text-white text-xs font-semibold rounded-lg px-3 py-1.5">
          <Footprints size={12} className="inline mr-1" />{here.name}{layout.floors.length > 1 ? ` · ${rooms.find(f => f.floor === here.floor)?.label ?? ''}` : ''}
        </div>
        <div className="flex-1" />
        <div className="flex gap-1 pointer-events-auto">
          <button onClick={toggleGyro} className={`btn btn-xs ${gyroOn ? 'btn-primary' : 'bg-white/90'}`} title="Look around by turning your phone"><Compass size={12} /> {gyroOn ? 'Phone look on' : 'Turn phone to look'}</button>
          <button onClick={fullscreen} className="btn btn-xs bg-white/90" title="Full screen"><Maximize size={12} /></button>
        </div>
      </div>

      {/* go to a room */}
      <div className="absolute top-10 left-2 right-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
        {rooms.map(fl => fl.rooms.map(r => (
          <button key={r.id} onClick={() => { jump.current(r, fl.floor); setHint(false); }}
            className="btn btn-xs bg-white/85 border-0 normal-case font-normal">
            <DoorOpen size={11} />{r.name.replace(/\s*\(.*?\)\s*/g, '')}{rooms.length > 1 ? ` (${fl.floor === 0 ? 'GF' : `F${fl.floor}`})` : ''}
          </button>
        )))}
      </div>

      {/* stairs */}
      {here.stair && (
        <div className="absolute right-3 bottom-28 flex flex-col gap-2">
          {rooms.some(f => f.floor === here.floor + 1) && <button onClick={() => stairs(1)} className="btn btn-sm btn-primary"><ArrowUp size={14} /> Go upstairs</button>}
          {here.floor > 0 && <button onClick={() => stairs(-1)} className="btn btn-sm btn-primary"><ArrowDown size={14} /> Go downstairs</button>}
        </div>
      )}

      {/* joystick */}
      <div ref={stickRef} className="absolute left-4 bottom-4 w-28 h-28 rounded-full bg-black/25 border-2 border-white/60 flex items-center justify-center" style={{ touchAction: 'none' }} aria-label="Walk joystick">
        <div ref={knobRef} className="w-12 h-12 rounded-full bg-white/90 shadow-lg pointer-events-none" />
      </div>

      {hint && ready && (
        <div className="absolute left-1/2 bottom-6 -translate-x-1/2 bg-black/65 text-white text-xs rounded-lg px-3 py-2 text-center pointer-events-none max-w-[70%]">
          Use the circle to walk (push to the edge to run) and drag the screen to look around.<br className="hidden sm:block" />
          <span className="hidden sm:inline"> On a computer: W A S D or arrow keys, Shift to run.</span> Tap a room name to jump there.
        </div>
      )}
    </div>
  );
};

export default WalkThrough;
