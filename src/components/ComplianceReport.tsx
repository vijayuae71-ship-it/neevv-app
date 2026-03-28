'use client';

import React, { useState } from 'react';
import { Layout } from '../types';
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
}

export const ComplianceReport: React.FC<Props> = ({ layout, vastuEnabled, onAutoFix }) => {
  const [expandNBC, setExpandNBC] = useState(false);
  const [expandVastu, setExpandVastu] = useState(false);
  const [expandFire, setExpandFire] = useState(false);
  const [fixing, setFixing] = useState(false);

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

      {/* Auto-Fix CTA Button */}
      {onAutoFix && (nbcErrors.length > 0 || nbcWarnings.length > 0 || (vastuEnabled && layout.vastuScore < 90)) && (
        <button
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
          onClick={() => {
            setFixing(true);
            setTimeout(() => {
              onAutoFix(layout);
              setFixing(false);
            }, 100);
          }}
          disabled={fixing}
        >
          {fixing ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Optimizing Layout...</span>
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
        Wall weights: 0.50mm external, 0.25mm internal • NBC 2016 Part 3 & 4 • IS 456:2000
      </div>
    </div>
  );
};
