'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ProjectRequirements, BOQ } from '../types';
import {
  Layers, Grid3x3, ArrowUpDown, Building, Shovel, Columns3,
  BarChart3, BrickWall, Zap, Droplets, Grid2x2, Ruler, Download,
  Footprints, Container, ShieldCheck, Pipette, Sparkles, Loader2,
  CheckCircle2, PlayCircle, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import { exportAIPDF, ExportProgress } from '../utils/pdfExport';
import { applyTextOverlay, OVERLAY_DRAWING_TYPES } from '../utils/textOverlay';

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
  boq?: BOQ | null;
}

type DrawingType =
  | 'excavation'
  | 'foundation'
  | 'rccDetail'
  | 'section'
  | 'elevation'
  | 'structural'
  | 'reinforcement'
  | 'barBending'
  | 'brickwork'
  | 'electrical'
  | 'plumbing'
  | 'tiling'
  | 'footingDetail'
  | 'staircase'
  | 'waterTank'
  | 'waterproofing'
  | 'stp';

/* Map internal drawing types to API drawing types */
const aiDrawingMap: Record<DrawingType, string> = {
  excavation: 'excavation',
  foundation: 'column_layout',
  footingDetail: 'footing_detail',
  rccDetail: 'beam_slab',
  structural: 'column_detail',
  reinforcement: 'column_detail',
  barBending: 'bar_bending',
  section: 'section_aa',
  elevation: 'front_elevation',
  brickwork: 'brickwork_detail',
  electrical: 'electrical',
  plumbing: 'plumbing',
  staircase: 'staircase_detail',
  waterTank: 'water_tank',
  waterproofing: 'waterproofing',
  stp: 'stp_detail',
  tiling: 'tiling_layout',
};

/* Drawing types that differ between Ground Floor and First Floor and need separate generation/caching */
const FLOOR_SPECIFIC: DrawingType[] = ['electrical', 'plumbing', 'tiling', 'brickwork'];

