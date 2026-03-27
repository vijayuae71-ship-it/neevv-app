'use client';

import React, { useState, useMemo } from 'react';
import { InteriorDesignData, RoomInterior } from '../types';

interface Props {
  data: InteriorDesignData;
  rooms: RoomInterior[];
}

const formatCurrency = (v: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);

const formatNum = (v: number): string =>
  new Intl.NumberFormat('en-IN').format(v);

type TabKey = 'summary' | 'rooms' | 'categories' | 'materials';

const CATEGORY_COLORS: Record<string, string> = {
  civil: '#EF4444',
  falseCeiling: '#F59E0B',
  flooring: '#3B82F6',
  woodwork: '#8B6914',
  painting: '#8B5CF6',
  electrical: '#3B82F6',
  plumbing: '#10B981',
  hardware: '#6B7280',
  furnishing: '#EC4899',
  miscellaneous: '#9CA3AF',
};

const CATEGORY_LABELS: Record<string, string> = {
  civil: 'Civil Work',
  falseCeiling: 'False Ceiling',
  flooring: 'Flooring',
  woodwork: 'Woodwork',
  painting: 'Painting',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hardware: 'Hardware',
  furnishing: 'Furnishing',
  miscellaneous: 'Miscellaneous',
};

const BOQ_CATEGORY_TO_BREAKDOWN: Record<string, string> = {
  civil: 'civil',
  false_ceiling: 'falseCeiling',
  flooring: 'flooring',
  woodwork: 'woodwork',
  painting: 'painting',
  electrical: 'electrical',
  plumbing: 'plumbing',
  hardware: 'hardware',
  furnishing: 'furnishing',
  miscellaneous: 'miscellaneous',
};

/* ==================== SUB COMPONENTS ==================== */

