'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, Loader2, CheckCircle, AlertCircle, ArrowLeft, ArrowRight, Edit3, X } from 'lucide-react';
import { ProjectRequirements, Layout, FloorLayout, Room, Column, Facing, FloorProgram } from '@/types';

interface ExtractedRoom {
  name: string;
  type: string;
  widthFt: number;
  depthFt: number;
}

interface ExtractedFloor {
  floorLabel: string;
  rooms: ExtractedRoom[];
}

interface ExtractedData {
  plotWidthFt: number;
  plotDepthFt: number;
  floors: ExtractedFloor[];
  facing: string;
  notes: string[];
}

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

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setErrorMsg('Please upload an image (JPG, PNG) or PDF file');
      setUploadStep('error');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('File size must be under 20MB');
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

      const response = await fetch('/api/analyze-drawing', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setExtracted(data.extracted);
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
        rooms: [...f.rooms, { name: 'New Room', type: 'bedroom', widthFt: 12, depthFt: 12 }],
      };
    });
    setExtracted(updated);
  };

  const handleProceed = () => {
    if (!extracted) return;

    const facing = (['North', 'South', 'East', 'West'].includes(extracted.facing)
      ? extracted.facing : 'North') as Facing;

    // Build ProjectRequirements from extracted data
    const floorPrograms: FloorProgram[] = extracted.floors.map((f) => {
      const bedrooms = f.rooms.filter(r => r.type === 'bedroom' || r.type === 'master_bedroom').length;
      const halls = f.rooms.filter(r => r.type === 'hall').length;
      const kitchens = f.rooms.filter(r => r.type === 'kitchen').length;
      const hasDining = f.rooms.some(r => r.type === 'dining');
      const hasPuja = f.rooms.some(r => r.type === 'puja');
      return {
        floorLabel: f.floorLabel,
        bedrooms: bedrooms || 1,
        halls: halls || 1,
        kitchens: kitchens || 1,
        hasDining,
        hasPuja,
      };
    });

    const requirements: ProjectRequirements = {
      city: 'Not specified',
      state: 'Not specified',
      plotWidthFt: extracted.plotWidthFt,
      plotDepthFt: extracted.plotDepthFt,
      facing,
      vastuCompliance: true,
      parkingType: extracted.floors[0]?.rooms.some(r => r.type === 'parking') ? 'Stilt' : 'None',
      budget: 'standard',
      architecturalStyle: 'modern_minimalist',
      floors: floorPrograms,
    };

    // Convert extracted rooms to Layout
    const FT_TO_M = 0.3048;
    const plotWidthM = extracted.plotWidthFt * FT_TO_M;
    const plotDepthM = extracted.plotDepthFt * FT_TO_M;
    const setbacks = { front: 1.5, rear: 1.0, left: 0.9, right: 0.9 };
    const buildableWidthM = plotWidthM - setbacks.left - setbacks.right;
    const buildableDepthM = plotDepthM - setbacks.front - setbacks.rear;

    const floorLayouts: FloorLayout[] = extracted.floors.map((f, floorIdx) => {
      let currentX = 0;
      let currentY = 0;
      let rowMaxDepth = 0;

      const rooms: Room[] = f.rooms.map((r, idx) => {
        const widthM = r.widthFt * FT_TO_M;
        const depthM = r.depthFt * FT_TO_M;

        // Simple left-to-right, top-to-bottom placement
        if (currentX + widthM > buildableWidthM) {
          currentX = 0;
          currentY += rowMaxDepth;
          rowMaxDepth = 0;
        }

        const room: Room = {
          id: `${floorIdx}-${idx}`,
          name: r.name,
          type: r.type as Room['type'],
          x: currentX,
          y: currentY,
          width: widthM,
          depth: depthM,
          floor: floorIdx,
        };

        currentX += widthM;
        if (depthM > rowMaxDepth) rowMaxDepth = depthM;

        return room;
      });

      // Generate columns
      const columns: Column[] = [];
      const colSpacingX = Math.min(buildableWidthM / 2, 4.0);
      const colSpacingY = Math.min(buildableDepthM / 2, 4.0);
      for (let cx = 0; cx <= buildableWidthM; cx += colSpacingX) {
        for (let cy = 0; cy <= buildableDepthM; cy += colSpacingY) {
          columns.push({ x: cx, y: cy, widthMM: 230, depthMM: 300 });
        }
      }

      return {
        floor: floorIdx,
        floorLabel: f.floorLabel,
        rooms,
        columns,
      };
    });

    const builtUpAreaSqM = buildableWidthM * buildableDepthM;

    const layout: Layout = {
      id: 'uploaded-plan',
      name: 'Uploaded Plan',
      strategy: 'User Uploaded Drawing',
      description: `Plan extracted from uploaded drawing — ${extracted.plotWidthFt}′×${extracted.plotDepthFt}′ plot`,
      floors: floorLayouts,
      vastuScore: 70,
      vastuDetails: [],
      nbcCompliant: true,
      nbcIssues: [],
      builtUpAreaSqM,
      builtUpAreaSqFt: builtUpAreaSqM * 10.764,
      setbacks,
      plotWidthM,
      plotDepthM,
      buildableWidthM,
      buildableDepthM,
    };

    onConversionComplete(layout, requirements);
  };

  const roomTypes = [
    'bedroom', 'master_bedroom', 'hall', 'kitchen', 'toilet', 'dining',
    'puja', 'staircase', 'parking', 'balcony', 'passage', 'entrance', 'store', 'utility',
  ];

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
              <p className="text-xs text-gray-400 mt-2">JPG, PNG, PDF — Max 20MB</p>
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
                      <p className="text-lg font-bold text-gray-900">{extracted.plotWidthFt * extracted.plotDepthFt} sq.ft</p>
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
                            {(room.widthFt * room.depthFt).toFixed(0)}
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
                className="flex-1 px-6 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
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
