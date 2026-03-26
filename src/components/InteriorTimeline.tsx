import React, { useMemo } from 'react';
import { InteriorExecutionPhase } from '../types';
import BrandWatermark from './BrandWatermark';

interface Props {
  phases: InteriorExecutionPhase[];
  totalDays: number;
}

const TRADE_COLORS: Record<string, string> = {
  Civil: '#EF4444',
  Carpenter: '#F59E0B',
  Electrician: '#3B82F6',
  Plumber: '#10B981',
  Painter: '#8B5CF6',
  'POP Worker': '#EC4899',
  Tiling: '#14B8A6',
  Mason: '#D97706',
  Housekeeping: '#6B7280',
};

const formatINR = (v: number): string =>
  new Intl.NumberFormat('en-IN').format(v);

function getTradeColor(trade: string): string {
  return TRADE_COLORS[trade] ?? '#6B7280';
}

/**
 * Compute critical path: longest chain by total duration.
 * Returns set of phase IDs on the critical path.
 */
function computeCriticalPath(phases: InteriorExecutionPhase[]): Set<string> {
  const byId = new Map<string, InteriorExecutionPhase>();
  phases.forEach((p) => byId.set(p.id, p));

  const memo = new Map<string, { cost: number; chain: string[] }>();

  function longest(id: string): { cost: number; chain: string[] } {
    if (memo.has(id)) return memo.get(id)!;
    const phase = byId.get(id);
    if (!phase) {
      const r = { cost: 0, chain: [] as string[] };
      memo.set(id, r);
      return r;
    }
    let best = { cost: 0, chain: [] as string[] };
    for (const dep of phase.dependencies) {
      const sub = longest(dep);
      if (sub.cost > best.cost) best = sub;
    }
    const r = {
      cost: best.cost + phase.durationDays,
      chain: [...best.chain, id],
    };
    memo.set(id, r);
    return r;
  }

  let globalBest = { cost: 0, chain: [] as string[] };
  for (const p of phases) {
    const res = longest(p.id);
    if (res.cost > globalBest.cost) globalBest = res;
  }
  return new Set(globalBest.chain);
}

