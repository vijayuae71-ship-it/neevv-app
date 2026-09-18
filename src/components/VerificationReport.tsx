'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Layout, ProjectRequirements, BOQ } from '../types';
import {
  runVerification,
  VerificationReport as VReport,
  CategoryResult,
  VerificationIssue,
  IssueSeverity,
  ProjectStatus,
  VerificationCategory,
} from '../utils/verificationEngine';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  CheckCircle2, AlertTriangle, XCircle, Ban,
  ChevronDown, ChevronRight,
  FileText, Layers, Columns3, Zap, Droplets, Eye, ClipboardCheck,
  RefreshCw, Building, Ruler, Download, Info,
  Home, BarChart3, Grid3x3,
} from 'lucide-react';

/* =============================================================================
 * PROPS
 * ========================================================================== */

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
  boq: BOQ | null;
  generatedDrawingTypes: string[];
}

/* =============================================================================
 * STATIC LOOKUPS — brand colors, icon maps, status styling
 * ========================================================================== */

const BRAND_GREEN = '#4f6f52';
const BRAND_ORANGE = '#e8853d';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

const CATEGORY_ICONS: Record<VerificationCategory, IconType> = {
  locked_design_validation: Home,
  architectural_validation: Building,
  structural_validation: Columns3,
  electrical_validation: Zap,
  plumbing_validation: Droplets,
  elevation_section_validation: Layers,
  boq_validation: BarChart3,
  cross_discipline_coordination: Grid3x3,
  visual_qa: Eye,
};

const CATEGORY_LABELS: Record<VerificationCategory, string> = {
  locked_design_validation: 'Locked Design Validation',
  architectural_validation: 'Architectural Drawing Validation',
  structural_validation: 'Structural Drawing Validation',
  electrical_validation: 'Electrical Drawing Validation',
  plumbing_validation: 'Plumbing Drawing Validation',
  elevation_section_validation: 'Elevation & Section Validation',
  boq_validation: 'BOQ & Quantity Validation',
  cross_discipline_coordination: 'Cross-Discipline Coordination',
  visual_qa: 'Visual QA & Export Readiness',
};

const SEVERITY_ICONS: Record<IssueSeverity, IconType> = {
  PASS: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: XCircle,
  BLOCKED: Ban,
};

type StatusKey = IssueSeverity | ProjectStatus;

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_STYLES: Record<StatusKey, StatusStyle> = {
  PASS: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-500', dot: 'bg-emerald-500' },
  VERIFIED_INTERNALLY: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-500', dot: 'bg-emerald-500' },
  WARNING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-500', dot: 'bg-amber-500' },
  REVIEW_REQUIRED: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-500', dot: 'bg-amber-500' },
  ERROR: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-500', dot: 'bg-red-500' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-700', dot: 'bg-red-700' },
  DRAFT: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-400', dot: 'bg-gray-400' },
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  VERIFIED_INTERNALLY: 'Verified Internally',
  REVIEW_REQUIRED: 'Review Required',
  BLOCKED: 'Blocked',
};

const STATUS_ICONS: Record<ProjectStatus, IconType> = {
  DRAFT: Shield,
  VERIFIED_INTERNALLY: ShieldCheck,
  REVIEW_REQUIRED: ShieldAlert,
  BLOCKED: ShieldX,
};

const STAT_COLORS = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', icon: 'text-blue-600', text: 'text-blue-900' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'text-emerald-600', text: 'text-emerald-900' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'text-amber-600', text: 'text-amber-900' },
  red: { bg: 'bg-red-50', border: 'border-red-100', icon: 'text-red-600', text: 'text-red-900' },
} as const;

/* =============================================================================
 * HELPERS
 * ========================================================================== */

