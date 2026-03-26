'use client';

import React, { useState } from 'react';
import { Room, Layout, InteriorStyle, RoomInterior, RoomFinishType, ColorPalette, InteriorMoodBoard as MoodBoardType } from '../types';
import { STYLE_TEMPLATES, getDefaultFurniture, getDefaultMaterials, mapRoomTypeToFinish } from '../utils/interiorTemplates';
import BrandWatermark from './BrandWatermark';

interface Props {
  layout: Layout;
  onComplete: (rooms: RoomInterior[]) => void;
}

type SubStep = 'style' | 'customize' | 'preview';

const ALL_STYLES: InteriorStyle[] = ['modern_minimalist', 'contemporary_indian', 'traditional', 'industrial', 'scandinavian'];

const FLOORING_OPTIONS = ['Vitrified Tiles', 'Marble', 'Wooden Laminate', 'Concrete Tiles', 'Anti-skid Tiles'];
const WALL_FINISH_OPTIONS = ['Emulsion Paint', 'Texture Paint', 'Wallpaper', 'POP Punning'];
const CEILING_OPTIONS: { label: string; value: RoomInterior['ceilingType'] }[] = [
  { label: 'Plain', value: 'plain' },
  { label: 'Peripheral False Ceiling', value: 'false_ceiling_peripheral' },
  { label: 'Full False Ceiling', value: 'false_ceiling_full' },
  { label: 'Wooden Ceiling', value: 'wooden_ceiling' },
];
const SPECIAL_FEATURE_OPTIONS = ['Accent Wall', 'Wall Niche', 'Mirror Panel', 'LED Profile Lights', 'Cove Lighting'];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function getElectricalDefaults(roomType: RoomFinishType) {
  switch (roomType) {
    case 'bedroom':
    case 'master_bedroom':
      return { switches: 3, sockets: 4, dataPoints: 1, lightPoints: 3, fanPoints: 1, acPoints: 1 };
    case 'living':
      return { switches: 4, sockets: 6, dataPoints: 2, lightPoints: 5, fanPoints: 2, acPoints: 1 };
    case 'kitchen':
      return { switches: 3, sockets: 5, dataPoints: 0, lightPoints: 3, fanPoints: 1, acPoints: 0 };
    case 'bathroom':
      return { switches: 2, sockets: 1, dataPoints: 0, lightPoints: 2, fanPoints: 1, acPoints: 0 };
    default:
      return { switches: 2, sockets: 3, dataPoints: 1, lightPoints: 2, fanPoints: 1, acPoints: 0 };
  }
}

function getDefaultCeiling(roomType: RoomFinishType): RoomInterior['ceilingType'] {
  switch (roomType) {
    case 'bedroom':
    case 'master_bedroom':
    case 'living':
      return 'false_ceiling_peripheral';
    default:
      return 'plain';
  }
}

function extractDesignableRooms(layout: Layout): Room[] {
  const allRooms = layout.floors.flatMap(f => f.rooms);
  return allRooms.filter(r =>
    !['staircase', 'passage', 'parking', 'store', 'utility'].includes(r.type)
  );
}

function buildRoomInterior(room: Room, style: InteriorStyle): RoomInterior {
  const finishType = mapRoomTypeToFinish(room.type);
  const furniture = getDefaultFurniture(finishType, style);
  const materials = getDefaultMaterials(finishType, style);
  const palette = { ...STYLE_TEMPLATES[style].palette };

  return {
    roomId: room.id,
    roomName: room.name,
    roomType: finishType,
    style,
    palette,
    flooring: materials.flooring,
    wallFinish: materials.wallFinish,
    ceilingType: getDefaultCeiling(finishType),
    ceilingHeight: getDefaultCeiling(finishType) === 'plain' ? 3000 : 2900,
    furniture,
    electricalPoints: getElectricalDefaults(finishType),
    specialFeatures: [],
  };
}

