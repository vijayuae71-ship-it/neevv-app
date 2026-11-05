'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { InteriorPlan } from '@/utils/drawingEngine';
import type { RoomInterior } from '@/types';
import { buildRoomScene } from '@/utils/roomScene';

/** Orbitable 3D of one furnished room, built from the same placement as the interior sheets. */
export default function Room3D({ plan, interior }: { plan: InteriorPlan; interior?: RoomInterior }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cutaway, setCutaway] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0, disposed = false, renderer: any = null, controls: any = null, onResize: (() => void) | null = null;
    const start = (THREE: any) => {
      if (disposed || !el) return;
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef2f6');
      const { w, d } = buildRoomScene(THREE, scene, plan, interior, { cutaway });
      const W = el.clientWidth, H = el.clientHeight;
      const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 100);
      camera.position.set(-w * 0.35, Math.max(w, d) * 1.05 + 1.5, -d * 0.45);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(W, H); renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.target.set(w / 2, 0.6, d / 2); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.05; controls.update();
      const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
      loop();
      onResize = () => { const w2 = el.clientWidth, h2 = el.clientHeight; camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2); };
      window.addEventListener('resize', onResize);
    };
    // three.js and OrbitControls load from the CDN in the app layout
    let tries = 0;
    const wait = () => {
      const T = (window as any).THREE;
      if (T?.OrbitControls) start(T);
      else if (++tries < 100) setTimeout(wait, 100);
      else setError('3D viewer could not load. Check your connection and reload.');
    };
    wait();
    return () => {
      disposed = true; cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener('resize', onResize);
      try { controls?.dispose(); } catch { /* already gone */ }
      if (renderer) { try { el.removeChild(renderer.domElement); } catch { /* already gone */ } renderer.dispose(); }
    };
  }, [plan, interior, cutaway]);

  return <div className="space-y-2">
    <div className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Cut-away front walls</label>
      <span className="text-xs text-gray-500">Drag to orbit · scroll to zoom. Same furniture, sizes and positions as the sheets and the BOQ.</span>
    </div>
    {error ? <div className="py-24 text-center text-sm text-red-600">{error}</div> : <div ref={ref} className="w-full h-[460px] rounded-xl overflow-hidden border border-gray-200" />}
  </div>;
}