function truncateHash(hash: string, len = 8): string {
  if (!hash) return '—';
  return hash.length > len ? hash.slice(0, len) : hash;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function buildReportText(report: VReport): string {
  const lines: string[] = [];
  lines.push('='.repeat(78));
  lines.push(`DRAWING VALIDATION & COORDINATION REPORT`);
  lines.push(`Project: ${report.projectName}`);
  lines.push('='.repeat(78));
  lines.push('');
  lines.push(`Overall Status: ${report.overallStatus}`);
  lines.push(`Validated: ${formatTimestamp(report.revision.validationTimestamp)}`);
  lines.push(`Locked Design Revision: ${report.revision.lockedDesignRevision}`);
  lines.push(`Drawing Revision: ${report.revision.drawingRevision}`);
  lines.push(`Project Revision: ${report.revision.projectRevision}`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push(`Total Checks: ${report.totalChecks}  |  Passed: ${report.passCount}  |  Warnings: ${report.warningCount}  |  Errors: ${report.errorCount}  |  Blocked: ${report.blockedCount}`);
  lines.push('');
  lines.push(report.internalVerificationNote);
  lines.push(report.professionalReviewNote);
  lines.push('');

  report.categories.forEach((cat) => {
    lines.push('-'.repeat(78));
    lines.push(`${CATEGORY_LABELS[cat.category] || cat.label}  [${cat.status}]`);
    lines.push(cat.description);
    lines.push(`Checks performed: ${cat.checksPerformed}  |  Pass: ${cat.passCount}  |  Warning: ${cat.warningCount}  |  Error: ${cat.errorCount}  |  Blocked: ${cat.blockedCount}`);
    lines.push('');
    if (cat.issues.length === 0) {
      lines.push('  All checks passed. No issues found.');
    } else {
      cat.issues.forEach((issue) => {
        lines.push(`  [${issue.severity}] ${issue.id} — ${issue.title}`);
        lines.push(`    Explanation: ${issue.explanation}`);
        lines.push(`    Affected Drawing: ${issue.affectedDrawing}`);
        lines.push(`    Affected Object: ${issue.affectedObject}`);
        lines.push(`    Expected Value: ${issue.expectedValue}`);
        lines.push(`    Generated Value: ${issue.generatedValue}`);
        lines.push(`    Suggested Correction: ${issue.suggestedCorrection}`);
        lines.push('');
      });
    }
    lines.push('');
  });

  lines.push('='.repeat(78));
  lines.push('AUTOMATED VERIFICATION ONLY');
  lines.push(report.disclaimer);
  lines.push('='.repeat(78));

  return lines.join('\n');
}

/* =============================================================================
 * SUBCOMPONENTS
 * ========================================================================== */

const StatCard: React.FC<{
  icon: IconType;
  color: keyof typeof STAT_COLORS;
  label: string;
  value: number;
}> = ({ icon: Icon, color, label, value }) => {
  const c = STAT_COLORS[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 flex items-center gap-3`}>
      <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-white/70`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className={`text-2xl font-bold leading-tight ${c.text}`}>{value}</div>
        <div className="text-xs text-gray-500 font-medium truncate">{label}</div>
      </div>
    </div>
  );
};

const SeverityBadge: React.FC<{ severity: IssueSeverity; small?: boolean }> = ({ severity, small }) => {
  const style = STATUS_STYLES[severity];
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wide ${style.bg} ${style.text} ${style.border} ${
        small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon size={small ? 11 : 12} />
      {severity}
    </span>
  );
};

const CountPill: React.FC<{ count: number; label: string; colorClasses: string }> = ({ count, label, colorClasses }) => {
  if (count <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorClasses}`}>
      {count} {label}
    </span>
  );
};

const IssueCard: React.FC<{
  issue: VerificationIssue;
  expanded: boolean;
  onToggle: () => void;
}> = ({ issue, expanded, onToggle }) => {
  const style = STATUS_STYLES[issue.severity];
  const valuesDiffer = issue.generatedValue !== issue.expectedValue;

  return (
    <div className={`rounded-lg border border-gray-200 border-l-4 ${style.border} bg-white overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start sm:items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <span className="font-mono text-[11px] text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0">{issue.id}</span>
          <span className="font-semibold text-sm text-gray-900 break-words">{issue.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeverityBadge severity={issue.severity} small />
          {expanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-0 border-t border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed mt-3 mb-3">{issue.explanation}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="text-gray-400 uppercase tracking-wide text-[10px] font-bold mb-1">Affected Drawing</div>
                <div className="text-gray-800 font-medium break-words">{issue.affectedDrawing}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="text-gray-400 uppercase tracking-wide text-[10px] font-bold mb-1">Affected Object</div>
                <div className="text-gray-800 font-medium break-words">{issue.affectedObject}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <div className="text-emerald-600 uppercase tracking-wide text-[10px] font-bold mb-1">Expected Value</div>
                <div className="text-emerald-800 font-medium break-words">{issue.expectedValue}</div>
              </div>
              <div
                className={`rounded-lg p-2.5 border ${
                  valuesDiffer ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div
                  className={`uppercase tracking-wide text-[10px] font-bold mb-1 ${
                    valuesDiffer ? 'text-red-600' : 'text-gray-400'
                  }`}
                >
                  Generated Value
                </div>
                <div className={`font-medium break-words ${valuesDiffer ? 'text-red-800' : 'text-gray-700'}`}>
                  {issue.generatedValue}
                </div>
              </div>
              <div className="sm:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="text-blue-600 uppercase tracking-wide text-[10px] font-bold mb-1">Suggested Correction</div>
                <div className="text-blue-800 font-medium break-words">{issue.suggestedCorrection}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CategoryAccordionItem: React.FC<{
  category: CategoryResult;
  expanded: boolean;
  onToggleCategory: () => void;
  expandedIssueIds: Set<string>;
  onToggleIssue: (id: string) => void;
}> = ({ category, expanded, onToggleCategory, expandedIssueIds, onToggleIssue }) => {
  const Icon = CATEGORY_ICONS[category.category] || FileText;
  const style = STATUS_STYLES[category.status];
  const label = CATEGORY_LABELS[category.category] || category.label;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggleCategory}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl ${style.bg} border ${style.border}`}>
            <Icon size={20} className={style.text} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base text-gray-900 truncate">{label}</div>
            <div className="text-xs text-gray-500 truncate hidden sm:block">{category.description}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden md:flex items-center gap-1.5">
            <CountPill count={category.passCount} label="pass" colorClasses="bg-emerald-50 text-emerald-700" />
            <CountPill count={category.warningCount} label="warn" colorClasses="bg-amber-50 text-amber-700" />
            <CountPill count={category.errorCount} label="error" colorClasses="bg-red-50 text-red-700" />
            <CountPill count={category.blockedCount} label="blocked" colorClasses="bg-red-100 text-red-900" />
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${style.bg} ${style.text} ${style.border}`}
          >
            {category.status}
          </span>
          {expanded ? (
            <ChevronDown size={18} className="text-gray-400" />
          ) : (
            <ChevronRight size={18} className="text-gray-400" />
          )}
        </div>
      </button>

      <p className="px-4 pb-3 -mt-1 text-xs text-gray-500 sm:hidden">{category.description}</p>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5 md:hidden pt-2">
              <CountPill count={category.passCount} label="pass" colorClasses="bg-emerald-50 text-emerald-700" />
              <CountPill count={category.warningCount} label="warn" colorClasses="bg-amber-50 text-amber-700" />
              <CountPill count={category.errorCount} label="error" colorClasses="bg-red-50 text-red-700" />
              <CountPill count={category.blockedCount} label="blocked" colorClasses="bg-red-100 text-red-900" />
            </div>

            {category.issues.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                <span className="text-sm font-medium text-emerald-700">
                  All checks passed — {category.checksPerformed} check{category.checksPerformed === 1 ? '' : 's'} performed, no issues found.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {category.issues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    expanded={expandedIssueIds.has(issue.id)}
                    onToggle={() => onToggleIssue(issue.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
 * MAIN COMPONENT
 * ========================================================================== */

export const VerificationReport: React.FC<Props> = ({ layout, requirements, boq, generatedDrawingTypes }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRerunning, setIsRerunning] = useState(false);

  const report: VReport = useMemo(
    () => runVerification(layout, requirements, boq, generatedDrawingTypes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, requirements, boq, generatedDrawingTypes, refreshKey],
  );

  const [expandedCategories, setExpandedCategories] = useState<Set<VerificationCategory>>(
    () => new Set(report.categories.filter((c) => c.status === 'ERROR' || c.status === 'BLOCKED').map((c) => c.category)),
  );

  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(() => new Set());

  const toggleCategory = useCallback((category: VerificationCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const toggleIssue = useCallback((id: string) => {
    setExpandedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleRerun = useCallback(() => {
    setIsRerunning(true);
    setRefreshKey((k) => k + 1);
    window.setTimeout(() => setIsRerunning(false), 500);
  }, []);

  const handleDownload = useCallback(() => {
    const text = buildReportText(report);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-report-${truncateHash(report.revision.projectRevision, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  const OverallIcon = STATUS_ICONS[report.overallStatus];
  const overallStyle = STATUS_STYLES[report.overallStatus];

  const plotLabel =
    requirements?.plotWidthFt && requirements?.plotDepthFt
      ? `${requirements.plotWidthFt}ft × ${requirements.plotDepthFt}ft`
      : null;

  const internalStatusStyle =
    report.overallStatus === 'VERIFIED_INTERNALLY'
      ? STATUS_STYLES.VERIFIED_INTERNALLY
      : report.overallStatus === 'REVIEW_REQUIRED'
      ? STATUS_STYLES.REVIEW_REQUIRED
      : report.overallStatus === 'BLOCKED'
      ? STATUS_STYLES.BLOCKED
      : STATUS_STYLES.DRAFT;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 p-3 sm:p-5">
      {/* ============================= 1. HEADER ============================= */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-2xl ${overallStyle.bg} border-2 ${overallStyle.border}`}
            >
              <OverallIcon size={28} className={overallStyle.text} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Drawing Validation &amp; Coordination Report</h2>
              </div>
              <div className="flex items-center flex-wrap gap-2 mt-1.5">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${overallStyle.bg} ${overallStyle.text} ${overallStyle.border}`}
                >
                  {STATUS_LABELS[report.overallStatus]}
                </span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Building size={13} />
                  {report.projectName}
                </span>
                {plotLabel && (
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Ruler size={13} />
                    {plotLabel} plot
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">
                Validated {formatTimestamp(report.revision.validationTimestamp)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRerun}
            style={{ backgroundColor: BRAND_GREEN }}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-semibold text-sm shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <RefreshCw size={16} className={isRerunning ? 'animate-spin' : ''} />
            Re-run Verification
          </button>
        </div>
      </div>

      {/* ========================= 2. SUMMARY STATS ROW ========================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={ClipboardCheck} color="blue" label="Total Checks" value={report.totalChecks} />
        <StatCard icon={CheckCircle2} color="emerald" label="Passed" value={report.passCount} />
        <StatCard icon={AlertTriangle} color="amber" label="Warnings" value={report.warningCount} />
        <StatCard icon={XCircle} color="red" label="Errors + Blocked" value={report.errorCount + report.blockedCount} />
      </div>

      {/* ===================== 3. STATUS DISTINCTION BANNER ===================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`rounded-xl border ${internalStatusStyle.border} ${internalStatusStyle.bg} p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className={internalStatusStyle.text} />
            <span className="font-bold text-sm text-gray-900">Internal Verification</span>
            <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold uppercase ${internalStatusStyle.text}`}>
              <span className={`w-2 h-2 rounded-full ${internalStatusStyle.dot}`} />
              {STATUS_LABELS[report.overallStatus]}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{report.internalVerificationNote}</p>
        </div>

        <div className="rounded-xl border border-amber-500 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck size={18} className="text-amber-700" />
            <span className="font-bold text-sm text-gray-900">Professional Review</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Pending
            </span>
          </div>
          <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
            <strong>PENDING</strong> — Architect, structural engineer, and MEP engineer review required before construction use.
          </p>
        </div>
      </div>

      {/* ======================== 4. REVISION TRACKING ======================== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 sm:w-auto flex-shrink-0">
              Locked Design Rev.
            </span>
            <span className="font-mono text-xs sm:text-sm bg-gray-100 text-gray-700 rounded px-2 py-1">
              {truncateHash(report.revision.lockedDesignRevision)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 sm:w-auto flex-shrink-0">
              Drawing Rev.
            </span>
            <span className="font-mono text-xs sm:text-sm bg-gray-100 text-gray-700 rounded px-2 py-1">
              {truncateHash(report.revision.drawingRevision)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-36 sm:w-auto flex-shrink-0">
              Validated
            </span>
            <span className="text-xs sm:text-sm text-gray-700">
              {formatTimestamp(report.revision.validationTimestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* =========================== 5/6. CATEGORY ACCORDION =========================== */}
      <div className="space-y-3">
        {report.categories.map((category) => (
          <CategoryAccordionItem
            key={category.category}
            category={category}
            expanded={expandedCategories.has(category.category)}
            onToggleCategory={() => toggleCategory(category.category)}
            expandedIssueIds={expandedIssueIds}
            onToggleIssue={toggleIssue}
          />
        ))}
      </div>

      {/* Totals footer */}
      <div className="text-center text-sm text-gray-500 font-medium py-1">
        {report.totalChecks} checks performed · {report.passCount} passed · {report.warningCount} warnings ·{' '}
        {report.errorCount + report.blockedCount} errors
      </div>

      {/* ============================ 7. EXPORT BUTTON ============================ */}
      <div className="flex justify-center sm:justify-end">
        <button
          type="button"
          onClick={handleDownload}
          style={{ backgroundColor: BRAND_ORANGE }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Download size={16} />
          Download Report
        </button>
      </div>

      {/* ========================= 8. DISCLAIMER BANNER ========================= */}
      <div className="rounded-xl border-2 border-red-600 bg-red-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-red-100">
            <AlertTriangle size={18} className="text-red-700" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-sm text-red-800 uppercase tracking-wide mb-1.5">
              Automated Verification Only
            </div>
            <p className="text-xs sm:text-sm text-red-800 leading-relaxed mb-2">{report.disclaimer}</p>
            <div className="flex items-start gap-1.5 text-xs sm:text-sm text-red-900 font-semibold">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                This report does not replace review and sign-off by licensed architects, structural engineers, MEP
                engineers, or statutory authorities. All drawings remain preliminary until professionally reviewed and
                approved.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificationReport;
