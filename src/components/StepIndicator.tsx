'use client';

import React, { useEffect, useRef } from 'react';
import { AppStep } from '../types';
import { ClipboardList, LayoutGrid, Box, Ruler, Package, Palette, IndianRupee, ShieldCheck } from 'lucide-react';

interface Props {
  current: AppStep;
  onNavigate: (step: AppStep) => void;
  canNavigate: (step: AppStep) => boolean;
}

/** label on tablets / desktop, short label on phones (icons alone were not understood) */
const STEPS: { id: AppStep; label: string; short: string; icon: React.ReactNode }[] = [
  { id: 'requirements', label: 'Requirements', short: 'Brief', icon: <ClipboardList size={14} /> },
  { id: 'layouts', label: 'Layouts', short: 'Plans', icon: <LayoutGrid size={14} /> },
  { id: 'isometric', label: '3D View', short: '3D', icon: <Box size={14} /> },
  { id: 'working', label: 'Drawings', short: 'Drawings', icon: <Ruler size={14} /> },
  { id: 'rates', label: 'Rates', short: 'Rates', icon: <IndianRupee size={14} /> },
  { id: 'boq', label: 'BOQ & Cost', short: 'Cost', icon: <Package size={14} /> },
  { id: 'verification', label: 'Validation', short: 'Checks', icon: <ShieldCheck size={14} /> },
  { id: 'interior', label: 'Interior', short: 'Interior', icon: <Palette size={14} /> },
];

export const StepIndicator: React.FC<Props> = ({ current, onNavigate, canNavigate }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [current]);

  return (
    <>
      <div
        className="scrollbar-hide flex items-center gap-0.5 px-2 py-1.5 bg-gray-100 border-b border-gray-200 overflow-x-auto shrink-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {STEPS.map((s, i) => {
          const isActive = s.id === current;
          const isDone = i < currentIndex;
          const canNav = canNavigate(s.id);

          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <div className={`hidden sm:block w-4 h-px flex-shrink-0 ${isDone ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
              <button
                ref={isActive ? activeButtonRef : undefined}
                className={`btn btn-xs flex-shrink-0 gap-1 relative z-10 ${
                  isActive ? 'btn-primary' : isDone ? 'btn-ghost text-blue-600' : 'btn-ghost text-gray-400'
                } ${!canNav && !isActive ? 'btn-disabled' : ''}`}
                onClick={() => canNav && onNavigate(s.id)}
              >
                {s.icon}
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
    </>
  );
};
