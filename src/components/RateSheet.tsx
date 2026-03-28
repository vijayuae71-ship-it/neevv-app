'use client';
import React, { useState, useEffect } from 'react';
import { MaterialRate, LabourRate, CustomRateSheet } from '../types';

/* ════════════════════════════════════════════════════════════════
   DEFAULT MATERIAL RATES — 2024-25 Indian market averages
   ════════════════════════════════════════════════════════════════ */

const DEFAULT_MATERIALS: MaterialRate[] = [
  // Cement & Concrete
  { id: 'cement_opc53', name: 'OPC 53-Grade Cement', unit: 'bag (50kg)', defaultRate: 380, category: 'cement_concrete', remark: 'UltraTech / ACC / Ambuja' },
  { id: 'cement_ppc', name: 'PPC Cement', unit: 'bag (50kg)', defaultRate: 360, category: 'cement_concrete', remark: 'Birla / Dalmia' },
  { id: 'rmc_m20', name: 'Ready Mix Concrete M20', unit: 'm³', defaultRate: 5500, category: 'cement_concrete' },
  { id: 'rmc_m25', name: 'Ready Mix Concrete M25', unit: 'm³', defaultRate: 6000, category: 'cement_concrete' },
  { id: 'pcc_148', name: 'PCC (1:4:8)', unit: 'm³', defaultRate: 5500, category: 'cement_concrete' },

  // Steel
  { id: 'steel_fe500d', name: 'TMT Steel Fe500D', unit: 'MT', defaultRate: 72000, category: 'steel', remark: 'Tata Tiscon / SAIL / JSW' },
  { id: 'binding_wire', name: 'Binding Wire (18 gauge)', unit: 'kg', defaultRate: 75, category: 'steel' },
  { id: 'ms_flat', name: 'MS Flat Bar', unit: 'kg', defaultRate: 65, category: 'steel' },
  { id: 'ms_angle', name: 'MS Angle Iron', unit: 'kg', defaultRate: 60, category: 'steel' },

  // Masonry
  { id: 'brick_class_a', name: 'Red Clay Brick (Class A)', unit: 'per 1000', defaultRate: 8000, category: 'masonry', remark: 'Machine-moulded, 230×110×75mm' },
  { id: 'aac_block', name: 'AAC Block (600×200×150mm)', unit: 'nos', defaultRate: 52, category: 'masonry', remark: 'Ultratech / Magicrete' },
  { id: 'fly_ash_brick', name: 'Fly Ash Brick', unit: 'per 1000', defaultRate: 5500, category: 'masonry' },

  // Sand & Aggregate
  { id: 'river_sand', name: 'River Sand (Fine)', unit: 'm³', defaultRate: 2800, category: 'sand_aggregate', remark: 'Zone II / III' },
  { id: 'm_sand', name: 'M-Sand (Manufactured)', unit: 'm³', defaultRate: 1800, category: 'sand_aggregate' },
  { id: 'aggregate_20mm', name: 'Coarse Aggregate (20mm)', unit: 'm³', defaultRate: 1600, category: 'sand_aggregate' },
  { id: 'aggregate_12mm', name: 'Coarse Aggregate (12mm)', unit: 'm³', defaultRate: 1800, category: 'sand_aggregate' },

  // Tiles & Flooring
  { id: 'vitrified_600', name: 'Vitrified Tile (600×600)', unit: 'm²', defaultRate: 55, category: 'tiles_flooring', remark: 'Double charge, Kajaria/Somany' },
  { id: 'antiskid_tile', name: 'Anti-Skid Tile (300×300)', unit: 'm²', defaultRate: 40, category: 'tiles_flooring', remark: 'Matt finish' },
  { id: 'wall_tile_ceramic', name: 'Ceramic Wall Tile (300×600)', unit: 'm²', defaultRate: 42, category: 'tiles_flooring' },
  { id: 'granite_slab', name: 'Granite Slab (Polished)', unit: 'Rmt', defaultRate: 2800, category: 'tiles_flooring', remark: '20mm thick' },
  { id: 'granite_tread', name: 'Granite Stair Tread', unit: 'nos', defaultRate: 1200, category: 'tiles_flooring', remark: '250×1000mm polished' },
  { id: 'kota_stone', name: 'Kota Stone', unit: 'm²', defaultRate: 60, category: 'tiles_flooring' },

  // Paint & Finish
  { id: 'wall_putty', name: 'Wall Putty (Birla/JK)', unit: 'bag (40kg)', defaultRate: 750, category: 'paint_finish' },
  { id: 'primer', name: 'Primer (Asian/Berger)', unit: 'litre', defaultRate: 180, category: 'paint_finish' },
  { id: 'interior_emulsion', name: 'Interior Emulsion (Premium)', unit: 'litre', defaultRate: 380, category: 'paint_finish', remark: 'Asian Royale / Berger Silk' },
  { id: 'exterior_emulsion', name: 'Exterior Emulsion', unit: 'litre', defaultRate: 400, category: 'paint_finish', remark: 'Apex Ultima / WeatherCoat' },
  { id: 'enamel_paint', name: 'Enamel Paint (for grills/doors)', unit: 'litre', defaultRate: 350, category: 'paint_finish' },

  // Plumbing Fixtures
  { id: 'cpvc_pipe', name: 'CPVC Pipe (½")', unit: 'Rmt', defaultRate: 55, category: 'plumbing_fixtures', remark: 'Astral/Supreme' },
  { id: 'swr_pipe_110', name: 'SWR Pipe (110mm)', unit: 'Rmt', defaultRate: 120, category: 'plumbing_fixtures' },
  { id: 'ewc', name: 'EWC (Floor/Wall Mounted)', unit: 'nos', defaultRate: 8000, category: 'plumbing_fixtures', remark: 'Hindware/Parryware' },
  { id: 'wash_basin', name: 'Wash Basin (Counter Top)', unit: 'nos', defaultRate: 4500, category: 'plumbing_fixtures' },
  { id: 'shower_mixer', name: 'Shower Mixer + Rain Shower', unit: 'nos', defaultRate: 5500, category: 'plumbing_fixtures' },
  { id: 'kitchen_sink', name: 'SS Double-Bowl Kitchen Sink', unit: 'nos', defaultRate: 6500, category: 'plumbing_fixtures' },
  { id: 'cp_fittings', name: 'CP Fittings (Taps, Bib-cock)', unit: 'nos', defaultRate: 1800, category: 'plumbing_fixtures', remark: 'Jaquar / Grohe equiv.' },
  { id: 'solar_heater', name: 'Solar Water Heater (100 LPD)', unit: 'nos', defaultRate: 22000, category: 'plumbing_fixtures' },
  { id: 'oh_tank', name: 'Overhead Water Tank (1000L)', unit: 'nos', defaultRate: 12000, category: 'plumbing_fixtures', remark: 'Sintex/Supreme' },

  // Electrical
  { id: 'wire_1_5mm', name: 'Copper Wire 1.5 sq mm (Finolex)', unit: 'coil (90m)', defaultRate: 2200, category: 'electrical' },
  { id: 'wire_2_5mm', name: 'Copper Wire 2.5 sq mm (Finolex)', unit: 'coil (90m)', defaultRate: 3500, category: 'electrical' },
  { id: 'pvc_conduit', name: 'PVC Conduit Pipe (25mm)', unit: 'Rmt', defaultRate: 18, category: 'electrical' },
  { id: 'modular_switch', name: 'Modular Switch (Anchor Roma)', unit: 'nos', defaultRate: 80, category: 'electrical' },
  { id: 'led_downlight', name: 'LED Downlight (15W)', unit: 'nos', defaultRate: 350, category: 'electrical', remark: 'Philips / Syska' },
  { id: 'ceiling_fan', name: 'Ceiling Fan', unit: 'nos', defaultRate: 2200, category: 'electrical', remark: 'Crompton / Havells' },
  { id: 'mcb_db', name: 'MCB Distribution Board', unit: 'nos', defaultRate: 8000, category: 'electrical', remark: 'Havells / Schneider' },
  { id: 'rccb', name: 'RCCB (63A/30mA)', unit: 'nos', defaultRate: 3500, category: 'electrical' },

  // Doors & Windows
  { id: 'teak_door', name: 'Teak Panel Door (Main)', unit: 'nos', defaultRate: 18000, category: 'doors_windows' },
  { id: 'flush_door', name: 'Flush Door (BWR Plywood)', unit: 'nos', defaultRate: 8000, category: 'doors_windows' },
  { id: 'frp_door', name: 'FRP/PVC Door (Toilet)', unit: 'nos', defaultRate: 3500, category: 'doors_windows' },
  { id: 'upvc_sliding', name: 'UPVC Sliding Door/Window', unit: 'nos', defaultRate: 15000, category: 'doors_windows' },
  { id: 'upvc_window_std', name: 'UPVC Window (1200×1200)', unit: 'nos', defaultRate: 8000, category: 'doors_windows' },
  { id: 'ventilator', name: 'Ventilator (600×450)', unit: 'nos', defaultRate: 2500, category: 'doors_windows' },
  { id: 'door_lock', name: 'Mortise Lock (Godrej/Ozone)', unit: 'nos', defaultRate: 2500, category: 'doors_windows' },
  { id: 'ms_grill', name: 'MS Window Grill', unit: 'nos', defaultRate: 3500, category: 'doors_windows' },

  // Waterproofing
  { id: 'wp_app_membrane', name: 'APP Membrane', unit: 'm²', defaultRate: 95, category: 'waterproofing' },
  { id: 'wp_liquid', name: 'Liquid Waterproofing (Dr.Fixit)', unit: 'm²', defaultRate: 75, category: 'waterproofing' },
  { id: 'wp_terrace', name: 'Terrace WP (Sika + Brick Bat Coba)', unit: 'm²', defaultRate: 85, category: 'waterproofing' },

  // Miscellaneous
  { id: 'scaffolding', name: 'Steel Shuttering (Rental)', unit: 'm²', defaultRate: 65, category: 'misc' },
  { id: 'ms_gate', name: 'MS Main Gate (5ft)', unit: 'nos', defaultRate: 35000, category: 'misc' },
  { id: 'ms_railing', name: 'MS Staircase Railing', unit: 'Rmt', defaultRate: 1800, category: 'misc' },
  { id: 'compound_wall', name: 'Compound Wall (Brick, 1.5m)', unit: 'Rmt', defaultRate: 2800, category: 'misc' },
  { id: 'paver_block', name: 'Interlocking Paver Block', unit: 'm²', defaultRate: 90, category: 'misc' },
];

