import React, { useRef, useEffect, useState } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { buildScene } from '../utils/sceneBuilder';
import { AIRenderView } from './AIRenderView';
import { Box, Sparkles, Ruler } from 'lucide-react';
import BrandWatermark from './BrandWatermark';

/** Floating dimension info panel */
const DimensionPanel: React.FC<{ layout: Layout; requirements: ProjectRequirements }> = ({ layout, requirements }) => {
  const numFloors = layout.floors.length;
  const frontSetback = requirements.plotWidthFt >= 40 ? 3.0 : 1.5;
  const sideSetback = requirements.plotWidthFt >= 40 ? 1.5 : 1.0;
  const rearSetback = requirements.plotDepthFt >= 40 ? 1.5 : 1.0;
  const buildW = layout.plotWidthM - 2 * sideSetback;
  const buildD = layout.plotDepthM - frontSetback - rearSetback;
  const builtUpPerFloor = Math.round(buildW * buildD * 10.764);
  const totalBuiltUp = builtUpPerFloor * numFloors;
  const totalHeight = numFloors * 3;

  return (
    <div className="absolute bottom-3 right-3 bg-base-100/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs z-10 border border-base-300" style={{ maxWidth: '220px' }}>
      <div className="flex items-center gap-1 font-bold text-primary mb-1.5 border-b border-base-300 pb-1">
        <Ruler size={12} />
        <span>KEY DIMENSIONS</span>
      </div>
      <div className="space-y-1 font-mono text-base-content/80">
        <div className="flex justify-between"><span>Plot:</span><span className="font-semibold">{requirements.plotWidthFt}' × {requirements.plotDepthFt}'</span></div>
        <div className="flex justify-between"><span>Building:</span><span className="font-semibold">{buildW.toFixed(1)}m × {buildD.toFixed(1)}m</span></div>
        <div className="flex justify-between"><span>Height:</span><span className="font-semibold">{totalHeight}m ({numFloors}F)</span></div>
        <div className="flex justify-between"><span>Floor Ht:</span><span className="font-semibold">3000mm</span></div>
        <div className="flex justify-between"><span>Slab:</span><span className="font-semibold">150mm RCC</span></div>
        <div className="flex justify-between"><span>Walls:</span><span className="font-semibold">230mm</span></div>
        <div className="flex justify-between"><span>Built-up/F:</span><span className="font-semibold">{builtUpPerFloor} sq.ft</span></div>
        <div className="flex justify-between"><span>Total:</span><span className="font-semibold text-primary">{totalBuiltUp} sq.ft</span></div>
        <div className="border-t border-base-300 pt-1 mt-1">
          <div className="flex justify-between"><span>Setback F:</span><span>{frontSetback}m</span></div>
          <div className="flex justify-between"><span>Setback S:</span><span>{sideSetback}m</span></div>
          <div className="flex justify-between"><span>Setback R:</span><span>{rearSetback}m</span></div>
        </div>
      </div>
    </div>
  );
};

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

export const IsometricView: React.FC<Props> = ({ layout, requirements }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  const [showFloor, setShowFloor] = useState<number | 'all'>('all');
  const [cutaway, setCutaway] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [viewMode, setViewMode] = useState<'3d' | 'ai'>('3d');

  // Setup scene once on mount / layout change
  useEffect(() => {
    if (viewMode !== '3d') return;
    const THREE = (window as any).THREE;
    if (!THREE || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E8F0F8');
    scene.fog = new THREE.Fog('#E8F0F8', 50, 100);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    const plotDiag = Math.sqrt(layout.plotWidthM ** 2 + layout.plotDepthM ** 2);
    camera.position.set(plotDiag * 0.8, plotDiag * 0.7, plotDiag * 0.8);
    camera.lookAt(layout.plotWidthM / 2, 1.5, layout.plotDepthM / 2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(layout.plotWidthM / 2, 1.5, layout.plotDepthM / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.update();
    controlsRef.current = controls;

    // Build scene
    buildScene(scene, layout, requirements, { showFloor: 'all', cutaway: false });

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [layout, viewMode]);

  // Rebuild scene when options change
  useEffect(() => {
    if (viewMode !== '3d' || !sceneRef.current) return;
    const scene = sceneRef.current;
    while (scene.children.length > 0) {
      const child = scene.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      scene.remove(child);
    }
    buildScene(scene, layout, requirements, { showFloor, cutaway });
  }, [showFloor, cutaway, layout, requirements, viewMode]);

  // Floor labels for toggle
  const floorLabels = layout.floors.map(f => ({ floor: f.floor, label: f.floorLabel }));

  return (
    <div className="flex flex-col h-full">
      {/* Mode Toggle Tabs */}
      <div className="flex items-center gap-1 mb-2">
        <button
          className={`btn btn-sm gap-1 ${viewMode === '3d' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewMode('3d')}
        >
          <Box size={14} />
          Interactive 3D
        </button>
        <button
          className={`btn btn-sm gap-1 ${viewMode === 'ai' ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setViewMode('ai')}
        >
          <Sparkles size={14} />
          AI Photorealistic Render
        </button>
      </div>

      {viewMode === '3d' ? (
        <>
          {/* 3D Toolbar */}
          <div className="flex items-center gap-2 p-2 bg-base-200 rounded-lg mb-2 flex-wrap">
            <span className="text-sm font-semibold text-base-content/70">Floor:</span>
            <button
              className={`btn btn-xs ${showFloor === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowFloor('all')}
            >
              All
            </button>
            {floorLabels.map(f => (
              <button
                key={f.floor}
                className={`btn btn-xs ${showFloor === f.floor ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setShowFloor(f.floor)}
              >
                {f.label}
              </button>
            ))}
            <div className="divider divider-horizontal mx-1" />
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-xs text-base-content/70">Cutaway</span>
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-primary"
                checked={cutaway}
                onChange={e => setCutaway(e.target.checked)}
              />
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-xs text-base-content/70">Dimensions</span>
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-secondary"
                checked={showDimensions}
                onChange={e => setShowDimensions(e.target.checked)}
              />
            </label>
            <div className="flex-1" />
            <span className="text-xs text-base-content/50">Drag to rotate • Scroll to zoom</span>
          </div>
          {/* 3D Canvas Container */}
          <div
            ref={containerRef}
            className="flex-1 rounded-lg overflow-hidden bg-base-300 min-h-0 relative"
            style={{ minHeight: '400px' }}
          >
            <BrandWatermark position="top-left" opacity={0.4} width={80} />
            {showDimensions && <DimensionPanel layout={layout} requirements={requirements} />}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-2 p-2 bg-base-200 rounded-lg">
            {[
              { label: 'Bedroom', color: '#D4885C' },
              { label: 'Hall/Living', color: '#E8CC78' },
              { label: 'Kitchen', color: '#7BC87B' },
              { label: 'Toilet', color: '#68B8D8' },
              { label: 'Balcony', color: '#E0A060' },
              { label: 'Staircase', color: '#909090' },
              { label: 'Parking', color: '#606060' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-base-content/70">{item.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <AIRenderView layout={layout} requirements={requirements} />
      )}
    </div>
  );
};
