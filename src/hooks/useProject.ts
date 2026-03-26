'use client';

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

interface ProjectData {
  name: string;
  requirements: any;
  selectedLayout: any;
  interiorConfig: any;
  renders: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function useProject() {
  const { getIdToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const saveProject = useCallback(async (data: ProjectData) => {
    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/save-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectData: data, projectId }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setProjectId(result.projectId);
      return result.projectId;
    } catch (error) {
      console.error('Save failed:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [getIdToken, projectId]);

  const loadProjects = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return [];

    const response = await fetch('/api/save-project', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json();
    return result.projects || [];
  }, [getIdToken]);

  return { saveProject, loadProjects, saving, projectId, setProjectId };
}
