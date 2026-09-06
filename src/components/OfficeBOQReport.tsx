'use client';

import React, { useState } from 'react';
import { Layout, OfficeRequirements } from '../types';
import { OfficeBOQ, OfficeBOQLineItem, calculateOfficeBOQ } from '../utils/officeBoqCalculator';
import { IndianRupee, Download, ChevronDown, ChevronUp, Building } from 'lucide-react';

interface Props {
  layout: Layout;
  officeReq: OfficeRequirements;
}

const formatINR = (amount: number): string => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} Lakhs`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const formatNumber = (value: number): string => value.toLocaleString('en-IN');

type CategoryKey = keyof OfficeBOQ['costBreakdown'];

const categories: Array<{
  key: CategoryKey;
  lineCategory: OfficeBOQLineItem['category'];
  label: string;
  color: string;
}> = [
  { key: 'civil', lineCategory: 'civil', label: 'Civil Works', color: '#6b7280' },
  { key: 'furniture', lineCategory: 'furniture', label: 'Furniture', color: '#3b82f6' },
  { key: 'partitions', lineCategory: 'partitions', label: 'Partitions', color: '#8b5cf6' },
  { key: 'ceiling', lineCategory: 'ceiling', label: 'Ceiling', color: '#f59e0b' },
  { key: 'flooring', lineCategory: 'flooring', label: 'Flooring', color: '#10b981' },
  { key: 'electrical', lineCategory: 'electrical', label: 'Electrical', color: '#ef4444' },
  { key: 'dataNetwork', lineCategory: 'data_network', label: 'Data & Network', color: '#06b6d4' },
  { key: 'hvac', lineCategory: 'hvac', label: 'HVAC', color: '#f97316' },
  { key: 'fireSafety', lineCategory: 'fire_safety', label: 'Fire Safety', color: '#dc2626' },
  { key: 'plumbing', lineCategory: 'plumbing', label: 'Plumbing', color: '#14b8a6' },
  { key: 'painting', lineCategory: 'painting', label: 'Painting', color: '#a855f7' },
  { key: 'signage', lineCategory: 'signage', label: 'Signage', color: '#64748b' },
  { key: 'misc', lineCategory: 'misc', label: 'Miscellaneous', color: '#9ca3af' },
];

const formatCSVCell = (value: string | number | undefined): string => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCSV = (boq: OfficeBOQ): void => {
  const headers = ['S.No', 'Category', 'Description', 'Qty', 'Unit', 'Rate', 'Amount', 'Remark'];
  const rows = boq.lineItems.map((item) => {
    const category = categories.find((entry) => entry.lineCategory === item.category)?.label ?? item.category;
    return [item.sno, category, item.description, item.quantity, item.unit, item.rate, item.amount, item.remark ?? '']
      .map(formatCSVCell)
      .join(',');
  });
  rows.push(['', '', '', '', '', 'Total', boq.totalCost, ''].map(formatCSVCell).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'office-fitout-boq.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const SummaryStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-gray-50 px-4 py-3">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
  </div>
);

export default function OfficeBOQReport({ layout, officeReq }: Props) {
  const [boq] = useState<OfficeBOQ>(() => calculateOfficeBOQ(layout, officeReq));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleCategory = (category: string) => {
    setExpanded((current) => ({ ...current, [category]: !current[category] }));
  };

  return (
    <div className="min-h-full bg-white text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><Building size={22} /></div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Office Fitout BOQ</h2>
              <p className="text-sm text-gray-500">Bill of quantities and cost estimate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => downloadCSV(boq)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Download size={17} /> Download CSV
          </button>
        </div>

        <section className="rounded-xl border border-gray-100 bg-gray-100 p-4 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
              <p className="text-sm font-medium text-gray-500">Total fitout cost</p>
              <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-gray-900"><IndianRupee size={23} />{formatINR(boq.totalCost).replace('₹', '')}</p>
              <p className="mt-1 text-xs text-gray-500">Complete office fitout estimate</p>
            </div>
            <SummaryStat label="Cost per sq. ft." value={formatINR(boq.costPerSqFt)} />
            <SummaryStat label="Total area" value={`${formatNumber(boq.totalAreaSqFt)} sq. ft.`} />
            <SummaryStat label="Employees / workstations" value={`${formatNumber(boq.employeeCount)} / ${formatNumber(boq.workstationCount)}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
            <span><strong className="text-gray-900">{formatNumber(boq.totalAreaSqM)}</strong> sq. m.</span>
            <span><strong className="text-gray-900">{boq.numFloors}</strong> {boq.numFloors === 1 ? 'floor' : 'floors'}</span>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h3 className="mb-5 text-base font-semibold text-gray-900">Cost breakdown</h3>
          <div className="space-y-3">
            {categories.map((category) => {
              const amount = boq.costBreakdown[category.key];
              const percentage = boq.totalCost > 0 ? (amount / boq.totalCost) * 100 : 0;
              return (
                <div key={category.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-gray-700"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: category.color }} />{category.label}</span>
                    <span className="shrink-0 text-gray-500">{formatINR(amount)} <span className="text-xs">({percentage.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, percentage)}%`, backgroundColor: category.color }} /></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="px-1 text-base font-semibold text-gray-900">Detailed line items</h3>
          {categories.map((category) => {
            const items = boq.lineItems.filter((item) => item.category === category.lineCategory);
            const amount = boq.costBreakdown[category.key];
            const isOpen = Boolean(expanded[category.key]);
            return (
              <div key={category.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button type="button" onClick={() => toggleCategory(category.key)} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-gray-50 sm:px-5">
                  <span className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="font-semibold text-gray-800">{category.label}</span><span className="text-xs text-gray-500">{items.length} {items.length === 1 ? 'item' : 'items'}</span></span>
                  <span className="flex shrink-0 items-center gap-3"><span className="text-sm font-semibold text-gray-700">{formatINR(amount)}</span>{isOpen ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}</span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-gray-100">
                    <table className="min-w-[760px] w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3 font-semibold">S.No</th><th className="px-4 py-3 font-semibold">Description</th><th className="px-4 py-3 text-right font-semibold">Qty</th><th className="px-4 py-3 font-semibold">Unit</th><th className="px-4 py-3 text-right font-semibold">Rate</th><th className="px-4 py-3 text-right font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Remark</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">{items.map((item) => <tr key={`${category.key}-${item.sno}`} className="text-gray-700"><td className="px-4 py-3">{item.sno}</td><td className="px-4 py-3 font-medium text-gray-800">{item.description}</td><td className="px-4 py-3 text-right">{formatNumber(item.quantity)}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3 text-right">{formatINR(item.rate)}</td><td className="px-4 py-3 text-right font-semibold">{formatINR(item.amount)}</td><td className="px-4 py-3 text-gray-500">{item.remark || '—'}</td></tr>)}</tbody>
                    </table>
                    {items.length === 0 && <p className="px-4 py-5 text-sm text-gray-500">No line items in this category.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <footer className="border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-500">Disclaimer: This BOQ is an indicative estimate based on the information provided and prevailing market rates. Actual quantities, specifications, taxes, site conditions, and vendor prices may vary. Please verify all details with a qualified contractor before execution.</footer>
      </div>
    </div>
  );
}
