import { useState, useEffect, useCallback } from 'react';
import { fetchProjects, createProject } from '../lib/api';
import type { ApiProject } from '../lib/api';
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

export function useProjects(searchQuery?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjects(searchQuery);
      setProjects(data ? data.map(apiToUiProject) : []);
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
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  return { projects, loading, error, reload: load, addProject, deleteProject };
}
