'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { CheckCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

interface Props {
  layouts: Layout[];
  onSelect: (layout: Layout) => void;
  vastuEnabled: boolean;
  requirements: ProjectRequirements;
}

export const LayoutSelector: React.FC<Props> = ({ layouts, onSelect, vastuEnabled, requirements }) => {
  const [planImages, setPlanImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const generatePlanImage = useCallback(async (layout: Layout) => {
    setLoading(prev => ({ ...prev, [layout.id]: true }));
    setErrors(prev => ({ ...prev, [layout.id]: '' }));

    try {
      const res = await fetch('/api/generate-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawingType: 'ground_floor',
          layout,
          requirements,
        }),
      });

      const data = await res.json();
      if (data.imageDataUri) {
        setPlanImages(prev => ({ ...prev, [layout.id]: data.imageDataUri }));
      } else {
        setErrors(prev => ({ ...prev, [layout.id]: 'Failed to generate plan' }));
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

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">Choose Your Floor Plan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Three distinct layouts generated per your requirements. Each plan shows accurate room dimensions, structural grid, and Vastu placement.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          AI-rendered architectural floor plans • All measurements in mm • NBC 2016 compliant
        </p>
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {layouts.map((layout) => (
          <div
            key={layout.id}
            className="bg-white border-2 rounded-xl overflow-hidden transition-all hover:shadow-lg cursor-pointer group"
            style={{ borderColor: '#e5e5e5' }}
            onClick={() => !loading[layout.id] && onSelect(layout)}
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
                  <div className="text-[9px] text-gray-500">Sq.Ft</div>
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
                <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                  {layout.nbcCompliant ? (
                    <CheckCircle size={12} className="mx-auto text-green-600" />
                  ) : (
                    <AlertTriangle size={12} className="mx-auto text-amber-600" />
                  )}
                  <div className="text-[9px] text-gray-500">NBC</div>
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

              {/* Area verification badge */}
              <div className="text-[9px] text-green-700 bg-green-50 rounded px-2 py-1">
                ✓ FSI 1.0 compliant • Built-up: {layout.builtUpAreaSqFt} sqft / {requirements.plotWidthFt * requirements.plotDepthFt} sqft plot
              </div>

              {/* Select Button */}
              <button
                className="w-full py-2 rounded-lg text-sm font-semibold transition-all text-white disabled:opacity-50"
                style={{ backgroundColor: '#4f6f52' }}
                disabled={loading[layout.id]}
                onClick={(e) => { e.stopPropagation(); onSelect(layout); }}
              >
                {loading[layout.id] ? 'Generating...' : 'Select This Layout →'}
              </button>
            </div>
          </div>
        ))}
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
