import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFixtureGeometry, fetchPartGeometry, fetchGlbBlobUrl } from '../lib/api';
import type { PartFeatures } from '../types';

interface FixtureGeometryResult {
  gltfUrl: string | null;
  version: number | null;
  partFeatures: PartFeatures | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** True when polling has been stopped after consecutive 404s */
  pollingStopped: boolean;
}

const MAX_CONSECUTIVE_FAILURES = 3;

export function useFixtureGeometry(projectId: string | undefined): FixtureGeometryResult {
  const [gltfUrl, setGltfUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [partFeatures, setPartFeatures] = useState<PartFeatures | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [pollingStopped, setPollingStopped] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const failCountRef = useRef(0);

  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchFixtureGeometry(projectId),
      fetchPartGeometry(projectId),
    ])
      .then(async ([fixture, part]) => {
        let gotData = false;
        // A record existing (even without gltf_url) means generation is in
        // progress — don't count that as a failure for polling purposes.
        let recordExists = false;
        if (fixture && typeof fixture === 'object') {
          const f = fixture as { gltf_url?: string; version?: number };
          recordExists = true;
          setVersion(f.version ?? null);

          if (f.gltf_url) {
            gotData = true;
            if (blobUrlRef.current) {
              URL.revokeObjectURL(blobUrlRef.current);
              blobUrlRef.current = null;
            }
            const blobUrl = await fetchGlbBlobUrl(f.gltf_url);
            if (blobUrl) {
              blobUrlRef.current = blobUrl;
              setGltfUrl(blobUrl);
            } else {
              setGltfUrl(f.gltf_url);
            }
          } else {
            setGltfUrl(null);
          }
        }
        if (part && typeof part === 'object') {
          const p = part as { features_json?: PartFeatures };
          if (p.features_json) gotData = true;
          recordExists = true;
          setPartFeatures(p.features_json ?? null);
        }
        // Reset or increment consecutive failure counter.
        // A record with no gltf_url means generation is in progress — keep polling.
        if (gotData || recordExists) {
          failCountRef.current = 0;
          setPollingStopped(false);
        } else {
          failCountRef.current += 1;
          if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
            setPollingStopped(true);
          }
        }
      })
      .catch((e) => {
        setError(String(e));
        failCountRef.current += 1;
        if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setPollingStopped(true);
        }
      })
      .finally(() => setLoading(false));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [projectId, tick]);

  const refetch = useCallback(() => {
    // Reset failure counter on explicit refetch (e.g. generation started)
    failCountRef.current = 0;
    setPollingStopped(false);
    setTick((t) => t + 1);
  }, []);

  return { gltfUrl, version, partFeatures, loading, error, refetch, pollingStopped };
}
