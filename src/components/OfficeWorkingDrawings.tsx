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
import { authFetch } from '@/utils/authFetch';
import { getCachedDrawing, setCachedDrawing, removeCachedDrawing, getAllCachedDrawings, clearCachedDrawings as clearCachedDrawingsDB, migrateFromLocalStorage } from '../utils/drawingCache';

interface Props {
  layout: Layout;
  officeReq: OfficeRequirements;
}

/* Brand colors */
const BRAND_GREEN = '#4f6f52';
const BRAND_ORANGE = '#e8734a';

/* Drawing types whose content differs per floor and therefore need a GF/FF (or per-floor) toggle */
const FLOOR_SPECIFIC_TYPES: OfficeDrawingType[] = [
  'electrical',
  'dataNetwork',
  'hvac',
  'fireSafety',
  'plumbing',
];

/* === 3D Visualization: additional drawing types not part of OFFICE_DRAWING_TYPES ===
   These are handled locally (own prompt builder, own cache keys) since they don't
   correspond to a floor-plan style technical drawing — they are photorealistic
   full-building / full-space renders instead. */
type Office3DDrawingType = 'office_3d_exterior' | 'office_3d_interior';
type ExtendedOfficeDrawingType = OfficeDrawingType | Office3DDrawingType;

interface DrawingTypeInfo {
  id: ExtendedOfficeDrawingType;
  label: string;
  description: string;
  icon: string;
  category: string;
}

const OFFICE_3D_DRAWING_TYPES: DrawingTypeInfo[] = [
  {
    id: 'office_3d_exterior',
    label: '3D Exterior Render',
    description: 'Photorealistic 3D exterior view of the office building, entrance and facade.',
    icon: '🏗️',
    category: '3D Visualization',
  },
  {
    id: 'office_3d_interior',
    label: '3D Interior Render',
    description: 'Photorealistic 3D interior view of the reception / main workspace area.',
    icon: '🏗️',
    category: '3D Visualization',
  },
];

const isOffice3DType = (type: ExtendedOfficeDrawingType): type is Office3DDrawingType =>
  type === 'office_3d_exterior' || type === 'office_3d_interior';

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

const getIcon = (name: string): IconComponent | null => {
  return ICON_MAP[name] || null;
};

const LOCAL_STORAGE_PREFIX = 'office-';

const buildCacheKey = (type: ExtendedOfficeDrawingType, floor?: number) => `${LOCAL_STORAGE_PREFIX}${type}-${floor || 0}`;

/* ---------- Helpers for building 3D render prompts from office requirements ---------- */

const OFFICE_STYLE_LABEL: Record<string, string> = {
  corporate: 'corporate',
  startup: 'startup',
  coworking: 'coworking',
  minimal: 'minimal',
  biophilic: 'biophilic',
};

function summarizeOfficeFloors(officeReq: OfficeRequirements): string {
  if (!officeReq?.floors?.length) return 'a modern office layout';
  return officeReq.floors
    .map((f, idx) => {
      const parts: string[] = [];
      if (f.workstations) parts.push(`${f.workstations} open workstations`);
      if (f.managerCabins) parts.push(`${f.managerCabins} manager cabins`);
      if (f.directorCabins) parts.push(`${f.directorCabins} director cabins`);
      if (f.mdCabin) parts.push('an MD cabin');
      if (f.conferenceSmall) parts.push(`${f.conferenceSmall} small conference room(s)`);
      if (f.conferenceLarge) parts.push(`${f.conferenceLarge} large conference room(s)`);
      if (f.boardRoom) parts.push('a board room');
      if (f.hasReception) parts.push('a reception area');
      if (f.hasPantry) parts.push('a pantry');
      if (f.hasCafeteria) parts.push('a cafeteria');
      if (f.hasServerRoom) parts.push('a server room');
      if (f.hasBreakRoom) parts.push('a break room');
      const label = f.floorLabel || (idx === 0 ? 'Ground Floor' : `Floor ${idx}`);
      return `${label}: ${parts.join(', ') || 'general office space'}`;
    })
    .join(' | ');
}

function buildOffice3DExteriorPrompt(layout: Layout, officeReq: OfficeRequirements): string {
  const style = OFFICE_STYLE_LABEL[officeReq?.officeStyle] || 'modern corporate';
  const width = officeReq?.plotWidthFt ?? layout?.plotWidthM;
  const depth = officeReq?.plotDepthFt ?? layout?.plotDepthM;
  const floorCount = officeReq?.floors?.length ?? layout?.floors?.length ?? 1;
  const roomSummary = summarizeOfficeFloors(officeReq);

  return `Generate a photorealistic 3D exterior render of a modern ${style} office building.
Plot: ${width}${width ? ' ft' : ''} × ${depth}${depth ? ' ft' : ''}, ${floorCount} floor(s).
Building features (by floor): ${roomSummary}.
Style: ${style}.
Show the building from a 3/4 perspective view with landscaping, entrance, signage area, and parking (${officeReq?.parkingType || 'as available'}).
Professional architectural visualization, daytime lighting, high quality.
ALL DIMENSIONS IN MILLIMETRES (mm) — NEVER label as metres (m).`;
}