/* ════════════════════════════════════════════════════════════════
   DEFAULT LABOUR RATES — 2024-25 Indian averages
   ════════════════════════════════════════════════════════════════ */

const DEFAULT_LABOUR: LabourRate[] = [
  // Skilled
  { id: 'mason', trade: 'Mason (Bricklayer)', unit: 'per day', defaultRate: 900, category: 'skilled', remark: 'Brick/block laying, plastering' },
  { id: 'carpenter', trade: 'Carpenter', unit: 'per day', defaultRate: 850, category: 'skilled', remark: 'Shuttering, door fitting' },
  { id: 'bar_bender', trade: 'Bar Bender / Steel Fixer', unit: 'per day', defaultRate: 800, category: 'skilled', remark: 'Rebar cutting, bending, tying' },
  { id: 'plumber', trade: 'Plumber', unit: 'per day', defaultRate: 800, category: 'skilled' },
  { id: 'electrician', trade: 'Electrician', unit: 'per day', defaultRate: 800, category: 'skilled' },
  { id: 'tile_mason', trade: 'Tile Mason', unit: 'per day', defaultRate: 900, category: 'skilled', remark: 'Floor & wall tiling' },
  { id: 'painter', trade: 'Painter', unit: 'per day', defaultRate: 700, category: 'skilled' },
  { id: 'welder', trade: 'Welder / Fabricator', unit: 'per day', defaultRate: 850, category: 'skilled', remark: 'MS gates, grills, railings' },
  { id: 'aluminium_fitter', trade: 'Aluminium / UPVC Fitter', unit: 'per day', defaultRate: 800, category: 'skilled' },

  // Semi-Skilled
  { id: 'helper_mason', trade: 'Mason Helper', unit: 'per day', defaultRate: 550, category: 'semi_skilled' },
  { id: 'helper_general', trade: 'General Helper', unit: 'per day', defaultRate: 500, category: 'semi_skilled' },
  { id: 'shuttering_helper', trade: 'Shuttering Helper', unit: 'per day', defaultRate: 550, category: 'semi_skilled' },
  { id: 'mixer_operator', trade: 'Concrete Mixer Operator', unit: 'per day', defaultRate: 600, category: 'semi_skilled' },

  // Unskilled
  { id: 'labour', trade: 'Unskilled Labour', unit: 'per day', defaultRate: 450, category: 'unskilled', remark: 'Earthwork, cleaning, carrying' },
  { id: 'watchman', trade: 'Site Watchman', unit: 'per month', defaultRate: 12000, category: 'unskilled' },

  // Specialist
  { id: 'surveyor', trade: 'Surveyor / Setting Out', unit: 'per visit', defaultRate: 5000, category: 'specialist' },
  { id: 'wp_applicator', trade: 'Waterproofing Applicator', unit: 'per m²', defaultRate: 25, category: 'specialist' },
  { id: 'termite_operator', trade: 'Anti-Termite Operator', unit: 'per m²', defaultRate: 12, category: 'specialist' },
  { id: 'crane_operator', trade: 'Crane/JCB Operator', unit: 'per day', defaultRate: 3500, category: 'specialist', remark: 'Incl. fuel' },
  { id: 'rcc_consultant', trade: 'Structural Consultant', unit: 'per visit', defaultRate: 8000, category: 'specialist' },
];

