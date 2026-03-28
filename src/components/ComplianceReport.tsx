'use client';

import React, { useState } from 'react';
import { Layout, CustomRateSheet } from '../types';
import { autoFixLayout } from '@/utils/vastuAutoFix';
import { calculateBOQ } from '@/utils/boqCalculator';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Compass,
  ChevronDown,
  ChevronUp,
  FileText,
  Home,
  Flame,
  Info,
} from 'lucide-react';

interface Props {
  layout: Layout;
  vastuEnabled: boolean;
  onAutoFix?: (optimizedLayout: Layout) => void;
  boqTotal?: number;
  numFloors?: number;
  customRates?: CustomRateSheet | null;
}

const formatCurrency = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

export const ComplianceReport: React.FC<Props> = ({ layout, vastuEnabled, onAutoFix, boqTotal, numFloors, customRates }) => {
  const [expandNBC, setExpandNBC] = useState(false);
  const [expandVastu, setExpandVastu] = useState(false);
  const [expandFire, setExpandFire] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [costPreview, setCostPreview] = useState<{
    beforeCost: number;
    afterCost: number;
    beforeVastu: number;
    afterVastu: number;
    beforeNBCIssues: number;
    afterNBCIssues: number;
    optimizedLayout: Layout;
  } | null>(null);

  const nbcErrors = layout.nbcIssues.filter((i) => i.severity === 'error');
  const nbcWarnings = layout.nbcIssues.filter((i) => i.severity === 'warning');
  const nbcInfo = layout.nbcIssues.filter((i) => i.severity === 'info');
  const fireIssues = layout.nbcIssues.filter((i) => i.room === 'Fire Safety');
  const nonFireErrors = nbcErrors.filter((i) => i.room !== 'Fire Safety');
  const nonFireWarnings = nbcWarnings.filter((i) => i.room !== 'Fire Safety');
  const fireErrors = fireIssues.filter((i) => i.severity === 'error');
  const fireWarnings = fireIssues.filter((i) => i.severity === 'warning');
  const fireInfo = fireIssues.filter((i) => i.severity === 'info');
  const nbcPass = nbcErrors.length === 0 && nbcWarnings.length === 0;

  // Overall status
  const getOverallStatus = (): { label: string; color: string; bg: string; icon: React.ReactNode } => {
    if (nbcErrors.length > 0) {
      return {
        label: 'Non-Compliant',
        color: 'text-red-700',
        bg: 'bg-red-50 border-red-200',
        icon: <XCircle size={24} className="text-red-600" />,
      };
    }
    if (nbcWarnings.length > 0 || (vastuEnabled && layout.vastuScore < 60)) {
      return {
        label: 'Partially Compliant',
        color: 'text-amber-700',
        bg: 'bg-amber-50 border-amber-200',
        icon: <AlertTriangle size={24} className="text-amber-600" />,
      };
    }
    return {
      label: '100% NBC Compliant',
      color: 'text-green-700',
      bg: 'bg-green-50 border-green-200',
      icon: <CheckCircle size={24} className="text-green-600" />,
    };
  };

  const status = getOverallStatus();

  const handleAutoFixPreview = () => {
    setFixing(true);
    setTimeout(() => {
      try {
        const optimized = autoFixLayout(layout, layout.facing || 'North', vastuEnabled);
        const floors = numFloors || 1;
        const beforeCost = boqTotal || calculateBOQ(layout, floors, customRates).totalCost;
        const afterBOQ = calculateBOQ(optimized, floors, customRates);
        const afterCost = afterBOQ.totalCost;
        const beforeNBCIssues = nbcErrors.length + nbcWarnings.length;
        const afterNBCIssues = optimized.nbcIssues.filter(
          (i) => i.severity === 'error' || i.severity === 'warning'
        ).length;

        setCostPreview({
          beforeCost,
          afterCost,
          beforeVastu: layout.vastuScore,
          afterVastu: optimized.vastuScore,
          beforeNBCIssues,
          afterNBCIssues,
          optimizedLayout: optimized,
        });
      } catch {
        // If preview calc fails, just apply directly
        if (onAutoFix) onAutoFix(layout);
      }
      setFixing(false);
    }, 100);
  };

  const handleAcceptFix = () => {
    if (costPreview && onAutoFix) {
      onAutoFix(costPreview.optimizedLayout);
      setCostPreview(null);
    }
  };

  const handleRejectFix = () => {
    setCostPreview(null);
  };

  const showAutoFix = onAutoFix && (nbcErrors.length > 0 || nbcWarnings.length > 0 || (vastuEnabled && layout.vastuScore < 90));

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Shield size={20} className="text-blue-600" />
        <h2 className="text-base font-bold text-gray-800">Compliance Audit Report</h2>
      </div>

      {/* Overall Status Banner */}
      <div className={`${status.bg} border rounded-xl p-4 flex items-center gap-3`}>
        {status.icon}
        <div>
          <div className={`font-bold text-lg ${status.color}`}>{status.label}</div>
          <div className="text-xs text-gray-600">
            NBC 2016 • {nbcErrors.length} errors • {nbcWarnings.length} warnings • Fire Safety: {fireErrors.length + fireWarnings.length} issues, {fireInfo.length} advisories
            {vastuEnabled && ` • Vastu Score: ${layout.vastuScore}%`}
          </div>
        </div>
      </div>

      {/* Cost Impact Preview Card */}
      {costPreview && (
        <div className="bg-white border-2 border-blue-300 rounded-xl p-4 space-y-3 shadow-lg">
          <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Auto-Fix Cost Impact Analysis
          </div>

          {/* Before vs After Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Before */}
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Plan</div>
              <div className="text-base font-bold text-gray-800">{formatCurrency(costPreview.beforeCost)}</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`w-2 h-2 rounded-full ${costPreview.beforeNBCIssues > 0 ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span className="text-gray-600">{costPreview.beforeNBCIssues} NBC Issues</span>
                </div>
                {vastuEnabled && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`w-2 h-2 rounded-full ${costPreview.beforeVastu < 60 ? 'bg-red-500' : costPreview.beforeVastu < 80 ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <span className="text-gray-600">Vastu {costPreview.beforeVastu}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* After */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-2">Optimized Plan</div>
              <div className="text-base font-bold text-green-700">{formatCurrency(costPreview.afterCost)}</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`w-2 h-2 rounded-full ${costPreview.afterNBCIssues > 0 ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <span className="text-green-700">{costPreview.afterNBCIssues} NBC Issues</span>
                </div>
                {vastuEnabled && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`w-2 h-2 rounded-full ${costPreview.afterVastu >= 80 ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <span className="text-green-700">Vastu {costPreview.afterVastu}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cost Difference */}
          {(() => {
            const diff = costPreview.afterCost - costPreview.beforeCost;
            const pct = costPreview.beforeCost > 0 ? ((diff / costPreview.beforeCost) * 100).toFixed(1) : '0';
            const isIncrease = diff > 0;
            return (
              <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold ${isIncrease ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                <span>{isIncrease ? '📈' : '📉'}</span>
                <span>
                  Cost {isIncrease ? 'Increase' : 'Savings'}: {formatCurrency(Math.abs(diff))} ({isIncrease ? '+' : '-'}{Math.abs(Number(pct))}%)
                </span>
              </div>
            );
          })()}

          {/* Rework Savings Note */}
          <div className="text-[10px] text-gray-500 text-center">
            💡 Compliant plans avoid ₹50K-₹2L rework costs from municipal rejections & structural fixes
          </div>

          {/* Accept / Reject Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleRejectFix}
              className="py-2.5 px-4 rounded-lg border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all"
            >
              ✕ Keep Current Plan
            </button>
            <button
              onClick={handleAcceptFix}
              className="py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-all shadow-md"
            >
              ✓ Apply Optimized Plan
            </button>
          </div>
        </div>
      )}

      {/* Auto-Fix CTA Button (hidden when preview shown) */}
      {showAutoFix && !costPreview && (
        <button
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
          onClick={handleAutoFixPreview}
          disabled={fixing}
        >
          {fixing ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Analyzing Cost Impact...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>⚡ Auto-Fix: Optimize Vastu &amp; NBC Compliance</span>
            </>
          )}
        </button>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white border rounded-lg p-3 text-center">
          <Home size={16} className="mx-auto text-gray-500 mb-1" />
          <div className="text-lg font-bold text-gray-800">{layout.builtUpAreaSqFt}</div>
          <div className="text-[10px] text-gray-500">Built-up Sq.Ft</div>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <Shield size={16} className="mx-auto text-gray-500 mb-1" />
          <div
            className={`text-lg font-bold ${
              nbcPass ? 'text-green-600' : nbcErrors.length > 0 ? 'text-red-600' : 'text-amber-600'
            }`}
          >
            {nbcPass ? 'PASS' : `${nonFireErrors.length + nonFireWarnings.length}`}
          </div>
          <div className="text-[10px] text-gray-500">NBC Issues</div>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <Flame size={16} className="mx-auto text-orange-500 mb-1" />
          <div
            className={`text-lg font-bold ${
              fireErrors.length > 0 ? 'text-red-600' : fireWarnings.length > 0 ? 'text-amber-600' : 'text-green-600'
            }`}
          >
            {fireErrors.length === 0 && fireWarnings.length === 0 ? 'SAFE' : `${fireErrors.length + fireWarnings.length}`}
          </div>
          <div className="text-[10px] text-gray-500">Fire Safety</div>
        </div>
        {vastuEnabled && (
          <div className="bg-white border rounded-lg p-3 text-center">
            <Compass size={16} className="mx-auto text-gray-500 mb-1" />
            <div
              className={`text-lg font-bold ${
                layout.vastuScore >= 80
                  ? 'text-green-600'
                  : layout.vastuScore >= 60
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {layout.vastuScore}%
            </div>
            <div className="text-[10px] text-gray-500">Vastu Score</div>
          </div>
        )}
      </div>

      {/* NBC 2016 Section */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
          onClick={() => setExpandNBC(!expandNBC)}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <span className="font-semibold text-sm text-gray-800">
              NBC 2016/2025 Compliance ({nbcErrors.length + nbcWarnings.length} issues)
            </span>
          </div>
          {expandNBC ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expandNBC && (
          <div className="px-3 pb-3 space-y-2">
            {nbcPass && (
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
                <span className="text-xs text-green-700">
                  All NBC 2016 rules passed. Layout is fully compliant.
                </span>
              </div>
            )}

            {/* Errors */}
            {nbcErrors.map((issue, idx) => (
              <div
                key={`err-${idx}`}
                className="flex items-start gap-2 p-2 bg-red-50 rounded-lg"
              >
                <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-red-700">{issue.room}</div>
                  <div className="text-[11px] text-red-600">{issue.issue}</div>
                </div>
              </div>
            ))}

            {/* Warnings */}
            {nbcWarnings.map((issue, idx) => (
              <div
                key={`warn-${idx}`}
                className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg"
              >
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-700">{issue.room}</div>
                  <div className="text-[11px] text-amber-600">{issue.issue}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vastu Section */}
      {vastuEnabled && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
            onClick={() => setExpandVastu(!expandVastu)}
          >
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-orange-500" />
              <span className="font-semibold text-sm text-gray-800">
                Vastu Shastra ({layout.vastuScore}% Score)
              </span>
            </div>
            {expandVastu ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandVastu && (
            <div className="px-3 pb-3">
              {/* Score Bar */}
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full ${
                      layout.vastuScore >= 80
                        ? 'bg-green-500'
                        : layout.vastuScore >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${layout.vastuScore}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>0%</span>
                  <span>Target: 90%+</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Room Details */}
              <div className="space-y-1">
                {layout.vastuDetails.map((detail, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between text-xs p-1.5 rounded ${
                      detail.compliant ? 'bg-green-50' : 'bg-orange-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {detail.compliant ? (
                        <CheckCircle size={12} className="text-green-600" />
                      ) : (
                        <AlertTriangle size={12} className="text-orange-500" />
                      )}
                      <span className="text-gray-700">{detail.room}</span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {detail.actualZone}
                      {!detail.compliant && (
                        <span className="text-orange-500 ml-1">→ {detail.idealZone}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Conflict Note */}
              <div className="mt-3 p-2 bg-blue-50 rounded-lg">
                <div className="text-[10px] text-blue-700">
                  <strong>Note:</strong> In case of conflict between Vastu and NBC Safety
                  (e.g., fire ventilation requirements), NBC Safety takes priority.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fire Safety Section */}
      {(fireErrors.length > 0 || fireWarnings.length > 0 || fireInfo.length > 0) && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
            onClick={() => setExpandFire(!expandFire)}
          >
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-orange-500" />
              <span className="font-semibold text-sm text-gray-800">
                Fire Safety ({fireErrors.length + fireWarnings.length} issues, {fireInfo.length} advisories)
              </span>
            </div>
            {expandFire ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandFire && (
            <div className="px-3 pb-3 space-y-2">
              {fireErrors.map((issue, idx) => (
                <div key={`fe-${idx}`} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                  <XCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-red-700">{issue.room}</div>
                    <div className="text-[11px] text-red-600">{issue.issue}</div>
                  </div>
                </div>
              ))}
              {fireWarnings.map((issue, idx) => (
                <div key={`fw-${idx}`} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-amber-700">{issue.room}</div>
                    <div className="text-[11px] text-amber-600">{issue.issue}</div>
                  </div>
                </div>
              ))}
              {fireInfo.map((issue, idx) => (
                <div key={`fi-${idx}`} className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                  <Info size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-blue-700">{issue.room}</div>
                    <div className="text-[11px] text-blue-600">{issue.issue}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BIM Export Note */}
      <div className="text-[10px] text-gray-400 text-center">
        Wall weights: 0.50mm external, 0.25mm internal • NBC 2016 Part 3 &amp; 4 • IS 456:2000
      </div>
    </div>
  );
};
