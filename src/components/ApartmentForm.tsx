'use client';

import React, { useState } from 'react';
import { Layout, ProjectRequirements, Room, FloorLayout, RoomType, Facing } from '../types';
import { Home, Plus, Trash2, ArrowLeft, ArrowRight, Ruler } from 'lucide-react';

interface Props {
  onSubmit: (layout: Layout, requirements: ProjectRequirements) => void;
  onBack: () => void;
}

interface RoomEntry {
  id: string;
  type: string;
  name: string;
  widthFt: number;
  depthFt: number;
}

const ROOM_TYPE_OPTIONS = [
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'master_bedroom', label: 'Master Bedroom' },
  { value: 'hall', label: 'Hall / Living' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'toilet', label: 'Toilet / Bathroom' },
  { value: 'dining', label: 'Dining' },
  { value: 'puja', label: 'Puja Room' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'entrance', label: 'Entrance' },
  { value: 'store', label: 'Store Room' },
  { value: 'utility', label: 'Utility' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Chandigarh', 'Puducherry',
];

const TEMPLATES: { name: string; label: string; rooms: Omit<RoomEntry, 'id'>[] }[] = [
  {
    name: '1bhk',
    label: '1 BHK',
    rooms: [
      { type: 'master_bedroom', name: 'Master Bedroom', widthFt: 12, depthFt: 14 },
      { type: 'hall', name: 'Hall', widthFt: 14, depthFt: 16 },
      { type: 'kitchen', name: 'Kitchen', widthFt: 8, depthFt: 10 },
      { type: 'toilet', name: 'Toilet', widthFt: 5, depthFt: 8 },
      { type: 'balcony', name: 'Balcony', widthFt: 10, depthFt: 4 },
    ],
  },
  {
    name: '2bhk',
    label: '2 BHK',
    rooms: [
      { type: 'master_bedroom', name: 'Master Bedroom', widthFt: 12, depthFt: 14 },
      { type: 'bedroom', name: 'Bedroom 1', widthFt: 10, depthFt: 12 },
      { type: 'hall', name: 'Hall', widthFt: 14, depthFt: 16 },
      { type: 'kitchen', name: 'Kitchen', widthFt: 8, depthFt: 10 },
      { type: 'toilet', name: 'Toilet 1', widthFt: 5, depthFt: 8 },
      { type: 'toilet', name: 'Toilet 2', widthFt: 5, depthFt: 8 },
      { type: 'dining', name: 'Dining', widthFt: 10, depthFt: 10 },
      { type: 'balcony', name: 'Balcony', widthFt: 10, depthFt: 4 },
    ],
  },
  {
    name: '3bhk',
    label: '3 BHK',
    rooms: [
      { type: 'master_bedroom', name: 'Master Bedroom', widthFt: 12, depthFt: 14 },
      { type: 'bedroom', name: 'Bedroom 1', widthFt: 10, depthFt: 12 },
      { type: 'bedroom', name: 'Bedroom 2', widthFt: 10, depthFt: 12 },
      { type: 'hall', name: 'Hall', widthFt: 16, depthFt: 18 },
      { type: 'kitchen', name: 'Kitchen', widthFt: 10, depthFt: 10 },
      { type: 'toilet', name: 'Toilet 1', widthFt: 5, depthFt: 8 },
      { type: 'toilet', name: 'Toilet 2', widthFt: 5, depthFt: 8 },
      { type: 'toilet', name: 'Toilet 3', widthFt: 5, depthFt: 8 },
      { type: 'dining', name: 'Dining', widthFt: 10, depthFt: 10 },
      { type: 'puja', name: 'Puja Room', widthFt: 5, depthFt: 5 },
      { type: 'balcony', name: 'Balcony', widthFt: 12, depthFt: 4 },
    ],
  },
];

let nextId = 1;
function genId() {
  return `re_${Date.now()}_${nextId++}`;
}

function defaultName(type: string, existing: RoomEntry[]): string {
  const label = ROOM_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
  const count = existing.filter(r => r.type === type).length;
  return count > 0 ? `${label} ${count + 1}` : label;
}

