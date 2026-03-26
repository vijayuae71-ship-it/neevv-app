'use client';

import React from 'react';
import { Layout } from '../types';
import { CheckCircle, AlertTriangle, Compass, Maximize, ArrowRight } from 'lucide-react';
import BrandWatermark from './BrandWatermark';

interface Props {
  layouts: Layout[];
  onSelect: (layout: Layout) => void;
  vastuEnabled: boolean;
}

export const LayoutSelector: React.FC<Props> = ({ layouts, onSelect, vastuEnabled }) => {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto relative">
      <BrandWatermark position="top-left" />
      <div className="text-sm text-base-content/60 mb-2">
        Three distinct spatial layouts generated per your program. Select one to proceed to detailed drawings.
      </div>

      {layouts.map((layout) => (
        <div
          key={layout.id}
          className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
          onClick={() => onSelect(layout)}
        >
          <div className="card-body p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-sm">{layout.name}</h3>
                <p className="text-xs text-base-content/50 mt-0.5">{layout.description}</p>
              </div>
              <ArrowRight size={16} className="text-primary mt-1 flex-shrink-0" />
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              {/* Built-up Area */}
              <div className="bg-base-300 rounded-lg p-2 text-center">
                <Maximize size={14} className="mx-auto opacity-60 mb-1" />
                <div className="text-sm font-bold">{layout.builtUpAreaSqFt}</div>
                <div className="text-[10px] text-base-content/50">Sq.Ft Built-up</div>
              </div>

              {/* Vastu Score */}
              {vastuEnabled && (
                <div className="bg-base-300 rounded-lg p-2 text-center">
                  <Compass size={14} className="mx-auto opacity-60 mb-1" />
                  <div
                    className={`text-sm font-bold ${
                      layout.vastuScore >= 70
                        ? 'text-success'
                        : layout.vastuScore >= 40
                          ? 'text-warning'
                          : 'text-error'
                    }`}
                  >
                    {layout.vastuScore}%
                  </div>
                  <div className="text-[10px] text-base-content/50">Vastu Score</div>
                </div>
              )}

              {/* NBC */}
              <div className="bg-base-300 rounded-lg p-2 text-center">
                {layout.nbcCompliant ? (
                  <CheckCircle size={14} className="mx-auto text-success mb-1" />
                ) : (
                  <AlertTriangle size={14} className="mx-auto text-warning mb-1" />
                )}
                <div className={`text-sm font-bold ${layout.nbcCompliant ? 'text-success' : 'text-warning'}`}>
                  {layout.nbcCompliant ? 'Pass' : 'Issues'}
                </div>
                <div className="text-[10px] text-base-content/50">NBC 2016</div>
              </div>
            </div>

            {/* Floor breakdown */}
            <div className="flex flex-wrap gap-1">
              {layout.floors.map((fl) => (
                <span key={fl.floor} className="badge badge-sm bg-base-300 text-base-content/70">
                  {fl.floorLabel}: {fl.rooms.length} rooms
                </span>
              ))}
            </div>

            {/* NBC Issues */}
            {layout.nbcIssues.length > 0 && (
              <div className="text-[10px] text-warning/70">
                {layout.nbcIssues.length} NBC issue{layout.nbcIssues.length > 1 ? 's' : ''} detected
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
