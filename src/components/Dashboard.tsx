'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/utils/authFetch';
import { Layout, ProjectRequirements, BOQ } from '@/types';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';
import {
  Home,
  Building2,
  Palette,
  Boxes,
  Plus,
  FolderOpen,
  Download,
  Trash2,
  Clock,
  MapPin,
  Layers,
  ArrowRight,
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const BRAND_GREEN = '#4f6f52';
const BRAND_ORANGE = '#e8734a';

export interface SavedProject {
  id: string;
  name: string;
  mode: string; // 'new_build' | 'interior_only' | 'office_design' | 'room_design'
  requirements?: ProjectRequirements;
  selectedLayout?: Layout;
  boq?: BOQ;
  drawingsGenerated?: number;
  generatedDrawingTypes?: string[]; // list of drawing type keys that were generated
  step?: string;
  createdAt: string;
  updatedAt: string;
}

interface DashboardProps {
  onNewProject: () => void;
  onOpenProject: (project: SavedProject) => void;
}

// ---------- drawing type label map ----------

const DRAWING_TYPE_LABELS: { [key: string]: string } = {
  floor_plan: 'Floor Plan',
  elevation: 'Front Elevation',
  section: 'Section Drawing',
  excavation: 'Excavation',
  foundation: 'Foundation',
  footing_detail: 'Footing Detail',
  rcc_layout: 'RCC Layout',
  structural_layout: 'Structural Layout',
  column_detail: 'Column Detail',
  bbs: 'Bar Bending Schedule',
  staircase: 'Staircase Detail',
  water_tank: 'Water Tank',
  waterproofing: 'Waterproofing',
  stp: 'STP Detail',
  electrical: 'Electrical Layout',
  plumbing: 'Plumbing Layout',
  tiling: 'Tiling Layout',
  brickwork: 'Brickwork Layout',
  furniture_layout: 'Furniture Layout',
  false_ceiling: 'False Ceiling',
  electrical_interior: 'Electrical Interior',
  woodwork_detail: 'Woodwork Details',
  flooring_layout: 'Flooring Layout',
};

function getDrawingTypeLabel(key: string): string {
  return DRAWING_TYPE_LABELS[key] || key;
}

// ---------- formatting helpers ----------

function formatINR(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

function formatINRShort(amount: number): string {
  if (amount >= 10000000) {
    // crore
    return '₹' + (amount / 10000000).toFixed(2).replace(/\.00$/, '') + 'Cr';
  }
  if (amount >= 100000) {
    // lakh
    return '₹' + (amount / 100000).toFixed(2).replace(/\.00$/, '') + 'L';
  }
  if (amount >= 1000) {
    return formatINR(amount);
  }
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

function formatRelativeDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  const isSameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: isSameYear ? undefined : 'numeric',
  });
}

function getProjectIcon(mode: string) {
  switch (mode) {
    case 'new_build':
      return Home;
    case 'interior_only':
      return Palette;
    case 'office_design':
      return Building2;
    case 'room_design':
      return Boxes;
    default:
      return Home;
  }
}

function getProjectTypeLabel(mode: string): string {
  switch (mode) {
    case 'new_build':
      return 'Residential Home';
    case 'interior_only':
      return 'Interior Design';
    case 'office_design':
      return 'Office Design';
    case 'room_design':
      return 'Room Design';
    default:
      return 'Project';
  }
}

function getStatus(project: SavedProject): { label: string; color: string; bg: string } {
  const drawings = project.drawingsGenerated || 0;
  if (drawings > 0) {
    return { label: 'Drawings Done', color: '#1e7d4d', bg: '#e6f6ec' };
  }
  if (project.selectedLayout) {
    return { label: 'Layout Selected', color: '#8a5a00', bg: '#fff4e0' };
  }
  return { label: 'In Progress', color: '#555', bg: '#f0f0f0' };
}

function getDimensionsLabel(project: SavedProject): string {
  if (project.requirements) {
    const w = project.requirements.plotWidthFt;
    const d = project.requirements.plotDepthFt;
    if (w && d) return `${w}×${d} ft`;
  }
  if (project.selectedLayout) {
    const w = project.selectedLayout.plotWidthM;
    const d = project.selectedLayout.plotDepthM;
    if (w && d) return `${w}m × ${d}m`;
  }
  return '—';
}

function formatFloorSummary(floor: ProjectRequirements['floors'][number]): string {
  const parts: string[] = [];
  if (floor.bedrooms > 0) {
    parts.push(`${floor.bedrooms}BHK`);
  }
  if (floor.kitchens > 0) {
    parts.push(floor.kitchens > 1 ? `${floor.kitchens} Kitchens` : 'Kitchen');
  }
  if (floor.halls > 0) {
    parts.push(floor.halls > 1 ? `${floor.halls} Halls` : 'Hall');
  }
  if (floor.hasDining) {
    parts.push('Dining');
  }
  if (floor.hasPuja) {
    parts.push('Puja');
  }
  return parts.length > 0 ? parts.join(' + ') : 'No rooms specified';
}