export default function InteriorTimeline({ phases, totalDays }: Props) {
  const PX_PER_DAY = 12;
  const LABEL_W = 200;
  const COST_W = 150;
  const ROW_H = 36;
  const HEADER_H = 50;
  const FOOTER_H = 80;
  const MARGIN = 20;

  const safeTotalDays = Math.max(totalDays, 1);
  const chartW = safeTotalDays * PX_PER_DAY;
  const svgWidth = LABEL_W + chartW + COST_W + MARGIN * 2;
  const svgHeight = HEADER_H + phases.length * ROW_H + FOOTER_H;

  const criticalSet = useMemo(() => computeCriticalPath(phases), [phases]);

  const phaseMap = useMemo(() => {
    const m = new Map<string, { idx: number; phase: InteriorExecutionPhase }>();
    phases.forEach((p, i) => m.set(p.id, { idx: i, phase: p }));
    return m;
  }, [phases]);

  // Day tick marks
  const dayTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let d = 0; d <= safeTotalDays; d += 5) ticks.push(d);
    return ticks;
  }, [safeTotalDays]);

  const timelineX = LABEL_W + MARGIN;

  if (phases.length === 0) {
    return (
      <div className="relative p-8 text-center text-base-content/50">
        <BrandWatermark position="top-left" />
        <p>No execution phases available.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <BrandWatermark position="top-left" />
      <div className="overflow-x-auto border border-base-300 rounded-xl bg-base-100">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ minWidth: svgWidth }}
        >
          {/* Background */}
          <rect width={svgWidth} height={svgHeight} fill="white" rx={8} />

          {/* Header background */}
          <rect x={0} y={0} width={svgWidth} height={HEADER_H} fill="#F3F4F6" />

          {/* Label header */}
          <text x={10} y={32} fontSize={13} fontWeight="bold" fill="#374151">
            Phase / Trade
          </text>

          {/* Cost header */}
          <text
            x={timelineX + chartW + 10}
            y={32}
            fontSize={13}
            fontWeight="bold"
            fill="#374151"
          >
            Est. Cost (₹)
          </text>

          {/* Day ticks */}
          {dayTicks.map((d) => {
            const x = timelineX + d * PX_PER_DAY;
            return (
              <g key={`tick-${d}`}>
                <line
                  x1={x}
                  y1={HEADER_H - 10}
                  x2={x}
                  y2={HEADER_H + phases.length * ROW_H}
                  stroke="#E5E7EB"
                  strokeWidth={d % 7 === 0 ? 1.5 : 0.5}
                />
                <text x={x} y={HEADER_H - 14} fontSize={10} fill="#9CA3AF" textAnchor="middle">
                  {d > 0 ? `D${d}` : ''}
                </text>
              </g>
            );
          })}

          {/* Week markers at top */}
          {dayTicks
            .filter((d) => d > 0 && d % 7 === 0)
            .map((d) => {
              const x = timelineX + d * PX_PER_DAY;
              return (
                <text
                  key={`wk-${d}`}
                  x={x}
                  y={12}
                  fontSize={9}
                  fill="#6B7280"
                  textAnchor="middle"
                >
                  Wk{Math.floor(d / 7)}
                </text>
              );
            })}

          {/* Dependency arrows (drawn behind bars) */}
          {phases.map((phase) =>
            phase.dependencies.map((depId) => {
              const dep = phaseMap.get(depId);
              const cur = phaseMap.get(phase.id);
              if (!dep || !cur) return null;
              const fromX =
                timelineX +
                (dep.phase.startDay + dep.phase.durationDays) * PX_PER_DAY;
              const fromY = HEADER_H + dep.idx * ROW_H + ROW_H / 2;
              const toX = timelineX + phase.startDay * PX_PER_DAY;
              const toY = HEADER_H + cur.idx * ROW_H + ROW_H / 2;
              const midX = (fromX + toX) / 2;
              return (
                <g key={`arrow-${depId}-${phase.id}`}>
                  <path
                    d={`M${fromX},${fromY} C${midX},${fromY} ${midX},${toY} ${toX},${toY}`}
                    fill="none"
                    stroke="#D1D5DB"
                    strokeWidth={1}
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })
          )}

          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth={8}
              markerHeight={6}
              refX={8}
              refY={3}
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#9CA3AF" />
            </marker>
          </defs>

          {/* Phase rows */}
          {phases.map((phase, i) => {
            const y = HEADER_H + i * ROW_H;
            const barX = timelineX + phase.startDay * PX_PER_DAY;
            const barW = Math.max(phase.durationDays * PX_PER_DAY, 4);
            const color = getTradeColor(phase.trade);
            const isCritical = criticalSet.has(phase.id);
            const labelFits = barW > phase.phase.length * 6 + 10;

            return (
              <g key={phase.id}>
                {/* Alternating row bg */}
                {i % 2 === 0 && (
                  <rect x={0} y={y} width={svgWidth} height={ROW_H} fill="#FAFAFA" />
                )}

                {/* Phase label */}
                <text x={10} y={y + 16} fontSize={11} fontWeight="600" fill="#1F2937">
                  {phase.phase.length > 24 ? phase.phase.slice(0, 22) + '…' : phase.phase}
                </text>
                <text x={10} y={y + 28} fontSize={9} fill={color}>
                  {phase.trade}
                </text>

                {/* Timeline bar */}
                <rect
                  x={barX}
                  y={y + 6}
                  width={barW}
                  height={ROW_H - 12}
                  rx={4}
                  fill={color}
                  opacity={0.85}
                  stroke={isCritical ? '#111827' : 'none'}
                  strokeWidth={isCritical ? 2 : 0}
                >
                  <title>
                    {`${phase.phase}\nTrade: ${phase.trade}\nDays: ${phase.startDay} – ${phase.startDay + phase.durationDays}\nDuration: ${phase.durationDays}d\nCost: ₹${formatINR(phase.estimatedCost)}`}
                  </title>
                </rect>

                {/* Bar label */}
                {labelFits ? (
                  <text
                    x={barX + 6}
                    y={y + ROW_H / 2 + 3}
                    fontSize={9}
                    fill="white"
                    fontWeight="600"
                  >
                    {phase.phase}
                  </text>
                ) : (
                  <text
                    x={barX + barW + 4}
                    y={y + ROW_H / 2 + 3}
                    fontSize={9}
                    fill={color}
                    fontWeight="500"
                  >
                    {phase.durationDays}d
                  </text>
                )}

                {/* Cost column */}
                <text
                  x={timelineX + chartW + 10}
                  y={y + ROW_H / 2 + 4}
                  fontSize={11}
                  fill="#374151"
                >
                  ₹{formatINR(phase.estimatedCost)}
                </text>
              </g>
            );
          })}

          {/* Bottom separator */}
          <line
            x1={0}
            y1={HEADER_H + phases.length * ROW_H}
            x2={svgWidth}
            y2={HEADER_H + phases.length * ROW_H}
            stroke="#D1D5DB"
            strokeWidth={1}
          />

          {/* Total duration banner */}
          <rect
            x={timelineX}
            y={HEADER_H + phases.length * ROW_H + 6}
            width={chartW}
            height={22}
            rx={4}
            fill="#1F2937"
            opacity={0.9}
          />
          <text
            x={timelineX + chartW / 2}
            y={HEADER_H + phases.length * ROW_H + 21}
            textAnchor="middle"
            fontSize={11}
            fontWeight="bold"
            fill="white"
          >
            Total Project Duration: {safeTotalDays} Days
          </text>

          {/* Total cost */}
          {(() => {
            const totalCost = phases.reduce((s, p) => s + p.estimatedCost, 0);
            return (
              <text
                x={timelineX + chartW + 10}
                y={HEADER_H + phases.length * ROW_H + 21}
                fontSize={11}
                fontWeight="bold"
                fill="#1F2937"
              >
                ₹{formatINR(totalCost)}
              </text>
            );
          })()}

          {/* Legend */}
          {(() => {
            const trades = Object.entries(TRADE_COLORS);
            const legendY = HEADER_H + phases.length * ROW_H + 38;
            return trades.map(([name, col], idx) => {
              const lx = 10 + idx * 100;
              return (
                <g key={`legend-${name}`}>
                  <rect x={lx} y={legendY} width={10} height={10} rx={2} fill={col} />
                  <text x={lx + 14} y={legendY + 9} fontSize={9} fill="#6B7280">
                    {name}
                  </text>
                </g>
              );
            });
          })()}

          {/* Critical path note */}
          <text
            x={svgWidth - MARGIN}
            y={HEADER_H + phases.length * ROW_H + 48}
            textAnchor="end"
            fontSize={9}
            fill="#6B7280"
          >
            ■ Bold border = Critical Path
          </text>
        </svg>
      </div>
    </div>
  );
}
