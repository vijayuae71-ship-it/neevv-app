'use client';

import React, { useState } from 'react';
import { Facing, ParkingType, BudgetRange } from '../types';
import type { OfficeRequirements, OfficeFloorProgram, OfficeStyle } from '../types';
import { MapPin, Ruler, Building, Compass, Car, Plus, Minus, IndianRupee, Users, Palette } from 'lucide-react';

interface Props {
  onSubmit: (req: OfficeRequirements) => void;
  onBack: () => void;
  initialValues?: OfficeRequirements | null;
}

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan',
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const FACINGS: Facing[] = ['North', 'South', 'East', 'West'];
const PARKING_TYPES: ParkingType[] = ['None', 'Open', 'Stilt'];

const BUDGET_OPTIONS: { value: BudgetRange; label: string; desc: string }[] = [
  { value: 'economy', label: '₹1500-2000/sqft', desc: 'Economy' },
  { value: 'standard', label: '₹2000-3000/sqft', desc: 'Standard' },
  { value: 'premium', label: '₹3000-4500/sqft', desc: 'Premium' },
  { value: 'luxury', label: '₹4500+/sqft', desc: 'Luxury' },
];

const STYLE_OPTIONS: { value: OfficeStyle; label: string; emoji: string }[] = [
  { value: 'corporate', label: 'Corporate', emoji: '🏢' },
  { value: 'startup', label: 'Startup / Tech', emoji: '🚀' },
  { value: 'coworking', label: 'Co-working', emoji: '👥' },
  { value: 'minimal', label: 'Minimal', emoji: '⬜' },
  { value: 'biophilic', label: 'Biophilic', emoji: '🌿' },
];

const defaultOfficeFloor = (label: string): OfficeFloorProgram => ({
  floorLabel: label,
  workstations: 20,
  managerCabins: 2,
  directorCabins: 1,
  mdCabin: label === 'Ground Floor',
  conferenceSmall: 1,
  conferenceLarge: 0,
  boardRoom: label === 'Ground Floor',
  hasReception: label === 'Ground Floor',
  hasPantry: true,
  hasCafeteria: false,
  hasServerRoom: label === 'Ground Floor',
  hasBreakRoom: true,
});