function formatBudgetLabel(budget: string): string {
  return budget.charAt(0).toUpperCase() + budget.slice(1);
}

function formatStyleLabel(style: string): string {
  return style
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------- component ----------

export function Dashboard({ onNewProject, onOpenProject }: DashboardProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/save-project', { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = useCallback(async (projectId: string) => {
    setDeletingId(projectId);
    try {
      const res = await authFetch('/api/save-project', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      alert('Could not delete project. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }, []);

  const handleDownloadZip = useCallback((project: SavedProject) => {
    // Placeholder — ZIP export of drawings will be implemented later.
    alert(`Download ZIP for "${project.name}" is coming soon.`);
  }, []);

  const toggleExpanded = useCallback((projectId: string) => {
    setExpandedId((prev) => (prev === projectId ? null : projectId));
  }, []);

  // ---------- derived stats ----------

  const totalProjects = projects.length;
  const totalDrawings = projects.reduce((sum, p) => sum + (p.drawingsGenerated || 0), 0);
  const totalCost = projects.reduce((sum, p) => sum + (p.boq?.totalCost || 0), 0);
  const lastUpdated = projects.reduce<string | null>((latest, p) => {
    if (!p.updatedAt) return latest;
    if (!latest) return p.updatedAt;
    return new Date(p.updatedAt).getTime() > new Date(latest).getTime() ? p.updatedAt : latest;
  }, null);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <img src={BRAND_LOGO_BASE64} alt="neevv" style={styles.logo} />
        </div>
        <div style={styles.headerCenter}>
          <LayoutDashboard size={22} color={BRAND_GREEN} />
          <h1 style={styles.title}>My Projects</h1>
        </div>
        <button style={styles.newProjectBtn} onClick={onNewProject}>
          <Plus size={18} />
          New Project
        </button>
      </div>

      <div style={styles.content}>
        {/* Overview stats */}
        <div style={styles.statsRow}>
          <StatCard icon={<FolderOpen size={20} color={BRAND_GREEN} />} label="Total Projects" value={String(totalProjects)} />
          <StatCard icon={<Layers size={20} color={BRAND_GREEN} />} label="Total Drawings Generated" value={String(totalDrawings)} />
          <StatCard icon={<span style={{ fontWeight: 700, color: BRAND_GREEN, fontSize: 18 }}>₹</span>} label="Total Est. Cost" value={formatINRShort(totalCost)} />
          <StatCard icon={<Clock size={20} color={BRAND_GREEN} />} label="Last Updated" value={lastUpdated ? formatRelativeDate(lastUpdated) : '—'} />
        </div>

        {/* Error state */}
        {error && (
          <div style={styles.errorBox}>
            <p style={{ margin: 0 }}>{error}</p>
            <button style={styles.retryBtn} onClick={fetchProjects}>
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={styles.grid}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIconCircle}>
              <Home size={40} color={BRAND_GREEN} />
            </div>
            <h2 style={styles.emptyTitle}>No projects yet</h2>
            <p style={styles.emptyText}>
              Start designing your first home, interior, office, or room layout and it will show up here automatically.
            </p>
            <button style={styles.newProjectBtnLarge} onClick={onNewProject}>
              <Plus size={18} />
              Create Your First Project
            </button>
          </div>
        )}

        {/* Project cards */}
        {!loading && !error && projects.length > 0 && (
          <div style={styles.grid}>
            {projects.map((project) => {
              const Icon = getProjectIcon(project.mode);
              const status = getStatus(project);
              const drawings = project.drawingsGenerated || 0;
              const boqTotal = project.boq?.totalCost;
              const isExpanded = expandedId === project.id;
              const hasRequirements = !!project.requirements;
              const hasLayout = !!project.selectedLayout;
              const hasDrawingTypes = !!(project.generatedDrawingTypes && project.generatedDrawingTypes.length > 0);
              const hasBOQ = !!project.boq;
              const hasDetails = hasRequirements || hasLayout || hasDrawingTypes || hasBOQ;

              return (
                <div key={project.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={styles.iconCircle}>
                      <Icon size={22} color={BRAND_GREEN} />
                    </div>
                    <span style={{ ...styles.statusBadge, color: status.color, backgroundColor: status.bg }}>
                      {status.label}
                    </span>
                  </div>

                  <h3 style={styles.cardTitle}>{project.name}</h3>
                  <p style={styles.cardSubtitle}>{getProjectTypeLabel(project.mode)}</p>

                  <div style={styles.cardMetaRow}>
                    <MapPin size={14} color="#888" />
                    <span style={styles.cardMetaText}>{getDimensionsLabel(project)}</span>
                  </div>

                  <div style={styles.cardMetaRow}>
                    <Layers size={14} color="#888" />
                    <span style={styles.cardMetaText}>
                      {drawings} drawing{drawings === 1 ? '' : 's'} generated
                    </span>
                  </div>

                  {boqTotal !== undefined && boqTotal !== null && (
                    <div style={styles.cardMetaRow}>
                      <span style={{ fontWeight: 700, color: BRAND_GREEN, fontSize: 13, width: 14, textAlign: 'center' }}>₹</span>
                      <span style={styles.cardMetaText}>Est. cost: {formatINRShort(boqTotal)}</span>
                    </div>
                  )}

                  <div style={styles.cardMetaRow}>
                    <Clock size={14} color="#888" />
                    <span style={styles.cardMetaText}>{formatRelativeDate(project.createdAt)}</span>
                  </div>

                  {/* View Details toggle */}
                  {hasDetails && (
                    <button style={styles.detailsToggleBtn} onClick={() => toggleExpanded(project.id)}>
                      {isExpanded ? 'Hide Details' : 'View Details'}
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}

                  {/* Expanded details section */}
                  {isExpanded && hasDetails && (
                    <div style={styles.detailsSection}>
                      {hasRequirements && project.requirements && (
                        <div style={styles.detailsBlock}>
                          <h4 style={styles.detailsBlockTitle}>Requirements</h4>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Plot:</span>
                            <span style={styles.detailsValue}>
                              {project.requirements.plotWidthFt} × {project.requirements.plotDepthFt} ft
                            </span>
                          </div>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Facing:</span>
                            <span style={styles.detailsValue}>{project.requirements.facing}</span>
                          </div>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Budget:</span>
                            <span style={styles.detailsValue}>{formatBudgetLabel(project.requirements.budget)}</span>
                          </div>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Style:</span>
                            <span style={styles.detailsValue}>{formatStyleLabel(project.requirements.architecturalStyle)}</span>
                          </div>
                          {project.requirements.floors && project.requirements.floors.length > 0 && (
                            <div style={styles.detailsFloorsWrap}>
                              <span style={styles.detailsLabel}>Floors:</span>
                              <ul style={styles.detailsFloorsList}>
                                {project.requirements.floors.map((floor, idx) => (
                                  <li key={idx} style={styles.detailsFloorsItem}>
                                    <strong>{floor.floorLabel}:</strong> {formatFloorSummary(floor)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {hasLayout && project.selectedLayout && (
                        <div style={styles.detailsBlock}>
                          <h4 style={styles.detailsBlockTitle}>Layout</h4>
                          {project.selectedLayout.buildingWidthMm && project.selectedLayout.buildingDepthMm ? (
                            <div style={styles.detailsRow}>
                              <span style={styles.detailsLabel}>Building footprint:</span>
                              <span style={styles.detailsValue}>
                                {(project.selectedLayout.buildingWidthMm / 1000).toFixed(2)} × {(project.selectedLayout.buildingDepthMm / 1000).toFixed(2)} m
                              </span>
                            </div>
                          ) : (
                            <div style={styles.detailsRow}>
                              <span style={styles.detailsLabel}>Plot:</span>
                              <span style={styles.detailsValue}>
                                {project.selectedLayout.plotWidthM} × {project.selectedLayout.plotDepthM} m
                              </span>
                            </div>
                          )}
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Rooms:</span>
                            <span style={styles.detailsValue}>
                              {project.selectedLayout.floors.reduce((sum, f) => sum + f.rooms.length, 0)}
                            </span>
                          </div>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Columns:</span>
                            <span style={styles.detailsValue}>
                              {project.selectedLayout.floors.reduce((sum, f) => sum + f.columns.length, 0)}
                            </span>
                          </div>
                        </div>
                      )}

                      {hasDrawingTypes && project.generatedDrawingTypes && (
                        <div style={styles.detailsBlock}>
                          <h4 style={styles.detailsBlockTitle}>Drawings</h4>
                          <div style={styles.drawingPillsWrap}>
                            {project.generatedDrawingTypes.map((typeKey) => (
                              <span key={typeKey} style={styles.drawingPill}>
                                {getDrawingTypeLabel(typeKey)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {hasBOQ && project.boq && (
                        <div style={styles.detailsBlock}>
                          <h4 style={styles.detailsBlockTitle}>BOQ Summary</h4>
                          <div style={styles.detailsRow}>
                            <span style={styles.detailsLabel}>Total:</span>
                            <span style={styles.detailsValue}>{formatINR(project.boq.totalCost)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={styles.cardActions}>
                    <button style={styles.openBtn} onClick={() => onOpenProject(project)}>
                      Open
                      <ArrowRight size={14} />
                    </button>
                    <button style={styles.iconBtn} title="Download ZIP" onClick={() => handleDownloadZip(project)}>
                      <Download size={16} color="#555" />
                    </button>
                    <button
                      style={styles.iconBtnDanger}
                      title="Delete project"
                      onClick={() => setConfirmDeleteId(project.id)}
                      disabled={deletingId === project.id}
                    >
                      <Trash2 size={16} color="#c0392b" />
                    </button>
                  </div>

                  {/* Confirm delete overlay */}
                  {confirmDeleteId === project.id && (
                    <div style={styles.confirmOverlay}>
                      <p style={styles.confirmText}>Delete "{project.name}"? This cannot be undone.</p>
                      <div style={styles.confirmActions}>
                        <button style={styles.confirmCancelBtn} onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                        <button
                          style={styles.confirmDeleteBtn}
                          onClick={() => handleDelete(project.id)}
                          disabled={deletingId === project.id}
                        >
                          {deletingId === project.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- subcomponents ----------

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIconCircle}>{icon}</div>
      <div>
        <div style={styles.statValue}>{value}</div>
        <div style={styles.statLabel}>{label}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ ...styles.card, overflow: 'hidden' }}>
      <div style={{ ...styles.skeletonBlock, width: 44, height: 44, borderRadius: '50%', marginBottom: 16 }} />
      <div style={{ ...styles.skeletonBlock, width: '70%', height: 20, marginBottom: 10 }} />
      <div style={{ ...styles.skeletonBlock, width: '40%', height: 14, marginBottom: 20 }} />
      <div style={{ ...styles.skeletonBlock, width: '60%', height: 12, marginBottom: 8 }} />
      <div style={{ ...styles.skeletonBlock, width: '50%', height: 12, marginBottom: 8 }} />
      <div style={{ ...styles.skeletonBlock, width: '45%', height: 12, marginBottom: 20 }} />
      <div style={{ ...styles.skeletonBlock, width: '100%', height: 36, borderRadius: 8 }} />
    </div>
  );
}

// ---------- styles ----------

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 28px',
    borderBottom: '1px solid #eee',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    height: 32,
  },
  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#222',
    margin: 0,
  },
  newProjectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_GREEN,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  newProjectBtnLarge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND_GREEN,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  content: {
    padding: '28px',
    maxWidth: 1280,
    margin: '0 auto',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 28,
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '18px 20px',
    borderRadius: 12,
    border: '1px solid #eee',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    backgroundColor: '#fff',
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    backgroundColor: '#eef4ee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#222',
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fdecea',
    color: '#c0392b',
    border: '1px solid #f5c6c0',
    borderRadius: 8,
    padding: '14px 18px',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
  },
  card: {
    position: 'relative',
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 20,
    backgroundColor: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    backgroundColor: '#eef4ee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#222',
    margin: '0 0 2px 0',
  },
  cardSubtitle: {
    fontSize: 12,
    color: BRAND_ORANGE,
    fontWeight: 600,
    margin: '0 0 14px 0',
  },
  cardMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardMetaText: {
    fontSize: 13,
    color: '#555',
  },
  detailsToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid #ddd',
    backgroundColor: '#fafafa',
    color: BRAND_GREEN,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  detailsSection: {
    marginTop: 8,
    marginBottom: 8,
    padding: '14px',
    borderRadius: 10,
    backgroundColor: '#fafbfa',
    border: '1px solid #eee',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  detailsBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  detailsBlockTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: BRAND_GREEN,
    margin: '0 0 4px 0',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailsRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontSize: 13,
  },
  detailsLabel: {
    color: '#888',
    fontWeight: 600,
    flexShrink: 0,
  },
  detailsValue: {
    color: '#333',
  },
  detailsFloorsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 2,
  },
  detailsFloorsList: {
    margin: '4px 0 0 0',
    padding: '0 0 0 18px',
  },
  detailsFloorsItem: {
    fontSize: 13,
    color: '#333',
    marginBottom: 3,
  },
  drawingPillsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  drawingPill: {
    fontSize: 11,
    fontWeight: 600,
    color: '#1e7d4d',
    backgroundColor: '#e8f5e9',
    padding: '4px 10px',
    borderRadius: 14,
    whiteSpace: 'nowrap',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  openBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND_GREEN,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  iconBtnDanger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid #f5c6c0',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  confirmOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 14,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 14,
    color: '#222',
    marginBottom: 16,
  },
  confirmActions: {
    display: 'flex',
    gap: 10,
  },
  confirmCancelBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  },
  confirmDeleteBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#c0392b',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    backgroundColor: '#eef4ee',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#222',
    margin: '0 0 8px 0',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    maxWidth: 420,
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  skeletonBlock: {
    backgroundColor: '#eee',
    borderRadius: 6,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};

export default Dashboard;
