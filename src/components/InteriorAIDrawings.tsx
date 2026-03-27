'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { Room, RoomInterior, InteriorMoodBoard, Layout } from '../types';
import { buildInteriorRoomPrompt, InteriorRenderType } from '../utils/interiorRenderPrompt';
import { Camera, RefreshCw, Download, AlertTriangle, Sparkles, Eye, ChevronRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODELS = [
  { id: 'nano-banana', label: 'Nano Banana' },
  { id: 'nano-banana-2', label: 'Nano Banana 2' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
];

const RENDER_TYPES: { key: RenderTypeKey; label: string; description: string }[] = [
  { key: 'plan', label: 'Plan View', description: 'Top-down furniture layout drawing' },
  { key: 'elevation', label: 'Elevation', description: 'Wall elevation with finishes & fixtures' },
  { key: 'render3d', label: '3D Render', description: 'Photorealistic perspective view' },
];

const ROOM_TYPE_LABELS: Record<string, string> = {
  master_bedroom: 'Master Bedroom',
  bedroom: 'Bedroom',
  hall: 'Living Room',
  kitchen: 'Kitchen',
  toilet: 'Bathroom',
  dining: 'Dining',
  puja: 'Puja Room',
  balcony: 'Balcony',
};

const ALLOWED_TYPES = Object.keys(ROOM_TYPE_LABELS);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RenderTypeKey = 'plan' | 'elevation' | 'render3d';

interface RenderEntry {
  roomId: string;
  type: RenderTypeKey;
  imageData: string; // data URI or URL
  timestamp: number;
}

type RenderCache = Record<string, RenderEntry[]>;

interface Props {
  layout: Layout;
  interiorSelections: Record<string, RoomInterior>;
  moodBoard: InteriorMoodBoard;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cacheKey(roomId: string, type: RenderTypeKey): string {
  return `${roomId}_${type}`;
}

function roomLabel(room: Room): string {
  const base = ROOM_TYPE_LABELS[room.type] || room.type;
  return room.name || base;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const InteriorAIDrawings: React.FC<Props> = ({ layout, interiorSelections, moodBoard }) => {
  /* ---------- derived data ---------- */
  const rooms = layout.floors.flatMap(f => f.rooms).filter(r => ALLOWED_TYPES.includes(r.type));

  /* ---------- state ---------- */
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');
  const [selectedType, setSelectedType] = useState<RenderTypeKey>('plan');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [renderCache, setRenderCache] = useState<RenderCache>({});
  const abortRef = useRef(false);

  /* ---------- generate single image via API route ---------- */
  const generateImage = useCallback(
    async (roomId: string, type: RenderTypeKey, model: string): Promise<RenderEntry | null> => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) throw new Error('Room not found');
      const interior = interiorSelections[roomId];

      // Build prompt
      const renderType: InteriorRenderType = type === 'plan' ? 'plan' : type === 'elevation' ? 'elevation' : 'render3d';
      const promptText = buildInteriorRoomPrompt(renderType, room, interior, moodBoard);

      // Call the API route (same one used for exterior renders)
      const response = await fetch('/api/generate-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          model,
          projectId: 'interior-project',
          renderType: `interior_${type}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit reached. Please wait a few minutes and try again.');
        }
        throw new Error(data.error || `API Error (${response.status})`);
      }

      if (!data.success) {
        throw new Error(data.error || 'No image generated');
      }

      // Use either the GCS public URL or the inline base64 data
      const imageUrl = data.imageUrl || data.imageDataUri;
      if (!imageUrl) {
        throw new Error('No image returned from API');
      }

      return {
        roomId,
        type,
        imageData: imageUrl,
        timestamp: Date.now(),
      };
    },
    [rooms, interiorSelections, moodBoard],
  );

  /* ---------- handle Generate click ---------- */
  const handleGenerate = useCallback(
    async (types?: RenderTypeKey[]) => {
      const typesToGen = types || [selectedType];
      setLoading(true);
      setError(null);
      abortRef.current = false;

      let updatedCache = { ...renderCache };

      for (const t of typesToGen) {
        if (abortRef.current) break;
        const typeLabel = RENDER_TYPES.find(rt => rt.key === t)?.label || t;
        const room = rooms.find(r => r.id === selectedRoomId);
        setProgress(`Generating ${typeLabel} for ${room ? roomLabel(room) : 'room'}…`);

        try {
          const entry = await generateImage(selectedRoomId, t, selectedModel);
          if (entry) {
            const key = cacheKey(selectedRoomId, t);
            updatedCache = {
              ...updatedCache,
              [key]: [...(updatedCache[key] || []), entry],
            };
            setRenderCache(updatedCache);
          }
        } catch (err: any) {
          setError(err.message || 'Generation failed');
          break;
        }
      }

      setLoading(false);
      setProgress('');
    },
    [selectedRoomId, selectedType, selectedModel, renderCache, rooms, generateImage],
  );

  /* ---------- download helper ---------- */
  const handleDownload = useCallback(async (imageData: string) => {
    const timestamp = Date.now();
    const a = document.createElement('a');
    a.href = imageData;
    a.download = `neevv-interior-render-${timestamp}.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /* ---------- derived selections ---------- */
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const currentKey = cacheKey(selectedRoomId, selectedType);
  const currentRenders = renderCache[currentKey] || [];
  const latestRender = currentRenders[currentRenders.length - 1] ?? null;

  /* ---------- room render count for sidebar badge ---------- */
  const roomRenderCount = (roomId: string) =>
    RENDER_TYPES.reduce((n, rt) => n + (renderCache[cacheKey(roomId, rt.key)]?.length || 0), 0);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>No rooms available. Please define rooms in the layout first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-[700px] border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* ==================== LEFT SIDEBAR ==================== */}
      <aside className="md:w-52 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-3 py-2 border-b border-gray-200">
          <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
            <Eye size={14} className="text-gray-700" /> Rooms
          </h3>
        </div>
        <div className="flex-1 overflow-x-auto md:overflow-y-auto p-2 flex md:flex-col gap-1 md:space-y-0">
          {rooms.map(room => {
            const count = roomRenderCount(room.id);
            const active = room.id === selectedRoomId;
            return (
              <button
                key={room.id}
                onClick={() => { setSelectedRoomId(room.id); setError(null); }}
                className={`text-sm px-3 py-1.5 rounded-lg flex-shrink-0 md:w-full text-left flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span className="truncate flex-1">{roomLabel(room)}</span>
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* render progress summary — hidden on mobile */}
        <div className="hidden md:block border-t border-gray-200 px-3 py-2">
          <p className="text-xs text-gray-500 mb-1">Render Coverage</p>
          {rooms.map(room => {
            const has = (t: RenderTypeKey) => (renderCache[cacheKey(room.id, t)]?.length || 0) > 0;
            return (
              <div key={room.id} className="flex items-center gap-1 text-xs mb-0.5">
                <span className="truncate flex-1 text-gray-600">{roomLabel(room).slice(0, 12)}</span>
                <span className={`w-2 h-2 rounded-full ${has('plan') ? 'bg-green-500' : 'bg-gray-200'}`} title="Plan" />
                <span className={`w-2 h-2 rounded-full ${has('elevation') ? 'bg-blue-500' : 'bg-gray-200'}`} title="Elevation" />
                <span className={`w-2 h-2 rounded-full ${has('render3d') ? 'bg-amber-500' : 'bg-gray-200'}`} title="3D" />
              </div>
            );
          })}
          <div className="flex gap-2 mt-1 text-[10px] text-gray-400">
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Plan</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Elev</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 3D</span>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN PANEL ==================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ---------- TOP BAR ---------- */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-wrap">
          {/* Render type dropdown */}
          <select
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-800"
            value={selectedType}
            onChange={e => { setSelectedType(e.target.value as RenderTypeKey); setError(null); }}
          >
            {RENDER_TYPES.map(rt => (
              <option key={rt.key} value={rt.key}>{rt.label}</option>
            ))}
          </select>

          {/* Model dropdown */}
          <select
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-800"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* generate button */}
          <button
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-80 flex items-center gap-1"
            disabled={loading}
            onClick={() => handleGenerate()}
          >
            {loading ? <span className="animate-spin">⏳</span> : <Sparkles size={13} />}
            Generate
          </button>

          {/* generate all 3 for this room */}
          <button
            className="text-sm border border-gray-300 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-80 flex items-center gap-1"
            disabled={loading}
            onClick={() => handleGenerate(['plan', 'elevation', 'render3d'])}
            title="Generate Plan + Elevation + 3D for this room"
          >
            <Camera size={13} />
            All 3
          </button>

          {/* stop button */}
          {loading && (
            <button
              className="text-sm bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 flex items-center gap-1"
              onClick={() => { abortRef.current = true; }}
              title="Stop generation"
            >
              ✕ Stop
            </button>
          )}
        </div>

        {/* ---------- render type description ---------- */}
        <div className="px-4 py-1.5 text-xs text-gray-500 border-b border-gray-100">
          {RENDER_TYPES.find(rt => rt.key === selectedType)?.description}
          {selectedRoom && (
            <span className="ml-2 text-gray-700 font-medium">
              — {roomLabel(selectedRoom)}
              {selectedRoom.width && selectedRoom.depth
                ? ` (${Math.round(selectedRoom.width * 3.281)}′ × ${Math.round(selectedRoom.depth * 3.281)}′)`
                : ''}
            </span>
          )}
        </div>

        {/* ---------- ERROR ---------- */}
        {error && (
          <div className="mx-4 mt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-800 flex-1">{error}</span>
              <button className="text-red-400 hover:text-red-600 text-sm" onClick={() => setError(null)}>✕</button>
            </div>
          </div>
        )}

        {/* ---------- MAIN IMAGE AREA ---------- */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
          {loading && (
            <div className="absolute inset-0 z-20 bg-white/80 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-blue-600 animate-pulse">{progress}</p>
            </div>
          )}

          {latestRender ? (
            <div className="relative max-h-full max-w-full">
              <img
                src={latestRender.imageData}
                alt={`${selectedType} render`}
                className="max-h-[480px] w-auto rounded-lg shadow-lg border border-gray-200 object-contain"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  className="w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white shadow"
                  onClick={() => handleDownload(latestRender.imageData)}
                  title="Download"
                >
                  <Download size={13} className="text-gray-700" />
                </button>
                <button
                  className="w-7 h-7 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white shadow"
                  onClick={() => handleGenerate()}
                  title="Regenerate"
                  disabled={loading}
                >
                  <RefreshCw size={13} className="text-gray-700" />
                </button>
              </div>
            </div>
          ) : !loading ? (
            <div className="flex flex-col items-center gap-4 text-gray-400">
              <Camera size={56} strokeWidth={1} />
              <p className="text-sm text-gray-500">No {RENDER_TYPES.find(rt => rt.key === selectedType)?.label} yet</p>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                onClick={() => handleGenerate()}
              >
                <Sparkles size={15} />
                Generate {RENDER_TYPES.find(rt => rt.key === selectedType)?.label}
              </button>
            </div>
          ) : null}
        </div>

        {/* ---------- THUMBNAIL HISTORY STRIP ---------- */}
        {currentRenders.length > 1 && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-gray-500 flex-shrink-0">History</span>
              <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
              {currentRenders.map((entry, idx) => (
                <button
                  key={entry.timestamp}
                  onClick={() => {
                    const updated = { ...renderCache };
                    const arr = [...(updated[currentKey] || [])];
                    const [item] = arr.splice(idx, 1);
                    arr.push(item);
                    updated[currentKey] = arr;
                    setRenderCache(updated);
                  }}
                  className={`flex-shrink-0 rounded-md border-2 overflow-hidden transition-all hover:scale-105 ${
                    idx === currentRenders.length - 1 ? 'border-blue-600' : 'border-gray-200'
                  }`}
                >
                  <img
                    src={entry.imageData}
                    alt={`v${idx + 1}`}
                    className="w-16 h-12 object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InteriorAIDrawings;
