import { useState, useEffect, useCallback } from 'react';
import { fetchNodeGraph, IS_DEMO } from '../lib/api';
import type { ApiNodeGraph } from '../types';

interface NodeGraphResult {
  graph: ApiNodeGraph | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useNodeGraph(projectId: string | undefined): NodeGraphResult {
  const [graph, setGraph] = useState<ApiNodeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId || IS_DEMO) return;

    setLoading(true);
    setError(null);

    fetchNodeGraph(projectId)
      .then((data) => {
        if (data) setGraph(data as ApiNodeGraph);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { graph, loading, error, refetch };
}
