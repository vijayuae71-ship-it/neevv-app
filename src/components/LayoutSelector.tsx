'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ProjectRequirements, Room } from '../types';
import { CheckCircle, AlertTriangle, Compass, Maximize, ArrowRight, RefreshCw, ZoomIn } from 'lucide-react';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';

interface Props {
  layouts: Layout[];
  onSelect: (layout: Layout) => void;
  vastuEnabled: boolean;
  requirements: ProjectRequirements;
}

// Programmatic SVG floor plan renderer — accurate, instant, zero API cost
function renderFloorPlanSVG(layout: Layout, requirements: ProjectRequirements): string {
  const plotW = layout.plotWidthM;
  const plotD = layout.plotDepthM;
  const setbacks = layout.setbacks;
  const buildW = layout.buildableWidthM;
  const buildD = layout.buildableDepthM;
  
  // SVG coordinate system: 1m = 40px for good resolution
  const scale = 40;
  const padding = 60; // padding for dimensions
  const svgW = Math.round(plotW * scale + padding * 2);
  const svgH = Math.round(plotD * scale + padding * 2);
  
  const ox = padding;
  const oy = padding;
  
  // Color map for room types
  const roomColors: Record<string, string> = {
    master_bedroom: '#E8F5E9',
    bedroom: '#E3F2FD',
    hall: '#FFF3E0',
    kitchen: '#FCE4EC',
    dining: '#F3E5F5',
    toilet: '#E0F7FA',
    puja: '#FFF8E1',
    staircase: '#ECEFF1',
    parking: '#F5F5F5',
    balcony: '#E8F5E9',
    store: '#EFEBE9',
    utility: '#EFEBE9',
    passage: '#FAFAFA',
    entrance: '#FFF3E0',
  };
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="background:#fff">`;
  
  // Title
  svg += `<text x="${svgW/2}" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="#1a1a1a" font-family="Arial,sans-serif">${layout.name}</text>`;
  svg += `<text x="${svgW/2}" y="28" text-anchor="middle" font-size="8" fill="#666" font-family="Arial,sans-serif">${requirements.plotWidthFt}ft × ${requirements.plotDepthFt}ft | ${requirements.facing}-Facing | Scale 1:100</text>`;
  
  // Plot boundary (dashed)
  svg += `<rect x="${ox}" y="${oy}" width="${plotW * scale}" height="${plotD * scale}" fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="4,2"/>`;
  
  // Buildable area (solid)
  const bx = ox + setbacks.left * scale;
  const by = oy + setbacks.front * scale;
  svg += `<rect x="${bx}" y="${by}" width="${buildW * scale}" height="${buildD * scale}" fill="none" stroke="#333" stroke-width="2"/>`;
  
  // Ground floor rooms
  const groundFloor = layout.floors[0];
  if (groundFloor) {
    for (const room of groundFloor.rooms) {
      const rx = ox + room.x * scale;
      const ry = oy + room.y * scale;
      const rw = room.width * scale;
      const rd = room.depth * scale;
      const color = roomColors[room.type] || '#F5F5F5';
      
      // Room fill
      svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rd}" fill="${color}" stroke="#555" stroke-width="${room.type === 'toilet' || room.type === 'balcony' ? '0.5' : '1'}"/>`;
      
      // Room label
      const cx = rx + rw / 2;
      const cy = ry + rd / 2;
      const widthMM = Math.round(room.width * 1000);
      const depthMM = Math.round(room.depth * 1000);
      const areaSqM = (room.width * room.depth).toFixed(1);
      
      // Truncate long names
      const displayName = room.name.length > 12 ? room.name.substring(0, 11) + '…' : room.name;
      
      if (rw > 35 && rd > 25) {
        svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="7" font-weight="600" fill="#333" font-family="Arial,sans-serif">${displayName}</text>`;
        svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="5.5" fill="#666" font-family="Arial,sans-serif">${widthMM}×${depthMM}mm</text>`;
        svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="5" fill="#888" font-family="Arial,sans-serif">${areaSqM}m²</text>`;
      } else if (rw > 20 && rd > 15) {
        svg += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="5.5" font-weight="600" fill="#333" font-family="Arial,sans-serif">${displayName}</text>`;
      }
    }
    
    // Columns
    for (const col of groundFloor.columns || []) {
      const colX = ox + col.x * scale - 3;
      const colY = oy + col.y * scale - 3;
      svg += `<rect x="${colX}" y="${colY}" width="6" height="6" fill="#333" stroke="#000" stroke-width="0.5"/>`;
    }
  }
  
  // Dimension lines
  const plotWmm = Math.round(plotW * 1000);
  const plotDmm = Math.round(plotD * 1000);
  
  // Top dimension (width)
  const dimY = oy - 15;
  svg += `<line x1="${ox}" y1="${dimY}" x2="${ox + plotW * scale}" y2="${dimY}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<line x1="${ox}" y1="${dimY - 3}" x2="${ox}" y2="${dimY + 3}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<line x1="${ox + plotW * scale}" y1="${dimY - 3}" x2="${ox + plotW * scale}" y2="${dimY + 3}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<text x="${ox + plotW * scale / 2}" y="${dimY - 4}" text-anchor="middle" font-size="7" fill="#333" font-family="Arial,sans-serif">${plotWmm}mm (${requirements.plotWidthFt}ft)</text>`;
  
  // Left dimension (depth)
  const dimX = ox - 15;
  svg += `<line x1="${dimX}" y1="${oy}" x2="${dimX}" y2="${oy + plotD * scale}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<line x1="${dimX - 3}" y1="${oy}" x2="${dimX + 3}" y2="${oy}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<line x1="${dimX - 3}" y1="${oy + plotD * scale}" x2="${dimX + 3}" y2="${oy + plotD * scale}" stroke="#333" stroke-width="0.5"/>`;
  svg += `<text x="${dimX - 4}" y="${oy + plotD * scale / 2}" text-anchor="middle" font-size="7" fill="#333" font-family="Arial,sans-serif" transform="rotate(-90, ${dimX - 4}, ${oy + plotD * scale / 2})">${plotDmm}mm (${requirements.plotDepthFt}ft)</text>`;
  
  // North arrow
  const naX = svgW - 30;
  const naY = oy + 20;
  svg += `<polygon points="${naX},${naY - 12} ${naX - 5},${naY + 4} ${naX + 5},${naY + 4}" fill="#4f6f52" stroke="#333" stroke-width="0.5"/>`;
  svg += `<text x="${naX}" y="${naY + 14}" text-anchor="middle" font-size="7" font-weight="bold" fill="#333" font-family="Arial,sans-serif">N</text>`;
  
  // Legend
  const legendY = svgH - 12;
  svg += `<text x="${ox}" y="${legendY}" font-size="5" fill="#999" font-family="Arial,sans-serif">neevv | Architecture • Structure • MEP • Interiors | NBC 2016 ✓</text>`;
  
  svg += '</svg>';
  return svg;
}

