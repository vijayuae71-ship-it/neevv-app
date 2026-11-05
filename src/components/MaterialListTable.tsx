'use client';

import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { type MaterialLine, materialCSV } from '@/utils/materialList';

/**
 * Material list with quantities, units, editable rates and amounts, grouped by trade.
 * compareTotal: the BOQ total for the same scope — the difference is shown as labour, fixing and margin.
 */
interface Props { lines: MaterialLine[]; title: string; compareTotal?: number; compareLabel?: string; fileName: string }

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

export default function MaterialListTable({ lines, title, compareTotal, compareLabel = 'BOQ total', fileName }: Props) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const key = (l: MaterialLine) => `${l.group}|${l.item}|${l.unit}`;
  const rows = useMemo(() => lines.map(l => ({ ...l, rate: rates[key(l)] ?? l.rate })), [lines, rates]);
  const groups = useMemo(() => [...new Set(rows.map(r => r.group))], [rows]);
  const total = rows.reduce((s, r) => s + r.qty * r.rate, 0);

  const download = () => {
    const blob = new Blob([materialCSV(rows, title)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${fileName}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500">What to buy, in purchase units, with cutting / wastage allowance. Rates are material-only market rates — tap a rate to change it.</p>
        </div>
        <button onClick={download} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50"><Download size={14} /> Download (Excel / CSV)</button>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr><th className="text-left px-3 py-2">Material</th><th className="text-right px-2">Qty</th><th className="text-left px-2">Unit</th><th className="text-right px-2">Rate</th><th className="text-right px-3">Amount</th></tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const gr = rows.filter(r => r.group === g), sub = gr.reduce((s, r) => s + r.qty * r.rate, 0);
              return (
                <React.Fragment key={g}>
                  <tr className="bg-emerald-50/60"><td colSpan={4} className="px-3 py-1.5 font-semibold text-emerald-900">{g}</td><td className="px-3 text-right font-semibold text-emerald-900">{inr(sub)}</td></tr>
                  {gr.map(r => (
                    <tr key={key(r)} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-1.5"><div className="text-gray-800">{r.item}</div><div className="text-[11px] text-gray-400">{r.basis}</div></td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.qty.toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.unit}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" min={0} className="w-20 text-right border border-gray-200 rounded px-1 py-0.5 font-mono text-xs" value={r.rate}
                          onChange={e => setRates(prev => ({ ...prev, [key(r)]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`Rate for ${r.item}`} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{inr(r.qty * r.rate)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50"><td colSpan={4} className="px-3 py-2 font-bold">Materials total</td><td className="px-3 text-right font-bold font-mono">{inr(total)}</td></tr>
            {typeof compareTotal === 'number' && compareTotal > 0 && (
              <tr className="text-gray-600"><td colSpan={4} className="px-3 py-1.5 text-xs">{compareLabel} {inr(compareTotal)} → labour, fixing &amp; contractor margin</td><td className="px-3 text-right font-mono text-xs">{inr(Math.max(0, compareTotal - total))}</td></tr>
            )}
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">Quantities come from the same take-off as the BOQ. Buy from samples; confirm batch, shade and box counts with the supplier.</p>
    </div>
  );
}