function buildOffice3DInteriorPrompt(layout: Layout, officeReq: OfficeRequirements): string {
  const style = OFFICE_STYLE_LABEL[officeReq?.officeStyle] || 'modern corporate';
  const roomSummary = summarizeOfficeFloors(officeReq);

  return `Generate a photorealistic 3D interior render of a ${style} office space.
Room layout: ${roomSummary}.
Style: ${style} with appropriate furniture, lighting, and decor.
Show the main workspace/reception area from an eye-level perspective.
Modern corporate interior design, natural lighting through windows.
Professional architectural visualization, high quality render.`;
}

function buildOffice3DPrompt(type: Office3DDrawingType, layout: Layout, officeReq: OfficeRequirements): string {
  return type === 'office_3d_exterior'
    ? buildOffice3DExteriorPrompt(layout, officeReq)
    : buildOffice3DInteriorPrompt(layout, officeReq);
}

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
      return getOfficeDesignSeed(layout.id);
    } catch {
      return '';
    }
  }, [layout.id]);

  /* Load any previously cached drawings from IndexedDB on mount */
  useEffect(() => {
    const loadCache = async () => {
      await migrateFromLocalStorage(LOCAL_STORAGE_PREFIX);
      try {
        const loaded = await getAllCachedDrawings(LOCAL_STORAGE_PREFIX);
        if (Object.keys(loaded).length > 0) {
          setImages(loaded);
        }
      } catch (e) {
        console.warn('Failed to load cached office drawings:', e);
      }
    };
    loadCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFloorSpecific = useCallback(
    (type: ExtendedOfficeDrawingType) => !isOffice3DType(type) && FLOOR_SPECIFIC_TYPES.includes(type as OfficeDrawingType),
    []
  );

  const getFloorForType = useCallback(
    (type: ExtendedOfficeDrawingType) => floorSelection[type] ?? 0,
    [floorSelection]
  );

  const setFloorForType = useCallback((type: ExtendedOfficeDrawingType, floor: number) => {
    setFloorSelection(prev => ({ ...prev, [type]: floor }));
  }, []);

  /* ---------- Apply canvas text overlay onto a freshly generated / cached image ---------- */
  /* Note: 3D photorealistic renders never receive the technical-drawing text overlay. */
  const applyOverlay = useCallback(
    (cacheKey: string, type: ExtendedOfficeDrawingType, floor?: number) => {
      if (isOffice3DType(type)) return;
      const srcData = images[cacheKey];
      if (!srcData) return;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          applyOfficeTextOverlay(canvas, type as OfficeDrawingType, layout, officeReq, floor);
          const overlaid = canvas.toDataURL('image/png');
          setImages(prev => ({ ...prev, [cacheKey]: overlaid }));
          setCachedDrawing(cacheKey, overlaid).catch(e => console.warn('Failed to persist overlaid drawing:', e));
        } catch (e) {
          console.warn('Text overlay failed:', e);
        }
      };
      img.src = srcData;
    },
    [layout, officeReq, images]
  );

  /* ---------- Generate (or load cached) drawing ---------- */
  const generateDrawing = useCallback(
    async (type: ExtendedOfficeDrawingType, floor?: number) => {
      const cacheKey = buildCacheKey(type, floor);

      // Check IndexedDB cache first
      const cached = await getCachedDrawing(cacheKey);
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
        const prompt = isOffice3DType(type)
          ? buildOffice3DPrompt(type, layout, officeReq)
          : getOfficeDrawingPrompt(type as OfficeDrawingType, layout, officeReq, floor);
        const res = await authFetch('/api/generate-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, type }),
        });
        const data = await res.json();
        if (data.imageDataUri) {
          await setCachedDrawing(cacheKey, data.imageDataUri);
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
    async (type: ExtendedOfficeDrawingType, floor?: number) => {
      const cacheKey = buildCacheKey(type, floor);
      await removeCachedDrawing(cacheKey);
      setImages(prev => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
      generateDrawing(type, floor);
    },
    [generateDrawing]
  );

  const downloadDrawing = useCallback(async (cacheKey: string) => {
    const dataUri = images[cacheKey] || await getCachedDrawing(cacheKey) || '';
    if (!dataUri) return;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `${cacheKey}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [images]);

  const clearAllOfficeDrawings = useCallback(async () => {
    try {
      await clearCachedDrawingsDB(LOCAL_STORAGE_PREFIX);
      // Also clear any remaining localStorage entries
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

  /* Combined list: existing technical drawing types + the new 3D Visualization types */
  const allDrawingTypes: DrawingTypeInfo[] = useMemo(
    () => [...OFFICE_DRAWING_TYPES, ...OFFICE_3D_DRAWING_TYPES],
    []
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    allDrawingTypes.forEach(d => set.add(d.category));
    return Array.from(set);
  }, [allDrawingTypes]);

  const visibleDrawingTypes = useMemo(() => {
    if (activeCategory === 'All') return allDrawingTypes;
    return allDrawingTypes.filter(d => d.category === activeCategory);
  }, [activeCategory, allDrawingTypes]);

  const generatedCount = useMemo(() => Object.keys(images).length, [images]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', backgroundColor: '#ffffff' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: 0,
            }}
          >
            <Sparkles size={18} style={{ color: BRAND_GREEN }} />
            Office Working Drawings
          </h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {generatedCount} drawing{generatedCount === 1 ? '' : 's'} generated
            {designSeed ? ` · Design seed: ${designSeed}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={clearAllOfficeDrawings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 500,
            color: '#dc2626',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={14} />
          Clear All Office Drawings
        </button>
      </div>

      {/* Category tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid #f3f4f6',
          backgroundColor: '#f9fafb',
        }}
      >
        {['All', ...categories].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            style={{
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 9999,
              padding: '6px 12px',
              cursor: 'pointer',
              transition: 'background-color 0.15s, color 0.15s',
              backgroundColor: activeCategory === cat ? BRAND_GREEN : '#ffffff',
              color: activeCategory === cat ? '#ffffff' : '#4b5563',
              border: activeCategory === cat ? `1px solid ${BRAND_GREEN}` : '1px solid #e5e7eb',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Drawing cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          padding: 16,
        }}
      >
        {visibleDrawingTypes.map(drawingInfo => {
          const is3D = isOffice3DType(drawingInfo.id);
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
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#f3f4f6',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    backgroundColor: is3D ? `${BRAND_ORANGE}1a` : `${BRAND_GREEN}1a`,
                    color: is3D ? BRAND_ORANGE : BRAND_GREEN,
                    flexShrink: 0,
                    fontSize: 20,
                  }}
                >
                  {Icon ? <Icon size={20} /> : <span>{drawingInfo.icon}</span>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#1f2937',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {drawingInfo.label}
                  </h3>
                  <p
                    style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginTop: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {drawingInfo.description}
                  </p>
                </div>
              </div>

              {/* Floor toggle */}
              {floorSpecific && isMultiFloor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px 8px' }}>
                  {officeReq.floors.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFloorForType(drawingInfo.id, idx)}
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        backgroundColor: (floor ?? 0) === idx ? BRAND_GREEN : '#ffffff',
                        color: (floor ?? 0) === idx ? '#ffffff' : '#4b5563',
                        border: (floor ?? 0) === idx ? `1px solid ${BRAND_GREEN}` : '1px solid #d1d5db',
                      }}
                    >
                      {f.floorLabel || (idx === 0 ? 'GF' : `F${idx}`)}
                    </button>
                  ))}
                </div>
              )}

              {/* Image / state area */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ffffff',
                  marginLeft: 16,
                  marginRight: 16,
                  marginBottom: 12,
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  minHeight: 140,
                  overflow: 'hidden',
                }}
              >
                {isGenerating ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      padding: '24px 0',
                      color: '#6b7280',
                    }}
                  >
                    <Loader2 size={24} className="animate-spin" style={{ color: BRAND_GREEN }} />
                    <span style={{ fontSize: 12 }}>Generating...</span>
                  </div>
                ) : image ? (
                  <img
                    src={image}
                    alt={drawingInfo.label}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : error ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: '#dc2626',
                    }}
                  >
                    <AlertTriangle size={20} />
                    <span style={{ fontSize: 12 }}>{error}</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '24px 0',
                      color: '#d1d5db',
                    }}
                  >
                    {Icon ? <Icon size={32} /> : <span style={{ fontSize: 32 }}>{drawingInfo.icon}</span>}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Not generated yet</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 16px' }}>
                {image ? (
                  <>
                    <button
                      type="button"
                      onClick={() => regenerateDrawing(drawingInfo.id, floor)}
                      disabled={isGenerating}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#374151',
                        backgroundColor: '#ffffff',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        padding: '8px 12px',
                        cursor: isGenerating ? 'default' : 'pointer',
                        opacity: isGenerating ? 0.5 : 1,
                      }}
                    >
                      <RefreshCw size={13} />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadDrawing(cacheKey)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#ffffff',
                        backgroundColor: BRAND_GREEN,
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        cursor: 'pointer',
                      }}
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
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#ffffff',
                      backgroundColor: is3D ? BRAND_ORANGE : BRAND_GREEN,
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 12px',
                      cursor: isGenerating ? 'default' : 'pointer',
                      opacity: isGenerating ? 0.5 : 1,
                    }}
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
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
        <p
          style={{
            fontSize: 11,
            color: '#6b7280',
            fontFamily: 'monospace',
            textAlign: 'center',
            letterSpacing: '0.05em',
            margin: 0,
          }}
        >
          PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION
        </p>
      </div>
    </div>
  );
};

export default OfficeWorkingDrawings;
