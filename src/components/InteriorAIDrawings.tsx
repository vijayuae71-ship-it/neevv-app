'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Room, RoomInterior, InteriorMoodBoard, Layout } from '../types';
import { buildInteriorRoomPrompt, InteriorRenderType } from '../utils/interiorRenderPrompt';
import { Camera, RefreshCw, Download, AlertTriangle, Sparkles, Eye, ChevronRight } from 'lucide-react';
import BrandWatermark from './BrandWatermark';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const GEMINI_API_KEY = 'AIzaSyDkBoNsiNMWeBdriH3_UqTyJovZs6vMdDg';
const RENDER_DIR = '/agent/home/exports/ai_renders';
const APP_RENDERS = '/agent/home/apps/architect-engineer/renders';
const EXTRACT_SCRIPT = '/agent/home/scripts/extract_render.py';
const INDEX_FILE = `${APP_RENDERS}/interior_index.json`;

const MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
  { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro' },
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
  imagePath: string;
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

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

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

  /* ---------- load index on mount ---------- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await window.tasklet.readFileFromDisk(INDEX_FILE);
        if (raw) {
          const parsed: RenderCache = JSON.parse(raw);
          setRenderCache(parsed);
        }
      } catch {
        // no index yet — that's fine
      }
    })();
  }, []);

  /* ---------- persist index ---------- */
  const persistIndex = useCallback(async (cache: RenderCache) => {
    try {
      await window.tasklet.runCommand(`mkdir -p ${APP_RENDERS}`);
      await window.tasklet.writeFileToDisk(INDEX_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
      console.error('Failed to persist interior index', e);
    }
  }, []);

  /* ---------- generate single image ---------- */
  const generateImage = useCallback(
    async (roomId: string, type: RenderTypeKey, model: string): Promise<RenderEntry | null> => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) throw new Error('Room not found');
      const interior = interiorSelections[roomId];

      /* 1 — build prompt */
      const renderType: InteriorRenderType = type === 'plan' ? 'plan' : type === 'elevation' ? 'elevation' : 'render3d';
      const promptText = buildInteriorRoomPrompt(renderType, room, interior, moodBoard);

      /* 2 — write request JSON */
      const ts = Date.now();
      const safeName = sanitize(roomLabel(room));
      const reqPath = `/tmp/interior_req_${safeName}_${type}_${ts}.json`;
      const respPath = `/tmp/interior_resp_${safeName}_${type}_${ts}.json`;
      const pngName = `interior_${safeName}_${type}_${ts}.png`;
      const pngPath = `${APP_RENDERS}/${pngName}`;

      const aspectRatio = type === 'plan' ? '1:1' : '16:9';
      const requestBody = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      };

      await window.tasklet.writeFileToDisk(reqPath, JSON.stringify(requestBody));

      /* 3 — call Gemini via curl (save response to file) */
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const curlCmd = [
        'curl -s --max-time 120 -X POST',
        `"${url}"`,
        '-H "Content-Type: application/json"',
        `-d @${reqPath}`,
        `-o ${respPath}`,
        `-w "\\n__HTTP_STATUS__%{http_code}"`,
      ].join(' ');

      const curlResult = await window.tasklet.runTool('run_command', { command: curlCmd, timeout: 150 });
      const curlOut = typeof curlResult === "object" && curlResult !== null ? (curlResult as any).log || "" : String(curlResult);

      /* parse status */
      const statusMatch = curlOut.match(/__HTTP_STATUS__(\d+)/);
      const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      if (httpStatus === 429) {
        throw new Error('Rate limit reached — please wait a minute before trying again.');
      }
      if (httpStatus !== 200) {
        // try to extract error message
        let detail = `HTTP ${httpStatus}`;
        try {
          const errRaw = await window.tasklet.readFileFromDisk(respPath);
          const errJson = JSON.parse(errRaw);
          detail = errJson?.error?.message || detail;
        } catch { /* ignore */ }
        throw new Error(`Gemini API error: ${detail}`);
      }

      /* 4 — extract PNG via python */
      await window.tasklet.runCommand(`mkdir -p ${APP_RENDERS}`);
      const pyCmd = `python3 ${EXTRACT_SCRIPT} ${respPath} ${pngPath}`;
      const pyResult = await window.tasklet.runCommand(pyCmd);
      const pyOut = typeof pyResult === "object" && pyResult !== null ? (pyResult as any).log || "" : String(pyResult);

      if (pyOut.toLowerCase().includes('error')) {
        throw new Error(`Image extraction failed: ${pyOut}`);
      }

      /* 5 — also copy to exports dir */
      await window.tasklet.runCommand(`mkdir -p ${RENDER_DIR} && cp ${pngPath} ${RENDER_DIR}/${pngName}`);

      const entry: RenderEntry = {
        roomId,
        type,
        imagePath: `./renders/${pngName}`,
        timestamp: ts,
      };
      return entry;
    },
    [rooms, interiorSelections, moodBoard],
  );

  /* ---------- handle Generate click (single room) ---------- */
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
        setProgress(`Generating ${typeLabel} for ${roomLabel(rooms.find(r => r.id === selectedRoomId)!)}…`);

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

      await persistIndex(updatedCache);
      setLoading(false);
      setProgress('');
    },
    [selectedRoomId, selectedType, selectedModel, renderCache, rooms, generateImage, persistIndex],
  );

  /* ---------- download helper ---------- */
  const handleDownload = useCallback(async (imagePath: string) => {
    const filename = imagePath.split('/').pop() || 'render.png';
    try {
      // Fetch the image as blob — works in mobile Chrome iframes
      const resp = await fetch(`./renders/${filename}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      // Fallback: open in new tab so user can long-press to save
      window.open(`./renders/${filename}`, '_blank');
    }
  }, []);

  /* ---------- derived selections ---------- */
  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const currentKey = cacheKey(selectedRoomId, selectedType);
  const currentRenders = renderCache[currentKey] || [];
  const latestRender = currentRenders[currentRenders.length - 1] ?? null;

  /* ---------- all-room thumbnails for sidebar badge ---------- */
  const roomRenderCount = (roomId: string) =>
    RENDER_TYPES.reduce((n, rt) => n + (renderCache[cacheKey(roomId, rt.key)]?.length || 0), 0);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  if (rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-base-content/50">
        <p>No rooms available. Please define rooms in the layout first.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[700px] border border-base-300 rounded-xl overflow-hidden bg-base-100">
      {/* ==================== LEFT SIDEBAR ==================== */}
      <aside className="w-52 flex-shrink-0 border-r border-base-300 bg-base-200/60 flex flex-col">
        <div className="px-3 py-2 border-b border-base-300">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <Eye size={14} /> Rooms
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {rooms.map(room => {
            const count = roomRenderCount(room.id);
            const active = room.id === selectedRoomId;
            return (
              <button
                key={room.id}
                onClick={() => { setSelectedRoomId(room.id); setError(null); }}
                className={`btn btn-sm w-full justify-start gap-2 ${active ? 'btn-primary' : 'btn-ghost'}`}
              >
                <span className="truncate flex-1 text-left">{roomLabel(room)}</span>
                {count > 0 && (
                  <span className={`badge badge-xs ${active ? 'badge-primary-content' : 'badge-neutral'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* render progress summary */}
        <div className="border-t border-base-300 px-3 py-2">
          <p className="text-xs text-base-content/50 mb-1">Render Coverage</p>
          {rooms.map(room => {
            const has = (t: RenderTypeKey) => (renderCache[cacheKey(room.id, t)]?.length || 0) > 0;
            return (
              <div key={room.id} className="flex items-center gap-1 text-xs mb-0.5">
                <span className="truncate flex-1 text-base-content/60">{roomLabel(room).slice(0, 12)}</span>
                <span className={`w-2 h-2 rounded-full ${has('plan') ? 'bg-success' : 'bg-base-300'}`} title="Plan" />
                <span className={`w-2 h-2 rounded-full ${has('elevation') ? 'bg-info' : 'bg-base-300'}`} title="Elevation" />
                <span className={`w-2 h-2 rounded-full ${has('render3d') ? 'bg-warning' : 'bg-base-300'}`} title="3D" />
              </div>
            );
          })}
          <div className="flex gap-2 mt-1 text-[10px] text-base-content/40">
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Plan</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-info inline-block" /> Elev</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> 3D</span>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN PANEL ==================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ---------- TOP BAR ---------- */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-base-300 bg-base-200/40 flex-wrap">
          {/* Render type dropdown */}
          <select
            className="select select-bordered select-xs min-w-0"
            value={selectedType}
            onChange={e => { setSelectedType(e.target.value as RenderTypeKey); setError(null); }}
          >
            {RENDER_TYPES.map(rt => (
              <option key={rt.key} value={rt.key}>{rt.label}</option>
            ))}
          </select>

          {/* Model dropdown */}
          <select
            className="select select-bordered select-xs min-w-0"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* generate button */}
          <button
            className="btn btn-primary btn-xs gap-1"
            disabled={loading}
            onClick={() => handleGenerate()}
          >
            {loading ? <span className="loading loading-spinner loading-xs" /> : <Sparkles size={13} />}
            Generate
          </button>

          {/* generate all 3 for this room */}
          <button
            className="btn btn-outline btn-xs gap-1"
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
              className="btn btn-error btn-xs gap-1"
              onClick={() => { abortRef.current = true; }}
              title="Stop generation"
            >
              ✕ Stop
            </button>
          )}
        </div>

        {/* ---------- render type description ---------- */}
        <div className="px-4 py-1.5 text-xs text-base-content/50 border-b border-base-300/50">
          {RENDER_TYPES.find(rt => rt.key === selectedType)?.description}
          {selectedRoom && (
            <span className="ml-2 text-base-content/70 font-medium">
              — {roomLabel(selectedRoom)}
              {selectedRoom.width && selectedRoom.height
                ? ` (${selectedRoom.width}′ × ${selectedRoom.height}′)`
                : ''}
            </span>
          )}
        </div>

        {/* ---------- ERROR ---------- */}
        {error && (
          <div className="mx-4 mt-2">
            <div className="alert alert-error alert-sm">
              <AlertTriangle size={16} />
              <span className="text-sm">{error}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setError(null)}>✕</button>
            </div>
          </div>
        )}

        {/* ---------- MAIN IMAGE AREA ---------- */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
          {loading && (
            <div className="absolute inset-0 z-20 bg-base-100/80 flex flex-col items-center justify-center gap-3">
              <span className="loading loading-ring loading-lg text-primary" />
              <p className="text-sm font-medium text-primary animate-pulse">{progress}</p>
            </div>
          )}

          {latestRender ? (
            <div className="relative max-h-full max-w-full">
              <img
                src={latestRender.imagePath}
                alt={`${selectedType} render`}
                className="max-h-[480px] w-auto rounded-lg shadow-lg border border-base-300 object-contain"
              />
              <div className="absolute top-2 left-2">
                <BrandWatermark />
              </div>
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  className="btn btn-circle btn-xs btn-ghost bg-base-100/70 backdrop-blur"
                  onClick={() => handleDownload(latestRender.imagePath)}
                  title="Download"
                >
                  <Download size={13} />
                </button>
                <button
                  className="btn btn-circle btn-xs btn-ghost bg-base-100/70 backdrop-blur"
                  onClick={() => handleGenerate()}
                  title="Regenerate"
                  disabled={loading}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
          ) : !loading ? (
            <div className="flex flex-col items-center gap-4 text-base-content/40">
              <Camera size={56} strokeWidth={1} />
              <p className="text-sm">No {RENDER_TYPES.find(rt => rt.key === selectedType)?.label} yet</p>
              <button
                className="btn btn-primary btn-sm gap-2"
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
          <div className="border-t border-base-300 bg-base-200/40 px-4 py-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-base-content/50 flex-shrink-0">History</span>
              <ChevronRight size={12} className="text-base-content/30 flex-shrink-0" />
              {currentRenders.map((entry, idx) => (
                <button
                  key={entry.timestamp}
                  onClick={() => {
                    // move this entry to end (make it "latest") by reordering cache
                    const updated = { ...renderCache };
                    const arr = [...(updated[currentKey] || [])];
                    const [item] = arr.splice(idx, 1);
                    arr.push(item);
                    updated[currentKey] = arr;
                    setRenderCache(updated);
                  }}
                  className={`flex-shrink-0 rounded-md border-2 overflow-hidden transition-all hover:scale-105 ${
                    idx === currentRenders.length - 1 ? 'border-primary' : 'border-base-300'
                  }`}
                >
                  <img
                    src={entry.imagePath}
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
