'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, Loader2, CheckCircle, AlertCircle, ArrowLeft, ArrowRight, Edit3, X } from 'lucide-react';
import { ProjectRequirements, Layout } from '@/types';
import { uploadedPlanToLayout, planIssues, ROOM_TYPES, type ExtractedPlan, type ExtractedRoom as ExtractedPlanRoom } from '@/utils/uploadedPlan';
import { authFetch } from '@/utils/authFetch';

type ExtractedRoom = ExtractedPlanRoom;

/** Phone photos are often 4–12 MB; the reader works from ~2000 px anyway, so shrink to a JPEG before sending. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || (file.size < 1.5 * 1024 * 1024 && file.type !== 'image/heic')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext('2d'); if (!ctx) return file;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** Cloud Run's own address for the analysis call (Firebase Hosting stops proxied requests at 60 s). */
let directUrlPromise: Promise<string> | null = null;
const directBase = () => (directUrlPromise ??= fetch('/api/upload-config').then((r) => r.json()).then((d) => (typeof d.directUrl === 'string' ? d.directUrl : '')).catch(() => ''));
type ExtractedData = ExtractedPlan;

interface DrawingUploadProps {
  onConversionComplete: (layout: Layout, requirements: ProjectRequirements) => void;
  onBack: () => void;
}

type UploadStep = 'upload' | 'analyzing' | 'review' | 'error';