export const WorkingDrawings: React.FC<Props> = ({ layout, requirements, boq }) => {
  const [activeDrawing, setActiveDrawing] = useState<DrawingType>('excavation');
  const [zoom, setZoom] = useState(100);
  const [selectedFloor, setSelectedFloor] = useState<'GF' | 'FF'>('GF');
  const [aiImages, setAiImages] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const drawingsStorageKey = `neevv-drawings-${requirements.plotWidthFt}x${requirements.plotDepthFt}`;

  const saveDrawings = useCallback((drawings: Record<string, string>) => {
    try {
      localStorage.setItem(drawingsStorageKey, JSON.stringify(drawings));
    } catch (e) {
      console.warn('Failed to save drawings to localStorage:', e);
    }
  }, [drawingsStorageKey]);

  /* Load cached drawings for this project on mount */
  useEffect(() => {
    try {
      const cached = localStorage.getItem(drawingsStorageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setAiImages(parsed as Record<string, string>);
        }
      }
    } catch (e) {
      console.warn('Failed to load drawings from localStorage:', e);
    }
  }, [drawingsStorageKey]);

  const isMultiFloor = (requirements?.floors?.length || layout?.floors?.length || 1) > 1;

  /* Cache key: floor-specific drawings get a separate key per floor, shared drawings don't */
  const getCacheKey = useCallback((dt: DrawingType, floor: 'GF' | 'FF') => {
    return FLOOR_SPECIFIC.includes(dt) ? `${dt}-${floor}` : dt;
  }, []);

  /* ---------- Single drawing generation ---------- */
  const generateSingle = useCallback(async (drawingType: DrawingType) => {
    const aiType = aiDrawingMap[drawingType];
    if (!aiType) return;

    const cacheKey = getCacheKey(drawingType, selectedFloor);

    setAiLoading(drawingType);
    setAiError(null);
    try {
      const res = await fetch('/api/generate-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawingType: aiType,
          layout,
          requirements,
          floor: FLOOR_SPECIFIC.includes(drawingType) ? selectedFloor : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `neevv Generation Pro: Drawing generation failed (${res.status})`);
      }
      const img = data.imageDataUri;
      if (img) {
        // Apply programmatic text overlay for numeric drawings
        let finalImg = img;
        if ((OVERLAY_DRAWING_TYPES as readonly string[]).includes(drawingType) && boq) {
          try {
            finalImg = await applyTextOverlay(img, drawingType, layout, boq, selectedFloor);
          } catch (e) {
            console.warn('Text overlay failed, using raw AI image:', e);
          }
        }
        setAiImages(prev => {
          const updated = { ...prev, [cacheKey]: finalImg };
          saveDrawings(updated);
          return updated;
        });
      } else {
        throw new Error('No image in response from neevv Generation Pro');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      console.error('AI generation error:', e);
      setAiError(msg);
    } finally {
      setAiLoading(null);
    }
  }, [layout, requirements, boq, selectedFloor, getCacheKey, saveDrawings]);

  /* ---------- Click handler for generate button ---------- */
  const handleGenerate = useCallback((drawingType: DrawingType) => {
    const cacheKey = getCacheKey(drawingType, selectedFloor);
    // If already cached, just view it
    if (aiImages[cacheKey]) {
      setActiveDrawing(drawingType);
      return;
    }
    generateSingle(drawingType);
  }, [aiImages, generateSingle, getCacheKey, selectedFloor]);

  /* ---------- Generate All ---------- */
  const generateAll = useCallback(async () => {
    setGeneratingAll(true);
    setAiError(null);
    const allTypes = Object.keys(aiDrawingMap) as DrawingType[];

    for (const dt of allTypes) {
      const cacheKey = getCacheKey(dt, selectedFloor);
      if (aiImages[cacheKey]) continue; // Skip cached

      setAiLoading(dt);
      setActiveDrawing(dt);
      try {
        const res = await fetch('/api/generate-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drawingType: aiDrawingMap[dt],
            layout,
            requirements,
            floor: FLOOR_SPECIFIC.includes(dt) ? selectedFloor : undefined,
          }),
        });
        const data = await res.json();
        if (data.success && data.imageDataUri) {
          let finalImg = data.imageDataUri;
          if ((OVERLAY_DRAWING_TYPES as readonly string[]).includes(dt) && boq) {
            try {
              finalImg = await applyTextOverlay(finalImg, dt, layout, boq, selectedFloor);
            } catch (e) {
              console.warn('Text overlay failed, using raw AI image:', e);
            }
          }
          setAiImages(prev => {
            const updated = { ...prev, [cacheKey]: finalImg };
            saveDrawings(updated);
            return updated;
          });
        }
      } catch {
        // Continue to next drawing
      }
    }

    setAiLoading(null);
    setGeneratingAll(false);
  }, [aiImages, layout, requirements, boq, selectedFloor, getCacheKey, saveDrawings]);

  /* ---------- PDF Export ---------- */
  const handleExportPDF = async () => {
    setExporting(true);
    setExportResult(null);
    setExportError(null);
    try {
      const path = await exportAIPDF(aiImages, layout, requirements, boq || null, setExportProgress);
      setExportResult(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setExportError(msg);
      console.error('PDF export error:', e);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  /* ---------- Download single image ---------- */
  const downloadImage = (drawingType: DrawingType) => {
    const cacheKey = getCacheKey(drawingType, selectedFloor);
    const dataUri = aiImages[cacheKey];
    if (!dataUri) return;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `neevv-${cacheKey.replace(/([A-Z])/g, '-$1').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generatedCount = Object.keys(aiImages).length;
  const totalDrawings = Object.keys(aiDrawingMap).length + (isMultiFloor ? FLOOR_SPECIFIC.length : 0);

  const tabs: { id: DrawingType; label: string; icon: React.ReactNode; group: string }[] = [
    { id: 'excavation', label: 'Excavation', icon: <Shovel size={12} />, group: 'Site' },
    { id: 'foundation', label: 'Foundation Plan', icon: <Grid3x3 size={12} />, group: 'Structure' },
    { id: 'footingDetail', label: 'Footing Detail', icon: <Layers size={12} />, group: 'Structure' },
    { id: 'rccDetail', label: 'RCC Slab/Beam', icon: <Layers size={12} />, group: 'Structure' },
    { id: 'structural', label: 'Column Grid', icon: <Columns3 size={12} />, group: 'Structure' },
    { id: 'reinforcement', label: 'Rebar Details', icon: <Ruler size={12} />, group: 'Structure' },
    { id: 'barBending', label: 'BBS', icon: <BarChart3 size={12} />, group: 'Structure' },
    { id: 'section', label: 'Section A-A', icon: <ArrowUpDown size={12} />, group: 'Views' },
    { id: 'elevation', label: 'Elevation', icon: <Building size={12} />, group: 'Views' },
    { id: 'brickwork', label: 'Brickwork', icon: <BrickWall size={12} />, group: 'Finishes' },
    { id: 'electrical', label: 'Electrical', icon: <Zap size={12} />, group: 'MEP' },
    { id: 'plumbing', label: 'Plumbing', icon: <Droplets size={12} />, group: 'MEP' },
    { id: 'tiling', label: 'Tiling', icon: <Grid2x2 size={12} />, group: 'Finishes' },
    { id: 'staircase', label: 'Staircase', icon: <Footprints size={12} />, group: 'Structure' },
    { id: 'waterTank', label: 'Water Tank', icon: <Container size={12} />, group: 'MEP' },
    { id: 'waterproofing', label: 'Waterproofing', icon: <ShieldCheck size={12} />, group: 'Finishes' },
    { id: 'stp', label: 'STP', icon: <Pipette size={12} />, group: 'MEP' },
  ];

  const groups = ['Site', 'Structure', 'Views', 'Finishes', 'MEP'];

  const descriptions: Record<DrawingType, string> = {
    excavation: 'Trench excavation layout with depths, bench mark, center line pegs, and earth removal volume. Trench width: 1800mm (1200mm footing + 300mm working space each side).',
    foundation: 'Foundation layout with isolated footings (1200\u00d71200\u00d7300mm), column pedestals, plinth beam grid (230\u00d7300). SBC assumed 150 kN/m\u00b2.',
    footingDetail: 'Detailed footing cross-section and plan with reinforcement, PCC bed, pedestal starter bars, and soil bearing details per IS 456.',
    rccDetail: 'RCC slab & beam layout showing slab panels (one-way/two-way), beam grid, reinforcement directions, staircase opening, and cantilever balcony slabs.',
    structural: 'Column-beam grid with centerline references. Column: 230\u00d7300mm. Beam: 230\u00d7400mm. Max clear span \u2264 4500mm.',
    reinforcement: 'Detailed reinforcement sections for footing, column, beam, slab, and lintel with bar sizes, spacing, cover, and stirrup details.',
    barBending: 'Bar Bending Schedule per IS 2502. All members quantified with bar mark, diameter, shape code, cutting length, and total weight.',
    section: `Cross-section showing foundation system, RCC frame, infill masonry, and lintels. Floor-to-floor: 3000mm. Slab: 150mm.`,
    elevation: `Front elevation (${requirements.facing} facing). Plinth, DPC, windows, main door, balcony, slab bands, parapet with coping.`,
    brickwork: 'Masonry layout: 230mm external walls (stretcher bond), 115mm partitions, door/window openings, lintel positions, waterproof plaster in wet areas.',
    electrical: 'Electrical layout: room-wise light/fan/socket/AC points, DB & MSB positions, circuit runs (power/lighting/earth), load schedule.',
    plumbing: 'Plumbing layout: cold/hot water supply lines, drainage with slope, fixtures (WC/basin/shower/sink), OHT, sump, manholes, RWP.',
    tiling: 'Floor finish layout: room-wise tile type/size, wall tiles in wet areas, skirting, threshold details, material schedule.',
    staircase: 'Dog-leg staircase detail: section and plan views with tread/riser dimensions, waist slab, handrail, landing, reinforcement per IS 456 / NBC 2016.',
    waterTank: 'Underground sump and overhead tank details: section views with reinforcement, inlet/outlet pipes, waterproof coating, capacity calculations per IS 3370.',
    waterproofing: 'Waterproofing details for roof terrace (APP membrane + brick bat coba) and bathroom (sunken floor + membrane) per IS 3067 / NBC Part 7.',
    stp: 'Sewage Treatment Plant layout: bar screen, settling tank, anaerobic baffled reactor, filter media, chlorination chamber with flow direction per CPCB / NBC Part 9.',
  };

  const cacheKey = getCacheKey(activeDrawing, selectedFloor);
  const activeImage = aiImages[cacheKey];
  const isLoadingCurrent = aiLoading === activeDrawing;
  const isLoadingOther = !!aiLoading && aiLoading !== activeDrawing;
  const activeTab = tabs.find(t => t.id === activeDrawing);
  const loadingTab = aiLoading ? tabs.find(t => t.id === aiLoading) : null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Tab bar - grouped */}
      <div className="p-2 bg-gray-100 border-b border-gray-200 overflow-x-auto">
        <div className="flex items-center gap-1 flex-wrap">
          {groups.map(g => {
            const groupTabs = tabs.filter(t => t.group === g);
            return (
              <React.Fragment key={g}>
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mr-1 ml-2">{g}</span>
                {groupTabs.map(t => {
                  const tabCacheKey = getCacheKey(t.id, selectedFloor);
                  const isGenerated = !!aiImages[tabCacheKey];
                  const isCurrentLoading = aiLoading === t.id;
                  return (
                    <button
                      key={t.id}
                      className={`btn btn-xs gap-1 ${activeDrawing === t.id ? 'btn-primary' : isGenerated ? 'btn-success btn-outline' : 'btn-ghost'}`}
                      onClick={() => { setActiveDrawing(t.id); }}
                    >
                      {isCurrentLoading ? <Loader2 size={10} className="animate-spin" /> : isGenerated ? <CheckCircle2 size={10} /> : t.icon}
                      {t.label}
                    </button>
                  );
                })}
                <span className="border-r border-gray-200 h-4 mx-1" />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 border-b border-gray-200">
        {/* Progress */}
        <span className="text-[10px] font-mono text-gray-500">
          <Sparkles size={10} className="inline mr-1" />
          {generatedCount}/{totalDrawings} generated
        </span>
        <div className="w-20 bg-gray-200 rounded-full h-1.5">
          <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${(generatedCount / totalDrawings) * 100}%` }} />
        </div>

        {/* Floor toggle - only relevant for multi-floor (G+1) projects */}
        {isMultiFloor && (
          <div className="flex items-center gap-0.5 ml-2 border border-gray-300 rounded overflow-hidden">
            <button
              className={`btn btn-xs rounded-none ${selectedFloor === 'GF' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedFloor('GF')}
            >
              GF
            </button>
            <button
              className={`btn btn-xs rounded-none ${selectedFloor === 'FF' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedFloor('FF')}
            >
              FF
            </button>
          </div>
        )}

        {/* Generate All */}
        <button
          className={`btn btn-xs btn-accent gap-1 ml-2 ${generatingAll ? 'btn-disabled' : ''}`}
          onClick={generateAll}
          disabled={generatingAll}
        >
          {generatingAll ? (
            <><Loader2 size={10} className="animate-spin" /> Generating All...</>
          ) : (
            <><PlayCircle size={10} /> Generate All</>
          )}
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-2">
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.max(50, z - 25))}><ZoomOut size={12} /></button>
          <span className="text-xs font-mono w-10 text-center">{zoom}%</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.min(200, z + 25))}><ZoomIn size={12} /></button>
          <button className="btn btn-xs btn-ghost" onClick={() => setZoom(100)}><RotateCcw size={10} /></button>
        </div>

        {aiError && !aiLoading && (
          <span className="text-[10px] text-red-600 ml-1 flex items-center gap-1">
            {aiError}
            <button className="btn btn-xs btn-error btn-outline ml-1" onClick={() => generateSingle(activeDrawing)}>Retry</button>
          </span>
        )}

        <div className="flex-1" />

        {/* Download current */}
        {activeImage && (
          <button className="btn btn-xs btn-ghost gap-1" onClick={() => downloadImage(activeDrawing)}>
            <Download size={12} /> Save Image
          </button>
        )}

        {/* PDF export */}
        {exporting ? (
          <span className="text-[10px] font-mono text-blue-600 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            {exportProgress ? `${exportProgress.step} (${exportProgress.current}/${exportProgress.total})` : 'Preparing...'}
          </span>
        ) : exportResult ? (
          <span className="text-[10px] font-mono text-green-600">{'\u2713'} PDF downloaded</span>
        ) : exportError ? (
          <span className="text-[10px] font-mono text-red-600">{exportError}</span>
        ) : null}
        <button
          className={`btn btn-xs gap-1 ${exporting || generatedCount === 0 ? 'btn-disabled' : 'btn-primary'}`}
          onClick={handleExportPDF}
          disabled={exporting || generatedCount === 0}
        >
          <Download size={12} /> {exporting ? 'Exporting...' : 'Download PDF'}
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto min-h-0 bg-neutral-100 p-4">
        {isLoadingCurrent ? (
          /* Loading state — this drawing is being generated */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative">
              <Loader2 size={48} className="animate-spin text-primary" />
              <Sparkles size={16} className="absolute -top-1 -right-1 text-amber-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-700">neevv Generation Pro</p>
              <p className="text-sm text-gray-500 mt-1">
                Generating {activeTab?.label || activeDrawing}...
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Professional architectural drawing with NBC 2016 compliance
              </p>
            </div>
          </div>
        ) : activeImage ? (
          /* Generated image */
          <div className="flex justify-center">
            <img
              src={activeImage}
              alt={activeTab?.label || activeDrawing}
              className="max-w-full rounded shadow-lg"
              style={{
                maxHeight: '80vh',
                width: zoom === 100 ? 'auto' : `${zoom}%`,
              }}
            />
          </div>
        ) : (
          /* Placeholder — Generate prompt */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-24 h-24 rounded-2xl bg-gray-200 flex items-center justify-center">
              {activeTab?.icon ? React.cloneElement(activeTab.icon as React.ReactElement, { size: 40, className: 'text-gray-400' }) : <Layers size={40} className="text-gray-400" />}
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold text-gray-700">{activeTab?.label || activeDrawing}</h3>
              <p className="text-sm text-gray-500 mt-1">{descriptions[activeDrawing]}</p>
            </div>

            {/* Show status banner when another drawing is being generated in background */}
            {isLoadingOther && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span className="text-xs text-blue-700">
                  Generating {loadingTab?.label || aiLoading} in background...
                </span>
              </div>
            )}

            <button
              className="btn btn-primary gap-2"
              onClick={() => handleGenerate(activeDrawing)}
              disabled={isLoadingCurrent}
            >
              <Sparkles size={16} /> Generate with neevv Generation Pro
            </button>
          </div>
        )}
      </div>

      {/* Description bar */}
      <div className="p-2 bg-gray-100 border-t border-gray-200">
        <div className="text-[10px] text-gray-500 font-mono leading-relaxed">
          {descriptions[activeDrawing]}
        </div>
      </div>
    </div>
  );
};