export default function ApartmentForm({ onSubmit, onBack }: Props) {
  const [projectName, setProjectName] = useState('My Apartment');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [roomEntries, setRoomEntries] = useState<RoomEntry[]>([]);
  const [newType, setNewType] = useState('bedroom');

  const totalAreaSqFt = roomEntries.reduce((sum, r) => sum + r.widthFt * r.depthFt, 0);

  function addRoom(type?: string) {
    const t = type ?? newType;
    const entry: RoomEntry = {
      id: genId(),
      type: t,
      name: defaultName(t, roomEntries),
      widthFt: 10,
      depthFt: 10,
    };
    setRoomEntries(prev => [...prev, entry]);
  }

  function removeRoom(id: string) {
    setRoomEntries(prev => prev.filter(r => r.id !== id));
  }

  function updateRoom(id: string, field: keyof RoomEntry, value: string | number) {
    setRoomEntries(prev =>
      prev.map(r => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  function applyTemplate(tpl: typeof TEMPLATES[number]) {
    setRoomEntries(tpl.rooms.map(r => ({ ...r, id: genId() })));
  }

  function handleSubmit() {
    if (roomEntries.length === 0) return;

    // Sort by area descending for placement
    const sorted = [...roomEntries].sort(
      (a, b) => b.widthFt * b.depthFt - a.widthFt * a.depthFt
    );

    // 2-column grid placement
    const colY = [0, 0]; // running Y for each column in meters
    const colX = [0, 0]; // X position for each column
    let maxColWidth = [0, 0];

    // First pass: determine column widths
    sorted.forEach((entry, idx) => {
      const col = idx % 2;
      const wM = entry.widthFt * 0.3048;
      if (wM > maxColWidth[col]) maxColWidth[col] = wM;
    });
    colX[1] = maxColWidth[0] + 0.3; // small gap

    const rooms: Room[] = sorted.map((entry, idx) => {
      const col = colY[0] <= colY[1] ? 0 : 1;
      const wM = entry.widthFt * 0.3048;
      const dM = entry.depthFt * 0.3048;
      const room: Room = {
        id: `r${idx}`,
        name: entry.name,
        type: entry.type as RoomType,
        x: colX[col],
        y: colY[col],
        width: wM,
        depth: dM,
        floor: 0,
      };
      colY[col] += dM + 0.15;
      if (wM > maxColWidth[col]) maxColWidth[col] = wM;
      return room;
    });

    const totalAreaSqM = roomEntries.reduce(
      (sum, r) => sum + r.widthFt * 0.3048 * r.depthFt * 0.3048,
      0
    );
    const maxRowWidth = colX[1] + maxColWidth[1];
    const totalDepth = Math.max(colY[0], colY[1]);

    const layout: Layout = {
      id: 'apt-1',
      name: projectName,
      strategy: 'apartment' as any,
      description: 'Existing apartment layout for interior design',
      floors: [
        {
          floor: 0,
          floorLabel: 'Main Floor',
          rooms: rooms,
          columns: [],
        },
      ],
      vastuScore: 0,
      vastuDetails: [],
      nbcCompliant: true,
      nbcIssues: [],
      builtUpAreaSqM: totalAreaSqM,
      builtUpAreaSqFt: totalAreaSqFt,
      setbacks: { front: 0, rear: 0, left: 0, right: 0 },
      plotWidthM: maxRowWidth,
      plotDepthM: totalDepth,
      buildableWidthM: maxRowWidth,
      buildableDepthM: totalDepth,
    };

    const requirements: ProjectRequirements = {
      city: city || 'Mumbai',
      state: state || 'Maharashtra',
      plotWidthFt: Math.round(maxRowWidth / 0.3048),
      plotDepthFt: Math.round(totalDepth / 0.3048),
      facing: 'North' as Facing,
      vastuCompliance: false,
      parkingType: 'None',
      floors: [
        {
          floorLabel: 'Main Floor',
          bedrooms: roomEntries.filter(
            r => r.type === 'bedroom' || r.type === 'master_bedroom'
          ).length,
          halls: roomEntries.filter(r => r.type === 'hall').length,
          kitchens: roomEntries.filter(r => r.type === 'kitchen').length,
          hasDining: roomEntries.some(r => r.type === 'dining'),
          hasPuja: roomEntries.some(r => r.type === 'puja'),
        },
      ],
    };

    onSubmit(layout, requirements);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <Home className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Apartment / Flat Interior</h1>
          </div>
        </div>

        {/* Project Info */}
        <div className="card bg-white shadow-md">
          <div className="card-body">
            <h2 className="card-title text-lg">Project Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Project Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="My Apartment"
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">State</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={state}
                  onChange={e => setState(e.target.value)}
                >
                  <option value="">Select State</option>
                  {INDIAN_STATES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">City</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Templates */}
        <div className="card bg-white shadow-md">
          <div className="card-body">
            <h2 className="card-title text-lg">Quick Start Templates</h2>
            <p className="text-sm opacity-70 -mt-1">
              Pick a template to pre-fill common room configurations
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              {TEMPLATES.map(tpl => {
                const area = tpl.rooms.reduce((s, r) => s + r.widthFt * r.depthFt, 0);
                return (
                  <button
                    key={tpl.name}
                    className="card card-bordered border-2 hover:border-primary hover:shadow-lg transition-all cursor-pointer bg-white"
                    onClick={() => applyTemplate(tpl)}
                  >
                    <div className="card-body p-4 items-center text-center">
                      <div className="text-2xl font-bold text-blue-600">{tpl.label}</div>
                      <div className="text-xs opacity-70">
                        {tpl.rooms.length} rooms · {area} sq.ft
                      </div>
                      <div className="flex flex-wrap justify-center gap-1 mt-1">
                        {tpl.rooms.map((r, i) => (
                          <span key={i} className="badge badge-sm badge-outline">
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Room List */}
        <div className="card bg-white shadow-md">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-lg">
                <Ruler className="w-5 h-5" />
                Rooms
                {roomEntries.length > 0 && (
                  <span className="badge badge-primary badge-sm ml-2">
                    {roomEntries.length}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <select
                  className="select select-bordered select-sm"
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                >
                  {ROOM_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm gap-1" onClick={() => addRoom()}>
                  <Plus className="w-4 h-4" />
                  Add Room
                </button>
              </div>
            </div>

            {roomEntries.length === 0 ? (
              <div className="text-center py-12 opacity-80">
                <Home className="w-12 h-12 mx-auto mb-3 opacity-80" />
                <p className="font-medium">No rooms added yet</p>
                <p className="text-sm">Use a template above or add rooms manually</p>
              </div>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="table table-sm w-full">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Width (ft)</th>
                      <th>Depth (ft)</th>
                      <th>Area (sq.ft)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomEntries.map((entry, idx) => (
                      <tr
                        key={entry.id}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      >
                        <td className="font-mono text-xs opacity-80">{idx + 1}</td>
                        <td>
                          <select
                            className="select select-bordered select-xs w-full max-w-[140px]"
                            value={entry.type}
                            onChange={e => updateRoom(entry.id, 'type', e.target.value)}
                          >
                            {ROOM_TYPE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="input input-bordered input-xs w-full max-w-[150px]"
                            value={entry.name}
                            onChange={e => updateRoom(entry.id, 'name', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input input-bordered input-xs w-20"
                            min={1}
                            max={100}
                            value={entry.widthFt}
                            onChange={e =>
                              updateRoom(entry.id, 'widthFt', Number(e.target.value) || 1)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input input-bordered input-xs w-20"
                            min={1}
                            max={100}
                            value={entry.depthFt}
                            onChange={e =>
                              updateRoom(entry.id, 'depthFt', Number(e.target.value) || 1)
                            }
                          />
                        </td>
                        <td>
                          <span className="font-medium">
                            {entry.widthFt * entry.depthFt}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs text-red-600"
                            onClick={() => removeRoom(entry.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total area */}
            {roomEntries.length > 0 && (
              <div className="flex justify-end mt-3">
                <div className="bg-blue-50 rounded-lg px-4 py-2 text-right">
                  <span className="text-sm opacity-70">Total Carpet Area: </span>
                  <span className="text-lg font-bold text-blue-600">
                    {totalAreaSqFt.toLocaleString()} sq.ft
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-between items-center">
          <button className="btn btn-ghost gap-2" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <button
            className="btn btn-primary btn-lg gap-2"
            disabled={roomEntries.length === 0}
            onClick={handleSubmit}
          >
            Proceed to Interior Design
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
