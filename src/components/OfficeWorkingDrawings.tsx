'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layers,
  Zap,
  Wifi,
  Wind,
  Shield,
  Droplets,
  Armchair,
  PanelLeft,
  Building,
  SplitSquareVertical,
  Type,
  Loader2,
  Download,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Layout, OfficeRequirements } from '../types';
import {
  OfficeDrawingType,
  OFFICE_DRAWING_TYPES,
  getOfficeDrawingPrompt,
  getOfficeDesignSeed,
} from '../utils/officeDrawingPrompts';
import { applyOfficeTextOverlay } from '../utils/officeTextOverlay';

interface Props {
  layout: Layout;
  officeReq: OfficeRequirements;
}

/* Drawing types whose content differs per floor and therefore need a GF/FF (or per-floor) toggle */
const FLOOR_SPECIFIC_TYPES: OfficeDrawingType[] = [
  'electrical',
  'dataNetwork',
  'hvac',
  'fireSafety',
  'plumbing',
];

/* Map icon name strings (as stored on OFFICE_DRAWING_TYPES) to lucide-react components */
type IconComponent = typeof Layers;

const ICON_MAP: Record<string, IconComponent> = {
  Layers,
  Zap,
  Wifi,
  Wind,
  Shield,
  Droplets,
  Armchair,
  PanelLeft,
  Building,
  SplitSquareVertical,
  Type,
};

const getIcon = (name: string): IconComponent => {
  return ICON_MAP[name] || Layers;
};

const LOCAL_STORAGE_PREFIX = 'office-';

const buildCacheKey = (type: OfficeDrawingType, floor?: number) => `${LOCAL_STORAGE_PREFIX}${type}-${floor || 0}`;