/* ════════════════════════════════════════════════════════════════
   CATEGORY LABELS
   ════════════════════════════════════════════════════════════════ */

const MATERIAL_CATEGORIES: Record<MaterialRate['category'], string> = {
  cement_concrete: '🏗️ Cement & Concrete',
  steel: '🔩 Steel & Reinforcement',
  masonry: '🧱 Masonry / Bricks / Blocks',
  sand_aggregate: '⛰️ Sand & Aggregate',
  tiles_flooring: '🪨 Tiles & Flooring',
  paint_finish: '🎨 Paint & Finish',
  plumbing_fixtures: '🚿 Plumbing & Fixtures',
  electrical: '💡 Electrical',
  doors_windows: '🚪 Doors & Windows',
  waterproofing: '💧 Waterproofing',
  misc: '📦 Miscellaneous',
};

const LABOUR_CATEGORIES: Record<LabourRate['category'], string> = {
  skilled: '👷 Skilled Trades',
  semi_skilled: '🔧 Semi-Skilled',
  unskilled: '🏋️ Unskilled Labour',
  specialist: '🎯 Specialist',
};

/* ════════════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════════════ */

interface Props {
  onSave: (rateSheet: CustomRateSheet) => void;
  onSkip: () => void;
  initialRateSheet?: CustomRateSheet;
}

