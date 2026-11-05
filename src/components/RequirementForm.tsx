'use client';

import React, { useState } from 'react';
import { ProjectRequirements, FloorProgram, Facing, ParkingType, BudgetRange, ArchitecturalStyle } from '../types';
import { MapPin, Ruler, Home, Compass, Car, Star, IndianRupee, Palette } from 'lucide-react';
import { BUILDING_TYPES, DESIGN_STYLES, REGIONS, type BuildingType, type DesignStyleId, type Region } from '../utils/designStyles';

interface Props {
  onSubmit: (req: ProjectRequirements) => void;
  initialValues?: ProjectRequirements | null;
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
  { value: 'economy', label: '~₹1,600–2,000/sqft', desc: 'Economy' },
  { value: 'standard', label: '~₹1,900–2,500/sqft', desc: 'Standard' },
  { value: 'premium', label: '~₹2,500–3,400/sqft', desc: 'Premium' },
  { value: 'luxury', label: '₹3,400+/sqft', desc: 'Luxury' },
];

// legacy style list (older saved projects)
export const STYLE_OPTIONS: { value: ArchitecturalStyle; label: string; emoji: string }[] = [
  { value: 'modern_minimalist', label: 'Modern Minimalist', emoji: '🏢' },
  { value: 'contemporary_indian', label: 'Contemporary Indian', emoji: '🏠' },
  { value: 'traditional', label: 'Traditional', emoji: '🛕' },
  { value: 'tropical', label: 'Tropical / Kerala', emoji: '🌴' },
  { value: 'industrial', label: 'Industrial', emoji: '🏗️' },
];

const SETBACK_DEFAULTS = { front: 1.5, rear: 1.5, left: 1.0, right: 1.0 };
const MIN_W = 30, MIN_D = 40;