function CostSummaryTab({ data }: { data: InteriorDesignData }) {
  const breakdown = data.costBreakdown;
  const total = data.totalCost || 1;

  const categories = useMemo(() => {
    const entries = Object.entries(breakdown) as [string, number][];
    return entries
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [breakdown]);

  const maxVal = categories.length > 0 ? categories[0][1] : 1;

  // Pie chart data
  const pieData = useMemo(() => {
    let cumulative = 0;
    return categories.map(([key, val]) => {
      const pct = (val / total) * 100;
      const offset = cumulative;
      cumulative += pct;
      return { key, val, pct, offset };
    });
  }, [categories, total]);

  const totalArea = data.boqItems.reduce((s, item) => {
    if (item.unit === 'sqft') return s + item.quantity;
    return s;
  }, 0);

  const costPerSqft = totalArea > 0 ? total / totalArea : 0;

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div className="stat">
          <div className="stat-title">Total Project Cost</div>
          <div className="stat-value text-blue-600 text-2xl">{formatCurrency(total)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Cost / sqft</div>
          <div className="stat-value text-lg">{costPerSqft > 0 ? formatCurrency(Math.round(costPerSqft)) : 'N/A'}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Project Duration</div>
          <div className="stat-value text-lg">{data.totalDurationDays} Days</div>
        </div>
        <div className="stat">
          <div className="stat-title">BOQ Items</div>
          <div className="stat-value text-lg">{data.boqItems.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horizontal bar chart */}
        <div className="card bg-white shadow-sm border border-gray-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Category-wise Breakdown</h3>
            <svg
              width="100%"
              viewBox={`0 0 500 ${categories.length * 36 + 10}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              {categories.map(([key, val], i) => {
                const y = i * 36 + 5;
                const barW = Math.max((val / maxVal) * 280, 2);
                const pct = ((val / total) * 100).toFixed(1);
                const color = CATEGORY_COLORS[key] ?? '#6B7280';
                return (
                  <g key={key}>
                    <text x={0} y={y + 14} fontSize={11} fill="#374151" fontWeight="500">
                      {CATEGORY_LABELS[key] ?? key}
                    </text>
                    <rect x={110} y={y + 2} width={barW} height={18} rx={3} fill={color} opacity={0.85}>
                      <title>{`${CATEGORY_LABELS[key] ?? key}: ${formatCurrency(val)} (${pct}%)`}</title>
                    </rect>
                    <text x={110 + barW + 6} y={y + 15} fontSize={10} fill="#6B7280">
                      {formatCurrency(val)} ({pct}%)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Donut / Pie chart */}
        <div className="card bg-white shadow-sm border border-gray-200">
          <div className="card-body p-4 flex flex-col items-center">
            <h3 className="card-title text-sm">Cost Proportions</h3>
            <svg width={220} height={220} viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
              {pieData.map(({ key, pct, offset }) => {
                const color = CATEGORY_COLORS[key] ?? '#6B7280';
                const circumference = Math.PI * 2 * 80;
                const dashLen = (pct / 100) * circumference;
                const dashOffset = -(offset / 100) * circumference;
                return (
                  <circle
                    key={key}
                    cx={110}
                    cy={110}
                    r={80}
                    fill="none"
                    stroke={color}
                    strokeWidth={36}
                    strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 110 110)"
                  >
                    <title>{`${CATEGORY_LABELS[key] ?? key}: ${pct.toFixed(1)}%`}</title>
                  </circle>
                );
              })}
              <circle cx={110} cy={110} r={58} fill="white" />
              <text x={110} y={106} textAnchor="middle" fontSize={11} fill="#6B7280">
                Total
              </text>
              <text x={110} y={124} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#1F2937">
                {formatCurrency(total)}
              </text>
            </svg>
            {/* Legend */}
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {pieData.map(({ key }) => (
                <span key={key} className="flex items-center gap-1 text-xs">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: CATEGORY_COLORS[key] ?? '#6B7280' }}
                  />
                  {CATEGORY_LABELS[key] ?? key}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomBreakdownTab({ data, rooms }: { data: InteriorDesignData; rooms: RoomInterior[] }) {
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

  const roomItems = useMemo(() => {
    const map = new Map<string, typeof data.boqItems>();
    for (const item of data.boqItems) {
      const arr = map.get(item.room) ?? [];
      arr.push(item);
      map.set(item.room, arr);
    }
    return map;
  }, [data.boqItems]);

  const roomCosts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [room, items] of roomItems.entries()) {
      map.set(room, items.reduce((s, it) => s + it.amount, 0));
    }
    return map;
  }, [roomItems]);

  if (rooms.length === 0) {
    return <p className="text-gray-500 text-center py-8">No room data available.</p>;
  }

  return (
    <div className="space-y-2">
      {rooms.map((room) => {
        const isOpen = expandedRoom === room.roomId;
        const items = roomItems.get(room.roomName) ?? [];
        const cost = roomCosts.get(room.roomName) ?? 0;

        return (
          <div key={room.roomId} className="collapse collapse-arrow border border-gray-200 bg-white">
            <input
              type="checkbox"
              checked={isOpen}
              onChange={() => setExpandedRoom(isOpen ? null : room.roomId)}
            />
            <div className="collapse-title font-medium flex items-center justify-between pr-12">
              <div>
                <span className="font-semibold">{room.roomName}</span>
                <span className="text-xs ml-2 opacity-80 capitalize">{room.style.replace(/_/g, ' ')}</span>
              </div>
              <span className="badge badge-primary badge-outline">{formatCurrency(cost)}</span>
            </div>
            <div className="collapse-content">
              {items.length === 0 ? (
                <p className="text-sm opacity-80">No BOQ items for this room.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-xs table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Sno</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.sno}>
                          <td>{it.sno}</td>
                          <td>{it.description}</td>
                          <td>{formatNum(it.quantity)}</td>
                          <td>{it.unit}</td>
                          <td className="text-right">{formatCurrency(it.rate)}</td>
                          <td className="text-right">{formatCurrency(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td colSpan={5} className="text-right">Room Total</td>
                        <td className="text-right">{formatCurrency(cost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryDetailsTab({ data }: { data: InteriorDesignData }) {
  const [openCat, setOpenCat] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data.boqItems>();
    for (const item of data.boqItems) {
      const bKey = BOQ_CATEGORY_TO_BREAKDOWN[item.category] ?? item.category;
      const arr = map.get(bKey) ?? [];
      arr.push(item);
      map.set(bKey, arr);
    }
    return map;
  }, [data.boqItems]);

  const catKeys = Object.keys(CATEGORY_LABELS);

  return (
    <div className="space-y-2">
      {catKeys.map((catKey) => {
        const items = grouped.get(catKey) ?? [];
        if (items.length === 0) return null;
        const subtotal = items.reduce((s, it) => s + it.amount, 0);
        const isOpen = openCat === catKey;

        return (
          <div key={catKey} className="collapse collapse-arrow border border-gray-200 bg-white">
            <input
              type="checkbox"
              checked={isOpen}
              onChange={() => setOpenCat(isOpen ? null : catKey)}
            />
            <div className="collapse-title font-medium flex items-center justify-between pr-12">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[catKey] }}
                />
                <span>{CATEGORY_LABELS[catKey]}</span>
                <span className="badge badge-sm">{items.length} items</span>
              </div>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="collapse-content">
              <div className="overflow-x-auto">
                <table className="table table-xs table-zebra w-full">
                  <thead>
                    <tr>
                      <th>Sno</th>
                      <th>Room</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amount</th>
                      <th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={`${catKey}-${it.sno}`}>
                        <td>{it.sno}</td>
                        <td>{it.room}</td>
                        <td>{it.description}</td>
                        <td>{formatNum(it.quantity)}</td>
                        <td>{it.unit}</td>
                        <td className="text-right">{formatCurrency(it.rate)}</td>
                        <td className="text-right">{formatCurrency(it.amount)}</td>
                        <td className="text-xs opacity-80">{it.remark ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={6} className="text-right">Subtotal</td>
                      <td className="text-right">{formatCurrency(subtotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MaterialScheduleTab({ data, rooms }: { data: InteriorDesignData; rooms: RoomInterior[] }) {
  // Aggregate materials from rooms
  const flooringAgg = useMemo(() => {
    const map = new Map<string, { name: string; totalQty: number; unit: string; rate: number }>();
    for (const room of rooms) {
      const key = room.flooring.name;
      const existing = map.get(key);
      // Use BOQ items to find flooring qty for this room
      const boqFloor = data.boqItems.filter(
        (b) => b.room === room.roomName && b.category === 'flooring'
      );
      const qty = boqFloor.reduce((s, b) => s + b.quantity, 0);
      if (existing) {
        existing.totalQty += qty;
      } else {
        map.set(key, { name: key, totalQty: qty, unit: room.flooring.unit, rate: room.flooring.ratePerUnit });
      }
    }
    return Array.from(map.values());
  }, [rooms, data.boqItems]);

  const paintAgg = useMemo(() => {
    const items = data.boqItems.filter((b) => b.category === 'painting');
    return items.reduce((s, b) => s + b.quantity, 0);
  }, [data.boqItems]);

  const ceilingAgg = useMemo(() => {
    const items = data.boqItems.filter((b) => b.category === 'false_ceiling');
    return items.reduce((s, b) => s + b.quantity, 0);
  }, [data.boqItems]);

  const woodworkItems = useMemo(() => {
    const map = new Map<string, { desc: string; count: number; totalCost: number }>();
    for (const room of rooms) {
      for (const furn of room.furniture) {
        const key = furn.category;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
          existing.totalCost += furn.estimatedCost;
        } else {
          map.set(key, { desc: furn.name, count: 1, totalCost: furn.estimatedCost });
        }
      }
    }
    return Array.from(map.entries());
  }, [rooms]);

  return (
    <div className="space-y-6">
      {/* Flooring */}
      <div className="card bg-white shadow-sm border border-gray-200">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">🪨 Flooring Materials</h3>
          {flooringAgg.length === 0 ? (
            <p className="text-sm opacity-80">No flooring data.</p>
          ) : (
            <table className="table table-xs w-full">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="text-right">Total Qty</th>
                  <th>Unit</th>
                  <th className="text-right">Rate/Unit</th>
                  <th className="text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {flooringAgg.map((f) => (
                  <tr key={f.name}>
                    <td>{f.name}</td>
                    <td className="text-right">{formatNum(Math.round(f.totalQty))}</td>
                    <td>{f.unit}</td>
                    <td className="text-right">{formatCurrency(f.rate)}</td>
                    <td className="text-right">{formatCurrency(Math.round(f.totalQty * f.rate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Paint */}
      <div className="card bg-white shadow-sm border border-gray-200">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">🎨 Painting</h3>
          <div className="stat p-2">
            <div className="stat-title text-xs">Total Paint Area</div>
            <div className="stat-value text-lg">{formatNum(Math.round(paintAgg))} sqft</div>
          </div>
        </div>
      </div>

      {/* False Ceiling */}
      <div className="card bg-white shadow-sm border border-gray-200">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">💡 False Ceiling</h3>
          <div className="stat p-2">
            <div className="stat-title text-xs">Total Ceiling Area</div>
            <div className="stat-value text-lg">{formatNum(Math.round(ceilingAgg))} sqft</div>
          </div>
        </div>
      </div>

      {/* Woodwork */}
      <div className="card bg-white shadow-sm border border-gray-200">
        <div className="card-body p-4">
          <h3 className="card-title text-sm">🪵 Woodwork / Furniture</h3>
          {woodworkItems.length === 0 ? (
            <p className="text-sm opacity-80">No furniture data.</p>
          ) : (
            <table className="table table-xs w-full">
              <thead>
                <tr>
                  <th>Item Type</th>
                  <th>Example</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {woodworkItems.map(([key, val]) => (
                  <tr key={key}>
                    <td className="capitalize">{key.replace(/_/g, ' ')}</td>
                    <td>{val.desc}</td>
                    <td className="text-right">{val.count}</td>
                    <td className="text-right">{formatCurrency(val.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== MAIN COMPONENT ==================== */

const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: '💰 Cost Summary' },
  { key: 'rooms', label: '🏠 Room-wise' },
  { key: 'categories', label: '📋 Categories' },
  { key: 'materials', label: '📦 Materials' },
];

export default function InteriorCostReport({ data, rooms }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');

  if (!data || !data.boqItems) {
    return (
      <div className="relative p-8 text-center text-gray-500">
        <p>No cost data available yet.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-4">

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-boxed">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'summary' && <CostSummaryTab data={data} />}
        {activeTab === 'rooms' && <RoomBreakdownTab data={data} rooms={rooms} />}
        {activeTab === 'categories' && <CategoryDetailsTab data={data} />}
        {activeTab === 'materials' && <MaterialScheduleTab data={data} rooms={rooms} />}
      </div>
    </div>
  );
}