export const RateSheet: React.FC<Props> = ({ onSave, onSkip, initialRateSheet }) => {
  const [activeTab, setActiveTab] = useState<'material' | 'labour'>('material');
  const [materials, setMaterials] = useState<MaterialRate[]>(() => {
    if (initialRateSheet?.materials?.length) return initialRateSheet.materials;
    return DEFAULT_MATERIALS.map(m => ({ ...m }));
  });
  const [labour, setLabour] = useState<LabourRate[]>(() => {
    if (initialRateSheet?.labour?.length) return initialRateSheet.labour;
    return DEFAULT_LABOUR.map(l => ({ ...l }));
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [editedCount, setEditedCount] = useState(0);

  useEffect(() => {
    const mEdited = materials.filter(m => m.customRate !== undefined && m.customRate !== m.defaultRate).length;
    const lEdited = labour.filter(l => l.customRate !== undefined && l.customRate !== l.defaultRate).length;
    setEditedCount(mEdited + lEdited);
  }, [materials, labour]);

  const handleMaterialRateChange = (id: string, value: string) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m;
      const num = parseFloat(value);
      return { ...m, customRate: isNaN(num) ? undefined : num };
    }));
  };

  const handleLabourRateChange = (id: string, value: string) => {
    setLabour(prev => prev.map(l => {
      if (l.id !== id) return l;
      const num = parseFloat(value);
      return { ...l, customRate: isNaN(num) ? undefined : num };
    }));
  };

  const resetAll = () => {
    setMaterials(DEFAULT_MATERIALS.map(m => ({ ...m })));
    setLabour(DEFAULT_LABOUR.map(l => ({ ...l })));
  };

  const handleSave = () => {
    onSave({
      materials,
      labour,
      lastUpdated: new Date().toISOString(),
    });
  };

  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLabour = labour.filter(l =>
    l.trade.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group by category
  const groupedMaterials: Record<string, MaterialRate[]> = {};
  filteredMaterials.forEach(m => {
    if (!groupedMaterials[m.category]) groupedMaterials[m.category] = [];
    groupedMaterials[m.category].push(m);
  });

  const groupedLabour: Record<string, LabourRate[]> = {};
  filteredLabour.forEach(l => {
    if (!groupedLabour[l.category]) groupedLabour[l.category] = [];
    groupedLabour[l.category].push(l);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">📋 Rate Sheet — Material & Labour</h2>
            <p className="text-sm text-gray-500 mt-1">
              Customize rates to match your local market. Leave blank to use defaults (2024-25 averages).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editedCount > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {editedCount} custom rate{editedCount > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={resetAll} className="btn btn-sm border-gray-300 text-gray-600 bg-white hover:bg-gray-50">
              ↺ Reset All
            </button>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('material')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'material' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🧱 Materials ({materials.length})
          </button>
          <button
            onClick={() => setActiveTab('labour')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'labour' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👷 Labour ({labour.length})
          </button>
        </div>
        <input
          type="text"
          placeholder={`Search ${activeTab === 'material' ? 'materials' : 'labour'}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input input-bordered input-sm w-full sm:w-64 bg-white text-gray-900 border-gray-300"
        />
      </div>

      {/* Material Tab */}
      {activeTab === 'material' && (
        <div className="space-y-4">
          {Object.entries(groupedMaterials).map(([cat, items]) => (
            <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  {MATERIAL_CATEGORIES[cat as MaterialRate['category']] || cat}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Material</th>
                      <th className="text-left px-4 py-2 font-medium">Unit</th>
                      <th className="text-right px-4 py-2 font-medium">Default (₹)</th>
                      <th className="text-right px-4 py-2 font-medium w-36">Your Rate (₹)</th>
                      <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => {
                      const isEdited = m.customRate !== undefined && m.customRate !== m.defaultRate;
                      return (
                        <tr key={m.id} className={`border-t border-gray-100 ${isEdited ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 text-gray-900 font-medium">{m.name}</td>
                          <td className="px-4 py-2.5 text-gray-500">{m.unit}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-right tabular-nums">₹{m.defaultRate.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              placeholder={m.defaultRate.toString()}
                              value={m.customRate ?? ''}
                              onChange={(e) => handleMaterialRateChange(m.id, e.target.value)}
                              className={`input input-bordered input-sm w-28 text-right tabular-nums bg-white text-gray-900 border-gray-300 ${isEdited ? 'border-blue-400 ring-1 ring-blue-200' : ''}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{m.remark || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {Object.keys(groupedMaterials).length === 0 && (
            <p className="text-center text-gray-400 py-8">No materials match your search.</p>
          )}
        </div>
      )}

      {/* Labour Tab */}
      {activeTab === 'labour' && (
        <div className="space-y-4">
          {Object.entries(groupedLabour).map(([cat, items]) => (
            <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  {LABOUR_CATEGORIES[cat as LabourRate['category']] || cat}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Trade</th>
                      <th className="text-left px-4 py-2 font-medium">Unit</th>
                      <th className="text-right px-4 py-2 font-medium">Default (₹)</th>
                      <th className="text-right px-4 py-2 font-medium w-36">Your Rate (₹)</th>
                      <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => {
                      const isEdited = l.customRate !== undefined && l.customRate !== l.defaultRate;
                      return (
                        <tr key={l.id} className={`border-t border-gray-100 ${isEdited ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 text-gray-900 font-medium">{l.trade}</td>
                          <td className="px-4 py-2.5 text-gray-500">{l.unit}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-right tabular-nums">₹{l.defaultRate.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              placeholder={l.defaultRate.toString()}
                              value={l.customRate ?? ''}
                              onChange={(e) => handleLabourRateChange(l.id, e.target.value)}
                              className={`input input-bordered input-sm w-28 text-right tabular-nums bg-white text-gray-900 border-gray-300 ${isEdited ? 'border-blue-400 ring-1 ring-blue-200' : ''}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{l.remark || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {Object.keys(groupedLabour).length === 0 && (
            <p className="text-center text-gray-400 py-8">No labour trades match your search.</p>
          )}
        </div>
      )}

      {/* Bottom Actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-b-xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        <p className="text-xs text-gray-400">
          {editedCount > 0
            ? `${editedCount} custom rate${editedCount > 1 ? 's' : ''} will be applied to BOQ`
            : 'Using default 2024-25 market rates. Customize any rate above.'}
        </p>
        <div className="flex gap-2">
          <button onClick={onSkip} className="btn btn-sm border-gray-300 text-gray-600 bg-white hover:bg-gray-50">
            Skip — Use Defaults →
          </button>
          <button onClick={handleSave} className="btn btn-sm bg-blue-600 text-white hover:bg-blue-700 border-0">
            ✓ Save Rates & Proceed to BOQ
          </button>
        </div>
      </div>
    </div>
  );
};