export const RequirementForm: React.FC<Props> = ({ onSubmit, initialValues }) => {
  const [plotW, setPlotW] = useState(initialValues?.plotWidthFt ?? 30);
  const [plotD, setPlotD] = useState(initialValues?.plotDepthFt ?? 40);
  const [facing, setFacing] = useState<Facing>(initialValues?.facing ?? 'East');
  const [city, setCity] = useState(initialValues?.city ?? 'Bangalore');
  const [state, setState] = useState(initialValues?.state ?? 'Karnataka');
  const [vastu, setVastu] = useState(initialValues?.vastuCompliance ?? true);
  const [budget, setBudget] = useState<BudgetRange>(initialValues?.budget ?? 'standard');
  const [style, setStyle] = useState<ArchitecturalStyle>(initialValues?.architecturalStyle ?? 'contemporary_indian');
  const [fsi, setFsi] = useState(initialValues?.fsi ?? 1.0);
  const [parking, setParking] = useState<ParkingType>(initialValues?.parkingType ?? 'Open');
  const initialBeds = initialValues?.bedroomsTotal ?? ((initialValues?.floors ?? []).reduce((s, f) => s + (f.bedrooms || 0), 0) || 2);
  const [bedrooms, setBedrooms] = useState<number>(Math.max(1, Math.min(4, initialBeds)));
  const [masterBath, setMasterBath] = useState<'attached' | 'separate'>(initialValues?.masterBath ?? 'attached');
  const [pooja, setPooja] = useState<boolean>(initialValues?.wantsPuja ?? true);
  const [study, setStudy] = useState<boolean>(initialValues?.wantsStudy ?? false);
  const [floorsPref, setFloorsPref] = useState<'auto' | 1 | 2>(initialValues?.floorsPreference ?? 'auto');
  const [buildingType, setBuildingType] = useState<BuildingType>(initialValues?.buildingType ?? 'independent');
  const [designStyle, setDesignStyle] = useState<DesignStyleId | ''>((initialValues?.designStyle as DesignStyleId) ?? '');
  const [region, setRegion] = useState<Region>(DESIGN_STYLES.find((d) => d.id === initialValues?.designStyle)?.region ?? 'india');
  const [setbacks, setSetbacks] = useState(initialValues?.setbacks ?? SETBACK_DEFAULTS);

  const plotTooSmall = plotW > 0 && plotD > 0 && (plotW < MIN_W || plotD < MIN_D || plotW * plotD < MIN_W * MIN_D);
  const fsiInvalid = !(fsi >= 0.5 && fsi <= 5);
  const setbacksInvalid = Object.values(setbacks).some((v) => !(v >= 0 && v <= 10));
  const plotInvalid = !(plotW > 0 && plotD > 0 && plotW <= 300 && plotD <= 300);
  const setbacksCustom = (Object.keys(SETBACK_DEFAULTS) as (keyof typeof SETBACK_DEFAULTS)[]).some((k) => Math.abs(setbacks[k] - SETBACK_DEFAULTS[k]) > 1e-9);

  const handleSubmit = () => {
    if (plotInvalid || fsiInvalid || setbacksInvalid || plotTooSmall) return;
    // Placeholder programme until a plan is chosen; the chosen plan then defines floors and rooms.
    const floors: FloorProgram[] = [{ floorLabel: 'Ground Floor', bedrooms, halls: 1, kitchens: 1, hasDining: true, hasPuja: pooja }];
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
      fsi,
      floors,
      bedroomsTotal: bedrooms,
      masterBath,
      wantsPuja: pooja,
      wantsStudy: study,
      floorsPreference: floorsPref,
      setbacks: setbacksCustom ? setbacks : undefined,
      buildingType: buildingType === 'independent' ? undefined : buildingType,
      designStyle: designStyle || undefined,
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
                value={plotW || ""}
                onChange={(e) => setPlotW(e.target.value === '' ? 0 : Number(e.target.value))}
                min={15}
                max={200}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Depth (ft)</label>
              <input
                type="number"
                className="input input-bordered input-sm w-full"
                value={plotD || ""}
                onChange={(e) => setPlotD(e.target.value === '' ? 0 : Number(e.target.value))}
                min={15}
                max={200}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Plot Area: <span className="font-medium text-gray-700">{plotAreaSqFt} sq.ft</span> ({plotAreaSqM.toFixed(1)} m²)
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">FSI (Floor Space Index)</label>
            <input
              type="number"
              className="input input-bordered input-sm w-full"
              value={fsi || ""}
              onChange={(e) => setFsi(e.target.value === '' ? 0 : Number(e.target.value))}
              min={0.5}
              max={5}
              step={0.1}
            />
            <div className="text-[10px] text-gray-400 mt-0.5">Assumed 1.0 — enter your local permitted FSI if known (0.5–5). Total buildable = plot area × FSI.</div>
            {fsiInvalid && <div className="text-[11px] text-red-600">FSI must be between 0.5 and 5.</div>}
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

      {/* Building type + exterior style */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Palette size={16} className="text-blue-600" /> Building Type &amp; Exterior Style
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {BUILDING_TYPES.map((t) => (
              <button key={t.id} className={`btn btn-sm h-auto py-2 flex-col items-start gap-0 normal-case ${buildingType === t.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setBuildingType(t.id); if (t.id === 'bungalow') setFloorsPref(1); else if (t.id === 'villa' || t.id === 'townhouse') setFloorsPref(2); }}>
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px] opacity-70 font-normal text-left">{t.blurb}</span>
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Exterior look — elevations, 3D model and photo render all follow it</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REGIONS.map((r) => (
                <button key={r.id} className={`btn btn-xs ${region === r.id ? 'btn-neutral' : 'btn-ghost border border-gray-300'}`} onClick={() => setRegion(r.id)}>{r.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DESIGN_STYLES.filter((d) => d.region === region).map((d) => (
                <button key={d.id} className={`btn btn-sm h-auto py-2 flex-col items-start gap-1 normal-case ${designStyle === d.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => { setDesignStyle(d.id); setStyle(d.id === 'in_kerala' ? 'tropical' : d.region === 'india' ? 'contemporary_indian' : 'modern_minimalist'); }}>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: d.walls.color }} />
                    <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: d.roof.color }} />
                    <span className="text-xs font-semibold">{d.label}</span>
                  </span>
                  <span className="text-[10px] opacity-70 font-normal text-left">{d.blurb}</span>
                </button>
              ))}
            </div>
            {region !== 'india' && <p className="text-[11px] text-gray-500 mt-2">Room sizes, structure, codes and costs are still worked out to Indian practice (₹). Local rules for this region are coming next.</p>}
          </div>
        </div>
      </section>

      {/* Home Brief */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Home size={16} className="text-blue-600" /> Your Home
          </h3>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Bedrooms (total, including master)</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={`btn btn-sm flex-1 ${bedrooms === n ? 'btn-primary' : 'btn-outline'}`} onClick={() => setBedrooms(n)}>
                  {n} BHK
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Master bedroom bathroom</label>
            <div className="flex gap-2">
              <button className={`btn btn-sm flex-1 ${masterBath === 'attached' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMasterBath('attached')}>Attached</button>
              <button className={`btn btn-sm flex-1 ${masterBath === 'separate' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMasterBath('separate')}>Separate (common)</button>
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-primary checkbox-xs" checked={pooja} onChange={(e) => setPooja(e.target.checked)} />
              Pooja
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-primary checkbox-xs" checked={study} onChange={(e) => setStudy(e.target.checked)} />
              Study / home office
            </label>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Floors</label>
            <div className="flex gap-2">
              {([['auto', 'Recommend for me'], [1, 'Single storey'], [2, 'G+1']] as const).map(([v, l]) => (
                <button key={String(v)} className={`btn btn-sm flex-1 ${floorsPref === v ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFloorsPref(v)}>
                  <span className="text-xs">{l}</span>
                </button>
              ))}
            </div>
            {buildingType === 'townhouse' && <div className="text-[10px] text-amber-700 mt-0.5">Townhouse: side walls are shared with the neighbours (no side setbacks).</div>}
            <div className="text-[10px] text-gray-400 mt-0.5">neevv plans the number of floors from your rooms and plot. If the brief does not fit, we explain why and suggest options — we never drop rooms without asking.</div>
          </div>
        </div>
      </section>

      {/* Setbacks */}
      <section className="card bg-gray-100">
        <div className="card-body p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Ruler size={16} className="text-blue-600" /> Setbacks (metres)
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {(['front', 'rear', 'left', 'right'] as const).map((k) => (
              <div key={k}>
                <label className="text-[10px] text-gray-600 block capitalize">{k}</label>
                <input
                  type="number"
                  className="input input-bordered input-xs w-full"
                  value={Number.isFinite(setbacks[k]) ? setbacks[k] : ''}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(e) => setSetbacks((p) => ({ ...p, [k]: e.target.value === '' ? NaN : Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-500">Assumed setback — confirm with applicable local building regulations.</div>
          {setbacksInvalid && <div className="text-[11px] text-red-600">Each setback must be between 0 and 10 m.</div>}
        </div>
      </section>

      {plotTooSmall && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Compact plot designs (below {MIN_W}×{MIN_D} ft) are coming soon. Meanwhile you can{' '}
          <a href="/interiors" className="underline font-medium">design your home interiors</a>,{' '}
          <a href="/room" className="underline font-medium">design a single room</a> or{' '}
          <a href="/upload" className="underline font-medium">upload your existing plan</a>.
        </div>
      )}

      <button className="btn btn-primary w-full" onClick={handleSubmit} disabled={plotTooSmall || plotInvalid || fsiInvalid || setbacksInvalid}>
        Generate Design Options →
      </button>
    </div>
  );
};