export const OfficeWorkingDrawings: React.FC<Props> = ({ layout, officeReq }) => {
  const [images, setImages] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [floorSelection, setFloorSelection] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const isMultiFloor = (officeReq?.floors?.length || 1) > 1;

  /* Stable design seed so repeated generations across drawing types stay visually consistent */
  const designSeed = useMemo(() => {
    try {
      return getOfficeDesignSeed(officeReq);
    } catch {
      return '';
    }
  }, [officeReq]);

  /* Load any previously cached drawings from localStorage on mount */
  useEffect(() => {
    try {
      const loaded: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
          const val = localStorage.getItem(key);
          if (val) loaded[key] = val;
        }
      }
      if (Object.keys(loaded).length > 0) {
        setImages(loaded);
      }
    } catch (e) {
      console.warn('Failed to load cached office drawings:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFloorSpecific = useCallback((type: OfficeDrawingType) => FLOOR_SPECIFIC_TYPES.includes(type), []);

  const getFloorForType = useCallback(
    (type: OfficeDrawingType) => floorSelection[type] ?? 0,
    [floorSelection]
  );

  const setFloorForType = useCallback((type: OfficeDrawingType, floor: number) => {
    setFloorSelection(prev => ({ ...prev, [type]: floor }));
  }, []);

  /* ---------- Apply canvas text overlay onto a freshly generated / cached image ---------- */
  const applyOverlay = useCallback(
    (cacheKey: string, type: OfficeDrawingType, floor?: number) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          applyOfficeTextOverlay(canvas, type, layout, officeReq, floor);
          const overlaid = canvas.toDataURL('image/png');
          setImages(prev => ({ ...prev, [cacheKey]: overlaid }));
          try {
            localStorage.setItem(cacheKey, overlaid);
          } catch (e) {
            console.warn('Failed to persist overlaid drawing:', e);
          }
        } catch (e) {
          console.warn('Text overlay failed:', e);
        }
      };
      img.src = localStorage.getItem(cacheKey) || '';
    },
    [layout, officeReq]
  );

  /* ---------- Generate (or load cached) drawing ---------- */
  const generateDrawing = useCallback(
    async (type: OfficeDrawingType, floor?: number) => {
      const cacheKey = buildCacheKey(type, floor);

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setImages(prev => ({ ...prev, [cacheKey]: cached }));
        return;
      }

      setGenerating(prev => ({ ...prev, [cacheKey]: true }));
      setErrors(prev => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });

      try {
        const prompt = getOfficeDrawingPrompt(type, layout, officeReq, floor);
        const res = await fetch('/api/generate-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, type }),
        });
        const data = await res.json();
        if (data.imageDataUri) {
          localStorage.setItem(cacheKey, data.imageDataUri);
          setImages(prev => ({ ...prev, [cacheKey]: data.imageDataUri }));
          applyOverlay(cacheKey, type, floor);
        } else {
          throw new Error(data.error || 'No image returned from generation service');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        console.error('Generation failed:', err);
        setErrors(prev => ({ ...prev, [cacheKey]: msg }));
      } finally {
        setGenerating(prev => ({ ...prev, [cacheKey]: false }));
      }
    },
    [layout, officeReq, applyOverlay]
  );

  const regenerateDrawing = useCallback(
    (type: OfficeDrawingType, floor?: number) => {
      const cacheKey = buildCacheKey(type, floor);
      localStorage.removeItem(cacheKey);
      setImages(prev => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
      generateDrawing(type, floor);
    },
    [generateDrawing]
  );

  const downloadDrawing = useCallback((cacheKey: string) => {
    const dataUri = localStorage.getItem(cacheKey) || '';
    if (!dataUri) return;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `${cacheKey}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const clearAllOfficeDrawings = useCallback(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      setImages({});
      setErrors({});
    } catch (e) {
      console.warn('Failed to clear office drawings:', e);
    }
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    OFFICE_DRAWING_TYPES.forEach(d => set.add(d.category));
    return Array.from(set);
  }, []);

  const visibleDrawingTypes = useMemo(() => {
    if (activeCategory === 'All') return OFFICE_DRAWING_TYPES;
    return OFFICE_DRAWING_TYPES.filter(d => d.category === activeCategory);
  }, [activeCategory]);

  const generatedCount = useMemo(() => Object.keys(images).length, [images]);

  return (
    <div className="flex flex-col w-full bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            Office Working Drawings
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {generatedCount} drawing{generatedCount === 1 ? '' : 's'} generated
            {designSeed ? ` · Design seed: ${designSeed}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={clearAllOfficeDrawings}
          className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md px-3 py-1.5 transition-colors"
        >
          <Trash2 size={14} />
          Clear All Office Drawings
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        {['All', ...categories].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`text-sm font-medium rounded-full px-3 py-1.5 transition-colors ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Drawing cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {visibleDrawingTypes.map(drawingInfo => {
          const Icon = getIcon(drawingInfo.icon);
          const floorSpecific = isFloorSpecific(drawingInfo.id);
          const floor = floorSpecific ? getFloorForType(drawingInfo.id) : undefined;
          const cacheKey = buildCacheKey(drawingInfo.id, floor);
          const image = images[cacheKey];
          const isGenerating = !!generating[cacheKey];
          const error = errors[cacheKey];

          return (
            <div
              key={drawingInfo.id}
              className="flex flex-col bg-gray-100 rounded-lg border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-blue-600/10 text-blue-600 shrink-0">
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-800 truncate">{drawingInfo.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{drawingInfo.description}</p>
                </div>
              </div>

              {/* Floor toggle */}
              {floorSpecific && isMultiFloor && (
                <div className="flex items-center gap-1 px-4 pb-2">
                  {officeReq.floors.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFloorForType(drawingInfo.id, idx)}
                      className={`text-[11px] font-mono rounded px-2 py-1 border transition-colors ${
                        (floor ?? 0) === idx
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {f.floorLabel || (idx === 0 ? 'GF' : `F${idx}`)}
                    </button>
                  ))}
                </div>
              )}

              {/* Image / state area */}
              <div className="flex-1 flex items-center justify-center bg-white mx-4 mb-3 rounded border border-gray-200 min-h-[140px] overflow-hidden">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-gray-500">
                    <Loader2 size={24} className="animate-spin text-blue-600" />
                    <span className="text-xs">Generating...</span>
                  </div>
                ) : image ? (
                  <img src={image} alt={drawingInfo.label} className="w-full h-full object-contain" />
                ) : error ? (
                  <div className="flex flex-col items-center gap-1 py-6 px-3 text-center text-red-600">
                    <AlertTriangle size={20} />
                    <span className="text-xs">{error}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 py-6 text-gray-300">
                    <Icon size={32} />
                    <span className="text-[11px] text-gray-400">Not generated yet</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 px-4 pb-4">
                {image ? (
                  <>
                    <button
                      type="button"
                      onClick={() => regenerateDrawing(drawingInfo.id, floor)}
                      disabled={isGenerating}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw size={13} />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadDrawing(cacheKey)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-blue-600 rounded-md px-3 py-2 hover:bg-blue-700 transition-colors"
                    >
                      <Download size={13} />
                      Download
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => generateDrawing(drawingInfo.id, floor)}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md px-3 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-[11px] text-gray-500 font-mono text-center tracking-wide">
          PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION
        </p>
      </div>
    </div>
  );
};

export default OfficeWorkingDrawings;
