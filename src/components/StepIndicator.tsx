'use client';

import React from 'react';
import { AppStep } from '../types';
import { ClipboardList, LayoutGrid, Shield, PenTool, Box, Ruler, Package, Palette, IndianRupee } from 'lucide-react';

interface Props {
  current: AppStep;
  onNavigate: (step: AppStep) => void;
  canNavigate: (step: AppStep) => boolean;
}

const STEPS: { id: AppStep; label: string; icon: React.ReactNode }[] = [
  { id: 'requirements', label: 'Requirements', icon: <ClipboardList size={14} /> },
  { id: 'layouts', label: 'Layouts', icon: <LayoutGrid size={14} /> },
  { id: 'compliance', label: 'Compliance', icon: <Shield size={14} /> },
  { id: 'floorplan', label: '2D Plans', icon: <PenTool size={14} /> },
  { id: 'isometric', label: '3D View', icon: <Box size={14} /> },
  { id: 'working', label: 'Working Dwg', icon: <Ruler size={14} /> },
  { id: 'rates', label: 'Rates', icon: <IndianRupee size={14} /> },
  { id: 'boq', label: 'BOQ & Cost', icon: <Package size={14} /> },
  { id: 'interior', label: 'Interior', icon: <Palette size={14} /> },
];

export const StepIndicator: React.FC<Props> = ({ current, onNavigate, canNavigate }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-100 border-b border-gray-200 overflow-x-auto">
      {STEPS.map((s, i) => {
        const isActive = s.id === current;
        const isDone = i < currentIndex;
        const canNav = canNavigate(s.id);

        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <div className={`w-4 h-px flex-shrink-0 ${isDone ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
            <button
              className={`btn btn-xs flex-shrink-0 gap-1 ${
                isActive ? 'btn-primary' : isDone ? 'btn-ghost text-blue-600' : 'btn-ghost text-gray-400'
              } ${!canNav && !isActive ? 'btn-disabled' : ''}`}
              onClick={() => canNav && onNavigate(s.id)}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
