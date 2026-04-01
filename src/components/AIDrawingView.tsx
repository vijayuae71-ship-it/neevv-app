'use client';

import React, { useState, useCallback } from 'react';
import {
  Layers,
  Building,
  Box,
  SplitSquareVertical,
  Shovel,
  Grid3x3,
  Columns3,
  Landmark,
  RectangleHorizontal,
  BarChart3,
  Zap,
  Droplets,
  Download,
  X,
  Loader2,
  PlayCircle,
  CheckCircle2,
  ImageIcon,
} from 'lucide-react';
import { DrawingType, DRAWING_TYPES, DrawingTypeInfo } from '../utils/drawingPrompts';

interface Layout {
  [key: string]: any;
}

interface ProjectRequirements {
  [key: string]: any;
}

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Layers,
  Building,
  Box,
  SplitSquareVertical,
  Shovel,
  Grid3x3,
  Columns3,
  Landmark,
  RectangleHorizontal,
  BarChart3,
  Zap,
  Droplets,
};

const CATEGORY_ORDER = ['Floor Plans', 'Elevations & 3D', 'Structural', 'MEP'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Floor Plans': 'bg-blue-50 border-blue-200',
  'Elevations & 3D': 'bg-amber-50 border-amber-200',
  Structural: 'bg-emerald-50 border-emerald-200',
  MEP: 'bg-violet-50 border-violet-200',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Floor Plans': 'badge-info',
  'Elevations & 3D': 'badge-warning',
  Structural: 'badge-success',
  MEP: 'badge-secondary',
};

export default function AIDrawingView({ layout, requirements }: Props) {
  const [generatedImages, setGeneratedImages] = useState<Map<DrawingType, string>>(new Map());
  const [loadingType, setLoadingType] = useState<DrawingType | null>(null);
  const [selectedType, setSelectedType] = useState<DrawingType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const generateDrawing = useCallback(
    async (drawingType: DrawingType) => {
      // Return cached image if available
      if (generatedImages.has(drawingType)) {
        setSelectedType(drawingType);
        return;
      }

      setLoadingType(drawingType);
      setError(null);

      try {
        const response = await fetch('/api/generate-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingType, layout, requirements }),
        });

        const data = await response.json();

        if (!data.success) {
          setError(data.error || 'Failed to generate drawing');
          return;
        }

        setGeneratedImages((prev) => {
          const next = new Map(prev);
          next.set(drawingType, data.imageDataUri);
          return next;
        });
        setSelectedType(drawingType);
      } catch (err: any) {
        setError(err.message || 'Network error');
      } finally {
        setLoadingType(null);
      }
    },
    [generatedImages, layout, requirements]
  );

  const generateAll = useCallback(async () => {
    setGeneratingAll(true);
    setError(null);

    for (const dt of DRAWING_TYPES) {
      if (generatedImages.has(dt.id)) continue;

      setLoadingType(dt.id);
      try {
        const response = await fetch('/api/generate-drawing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingType: dt.id, layout, requirements }),
        });

        const data = await response.json();
        if (data.success) {
          setGeneratedImages((prev) => {
            const next = new Map(prev);
            next.set(dt.id, data.imageDataUri);
            return next;
          });
        }
      } catch {
        // Continue to next drawing on error
      }
    }

    setLoadingType(null);
    setGeneratingAll(false);
  }, [generatedImages, layout, requirements]);

  const downloadImage = useCallback(
    (drawingType: DrawingType) => {
      const dataUri = generatedImages.get(drawingType);
      if (!dataUri) return;

      const link = document.createElement('a');
      link.href = dataUri;
      link.download = `neevv-${drawingType.replace(/_/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [generatedImages]
  );

  const closeLightbox = () => setSelectedType(null);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: DRAWING_TYPES.filter((dt) => dt.category === cat),
  }));

  const selectedImage = selectedType ? generatedImages.get(selectedType) : null;
  const selectedInfo = selectedType ? DRAWING_TYPES.find((dt) => dt.id === selectedType) : null;

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6" data-theme="light">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          Professional Drawing Package
        </h2>
        <p className="text-sm md:text-base text-gray-500 mt-1">
          AI-Generated Architectural Drawings &bull; NBC 2016 Compliant
        </p>
        <div className="mt-4">
          <button
            className="btn btn-primary btn-sm md:btn-md gap-2"
            onClick={generateAll}
            disabled={generatingAll || loadingType !== null}
          >
            {generatingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating All…
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Generate All 14 Drawings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-error mb-6 shadow-sm">
          <span className="text-sm">{error}</span>
          <div className="flex gap-1">
            <button className="btn btn-ghost btn-xs" onClick={() => { setError(null); if (loadingType) generateDrawing(loadingType); }}>
              Retry
            </button>
            <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Drawing type groups */}
      {grouped.map(({ category, items }) => (
        <div key={category} className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`badge ${CATEGORY_BADGE[category]} badge-sm`}>{category}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((dt) => {
              const Icon = ICON_MAP[dt.icon] || ImageIcon;
              const isLoading = loadingType === dt.id;
              const isGenerated = generatedImages.has(dt.id);
              const thumbnail = generatedImages.get(dt.id);

              return (
                <div
                  key={dt.id}
                  className={`card card-border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${CATEGORY_COLORS[dt.category]}`}
                  onClick={() => generateDrawing(dt.id)}
                >
                  <div className="card-body p-4 flex-row items-center gap-4">
                    {/* Thumbnail or icon */}
                    <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                      {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      ) : isGenerated && thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={dt.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon className="w-7 h-7 text-gray-400" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 text-sm md:text-base flex items-center gap-2">
                        {dt.label}
                        {isGenerated && (
                          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                        )}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {dt.description}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      {isLoading ? (
                        <span className="text-xs text-primary font-medium">Generating…</span>
                      ) : isGenerated ? (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadImage(dt.id);
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="btn btn-primary btn-xs btn-outline">Generate</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Lightbox modal */}
      {selectedType && selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeLightbox}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedInfo?.label || selectedType}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedInfo?.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm btn-primary gap-1"
                  onClick={() => downloadImage(selectedType)}
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button className="btn btn-sm btn-ghost btn-circle" onClick={closeLightbox}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50">
              <img
                src={selectedImage}
                alt={selectedInfo?.label || selectedType}
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
