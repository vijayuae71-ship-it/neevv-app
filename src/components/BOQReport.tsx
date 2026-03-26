import React, { useState } from 'react';
import { BOQ, BOQLineItem, Layout } from '../types';
import { Package, Zap, Droplets, Building2, Ruler, Layers, DoorOpen, PieChart, IndianRupee } from 'lucide-react';
import BrandWatermark from './BrandWatermark';

interface Props {
  boq: BOQ;
  layout: Layout;
}

type BOQTab = 'summary' | 'itemized' | 'doors_windows' | 'concrete' | 'cost';

const CAT_LABELS: Record<string, string> = {
  structural: 'Structural Works',
  masonry: 'Masonry & Plastering',
  finishing: 'Finishing Works',
  mep: 'MEP (Plumbing + Electrical)',
  doors_windows: 'Doors & Windows',
  misc: 'Miscellaneous',
};

const formatINR = (n: number) => '₹' + n.toLocaleString('en-IN');

export const BOQReport: React.FC<Props> = ({ boq, layout }) => {
  const [tab, setTab] = useState<BOQTab>('summary');

  const tabs: { id: BOQTab; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: 'Summary', icon: <PieChart size={12} /> },
    { id: 'itemized', label: 'Itemized BOQ', icon: <Layers size={12} /> },
    { id: 'concrete', label: 'Concrete', icon: <Building2 size={12} /> },
    { id: 'doors_windows', label: 'D&W Schedule', icon: <DoorOpen size={12} /> },
    { id: 'cost', label: 'Cost Estimate', icon: <IndianRupee size={12} /> },
  ];

  // Group line items by category
  const grouped: Record<string, BOQLineItem[]> = {};
  boq.lineItems.forEach(li => {
    if (!grouped[li.category]) grouped[li.category] = [];
    grouped[li.category].push(li);
  });

  return (
    <div className="flex flex-col h-full bg-base-100 relative">
      <BrandWatermark position="top-left" />
      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 bg-base-200 border-b border-base-300 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-base-content/60 mr-2">
          <Package size={12} className="inline mr-1" />BILL OF QUANTITIES
        </span>
        {tabs.map(t => (
          <button key={t.id} className={`btn btn-xs ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.id)}>
            {t.icon}<span className="ml-1">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-xs text-base-content/50 font-mono">
            {layout.name} • {boq.numFloors} floor(s) • {boq.totalBuiltUpAreaSqFt.toLocaleString()} sqft total built-up • Rates: 2024-25 market average
          </div>

          {/* ─── SUMMARY TAB ─── */}
          {tab === 'summary' && (
            <>
              {/* Area */}
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Ruler size={14} className="text-primary" /> Area Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox label="Built-up / Floor" value={`${layout.builtUpAreaSqFt}`} unit="sqft" />
                    <StatBox label="Total Built-up" value={`${boq.totalBuiltUpAreaSqFt.toLocaleString()}`} unit="sqft" />
                    <StatBox label="Total Built-up" value={`${boq.totalBuiltUpAreaSqM}`} unit="m²" />
                  </div>
                </div>
              </div>

              {/* Key Quantities */}
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 size={14} className="text-primary" /> Key Quantities
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="table table-zebra table-sm">
                      <thead><tr><th>Item</th><th className="text-right">Qty</th><th>Unit</th></tr></thead>
                      <tbody>
                        <tr><td>Concrete (M20)</td><td className="text-right font-mono">{boq.concreteVolumeM3}</td><td>m³</td></tr>
                        <tr><td>Steel (Fe500D)</td><td className="text-right font-mono">{boq.steelWeightMT}</td><td>MT</td></tr>
                        <tr><td>Bricks/Blocks</td><td className="text-right font-mono">{boq.brickCount.toLocaleString()}</td><td>nos</td></tr>
                        <tr><td>Cement (OPC 53)</td><td className="text-right font-mono">{boq.cementBags.toLocaleString()}</td><td>bags</td></tr>
                        <tr><td>Sand</td><td className="text-right font-mono">{boq.sandCuM}</td><td>m³</td></tr>
                        <tr><td>Aggregate (20mm)</td><td className="text-right font-mono">{boq.aggregateCuM}</td><td>m³</td></tr>
                        <tr><td>Waterproofing</td><td className="text-right font-mono">{boq.waterproofingAreaSqM}</td><td>m²</td></tr>
                        <tr><td>Plastering</td><td className="text-right font-mono">{boq.plasteringAreaSqM}</td><td>m²</td></tr>
                        <tr><td>Painting</td><td className="text-right font-mono">{boq.paintAreaSqM.toLocaleString()}</td><td>m²</td></tr>
                        <tr><td>Flooring</td><td className="text-right font-mono">{boq.flooringAreaSqM.toLocaleString()}</td><td>m²</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* MEP */}
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Zap size={14} className="text-primary" /> MEP
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 bg-base-300 rounded-lg p-2">
                      <Droplets size={14} className="text-info" />
                      <div><div className="text-xs text-base-content/50">Plumbing Points</div><div className="text-sm font-bold">{boq.plumbingPoints}</div></div>
                    </div>
                    <div className="flex items-center gap-2 bg-base-300 rounded-lg p-2">
                      <Zap size={14} className="text-warning" />
                      <div><div className="text-xs text-base-content/50">Electrical Points</div><div className="text-sm font-bold">{boq.electricalPoints}</div></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost snapshot */}
              <div className="card bg-primary text-primary-content">
                <div className="card-body p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs opacity-70">Estimated Construction Cost</div>
                      <div className="text-2xl font-bold">{formatINR(boq.totalCost)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs opacity-70">Cost per Sqft</div>
                      <div className="text-lg font-bold">{formatINR(boq.costPerSqFt)}/sqft</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── ITEMIZED BOQ ─── */}
          {tab === 'itemized' && (
            <>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="card bg-base-200">
                  <div className="card-body p-3 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">{CAT_LABELS[cat] || cat}</h3>
                    <div className="overflow-x-auto">
                      <table className="table table-xs">
                        <thead>
                          <tr className="text-[10px]">
                            <th>S.No</th><th>Description</th><th className="text-right">Qty</th><th>Unit</th>
                            <th className="text-right">Rate (₹)</th><th className="text-right">Amount (₹)</th><th>Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(li => (
                            <tr key={li.sno}>
                              <td className="font-mono text-[10px]">{li.sno}</td>
                              <td className="text-xs">{li.description}</td>
                              <td className="text-right font-mono text-xs">{li.quantity.toLocaleString()}</td>
                              <td className="text-xs">{li.unit}</td>
                              <td className="text-right font-mono text-xs">{li.rate.toLocaleString()}</td>
                              <td className="text-right font-mono text-xs font-semibold">{li.amount.toLocaleString()}</td>
                              <td className="text-[10px] text-base-content/50">{li.remark || '—'}</td>
                            </tr>
                          ))}
                          <tr className="font-bold bg-base-300">
                            <td colSpan={5} className="text-right text-xs">Sub-Total</td>
                            <td className="text-right font-mono text-xs">{formatINR(items.reduce((s, li) => s + li.amount, 0))}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}

              {/* Grand total */}
              <div className="card bg-primary text-primary-content">
                <div className="card-body p-3 flex-row justify-between items-center">
                  <span className="font-bold">GRAND TOTAL</span>
                  <span className="text-xl font-bold">{formatINR(boq.totalCost)}</span>
                </div>
              </div>
            </>
          )}

          {/* ─── CONCRETE BREAKDOWN ─── */}
          {tab === 'concrete' && (
            <div className="card bg-base-200">
              <div className="card-body p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Building2 size={14} className="text-primary" /> Concrete Volume Breakdown (M20 Grade)
                </h3>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead><tr><th>Element</th><th className="text-right">Volume (m³)</th><th className="text-right">% of Total</th></tr></thead>
                    <tbody>
                      {Object.entries(boq.concreteBreakdown).map(([key, val]) => {
                        const v = val as number;
                        return (
                          <tr key={key}>
                            <td className="capitalize">{key}</td>
                            <td className="text-right font-mono">{v}</td>
                            <td className="text-right font-mono">{(v / boq.concreteVolumeM3 * 100).toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold bg-base-300">
                        <td>Total</td>
                        <td className="text-right font-mono">{boq.concreteVolumeM3}</td>
                        <td className="text-right font-mono">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Visual bar */}
                <div className="space-y-1">
                  {Object.entries(boq.concreteBreakdown).map(([key, rawVal]) => {
                    const val = rawVal as number;
                    const pct = val / boq.concreteVolumeM3 * 100;
                    const colors: Record<string, string> = {
                      foundation: 'bg-amber-500', columns: 'bg-blue-500', beams: 'bg-green-500',
                      slabs: 'bg-purple-500', staircase: 'bg-red-400', lintels: 'bg-orange-400',
                    };
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-20 capitalize text-base-content/60">{key}</span>
                        <div className="flex-1 bg-base-300 rounded-full h-3">
                          <div className={`h-3 rounded-full ${colors[key] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-14 text-right font-mono">{val} m³</span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-base-content/50 font-mono mt-2">
                  Steel requirement: {boq.steelWeightMT} MT @ 4.5 kg/sqft • Ready-mix truck loads (6m³): {Math.ceil(boq.concreteVolumeM3 / 6)}
                </div>
              </div>
            </div>
          )}

          {/* ─── DOOR & WINDOW SCHEDULE ─── */}
          {tab === 'doors_windows' && (
            <>
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <DoorOpen size={14} className="text-primary" /> Door Schedule
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="table table-xs">
                      <thead>
                        <tr className="text-[10px]">
                          <th>Mark</th><th>Location</th><th>Type</th><th>Size (mm)</th><th>Material</th><th className="text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boq.doorSchedule.map(d => (
                          <tr key={d.mark}>
                            <td className="font-mono font-bold">{d.mark}</td>
                            <td className="text-xs">{d.location}</td>
                            <td className="text-xs">{d.type}</td>
                            <td className="font-mono text-xs">{d.widthMM} × {d.heightMM}</td>
                            <td className="text-xs">{d.material}</td>
                            <td className="text-right font-mono">{d.qty}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-base-300">
                          <td colSpan={5}>Total Doors</td>
                          <td className="text-right font-mono">{boq.doorSchedule.reduce((s, d) => s + d.qty, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Ruler size={14} className="text-primary" /> Window Schedule
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="table table-xs">
                      <thead>
                        <tr className="text-[10px]">
                          <th>Mark</th><th>Location</th><th>Type</th><th>Size (mm)</th><th>Material</th><th className="text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boq.windowSchedule.map(w => (
                          <tr key={w.mark}>
                            <td className="font-mono font-bold">{w.mark}</td>
                            <td className="text-xs">{w.location}</td>
                            <td className="text-xs">{w.type}</td>
                            <td className="font-mono text-xs">{w.widthMM} × {w.heightMM}</td>
                            <td className="text-xs">{w.material}</td>
                            <td className="text-right font-mono">{w.qty}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-base-300">
                          <td colSpan={5}>Total Windows</td>
                          <td className="text-right font-mono">{boq.windowSchedule.reduce((s, w) => s + w.qty, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="text-xs text-base-content/50 font-mono">
                Note: All door frames include 150mm lugs. Window sill height: 900mm (habitable), 2100mm (toilet ventilators). All UPVC windows with 5mm toughened glass.
              </div>
            </>
          )}

          {/* ─── COST ESTIMATE ─── */}
          {tab === 'cost' && (
            <>
              {/* Category-wise cost */}
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <IndianRupee size={14} className="text-primary" /> Category-wise Cost Breakdown
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead><tr><th>Category</th><th className="text-right">Amount (₹)</th><th className="text-right">%</th></tr></thead>
                      <tbody>
                        {Object.entries(grouped).map(([cat, items]) => {
                          const subtotal = items.reduce((s, li) => s + li.amount, 0);
                          return (
                            <tr key={cat}>
                              <td>{CAT_LABELS[cat] || cat}</td>
                              <td className="text-right font-mono">{formatINR(subtotal)}</td>
                              <td className="text-right font-mono">{(subtotal / boq.totalCost * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                        <tr className="font-bold bg-base-300">
                          <td>Material + Labour (Base)</td>
                          <td className="text-right font-mono">{formatINR(boq.totalCost)}</td>
                          <td className="text-right font-mono">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Additional costs */}
              <div className="card bg-base-200">
                <div className="card-body p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/60">Provisional Add-ons (Not in Base)</h3>
                  <div className="overflow-x-auto">
                    <table className="table table-xs">
                      <thead><tr><th>Item</th><th className="text-right">Estimated (₹)</th><th>Remark</th></tr></thead>
                      <tbody>
                        <tr><td>Architect Fees (5%)</td><td className="text-right font-mono">{formatINR(Math.round(boq.totalCost * 0.05))}</td><td className="text-[10px] text-base-content/50">Design + supervision</td></tr>
                        <tr><td>Structural Engineer (2%)</td><td className="text-right font-mono">{formatINR(Math.round(boq.totalCost * 0.02))}</td><td className="text-[10px] text-base-content/50">RCC design + certification</td></tr>
                        <tr><td>Sanction Fees / RERA</td><td className="text-right font-mono">{formatINR(Math.round(boq.totalBuiltUpAreaSqFt * 25))}</td><td className="text-[10px] text-base-content/50">Municipal approval</td></tr>
                        <tr><td>Lift (if applicable)</td><td className="text-right font-mono">{formatINR(boq.numFloors >= 3 ? 350000 : 0)}</td><td className="text-[10px] text-base-content/50">{boq.numFloors >= 3 ? 'Recommended for G+2+' : 'N/A for G+1'}</td></tr>
                        <tr><td>Solar + Rain Harvest</td><td className="text-right font-mono">{formatINR(Math.round(boq.totalBuiltUpAreaSqFt * 15))}</td><td className="text-[10px] text-base-content/50">Green building compliance</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Grand total card */}
              <div className="card bg-primary text-primary-content">
                <div className="card-body p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs opacity-70">Base Construction Cost</div>
                      <div className="text-2xl font-bold">{formatINR(boq.totalCost)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs opacity-70">Per Sqft</div>
                      <div className="text-lg font-bold">{formatINR(boq.costPerSqFt)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Assumptions */}
              <div className="card bg-base-200">
                <div className="card-body p-3 space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/60">Design Assumptions</h3>
                  <ul className="text-[10px] text-base-content/50 space-y-0.5 list-disc list-inside font-mono">
                    <li>Column: 230mm × 300mm at all wall junctions</li>
                    <li>Max span without beam: 4.5m (NBC 2016 cl. 8.1)</li>
                    <li>Slab: 125mm RCC M20, Fe500D</li>
                    <li>Wall: 230mm brick/block masonry (CM 1:6)</li>
                    <li>Floor-to-floor: 3.0m (clear 2.7m)</li>
                    <li>Foundation: Isolated footings, SBC 150 kN/m²</li>
                    <li>Steel ratio: 4.5 kg/sqft (residential G+1/G+2)</li>
                    <li>Rates: South India 2024-25 average (±15% variation)</li>
                    <li>Excludes: Furniture, modular kitchen, AC, interiors</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string; unit: string }> = ({ label, value, unit }) => (
  <div className="bg-base-300 rounded-lg p-3 text-center">
    <div className="text-lg font-bold">{value} <span className="text-xs font-normal text-base-content/50">{unit}</span></div>
    <div className="text-[10px] text-base-content/50">{label}</div>
  </div>
);
