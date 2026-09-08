'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { CheckCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { authFetch } from '@/utils/authFetch';
import { generateDesignSeed } from '../utils/drawingPrompts';

interface Props {
  layouts: Layout[];
  onSelect: (layout: Layout) => void;
  vastuEnabled: boolean;
  requirements: ProjectRequirements;
}

function buildLayoutPrompt(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = requirements.plotWidthFt || layout.plotWidthFt || layout.plotWidthM;
  const plotD = requirements.plotDepthFt || layout.plotDepthFt || layout.plotDepthM;
  const facing = requirements.facing || 'North';
  const numFloors = requirements.floors?.length || 1;

  const roomList = layout.floors
    .map(fl =>
      `${fl.floorLabel}: ${fl.rooms.map(r => `${r.name} (${Math.round((r.width || 3) * (r.depth || 3) * 10.764)} sqft)`).join(', ')}`
    )
    .join('\n');

  const setbacks = layout.setbacks
    ? `Front: ${layout.setbacks.front}m, Rear: ${layout.setbacks.rear}m, Left: ${layout.setbacks.left}m, Right: ${layout.setbacks.right}m`
    : 'Front: 1.5m, Rear: 1.5m, Left: 1.0m, Right: 1.0m';

  return `Generate a professional architectural floor plan drawing for a residential building.

PLOT: ${plotW} × ${plotD} feet, ${facing}-facing
FLOORS: ${numFloors} (${numFloors === 1 ? 'Ground only' : 'G+' + (numFloors - 1)})
TOTAL BUILT-UP AREA: ${layout.builtUpAreaSqFt} sqft (FSI 1.0)
SETBACKS: ${setbacks}
LAYOUT STRATEGY: ${layout.name} — ${layout.description || ''}

ROOMS:
${roomList}

DRAWING REQUIREMENTS:
- Professional black-and-white engineering drawing style
- External walls: 230mm double-line (0.7mm weight)
- Internal partitions: 150mm (0.4mm weight)
- Show all doors (with swing arcs), windows, and openings
- IS 962:1989 hatching for wet areas (kitchen, bathroom, toilet) at 45°
- Dimension chains with tick marks showing room sizes in mm
- Grid circles with alphanumeric labels (A, B, C for columns; 1, 2, 3 for rows)
- Structural columns shown as filled 230×300mm rectangles
- North arrow indicator
- Room names labeled clearly inside each room
- Staircase with UP/DN arrows if multi-floor
- Scale: 1:100
- Clean white background, no color fills
- Title: "${layout.name} — ${plotW}×${plotD} ft ${facing}-facing"

SCHEDULE OF OPENINGS (MANDATORY — include as a table in the drawing):
| Opening | Type | Width (mm) | Height (mm) | Sill Height (mm) |
Show all doors (D1, D2...) and windows (W1, W2...) with sizes.
Main door: 1050×2100mm, Internal doors: 900×2100mm, Bathroom: 750×2100mm
Windows: Bedroom 1500×1200mm sill 900mm, Kitchen 1200×1050mm sill 1050mm, Bathroom 600×450mm sill 1800mm

SPELLING: SCHEDULE, REINFORCEMENT, WATERPROOFING, CALCULATION, ABBREVIATION, STAIRCASE

IMPORTANT: Use building footprint (post-setback dimensions), not raw plot size for the plan outline.
The Schedule of Openings table MUST appear clearly on every layout — position it in an empty area of the drawing.`;
}