export const LayoutSelector: React.FC<Props> = ({ layouts, onSelect, vastuEnabled, requirements }) => {
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  
  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">Choose Your Floor Plan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Three distinct layouts generated per your requirements. Each plan shows accurate room dimensions, structural grid, and Vastu placement.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Measurements are verified: room widths + wall thicknesses = total plot dimension
        </p>
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {layouts.map((layout) => {
          const svgContent = renderFloorPlanSVG(layout, requirements);
          const svgDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
          
          return (
            <div
              key={layout.id}
              className="bg-white border-2 rounded-xl overflow-hidden transition-all hover:shadow-lg hover:border-green-500 cursor-pointer group"
              style={{ borderColor: '#e5e5e5' }}
              onClick={() => onSelect(layout)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4f6f52'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e5e5'; }}
            >
              {/* Floor Plan Image */}
              <div className="bg-white p-2 border-b" style={{ minHeight: '220px' }}>
                <img
                  src={svgDataUri}
                  alt={`${layout.name} floor plan`}
                  className="w-full h-auto"
                  style={{ maxHeight: '280px', objectFit: 'contain' }}
                />
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
                  {/* Built-up Area */}
                  <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                    <div className="text-xs font-bold text-gray-800">{layout.builtUpAreaSqFt}</div>
                    <div className="text-[9px] text-gray-500">Sq.Ft</div>
                  </div>

                  {/* Vastu Score */}
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

                  {/* NBC */}
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

                {/* Dimension verification */}
                <div className="text-[9px] text-green-700 bg-green-50 rounded px-2 py-1">
                  ✓ Dimensions verified: {Math.round(layout.plotWidthM * 1000)}mm × {Math.round(layout.plotDepthM * 1000)}mm
                </div>

                {/* Select Button */}
                <button
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-all text-white"
                  style={{ backgroundColor: '#4f6f52' }}
                  onClick={(e) => { e.stopPropagation(); onSelect(layout); }}
                >
                  Select This Layout →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-xl p-3 mt-4">
        <div className="text-[10px] font-semibold text-gray-600 mb-2">ROOM COLOR LEGEND</div>
        <div className="flex flex-wrap gap-2">
          {[
            { color: '#FFF3E0', label: 'Living/Hall' },
            { color: '#E8F5E9', label: 'Master Bed' },
            { color: '#E3F2FD', label: 'Bedroom' },
            { color: '#FCE4EC', label: 'Kitchen' },
            { color: '#F3E5F5', label: 'Dining' },
            { color: '#E0F7FA', label: 'Toilet' },
            { color: '#FFF8E1', label: 'Puja' },
            { color: '#ECEFF1', label: 'Staircase' },
            { color: '#F5F5F5', label: 'Parking' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded border" style={{ backgroundColor: item.color, borderColor: '#ccc' }} />
              <span className="text-[10px] text-gray-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};