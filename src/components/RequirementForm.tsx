'use client';

import React, { useState } from 'react';
import { ProjectRequirements, FloorProgram, Facing, ParkingType, BudgetRange, ArchitecturalStyle } from '../types';
import { MapPin, Ruler, Home, Compass, Car, Star, Plus, Minus, IndianRupee, Palette } from 'lucide-react';

interface Props {
  onSubmit: (req: ProjectRequirements) => void;
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
  { value: 'economy', label: '₹1200-1500/sqft', desc: 'Economy' },
  { value: 'standard', label: '₹1500-2000/sqft', desc: 'Standard' },
  { value: 'premium', label: '₹2000-2800/sqft', desc: 'Premium' },
  { value: 'luxury', label: '₹2800+/sqft', desc: 'Luxury' },
];

const STYLE_OPTIONS: { value: ArchitecturalStyle; label: string; emoji: string }[] = [
  { value: 'modern_minimalist', label: 'Modern Minimalist', emoji: '🏢' },
  { value: 'contemporary_indian', label: 'Contemporary Indian', emoji: '🏠' },
  { value: 'traditional', label: 'Traditional', emoji: '🛕' },
  { value: 'tropical', label: 'Tropical / Kerala', emoji: '🌴' },
  { value: 'industrial', label: 'Industrial', emoji: '🏗️' },
];

const defaultFloor = (label: string): FloorProgram => ({
  floorLabel: label,
  bedrooms: label === 'Ground Floor' ? 1 : 2,
  halls: 1,
  kitchens: 1,
  hasDining: true,
  hasPuja: false,
});

export const RequirementForm: React.FC<Props> = ({ onSubmit }) => {
  const [city, setCity] = useState('Bangalore');
  const [state, setState] = useState('Karnataka');
  const [plotW, setPlotW] = useState(30);
  const [plotD, setPlotD] = useState(40);
  const [facing, setFacing] = useState<Facing>('North');
  const [vastu, setVastu] = useState(true);
  const [parking, setParking] = useState<ParkingType>('Open');
  const [budget, setBudget] = useState<BudgetRange>('standard');
  const [style, setStyle] = useState<ArchitecturalStyle>('contemporary_indian');
  const [floors, setFloors] = useState<FloorProgram[]>([
    defaultFloor('Ground Floor'),
    defaultFloor('First Floor'),
  ]);

  const updateFloor = (idx: number, partial: Partial<FloorProgram>) => {
    setFloors((prev) => prev.map((f, i) => (i === idx ? { ...f, ...partial } : f)));
  };

  const addFloor = () => {
    if (floors.length >= 4) return;
    const labels = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
    setFloors((prev) => [...prev, defaultFloor(labels[prev.length] || `Floor ${prev.length}`)]);
  };

  const removeFloor = () => {
    if (floors.length <= 1) return;
    setFloors((prev) => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    onSubmit({
      city,
      state,
      plotWidthFt: plotW,
      plotDepthFt: plotD,
      facing,
      vastuCompliance: vastu,
      parkingType: parking,
      budget,
      architecturalStyle: style,
      floors,
    });
  };

  const plotAreaSqFt = plotW * plotD;
  const plotAreaSqM = plotAreaSqFt * 0.0929;

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
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
            <Ruler size={16} className="text-blue-600" /> Plot Dimensions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Width (ft)</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={plotW}
                onChange={(e) => setPlotW(Number(e.target.value))}
                min={15}
                max={200}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Depth (ft)</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={plotD}
                onChange={(e) => setPlotD(Number(e.target.value))}
                min={15}
                max={200}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Plot Area: <span className="font-medium text-gray-700">{plotAreaSqFt} sq.ft</span> ({plotAreaSqM.toFixed(1)} m²)
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

      {/* Preferences */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Star size={16} className="text-blue-600" /> Preferences
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Vastu Compliance</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={vastu}
              onChange={(e) => setVastu(e.target.checked)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">
              <Car size={12} className="inline mr-1" />
              Parking
            </label>
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
        </div>
      </section>

      {/* Budget */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <IndianRupee size={16} className="text-blue-600" /> Budget Range
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

      {/* Architectural Style */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Palette size={16} className="text-blue-600" /> Architectural Style
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s.value}
                className={`btn btn-sm justify-start gap-2 ${style === s.value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setStyle(s.value)}
              >
                <span>{s.emoji}</span>
                <span className="text-xs">{s.label}</span>
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
              <Home size={16} className="text-blue-600" /> Floor-wise Program
            </h3>
            <div className="flex gap-1">
              <button className="btn btn-ghost btn-xs" onClick={removeFloor} disabled={floors.length <= 1}>
                <Minus size={14} />
              </button>
              <span className="text-xs font-medium px-2 flex items-center">
                {floors.length} Floor{floors.length > 1 ? 's' : ''}
              </span>
              <button className="btn btn-ghost btn-xs" onClick={addFloor} disabled={floors.length >= 4}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          {floors.map((fp, idx) => (
            <div key={idx} className="bg-gray-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-blue-600">{fp.floorLabel}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block">Bedrooms</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.bedrooms}
                    onChange={(e) => updateFloor(idx, { bedrooms: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Hall/Living</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.halls}
                    onChange={(e) => updateFloor(idx, { halls: Number(e.target.value) })}
                  >
                    {[0, 1, 2].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block">Kitchen</label>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={fp.kitchens}
                    onChange={(e) => updateFloor(idx, { kitchens: Number(e.target.value) })}
                  >
                    {[0, 1, 2].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-xs"
                    checked={fp.hasDining}
                    onChange={(e) => updateFloor(idx, { hasDining: e.target.checked })}
                  />
                  Dining
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-xs"
                    checked={fp.hasPuja}
                    onChange={(e) => updateFloor(idx, { hasPuja: e.target.checked })}
                  />
                  Puja Room
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button className="btn btn-primary w-full" onClick={handleSubmit}>
        Generate Design Options →
      </button>
    </div>
  );
};