function ColorSwatch({ color, size = 24, onClick }: { color: string; size?: number; onClick?: () => void }) {
  return (
    <div
      className="rounded-full border border-base-content/20 inline-block cursor-pointer"
      style={{ backgroundColor: color, width: size, height: size, minWidth: size }}
      onClick={onClick}
    />
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export default function InteriorMoodBoard({ layout, onComplete }: Props) {
  const [subStep, setSubStep] = useState<SubStep>('style');
  const [globalStyle, setGlobalStyle] = useState<InteriorStyle | null>(null);
  const [roomInteriors, setRoomInteriors] = useState<RoomInterior[]>([]);
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [configuredSet, setConfiguredSet] = useState<Set<string>>(new Set());
  // Track excluded furniture per room (by furniture id)
  const [excludedFurniture, setExcludedFurniture] = useState<Record<string, Set<string>>>({});

  const designableRooms = extractDesignableRooms(layout);

  /* ---------- Sub-step 1 handlers ---------- */

  const handleApplyGlobalStyle = () => {
    if (!globalStyle) return;
    const interiors = designableRooms.map(r => buildRoomInterior(r, globalStyle));
    setRoomInteriors(interiors);
    setSelectedRoomIdx(0);
    setConfiguredSet(new Set());
    setExcludedFurniture({});
    setSubStep('customize');
  };

  /* ---------- Sub-step 2 handlers ---------- */

  const currentRoom = roomInteriors[selectedRoomIdx] as RoomInterior | undefined;

  const updateCurrentRoom = (patch: Partial<RoomInterior>) => {
    setRoomInteriors(prev => {
      const next = [...prev];
      next[selectedRoomIdx] = { ...next[selectedRoomIdx], ...patch };
      return next;
    });
  };

  const handleStyleOverride = (style: InteriorStyle) => {
    if (!currentRoom) return;
    const room = designableRooms[selectedRoomIdx];
    const rebuilt = buildRoomInterior(room, style);
    // keep special features
    rebuilt.specialFeatures = currentRoom.specialFeatures;
    setRoomInteriors(prev => {
      const next = [...prev];
      next[selectedRoomIdx] = rebuilt;
      return next;
    });
  };

  const handlePaletteChange = (key: keyof ColorPalette, value: string) => {
    if (!currentRoom) return;
    if (key === 'name') return;
    updateCurrentRoom({ palette: { ...currentRoom.palette, [key]: value } });
  };

  const handleFlooringChange = (name: string) => {
    if (!currentRoom) return;
    updateCurrentRoom({ flooring: { ...currentRoom.flooring, name } });
  };

  const handleWallFinishChange = (name: string) => {
    if (!currentRoom) return;
    updateCurrentRoom({ wallFinish: { ...currentRoom.wallFinish, name } });
  };

  const handleCeilingChange = (val: RoomInterior['ceilingType']) => {
    if (!currentRoom) return;
    updateCurrentRoom({ ceilingType: val, ceilingHeight: val === 'plain' ? 3000 : 2900 });
  };

  const toggleFeature = (feat: string) => {
    if (!currentRoom) return;
    const features = currentRoom.specialFeatures.includes(feat)
      ? currentRoom.specialFeatures.filter(f => f !== feat)
      : [...currentRoom.specialFeatures, feat];
    updateCurrentRoom({ specialFeatures: features });
  };

  const toggleFurnitureItem = (furnId: string) => {
    if (!currentRoom) return;
    const roomId = currentRoom.roomId;
    setExcludedFurniture(prev => {
      const set = new Set(prev[roomId] ?? []);
      if (set.has(furnId)) set.delete(furnId);
      else set.add(furnId);
      return { ...prev, [roomId]: set };
    });
  };

  const [justSaved, setJustSaved] = useState<string | null>(null);

  const saveRoom = () => {
    if (!currentRoom) return;
    const roomId = currentRoom.roomId;
    setConfiguredSet(prev => new Set(prev).add(roomId));
    setJustSaved(roomId);
    setTimeout(() => setJustSaved(null), 1500);

    // Auto-advance to next unconfigured room
    const nextUnconfigured = roomInteriors.findIndex(
      (ri, idx) => idx !== selectedRoomIdx && !configuredSet.has(ri.roomId)
    );
    if (nextUnconfigured >= 0) {
      setTimeout(() => setSelectedRoomIdx(nextUnconfigured), 600);
    }
  };

  const allConfigured = configuredSet.size >= roomInteriors.length;

  const getFloorLabel = (room: Room): string => {
    const fl = layout.floors.find(f => f.floor === room.floor);
    return fl?.floorLabel ?? `Floor ${room.floor}`;
  };

  /* ---------- Sub-step 3 ---------- */

  const getFinalRooms = (): RoomInterior[] =>
    roomInteriors.map(ri => {
      const excluded = excludedFurniture[ri.roomId];
      if (!excluded || excluded.size === 0) return ri;
      return { ...ri, furniture: ri.furniture.filter(f => !excluded.has(f.id)) };
    });

  const roomFurnitureCost = (ri: RoomInterior): number => {
    const excluded = excludedFurniture[ri.roomId];
    return ri.furniture
      .filter(f => !(excluded && excluded.has(f.id)))
      .reduce((s, f) => s + f.estimatedCost, 0);
  };

  const totalEstimatedCost = roomInteriors.reduce((s, ri) => s + roomFurnitureCost(ri), 0);

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="relative w-full">
      <BrandWatermark position="top-left" />

      {/* ---------- STEP INDICATOR ---------- */}
      <div className="flex items-center gap-2 mb-6">
        {(['style', 'customize', 'preview'] as SubStep[]).map((step, i) => {
          const labels = ['Style Selection', 'Room Customization', 'Mood Board Preview'];
          const active = step === subStep;
          return (
            <React.Fragment key={step}>
              {i > 0 && <div className="flex-1 h-px bg-base-content/20" />}
              <span className={`badge ${active ? 'badge-primary' : 'badge-ghost'} text-xs`}>
                {i + 1}. {labels[i]}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* ================================================================
         SUB-STEP 1 — GLOBAL STYLE SELECTION
         ================================================================ */}
      {subStep === 'style' && (
        <div>
          <h2 className="text-xl font-bold mb-4">Choose a Base Interior Style</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_STYLES.map(styleKey => {
              const tpl = STYLE_TEMPLATES[styleKey];
              const selected = globalStyle === styleKey;
              return (
                <div
                  key={styleKey}
                  className={`card bg-base-200 cursor-pointer transition-all ${selected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-base-content/30'}`}
                  onClick={() => setGlobalStyle(styleKey)}
                >
                  <div className="card-body p-4">
                    <h3 className="text-lg font-bold">{tpl.styleName}</h3>
                    <p className="text-sm opacity-80 mb-3">{tpl.description}</p>

                    {/* palette swatches */}
                    <div className="flex gap-2 mb-3">
                      {[tpl.palette.primary, tpl.palette.secondary, tpl.palette.accent, tpl.palette.wall, tpl.palette.ceiling].map((c, ci) => (
                        <span key={ci}><ColorSwatch color={c} /></span>
                      ))}
                    </div>

                    {/* key materials */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {tpl.keyMaterials.slice(0, 4).map((m, mi) => (
                        <span key={mi} className="badge badge-sm badge-outline text-xs">{m}</span>
                      ))}
                    </div>

                    {/* key furniture */}
                    <div className="text-xs opacity-70">
                      {tpl.keyFurniture.slice(0, 3).join(' • ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 text-right">
            <button
              className="btn btn-primary"
              disabled={!globalStyle}
              onClick={handleApplyGlobalStyle}
            >
              Apply &amp; Customize Rooms
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
         SUB-STEP 2 — ROOM-BY-ROOM CUSTOMIZATION
         ================================================================ */}
      {subStep === 'customize' && currentRoom && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* --- Left sidebar: room list --- */}
          <div className="lg:w-56 shrink-0">
            <div className="text-sm font-semibold mb-2">
              Rooms ({configuredSet.size}/{roomInteriors.length} configured)
            </div>
            <ul className="menu bg-base-200 rounded-box w-full max-h-[60vh] overflow-y-auto">
              {roomInteriors.map((ri, idx) => {
                const done = configuredSet.has(ri.roomId);
                const active = idx === selectedRoomIdx;
                return (
                  <li key={ri.roomId}>
                    <button
                      className={`text-sm justify-between ${active ? 'active' : ''}`}
                      onClick={() => setSelectedRoomIdx(idx)}
                    >
                      <span className="truncate">{ri.roomName}</span>
                      {done && <span className="text-success text-xs">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              className="btn btn-primary btn-sm w-full mt-3"
              disabled={!allConfigured}
              onClick={() => setSubStep('preview')}
            >
              Review Mood Board
            </button>
            <button
              className="btn btn-ghost btn-xs w-full mt-1"
              onClick={() => setSubStep('style')}
            >
              ← Back to Style
            </button>
          </div>

          {/* --- Right panel: room editor --- */}
          <div className="flex-1 bg-base-200 rounded-xl p-4 space-y-5 overflow-y-auto max-h-[75vh]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{currentRoom.roomName}</h3>
              <span className="badge badge-sm">{currentRoom.roomType}</span>
            </div>

            {/* Style Override */}
            <div>
              <label className="text-sm font-semibold block mb-1">Style Override</label>
              <select
                className="select select-bordered select-sm w-full max-w-xs"
                value={currentRoom.style}
                onChange={e => handleStyleOverride(e.target.value as InteriorStyle)}
              >
                {ALL_STYLES.map(s => (
                  <option key={s} value={s}>{STYLE_TEMPLATES[s].styleName}</option>
                ))}
              </select>
            </div>

            {/* Color Palette */}
            <div>
              <label className="text-sm font-semibold block mb-1">Color Palette — {currentRoom.palette.name}</label>
              <div className="flex gap-3 flex-wrap">
                {(['primary', 'secondary', 'accent', 'wall', 'ceiling'] as const).map(key => (
                  <label key={key} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <ColorSwatch color={currentRoom.palette[key]} />
                      <input
                        type="color"
                        className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
                        value={currentRoom.palette[key]}
                        onChange={e => handlePaletteChange(key, e.target.value)}
                      />
                    </div>
                    <span className="text-xs opacity-60 capitalize">{key}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Flooring */}
            <div>
              <label className="text-sm font-semibold block mb-1">Flooring</label>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  className="select select-bordered select-sm"
                  value={currentRoom.flooring.name}
                  onChange={e => handleFlooringChange(e.target.value)}
                >
                  {FLOORING_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {/* keep current if not in list */}
                  {!FLOORING_OPTIONS.includes(currentRoom.flooring.name) && (
                    <option value={currentRoom.flooring.name}>{currentRoom.flooring.name}</option>
                  )}
                </select>
                <span className="text-xs opacity-60">
                  {currentRoom.flooring.finish} • {fmt(currentRoom.flooring.ratePerUnit)}/{currentRoom.flooring.unit}
                </span>
              </div>
            </div>

            {/* Wall Finish */}
            <div>
              <label className="text-sm font-semibold block mb-1">Wall Finish</label>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  className="select select-bordered select-sm"
                  value={currentRoom.wallFinish.name}
                  onChange={e => handleWallFinishChange(e.target.value)}
                >
                  {WALL_FINISH_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {!WALL_FINISH_OPTIONS.includes(currentRoom.wallFinish.name) && (
                    <option value={currentRoom.wallFinish.name}>{currentRoom.wallFinish.name}</option>
                  )}
                </select>
                <span className="text-xs opacity-60">
                  {currentRoom.wallFinish.finish} • {fmt(currentRoom.wallFinish.ratePerUnit)}/{currentRoom.wallFinish.unit}
                </span>
              </div>
            </div>

            {/* Ceiling Type */}
            <div>
              <label className="text-sm font-semibold block mb-1">Ceiling Type</label>
              <div className="flex flex-wrap gap-3">
                {CEILING_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="ceiling"
                      className="radio radio-sm radio-primary"
                      checked={currentRoom.ceilingType === opt.value}
                      onChange={() => handleCeilingChange(opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Furniture List */}
            <div>
              <label className="text-sm font-semibold block mb-1">Furniture</label>
              <div className="overflow-x-auto">
                <table className="table table-xs w-full">
                  <thead>
                    <tr>
                      <th className="w-8">Inc.</th>
                      <th>Item</th>
                      <th>Dimensions (W×D×H)</th>
                      <th>Material</th>
                      <th className="text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoom.furniture.map(f => {
                      const excluded = excludedFurniture[currentRoom.roomId];
                      const isExcluded = excluded ? excluded.has(f.id) : false;
                      return (
                        <tr key={f.id} className={isExcluded ? 'opacity-40' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs checkbox-primary"
                              checked={!isExcluded}
                              onChange={() => toggleFurnitureItem(f.id)}
                            />
                          </td>
                          <td className="text-xs">{f.name}</td>
                          <td className="text-xs">{f.widthMM}×{f.depthMM}×{f.heightMM}</td>
                          <td className="text-xs">{f.material}</td>
                          <td className="text-xs text-right">{fmt(f.estimatedCost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-right mt-1 opacity-70">
                Room furniture total: {fmt(roomFurnitureCost(currentRoom))}
              </div>
            </div>

            {/* Special Features */}
            <div>
              <label className="text-sm font-semibold block mb-1">Special Features</label>
              <div className="flex flex-wrap gap-3">
                {SPECIAL_FEATURE_OPTIONS.map(feat => (
                  <label key={feat} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={currentRoom.specialFeatures.includes(feat)}
                      onChange={() => toggleFeature(feat)}
                    />
                    <span className="text-sm">{feat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Save Room + Navigation */}
            <div className="pt-2 flex items-center gap-3">
              {justSaved === currentRoom.roomId ? (
                <button className="btn btn-success btn-sm gap-1" disabled>
                  ✓ Saved!
                </button>
              ) : configuredSet.has(currentRoom.roomId) ? (
                <button className="btn btn-outline btn-primary btn-sm gap-1" onClick={saveRoom}>
                  ✓ Update Room
                </button>
              ) : (
                <button className="btn btn-primary btn-sm gap-1" onClick={saveRoom}>
                  Save Room
                </button>
              )}

              {/* Quick nav buttons */}
              {selectedRoomIdx > 0 && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedRoomIdx(selectedRoomIdx - 1)}
                >
                  ← Prev Room
                </button>
              )}
              {selectedRoomIdx < roomInteriors.length - 1 && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedRoomIdx(selectedRoomIdx + 1)}
                >
                  Next Room →
                </button>
              )}

              {allConfigured && (
                <button
                  className="btn btn-accent btn-sm ml-auto"
                  onClick={() => setSubStep('preview')}
                >
                  All Done → Review Mood Board
                </button>
              )}
            </div>

            {/* Progress hint */}
            {!allConfigured && (
              <div className="text-xs opacity-50 mt-1">
                Save all {roomInteriors.length} rooms to unlock the Mood Board preview
                ({configuredSet.size}/{roomInteriors.length} done)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
         SUB-STEP 3 — MOOD BOARD PREVIEW
         ================================================================ */}
      {subStep === 'preview' && (
        <div>
          <h2 className="text-xl font-bold mb-4">Interior Mood Board Preview</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roomInteriors.map((ri, idx) => {
              const room = designableRooms[idx];
              const floorLabel = room ? getFloorLabel(room) : '';
              const excluded = excludedFurniture[ri.roomId];
              const includedFurniture = ri.furniture.filter(f => !(excluded && excluded.has(f.id)));
              const furnCost = includedFurniture.reduce((s, f) => s + f.estimatedCost, 0);

              return (
                <div key={ri.roomId} className="card bg-base-200">
                  <div className="card-body p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-sm">{ri.roomName}</h4>
                      <span className="badge badge-xs badge-ghost">{floorLabel}</span>
                    </div>

                    <div className="text-xs opacity-70 mb-2">
                      {STYLE_TEMPLATES[ri.style].styleName}
                    </div>

                    {/* palette */}
                    <div className="flex gap-1 mb-2">
                      {[ri.palette.primary, ri.palette.secondary, ri.palette.accent, ri.palette.wall, ri.palette.ceiling].map((c, ci) => (
                        <span key={ci}><ColorSwatch color={c} size={18} /></span>
                      ))}
                    </div>

                    <div className="text-xs space-y-0.5">
                      <div><span className="opacity-60">Flooring:</span> {ri.flooring.name}</div>
                      <div><span className="opacity-60">Wall:</span> {ri.wallFinish.name}</div>
                      <div><span className="opacity-60">Ceiling:</span> {ri.ceilingType.replace(/_/g, ' ')}</div>
                      <div>
                        <span className="opacity-60">Furniture:</span> {includedFurniture.length} items — {fmt(furnCost)}
                      </div>
                    </div>

                    {ri.specialFeatures.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {ri.specialFeatures.map(f => (
                          <span key={f} className="badge badge-xs badge-outline">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="bg-base-200 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <span className="font-semibold">{roomInteriors.length}</span> rooms &nbsp;•&nbsp;
              Total Estimated Furniture Cost: <span className="font-bold text-primary">{fmt(totalEstimatedCost)}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setSubStep('customize')}>
                ← Edit Rooms
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onComplete(getFinalRooms())}
              >
                Proceed to Interior Design
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
