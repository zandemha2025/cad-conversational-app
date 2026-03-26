import { useState, useEffect, useRef } from 'react';
import { fetchFixtureGeometry, fetchPartGeometry, fetchGlbBlobUrl } from '../lib/api';
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
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchFixtureGeometry(projectId),
      fetchPartGeometry(projectId),
    ])
      .then(async ([fixture, part]) => {
        if (fixture && typeof fixture === 'object') {
          const f = fixture as { gltf_url?: string; version?: number };
          setVersion(f.version ?? null);

          if (f.gltf_url) {
            // Revoke previous blob URL to avoid memory leaks
            if (blobUrlRef.current) {
              URL.revokeObjectURL(blobUrlRef.current);
              blobUrlRef.current = null;
            }
            // Fetch GLB with auth headers and create a blob URL so Three.js
            // can load it without needing auth (avoids 401 from useGLTF)
            const blobUrl = await fetchGlbBlobUrl(f.gltf_url);
            if (blobUrl) {
              blobUrlRef.current = blobUrl;
              setGltfUrl(blobUrl);
            } else {
              // Fallback: try the URL directly (works if it's a public presigned URL)
              setGltfUrl(f.gltf_url);
            }
          } else {
            setGltfUrl(null);
          }
        }
        if (part && typeof part === 'object') {
          const p = part as { features_json?: PartFeatures };
          setPartFeatures(p.features_json ?? null);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [projectId, tick]);

  const refetch = () => setTick((t) => t + 1);

  return { gltfUrl, version, partFeatures, loading, error, refetch };
}
