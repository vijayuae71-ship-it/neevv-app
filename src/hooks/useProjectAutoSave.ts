'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { authFetch } from '@/utils/authFetch';
import { Layout, ProjectRequirements, BOQ } from '@/types';

const DEBOUNCE_MS = 3000;

interface UseProjectAutoSaveArgs {
  mode: string;
  step?: string;
  requirements?: ProjectRequirements;
  selectedLayout?: Layout;
  boq?: BOQ;
  drawingsGenerated?: number;
  generatedDrawingTypes?: string[];
}

interface UseProjectAutoSaveResult {
  projectId: string | null;
  saving: boolean;
  lastSaved: Date | null;
  saveNow: () => Promise<void>;
  /** Point auto-save at an existing cloud project (e.g. opened from My Projects). */
  setCloudProjectId: (id: string | null) => void;
  /** Forget the current cloud project so the next save creates a new one. */
  resetCloudProject: () => void;
}

const CLOUD_ID_KEY = 'neevv_cloud_project_id';

interface StoredCloudId { id: string; key: string }

/** Identity of the work in progress: same mode + same name (plot/floors) = same project. */
function projectKey(a: UseProjectAutoSaveArgs): string {
  return `${a.mode}|${generateProjectName(a)}`;
}
function readStoredId(): StoredCloudId | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(CLOUD_ID_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.id === 'string' && typeof v.key === 'string' ? v : null;
  } catch { return null; }
}
function writeStoredId(v: StoredCloudId | null) {
  try {
    if (typeof window === 'undefined') return;
    if (v) window.localStorage.setItem(CLOUD_ID_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(CLOUD_ID_KEY);
  } catch { /* storage unavailable */ }
}

/**
 * Strip fields that shouldn't be persisted to Firestore (e.g. large base64
 * image payloads) from a Layout object before saving.
 */
function stripLayoutForSave(layout: Layout | undefined | null): Layout | undefined {
  if (!layout) return undefined;
  const { imageDataUri, ...rest } = layout as Layout & { imageDataUri?: string };
  return rest as Layout;
}

/**
 * Build a human-friendly project name from the current project data, e.g.
 * "30×40 G+1 Home" for a new build, or "Living Room 15×12" for a room design.
 */
function generateProjectName(args: UseProjectAutoSaveArgs): string {
  const { mode, requirements, selectedLayout } = args;

  const width = requirements?.plotWidthFt ?? selectedLayout?.plotWidthM;
  const depth = requirements?.plotDepthFt ?? selectedLayout?.plotDepthM;
  const floors = requirements?.floors ?? selectedLayout?.floors;

  const floorsLabel = (() => {
    if (floors === undefined || floors === null) return '';
    if (typeof floors === 'number') {
      if (floors <= 1) return 'G';
      return `G+${floors - 1}`;
    }
    return String(floors);
  })();

  const dimsLabel = width && depth ? `${width}×${depth}` : '';

  switch (mode) {
    case 'new_build':
      return [dimsLabel, floorsLabel, 'Home'].filter(Boolean).join(' ') || 'New Home Project';
    case 'interior_only':
      return [dimsLabel, 'Interior Design'].filter(Boolean).join(' ') || 'Interior Design Project';
    case 'office_design':
      return [dimsLabel, 'Office Design'].filter(Boolean).join(' ') || 'Office Design Project';
    case 'room_design':
      return dimsLabel ? `Room ${dimsLabel}` : 'Room Design Project';
    default:
      return 'Untitled Project';
  }
}

export function useProjectAutoSave(args: UseProjectAutoSaveArgs): UseProjectAutoSaveResult {
  const { mode, step, requirements, selectedLayout, boq, drawingsGenerated, generatedDrawingTypes } = args;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const projectIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);

  const setCloudProjectId = useCallback((id: string | null) => {
    generationRef.current += 1;
    projectIdRef.current = id;
    setProjectId(id);
    writeStoredId(id ? { id, key: projectKey(latestArgsRef.current) } : null);
  }, []);

  const resetCloudProject = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pendingRef.current = false;
    generationRef.current += 1;
    projectIdRef.current = null;
    setProjectId(null);
    writeStoredId(null);
  }, []);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef(args);
  const performSaveRef = useRef<(() => Promise<void>) | null>(null);
  latestArgsRef.current = args;

  const hasMeaningfulData = useCallback((a: UseProjectAutoSaveArgs) => {
    return Boolean(a.requirements || a.selectedLayout);
  }, []);

  const performSave = useCallback(async (): Promise<void> => {
    const current = latestArgsRef.current;
    if (!hasMeaningfulData(current)) return;

    // Serialize saves: a second save while the first (which may be creating the
    // document) is in flight would otherwise create a duplicate project.
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const generation = generationRef.current;

    // After a page reload, keep updating the same cloud project instead of creating a new one.
    if (!projectIdRef.current) {
      const stored = readStoredId();
      if (stored && stored.key === projectKey(current)) {
        projectIdRef.current = stored.id;
        setProjectId(stored.id);
      }
    }

    setSaving(true);
    try {
      const projectData = {
        name: generateProjectName(current),
        mode: current.mode,
        step: current.step,
        requirements: current.requirements,
        selectedLayout: stripLayoutForSave(current.selectedLayout),
        boq: current.boq,
        drawingsGenerated: current.drawingsGenerated ?? 0,
        generatedDrawingTypes: current.generatedDrawingTypes ?? [],
      };

      const res = await authFetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectData,
          projectId: projectIdRef.current || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Auto-save failed (${res.status})`);

      const data = await res.json();
      // Ignore the id if the user started a new project / opened another one meanwhile.
      if (data?.success && data?.projectId && generation === generationRef.current) {
        projectIdRef.current = data.projectId;
        setProjectId(data.projectId);
        writeStoredId({ id: data.projectId, key: projectKey(current) });
      }
      setLastSaved(new Date());
    } catch (err) {
      // Swallow errors — auto-save should never interrupt the user's flow.
      // The next debounced attempt (or manual saveNow) will retry.
      console.error('[useProjectAutoSave] save failed:', err);
    } finally {
      setSaving(false);
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void performSaveRef.current?.();
      }
    }
  }, [hasMeaningfulData]);
  performSaveRef.current = performSave;

  const saveNow = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    await performSave();
  }, [performSave]);

  // Debounced auto-save whenever tracked data changes.
  useEffect(() => {
    if (!hasMeaningfulData({ mode, step, requirements, selectedLayout, boq, drawingsGenerated, generatedDrawingTypes })) {
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    step,
    requirements,
    selectedLayout,
    boq,
    drawingsGenerated,
    generatedDrawingTypes,
    hasMeaningfulData,
    performSave,
  ]);

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        performSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { projectId, saving, lastSaved, saveNow, setCloudProjectId, resetCloudProject };
}

export default useProjectAutoSave;
