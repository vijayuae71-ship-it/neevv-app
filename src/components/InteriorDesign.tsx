'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Layout, ProjectRequirements, RoomInterior, InteriorDesignData } from '../types';
import { generateInteriorDesign } from '../utils/interiorCalculator';
import { roomClearM } from '../utils/drawingEngine';
import { STYLE_TEMPLATES } from '../utils/interiorTemplates';
import InteriorMoodBoard from './InteriorMoodBoard';
import InteriorDrawings from './InteriorDrawings';
import InteriorAIDrawings from './InteriorAIDrawings';
import InteriorTimeline from './InteriorTimeline';
import InteriorCostReport from './InteriorCostReport';
import { useActiveProjectId } from '@/utils/activeProject';
import { fetchProjectSamples, saveProjectSamples } from '@/utils/projectSamplesClient';

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

type InteriorTab = 'moodboard' | 'drawings' | 'ai_renders' | 'timeline' | 'cost';

export const InteriorDesign: React.FC<Props> = ({ layout, requirements }) => {
  const [rooms, setRooms] = useState<RoomInterior[] | null>(null);
  const [activeTab, setActiveTab] = useState<InteriorTab>('moodboard');

  const clearDims = useMemo(() => roomClearM(layout, requirements), [layout, requirements]);
  const interiorData = useMemo<InteriorDesignData | null>(() => {
    if (!rooms) return null;
    // quantities on the finished (clear) room size — the same figures the interior sheets show
    return generateInteriorDesign(rooms, layout, clearDims);
  }, [rooms, layout, clearDims]);

  /* sample prices follow the saved project: loaded when it opens, saved after each change.
     Saving waits until the load has finished, so stored prices are never overwritten by an empty set. */
  const projectId = useActiveProjectId();
  const [samplesReady, setSamplesReady] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !rooms || loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    let cancelled = false;
    fetchProjectSamples(projectId).then((saved) => {
      if (cancelled || saved === null) return;
      setRooms((prev) => (prev ?? []).map((r) => {
        const s = saved[r.roomId];
        // only fill rooms that have no prices yet, and only when the room is the same one
        return s && !r.samples && s.roomName === r.roomName ? { ...r, samples: s.samples } : r;
      }));
      setSamplesReady(projectId);
    });
    return () => { cancelled = true; };
  }, [projectId, rooms]);
  const savedRef = useRef<string>('');
  useEffect(() => {
    if (!projectId || !rooms || samplesReady !== projectId) return;
    const snapshot = JSON.stringify(rooms.map((r) => [r.roomId, r.roomName, r.samples ?? null]));
    if (snapshot === savedRef.current) return;
    const t = setTimeout(() => {
      savedRef.current = snapshot;
      saveProjectSamples(projectId, rooms);
    }, 1500);
    return () => clearTimeout(t);
  }, [projectId, rooms, samplesReady]);

  const handleMoodBoardComplete = (configuredRooms: RoomInterior[]) => {
    setRooms(configuredRooms);
    setActiveTab('drawings');
  };

  if (!rooms) {
    return <InteriorMoodBoard layout={layout} onComplete={handleMoodBoardComplete} />;
  }

  const tabs: { id: InteriorTab; label: string; shortLabel: string; icon: string }[] = [
    { id: 'moodboard', label: 'Mood Board', shortLabel: 'Mood', icon: '🎨' },
    { id: 'drawings', label: 'Interior Drawings', shortLabel: 'Drawings', icon: '📐' },
    { id: 'ai_renders', label: 'neevv Generation Pro Renders', shortLabel: 'Renders', icon: '✨' },
    { id: 'timeline', label: 'Execution Plan', shortLabel: 'Plan', icon: '📅' },
    { id: 'cost', label: 'Cost Estimation', shortLabel: 'Cost', icon: '💰' },
  ];

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="relative flex flex-col h-full">
      {/* Summary bar */}
      {interiorData && (
        <div className="bg-gray-100 px-4 py-2 flex flex-wrap items-center gap-4 text-sm border-b border-gray-200 shrink-0">
          <span className="font-semibold text-blue-600">{rooms.length} Rooms Configured</span>
          <span className="text-gray-700">|</span>
          <span>Estimated Cost: <span className="font-bold text-green-600">{fmt(Math.round(interiorData.totalCost * 0.9))} – {fmt(Math.round(interiorData.totalCost * 1.1))}</span> <span className="text-[10px] text-gray-400">(±10%, current market prices)</span></span>
          <span className="text-gray-700">|</span>
          <span>Duration: <span className="font-bold">{interiorData.totalDurationDays} Days</span></span>
          <div className="ml-auto">
            <button
              className="btn btn-xs btn-outline btn-warning"
              onClick={() => { setRooms(null); setActiveTab('moodboard'); }}
            >
              ✏️ Re-configure
            </button>
          </div>
        </div>
      )}

      {/* Tab navigation — scrollable on mobile */}
      <div
        className="scrollbar-hide overflow-x-auto shrink-0 border-b border-gray-200"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex min-w-max px-2 py-2 gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setActiveTab(t.id)}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>
      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2">
        {activeTab === 'moodboard' && (
          <InteriorMoodBoard layout={layout} onComplete={handleMoodBoardComplete} />
        )}
        {activeTab === 'drawings' && (
          <InteriorDrawings layout={layout} rooms={rooms} requirements={requirements} onRoomChange={(next) => setRooms(prev => (prev ?? []).map(r => (r.roomId === next.roomId ? next : r)))} />
        )}
        {activeTab === 'ai_renders' && (() => {
          const selectionsMap: Record<string, RoomInterior> = {};
          rooms.forEach(r => { selectionsMap[r.roomId] = r; });
          const primaryStyle = rooms[0]?.style || 'modern_minimalist';
          const moodBoard = STYLE_TEMPLATES[primaryStyle];
          return (
            <InteriorAIDrawings
              layout={layout}
              interiorSelections={selectionsMap}
              moodBoard={moodBoard}
              onRoomChange={(next) => setRooms(prev => (prev ?? []).map(r => (r.roomId === next.roomId ? next : r)))}
            />
          );
        })()}
        {activeTab === 'timeline' && interiorData && (
          <InteriorTimeline phases={interiorData.executionPlan} totalDays={interiorData.totalDurationDays} />
        )}
        {activeTab === 'cost' && interiorData && (
          <InteriorCostReport data={interiorData} rooms={rooms} layout={layout} clear={clearDims} />
        )}
      </div>
    </div>
  );
};
