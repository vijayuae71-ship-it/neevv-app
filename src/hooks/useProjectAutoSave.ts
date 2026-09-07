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
}

interface UseProjectAutoSaveResult {
  projectId: string | null;
  saving: boolean;
  lastSaved: Date | null;
  saveNow: () => Promise<void>;
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
  const { mode, step, requirements, selectedLayout, boq, drawingsGenerated } = args;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const projectIdRef = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef(args);
  latestArgsRef.current = args;

  const hasMeaningfulData = useCallback((a: UseProjectAutoSaveArgs) => {
    return Boolean(a.requirements || a.selectedLayout);
  }, []);

  const performSave = useCallback(async () => {
    const current = latestArgsRef.current;
    if (!hasMeaningfulData(current)) return;

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
      if (data?.success && data?.projectId) {
        projectIdRef.current = data.projectId;
        setProjectId(data.projectId);
      }
      setLastSaved(new Date());
    } catch (err) {
      // Swallow errors — auto-save should never interrupt the user's flow.
      // The next debounced attempt (or manual saveNow) will retry.
      console.error('[useProjectAutoSave] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [hasMeaningfulData]);

  const saveNow = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    await performSave();
  }, [performSave]);

  // Debounced auto-save whenever tracked data changes.
  useEffect(() => {
    if (!hasMeaningfulData({ mode, step, requirements, selectedLayout, boq, drawingsGenerated })) {
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

  return { projectId, saving, lastSaved, saveNow };
}

export default useProjectAutoSave;