export default function DrawingUpload({ onConversionComplete, onBack }: DrawingUploadProps) {
  const [uploadStep, setUploadStep] = useState<UploadStep>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingRoom, setEditingRoom] = useState<{ fi: number; ri: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (picked: File) => {
    let file = picked;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setErrorMsg('Please upload an image (JPG, PNG) or PDF file');
      setUploadStep('error');
      return;
    }
    file = await shrinkImage(file);

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setErrorMsg('Please upload a JPG, PNG, WebP or PDF (iPhone photos: share as JPG).');
      setUploadStep('error');
      return;
    }
    if (file.size > (file.type === 'application/pdf' ? 20 : 5) * 1024 * 1024) {
      setErrorMsg(file.type === 'application/pdf' ? 'PDF must be under 20 MB' : 'Image must be under 5 MB — please resize it');
      setUploadStep('error');
      return;
    }

    // Show preview
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    setUploadStep('analyzing');

    try {
      const formData = new FormData();
      formData.append('drawing', file);

      const base = await directBase();
      let response: Response;
      try {
        response = await authFetch(`${base}/api/analyze-drawing`, { method: 'POST', body: formData });
      } catch (e) {
        if (!base) throw e;
        response = await authFetch('/api/analyze-drawing', { method: 'POST', body: formData }); // direct address blocked: try via the site
      }

      const data = await response.json().catch(() => ({
        error: response.status === 504 || response.status === 502
          ? 'Reading the drawing took too long. Please try again, or upload one floor per image.'
          : `The server could not read this drawing (error ${response.status}). Please try again.`,
      }));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      const e = data.extracted;
      const cleaned: ExtractedData = {
        plotWidthFt: e.plotWidthFt, plotDepthFt: e.plotDepthFt, facing: e.facing,
        setbacksFt: e.setbacksFt ?? { front: 5, rear: 5, left: 3.3, right: 3.3 },
        floors: (e.floors || []).map((f: any) => ({ floorLabel: f.floorLabel, rooms: f.rooms || [], openings: f.openings || [] })),
        confidence: e.confidence ?? 'medium', notes: e.notes ?? [],
      };
      setExtracted(cleaned);
      if (data.imageBase64 && !previewUrl) {
        setPreviewUrl(data.imageBase64);
      }
      setUploadStep('review');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to analyze drawing');
      setUploadStep('error');
    }
  }, [previewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const updateRoom = (fi: number, ri: number, field: keyof ExtractedRoom, value: string | number) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.floors = updated.floors.map((f, fIdx) => {
      if (fIdx !== fi) return f;
      return {
        ...f,
        rooms: f.rooms.map((r, rIdx) => {
          if (rIdx !== ri) return r;
          return { ...r, [field]: value };
        }),
      };
    });
    setExtracted(updated);
  };

  const deleteRoom = (fi: number, ri: number) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.floors = updated.floors.map((f, fIdx) => {
      if (fIdx !== fi) return f;
      return { ...f, rooms: f.rooms.filter((_, rIdx) => rIdx !== ri) };
    });
    setExtracted(updated);
  };

  const addRoom = (fi: number) => {
    if (!extracted) return;
    const updated = { ...extracted };
    updated.floors = updated.floors.map((f, fIdx) => {
      if (fIdx !== fi) return f;
      return {
        ...f,
        rooms: [...f.rooms, { name: `Room ${f.rooms.length + 1}`, type: 'bedroom', xFt: 0, yFt: Math.max(0, ...f.rooms.map(r => r.yFt + r.depthFt)), widthFt: 12, depthFt: 12 }],
      };
    });
    setExtracted(updated);
  };

  /** Format area with clean rounding */
  const fmtArea = (n: number) => Math.round(n).toLocaleString('en-IN');

  const [city, setCity] = useState('');
  const handleProceed = () => {
    if (!extracted) return;
    const { layout, requirements } = uploadedPlanToLayout(extracted, city.trim() || 'Not specified');
    onConversionComplete(layout, requirements);
  };
  const issues = extracted ? planIssues(extracted) : [];

  const roomTypes = [...ROOM_TYPES];

  /* ===================== RENDER ===================== */

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft size={18} /> Back
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Upload Drawing</h1>
        <p className="text-gray-500 mt-1">Upload your architectural drawing and we&apos;ll convert it to 2D plans, 3D elevation &amp; cost estimation</p>
      </div>

      <div className="max-w-4xl mx-auto">

        {/* ─── UPLOAD STEP ─── */}
        {uploadStep === 'upload' && (
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
              ${dragActive ? 'border-amber-500 bg-amber-50' : 'border-gray-300 bg-white hover:border-amber-400 hover:bg-amber-50/30'}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleInputChange}
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                <Upload size={36} className="text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-800">Drop your drawing here</p>
                <p className="text-gray-500 mt-1">or click to browse</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">📸 Photo of sketch</span>
                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">📄 Scanned PDF</span>
                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">🖼️ CAD screenshot</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">JPG, PNG, WebP up to 5 MB · PDF up to 20 MB</p>
            </div>
          </div>
        )}

        {/* ─── ANALYZING STEP ─── */}
        {uploadStep === 'analyzing' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12">
            <div className="flex flex-col items-center gap-6">
              {previewUrl && (
                <img src={previewUrl} alt="Uploaded drawing" className="max-h-64 rounded-xl border border-gray-200 object-contain" />
              )}
              <div className="flex items-center gap-3">
                <Loader2 size={28} className="text-amber-600 animate-spin" />
                <span className="text-lg text-gray-700">AI is analyzing your drawing...</span>
              </div>
              <p className="text-xs text-gray-500 -mt-3">Reading every room, door and window carefully takes 1–3 minutes. Please keep this page open.</p>
              <div className="w-full max-w-md">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>Detecting rooms</span>
                  <span>Extracting dimensions</span>
                  <span>Building plan</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── REVIEW STEP ─── */}
        {uploadStep === 'review' && extracted && (
          <div className="space-y-6">
            {/* Preview + Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Uploaded Image */}
              {previewUrl && (
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileImage size={18} /> Uploaded Drawing
                  </h3>
                  <img src={previewUrl} alt="Drawing" className="w-full rounded-xl border border-gray-200 object-contain max-h-80" />
                </div>
              )}

              {/* Extracted Summary */}
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" /> Extracted Details
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Plot Width</p>
                      <p className="text-xl font-bold text-gray-900">{extracted.plotWidthFt}′</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Plot Depth</p>
                      <p className="text-xl font-bold text-gray-900">{extracted.plotDepthFt}′</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Facing</p>
                      <p className="text-xl font-bold text-gray-900">{extracted.facing}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Total Rooms</p>
                      <p className="text-xl font-bold text-gray-900">
                        {extracted.floors.reduce((s, f) => s + f.rooms.length, 0)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Floors</p>
                      <p className="text-lg font-bold text-gray-900">{extracted.floors.length}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Plot Area</p>
                      <p className="text-lg font-bold text-gray-900">{fmtArea(extracted.plotWidthFt * extracted.plotDepthFt)} sq.ft</p>
                    </div>
                  </div>

                  {extracted.notes?.length > 0 && (
                    <div className="bg-blue-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1">AI Notes</p>
                      {extracted.notes.map((note, i) => (
                        <p key={i} className="text-xs text-blue-600">• {note}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Confidence, issues, city */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <p className={`text-sm font-medium ${extracted.confidence === 'high' ? 'text-green-700' : extracted.confidence === 'medium' ? 'text-amber-700' : 'text-red-700'}`}>
                Reading confidence: {extracted.confidence} — {extracted.confidence === 'high' ? 'sizes were written on the drawing.' : 'some sizes were scaled from the drawing; check them against your plan.'}
              </p>
              {issues.length > 0 && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 space-y-1">
                <p className="font-semibold">Please fix before continuing:</p>{issues.map((t, i) => <p key={i}>• {t}</p>)}
              </div>}
              <label className="block text-sm text-gray-700">City (for soil, rates and loads)
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" className="mt-1 w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </label>
            </div>

            {/* To-scale preview of what was read (road at the top) */}
            {extracted.floors.map((floor, fi) => {
              const W = Math.max(1, ...floor.rooms.map(r => r.xFt + r.widthFt)), D = Math.max(1, ...floor.rooms.map(r => r.yFt + r.depthFt));
              const k = Math.min(600 / W, 420 / D);
              return <div key={`p${fi}`} className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 mb-2">{floor.floorLabel} — as read (road at the top)</h3>
                <svg viewBox={`-10 -24 ${W * k + 20} ${D * k + 34}`} className="w-full max-h-[460px]">
                  <text x={(W * k) / 2} y={-10} textAnchor="middle" fontSize="11" fill="#6b7280">ROAD / FRONT</text>
                  {floor.rooms.map((r, ri) => {
                    const bad = issues.some(t => t.startsWith(floor.floorLabel) && t.includes(r.name));
                    return <g key={ri}>
                      <rect x={r.xFt * k} y={r.yFt * k} width={r.widthFt * k} height={r.depthFt * k} fill={bad ? '#fee2e2' : r.type === 'toilet' ? '#e0f2fe' : r.type === 'staircase' ? '#f3f4f6' : '#fffbeb'} stroke={bad ? '#dc2626' : '#374151'} strokeWidth={1.5} />
                      <text x={(r.xFt + r.widthFt / 2) * k} y={(r.yFt + r.depthFt / 2) * k} textAnchor="middle" fontSize="10" fill="#111827">{r.name}</text>
                      <text x={(r.xFt + r.widthFt / 2) * k} y={(r.yFt + r.depthFt / 2) * k + 12} textAnchor="middle" fontSize="9" fill="#6b7280">{r.widthFt}′×{r.depthFt}′</text>
                    </g>;
                  })}
                  {floor.openings.map((o, oi) => {
                    const r = floor.rooms.find(q => q.name.toLowerCase() === o.roomName.toLowerCase()); if (!r) return null;
                    const hz = o.wall === 'front' || o.wall === 'rear', a = (hz ? r.xFt : r.yFt) + o.positionFt - o.widthFt / 2;
                    const fixed = o.wall === 'front' ? r.yFt : o.wall === 'rear' ? r.yFt + r.depthFt : o.wall === 'left' ? r.xFt : r.xFt + r.widthFt;
                    const col = o.type === 'door' ? '#b45309' : '#0284c7';
                    return hz ? <line key={oi} x1={a * k} x2={(a + o.widthFt) * k} y1={fixed * k} y2={fixed * k} stroke={col} strokeWidth={4} />
                      : <line key={oi} y1={a * k} y2={(a + o.widthFt) * k} x1={fixed * k} x2={fixed * k} stroke={col} strokeWidth={4} />;
                  })}
                </svg>
                <p className="text-xs text-gray-500 mt-1">Brown: doors · Blue: windows. Positions are from the front-left corner; edit X/Y below if a room is misplaced.</p>
              </div>;
            })}

            {/* Editable Room List */}
            {extracted.floors.map((floor, fi) => (
              <div key={fi} className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 mb-3">{floor.floorLabel}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="pb-2 pr-3">Room</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">X (ft)</th>
                        <th className="pb-2 pr-3">Y (ft)</th>
                        <th className="pb-2 pr-3">Width (ft)</th>
                        <th className="pb-2 pr-3">Depth (ft)</th>
                        <th className="pb-2 pr-3">Area (sq.ft)</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {floor.rooms.map((room, ri) => (
                        <tr key={ri} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-3">
                            {editingRoom?.fi === fi && editingRoom?.ri === ri ? (
                              <input
                                type="text"
                                value={room.name}
                                onChange={(e) => updateRoom(fi, ri, 'name', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
                              />
                            ) : (
                              <span className="font-medium text-gray-800">{room.name}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              value={room.type}
                              onChange={(e) => updateRoom(fi, ri, 'type', e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
                            >
                              {roomTypes.map(t => (
                                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                          </td>
                          {(['xFt', 'yFt'] as const).map(fld => <td key={fld} className="py-2 pr-3">
                            <input type="number" value={room[fld]} onChange={(e) => updateRoom(fi, ri, fld, parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900" min={0} step={0.5} />
                          </td>)}
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={room.widthFt}
                              onChange={(e) => updateRoom(fi, ri, 'widthFt', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
                              min={1}
                              step={0.5}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={room.depthFt}
                              onChange={(e) => updateRoom(fi, ri, 'depthFt', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
                              min={1}
                              step={0.5}
                            />
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {Math.round(room.widthFt * room.depthFt)}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingRoom(editingRoom?.fi === fi && editingRoom?.ri === ri ? null : { fi, ri })}
                                className="p-1 text-gray-400 hover:text-amber-600"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => deleteRoom(fi, ri)}
                                className="p-1 text-gray-400 hover:text-red-500"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => addRoom(fi)}
                  className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
                >
                  + Add Room
                </button>
              </div>
            ))}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setUploadStep('upload');
                  setExtracted(null);
                  setPreviewUrl(null);
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
              >
                Upload Different Drawing
              </button>
              <button
                onClick={handleProceed}
                disabled={issues.length > 0}
                className="flex-1 px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                Generate Plans &amp; Cost Estimation <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ─── ERROR STEP ─── */}
        {uploadStep === 'error' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Analysis Failed</h3>
              <p className="text-gray-500 max-w-md">{errorMsg}</p>
              <button
                onClick={() => {
                  setUploadStep('upload');
                  setErrorMsg('');
                  setPreviewUrl(null);
                }}
                className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
