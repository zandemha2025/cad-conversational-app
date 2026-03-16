/**
 * useProjects — fetches projects from the API, falls back to localStorage-persisted
 * mock data in DEMO MODE.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchProjects, createProject, IS_DEMO } from '../lib/api';
import type { ApiProject } from '../lib/api';
import { mockProjects } from '../data/mockData';
import { getProjects, saveProjects } from '../lib/storage';
import type { Project } from '../types';

function apiToUiProject(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    description: '',
    thumbnail: 'fixture',
    status: (p.status as Project['status']) || 'draft',
    category: 'fixture',
    updatedAt: new Date(p.updated_at).toLocaleDateString(),
    createdAt: p.created_at,
    parts: 0,
    assemblies: 0,
    drawings: 0,
    collaborators: [],
    tags: [],
    revision: p.revision ?? undefined,
    partNumber: p.part_number ?? undefined,
  };
}

function storedToUiProject(p: ReturnType<typeof getProjects>[number]): Project {
  return {
    id: p.id,
    name: p.name,
    description: '',
    thumbnail: 'fixture',
    status: (p.status as Project['status']) || 'draft',
    category: 'fixture',
    updatedAt: new Date(p.updated_at).toLocaleDateString(),
    createdAt: p.created_at,
    parts: 0,
    assemblies: 0,
    drawings: 0,
    collaborators: [],
    tags: [],
    revision: p.revision ?? undefined,
    partNumber: p.part_number ?? undefined,
  };
}

function uiToStoredProject(p: Project): ReturnType<typeof getProjects>[number] {
  return {
    id: p.id,
    name: p.name,
    part_number: p.partNumber ?? null,
    revision: p.revision ?? null,
    template_id: null,
    gdt_standard: null,
    quality_standard: null,
    status: p.status,
    environment_json: null,
    printer_profile_json: null,
    created_at: p.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export function useProjects(searchQuery?: string) {
  const [projects, setProjects] = useState<Project[]>(() => {
    if (IS_DEMO) {
      const stored = getProjects();
      if (stored.length > 0) return stored.map(storedToUiProject);
      // First launch — seed with mock data
      saveProjects(mockProjects.map(uiToStoredProject));
      return mockProjects;
    }
    return [];
  });
  const [loading, setLoading]   = useState(!IS_DEMO);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (IS_DEMO) {
      const stored = getProjects();
      let all = stored.length > 0 ? stored.map(storedToUiProject) : mockProjects;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        all = all.filter(p => p.name.toLowerCase().includes(q));
      }
      setProjects(all);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProjects(searchQuery);
      if (data) {
        setProjects(data.map(apiToUiProject));
      } else {
        setProjects([]);
      }
    } catch {
      setError('Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { load(); }, [load]);

  const addProject = async (body: {
    name: string;
    partNumber?: string;
    revision?: string;
    templateId?: string;
    gdtStandard?: string;
    qualityStandard?: string;
    environment?: Record<string, unknown>;
    printerProfile?: Record<string, unknown>;
  }) => {
    if (IS_DEMO) {
      const newProject: Project = {
        id: `demo_${Date.now()}`,
        name: body.name,
        description: '',
        thumbnail: 'fixture',
        status: 'draft',
        category: 'fixture',
        updatedAt: 'just now',
        createdAt: new Date().toISOString(),
        parts: 0,
        assemblies: 0,
        drawings: 0,
        collaborators: [],
        tags: [],
        revision: body.revision,
        partNumber: body.partNumber,
      };
      setProjects(prev => {
        const next = [newProject, ...prev];
        saveProjects(next.map(uiToStoredProject));
        return next;
      });
      return newProject.id;
    }

    const created = await createProject({
      name: body.name,
      part_number: body.partNumber,
      revision: body.revision,
      template_id: body.templateId,
      gdt_standard: body.gdtStandard,
      quality_standard: body.qualityStandard,
    });

    if (created) {
      setProjects(prev => [apiToUiProject(created), ...prev]);
      return created.id;
    }
    return null;
  };

  const deleteProject = (id: string) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      if (IS_DEMO) saveProjects(next.map(uiToStoredProject));
      return next;
    });
  };

  return { projects, loading, error, reload: load, addProject, deleteProject };
}