export const LayoutSelector: React.FC<Props> = ({ layouts, onSelect, vastuEnabled, requirements }) => {
  const [planImages, setPlanImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const generatePlanImage = useCallback(async (layout: Layout) => {
    setLoading(prev => ({ ...prev, [layout.id]: true }));
    setErrors(prev => ({ ...prev, [layout.id]: '' }));

    try {
      const prompt = buildLayoutPrompt(layout, requirements);
      const res = await authFetch('/api/generate-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          drawingType: 'ground_floor',
        }),
      });

      const data = await res.json();
      if (data.imageDataUri) {
        setPlanImages(prev => ({ ...prev, [layout.id]: data.imageDataUri }));
      } else {
        setErrors(prev => ({ ...prev, [layout.id]: data.error || 'Failed to generate plan' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, [layout.id]: 'Network error' }));
    } finally {
      setLoading(prev => ({ ...prev, [layout.id]: false }));
    }
  }, [requirements]);

  useEffect(() => {
    // Generate AI plan images for all 3 layouts in parallel
    layouts.forEach(layout => {
      if (!planImages[layout.id] && !loading[layout.id]) {
        generatePlanImage(layout);
      }
    });
  }, [layouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const numFloors = requirements.floors.length;

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">Choose Your Floor Plan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Three NBC-compliant layouts generated for your plot. Select one to lock as your Mother Layout — all drawings, elevations, and BOQ will follow it exactly.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          AI-rendered floor plans • NBC 2016 compliant • FSI 1.0 enforced • Best Vastu placement
        </p>
      </div>

      {/* Auto-downgrade notice */}
      {layouts.some(l => l.downgradeNote) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <span>{layouts.find(l => l.downgradeNote)?.downgradeNote}</span>
        </div>
      )}

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {layouts.map((layout) => {
          const perFloorSqFt = layout.effectivePerFloorSqFt ?? Math.round(layout.builtUpAreaSqFt / numFloors);
          return (
            <div
              key={layout.id}
              className="bg-white border-2 rounded-xl overflow-hidden transition-all hover:shadow-lg cursor-pointer group"
              style={{ borderColor: '#e5e5e5' }}
              onClick={() => !loading[layout.id] && onSelect({ ...layout, designSeed: generateDesignSeed() })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4f6f52'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e5e5'; }}
            >
              {/* Floor Plan Image */}
              <div className="bg-white p-2 border-b flex items-center justify-center" style={{ minHeight: '300px' }}>
                {loading[layout.id] ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 size={32} className="animate-spin" style={{ color: '#4f6f52' }} />
                    <p className="text-sm text-gray-500">Generating {layout.name}...</p>
                    <p className="text-[10px] text-gray-400">neevv Generation Pro is drafting your plan</p>
                  </div>
                ) : planImages[layout.id] ? (
                  <img
                    src={planImages[layout.id]}
                    alt={`${layout.name} floor plan`}
                    className="w-full h-auto"
                    style={{ maxHeight: '360px', objectFit: 'contain' }}
                  />
                ) : errors[layout.id] ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <AlertTriangle size={24} className="text-amber-500" />
                    <p className="text-sm text-gray-500">{errors[layout.id]}</p>
                    <button
                      className="text-xs px-3 py-1 rounded-md text-white"
                      style={{ backgroundColor: '#4f6f52' }}
                      onClick={(e) => { e.stopPropagation(); generatePlanImage(layout); }}
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Layout Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm text-gray-800">{layout.name}</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{layout.description}</p>
                  </div>
                  <ArrowRight size={16} className="text-green-600 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-gray-800">{layout.builtUpAreaSqFt}</div>
                    <div className="text-[9px] text-gray-500">Total Sq.Ft</div>
                  </div>
                  {vastuEnabled && (
                    <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                      <div className={`text-xs font-bold ${
                        layout.vastuScore >= 70 ? 'text-green-600' :
                        layout.vastuScore >= 40 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {layout.vastuScore}%
                      </div>
                      <div className="text-[9px] text-gray-500">Vastu</div>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-1.5 text-center" title={layout.nbcCompliant ? 'All rooms meet NBC 2016 minimum sizes' : 'Some rooms below NBC minimums — auto-adjusted for small plot'}>
                    {layout.nbcCompliant ? (
                      <CheckCircle size={12} className="mx-auto text-green-600" />
                    ) : (
                      <div className="text-xs font-bold text-amber-600" title="Small plot — some rooms adjusted below NBC ideal sizes">~</div>
                    )}
                    <div className="text-[9px] text-gray-500">{layout.nbcCompliant ? 'NBC ✓' : 'NBC ~'}</div>
                  </div>
                </div>

                {/* Room counts */}
                <div className="flex flex-wrap gap-1">
                  {layout.floors.map((fl) => (
                    <span key={fl.floor} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {fl.floorLabel}: {fl.rooms.length} rooms
                    </span>
                  ))}
                </div>

                {/* Area verification badge — clear total vs per-floor */}
                <div className="text-[9px] text-green-700 bg-green-50 rounded px-2 py-1">
                  ✓ FSI 1.0 • Total: {layout.builtUpAreaSqFt} sqft{numFloors > 1 ? ` • ${perFloorSqFt} sqft/floor` : ''}
                </div>

                {/* Select Button */}
                <button
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-all text-white disabled:opacity-50"
                  style={{ backgroundColor: '#4f6f52' }}
                  disabled={loading[layout.id]}
                  onClick={(e) => { e.stopPropagation(); onSelect({ ...layout, designSeed: generateDesignSeed() }); }}
                >
                  {loading[layout.id] ? 'Generating...' : '🔒 Lock This Layout →'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-xl p-3 mt-4">
        <div className="text-[10px] font-semibold text-gray-600 mb-2">DRAWING STANDARDS</div>
        <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
          <span>■ External wall: 230mm (0.7mm weight)</span>
          <span>│ Internal partition: 150mm (0.4mm weight)</span>
          <span>▨ Wet area: 45° hatching (IS 962)</span>
          <span>◼ Structural column: 230×300mm</span>
          <span>┤ Dimension chain: tick marks with mm values</span>
        </div>
      </div>
    </div>
  );
};