export const OfficeRequirementForm: React.FC<Props> = ({ onSubmit, onBack, initialValues }) => {
  const [plotW, setPlotW] = useState(initialValues?.plotWidthFt ?? 40);
  const [plotD, setPlotD] = useState(initialValues?.plotDepthFt ?? 60);
  const [facing, setFacing] = useState<Facing>(initialValues?.facing ?? 'North');
  const [city, setCity] = useState(initialValues?.city ?? 'Bangalore');
  const [state, setState] = useState(initialValues?.state ?? 'Karnataka');
  const [budget, setBudget] = useState<BudgetRange>(initialValues?.budget ?? 'standard');
  const [officeStyle, setOfficeStyle] = useState<OfficeStyle>(initialValues?.officeStyle ?? 'corporate');
  const [parking, setParking] = useState<ParkingType>(initialValues?.parkingType ?? 'Open');
  const [companyName, setCompanyName] = useState(initialValues?.companyName ?? '');
  const [employeeCount, setEmployeeCount] = useState(initialValues?.employeeCount ?? 30);
  const [floors, setFloors] = useState<OfficeFloorProgram[]>(
    initialValues?.floors?.length ? initialValues.floors : [
      defaultOfficeFloor('Ground Floor'),
    ]
  );

  const updateFloor = (idx: number, partial: Partial<OfficeFloorProgram>) => {
    setFloors((prev) => prev.map((f, i) => (i === idx ? { ...f, ...partial } : f)));
  };

  const addFloor = () => {
    if (floors.length >= 2) return;
    const labels = ['Ground Floor', 'First Floor'];
    setFloors((prev) => [...prev, defaultOfficeFloor(labels[prev.length] || `Floor ${prev.length}`)]);
  };

  const removeFloor = () => {
    if (floors.length <= 1) return;
    setFloors((prev) => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    onSubmit({
      projectType: 'office',
      city,
      state,
      plotWidthFt: plotW,
      plotDepthFt: plotD,
      facing,
      budget,
      officeStyle,
      parkingType: parking,
      companyName: companyName || undefined,
      employeeCount,
      floors,
    });
  };

  const plotAreaSqFt = plotW * plotD;
  const plotAreaSqM = plotAreaSqFt * 0.0929;
  const sqftPerPerson = Math.round(plotAreaSqFt / employeeCount);

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      {/* Back button */}
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← Back to Home
      </button>

      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Building size={24} className="text-blue-600" /> Office Design Requirements
        </h2>
        <p className="text-sm text-gray-500 mt-1">Configure your workspace layout</p>
      </div>

      {/* Company Info */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Building size={16} className="text-blue-600" /> Company Details
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Company Name (optional)</label>
              <input
                className="input input-bordered input-sm w-full"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. TechCorp Pvt Ltd"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Total Employees</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(Number(e.target.value))}
                min={5}
                max={500}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <MapPin size={16} className="text-blue-600" /> Location
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">City</label>
              <input
                className="input input-bordered input-sm w-full"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Bangalore"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">State</label>
              <select
                className="select select-bordered select-sm w-full"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Plot */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Ruler size={16} className="text-blue-600" /> Plot / Floor Plate Dimensions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Width (ft)</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={plotW}
                onChange={(e) => setPlotW(Number(e.target.value))}
                min={20}
                max={300}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Depth (ft)</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={plotD}
                onChange={(e) => setPlotD(Number(e.target.value))}
                min={20}
                max={300}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500 space-y-0.5">
            <div>Plot Area: <span className="font-medium text-gray-700">{plotAreaSqFt.toLocaleString('en-IN')} sq.ft</span> ({plotAreaSqM.toFixed(1)} m²)</div>
            <div>Approx. <span className="font-medium text-gray-700">{sqftPerPerson} sq.ft/person</span> ({employeeCount} employees)
              {sqftPerPerson < 80 && <span className="text-amber-600 ml-1">⚠️ Below NBC recommended 9.3m²/person</span>}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Plot Facing</label>
            <div className="flex gap-2">
              {FACINGS.map((f) => (
                <button
                  key={f}
                  className={`btn btn-sm flex-1 ${facing === f ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setFacing(f)}
                >
                  <Compass size={14} /> {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Office Style */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Palette size={16} className="text-blue-600" /> Office Style
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s.value}
                className={`btn btn-sm justify-start gap-2 ${officeStyle === s.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setOfficeStyle(s.value)}
              >
                <span>{s.emoji}</span>
                <span className="text-xs">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Budget */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <IndianRupee size={16} className="text-blue-600" /> Fitout Budget Range
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_OPTIONS.map((b) => (
              <button
                key={b.value}
                className={`btn btn-sm justify-start gap-2 ${budget === b.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setBudget(b.value)}
              >
                <span className="text-xs">{b.desc}</span>
                <span className="text-xs opacity-70">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Parking */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Car size={16} className="text-blue-600" /> Parking
          </h3>
          <div className="flex gap-2">
            {PARKING_TYPES.map((p) => (
              <button
                key={p}
                className={`btn btn-sm flex-1 ${parking === p ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setParking(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Floor Program */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <Users size={16} className="text-blue-600" /> Floor-wise Space Program
            </h3>
            <div className="flex gap-1 items-center">
              <button className="btn btn-ghost btn-xs" onClick={removeFloor} disabled={floors.length <= 1}>
                <Minus size={14} />
              </button>
              <span className="text-xs font-medium px-2">
                {floors.length === 1 ? 'Single Floor' : `${floors.length} Floors`}
              </span>
              <button className="btn btn-ghost btn-xs" onClick={addFloor} disabled={floors.length >= 2} title={floors.length >= 2 ? 'More floors coming soon' : 'Add floor'}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          {floors.map((fp, idx) => (
            <div key={idx} className="bg-gray-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-blue-600">{fp.floorLabel}</div>

              {/* Workstations */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Open Workstations</label>
                <input
                  type="number"
                  className="input input-bordered input-xs w-24"
                  value={fp.workstations}
                  onChange={(e) => updateFloor(idx, { workstations: Number(e.target.value) })}
                  min={0}
                  max={200}
                />
              </div>

              {/* Cabins */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block">Manager Cabins</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.managerCabins}
                    onChange={(e) => updateFloor(idx, { managerCabins: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Director Cabins</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.directorCabins}
                    onChange={(e) => updateFloor(idx, { directorCabins: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Conference (Sm)</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.conferenceSmall}
                    onChange={(e) => updateFloor(idx, { conferenceSmall: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block">Conference (Lg)</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.conferenceLarge}
                    onChange={(e) => updateFloor(idx, { conferenceLarge: Number(e.target.value) })}
                  >
                    {[0, 1, 2].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amenities */}
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'mdCabin', label: 'MD Cabin' },
                  { key: 'boardRoom', label: 'Board Room' },
                  { key: 'hasReception', label: 'Reception' },
                  { key: 'hasPantry', label: 'Pantry' },
                  { key: 'hasCafeteria', label: 'Cafeteria' },
                  { key: 'hasServerRoom', label: 'Server Room' },
                  { key: 'hasBreakRoom', label: 'Break Room' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-xs"
                      checked={fp[key as keyof OfficeFloorProgram] as boolean}
                      onChange={(e) => updateFloor(idx, { [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <button className="btn btn-primary w-full" onClick={handleSubmit}>
        <Building size={18} /> Generate Office Layouts →
      </button>
    </div>
  );
};
