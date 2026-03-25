import { useState, useEffect } from 'react';
import { fetchFixtureGeometry, fetchPartGeometry } from '../lib/api';
import type { PartFeatures } from '../types';

interface FixtureGeometryResult {
  gltfUrl: string | null;
  version: number | null;
  partFeatures: PartFeatures | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFixtureGeometry(projectId: string | undefined): FixtureGeometryResult {
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [partFeatures, setPartFeatures] = useState<PartFeatures | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchFixtureGeometry(projectId),
      fetchPartGeometry(projectId),
    ])
      .then(([fixture, part]) => {
        if (fixture && typeof fixture === 'object') {
          const f = fixture as { gltf_url?: string; version?: number };
          setGltfUrl(f.gltf_url ?? null);
          setVersion(f.version ?? null);
        }
        if (part && typeof part === 'object') {
          const p = part as { features_json?: PartFeatures };
          setPartFeatures(p.features_json ?? null);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId, tick]);

  const refetch = () => setTick((t) => t + 1);

  return { gltfUrl, version, partFeatures, loading, error, refetch };
}
