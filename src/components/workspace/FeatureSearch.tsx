/**
 * FeatureSearch — search and inspect CAD geometry features.
 *
 * Shows a search bar + results list. Clicking a result shows
 * full parameters and 3D coordinates for that feature.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Box, Circle, Layers, BarChart3, X, MapPin,
  ChevronDown, ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import {
  fetchFeatures, searchFeatures,
  type PartFeature, type FeatureListResult,
  IS_DEMO,
} from '../../lib/api';

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_FEATURES: PartFeature[] = [
  {
    id: 'bounding_box',
    type: 'bounding_box',
    name: 'Bounding Box 165×115×15mm',
    params: { x_mm: 165, y_mm: 115, z_mm: 15, volume_mm3: 18750, surface_area_mm2: 8940 },
    location: [82.5, 57.5, 7.5],
    dependencies: [],
  },
  {
    id: 'face_001',
    type: 'face',
    name: 'Face face_001',
    params: { area_mm2: 150, normal: [0, 0, -1], is_planar: true, is_datum_candidate: true },
    location: [82.5, 57.5, 0],
    dependencies: ['bounding_box'],
  },
  {
    id: 'face_002',
    type: 'face',
    name: 'Face face_002',
    params: { area_mm2: 150, normal: [0, 0, 1], is_planar: true, is_datum_candidate: false },
    location: [82.5, 57.5, 15],
    dependencies: ['bounding_box'],
  },
  {
    id: 'hole_000',
    type: 'hole',
    name: 'Hole Ø6.0mm',
    params: { diameter_mm: 6.0, depth_mm: 15.0, axis: [0, 0, -1], is_through_hole: true },
    location: [50, 50, 7.5],
    dependencies: [],
  },
  {
    id: 'hole_001',
    type: 'hole',
    name: 'Hole Ø6.0mm',
    params: { diameter_mm: 6.0, depth_mm: 15.0, axis: [0, 0, -1], is_through_hole: true },
    location: [115, 50, 7.5],
    dependencies: [],
  },
  {
    id: 'hole_002',
    type: 'hole',
    name: 'Hole Ø10.0mm',
    params: { diameter_mm: 10.0, depth_mm: 15.0, axis: [0, 0, -1], is_through_hole: true },
    location: [30, 30, 7.5],
    dependencies: [],
  },
  {
    id: 'hole_003',
    type: 'hole',
    name: 'Hole Ø10.0mm',
    params: { diameter_mm: 10.0, depth_mm: 15.0, axis: [0, 0, -1], is_through_hole: true },
    location: [135, 85, 7.5],
    dependencies: [],
  },
  {
    id: 'geometry_summary',
    type: 'summary',
    name: 'Geometry Summary',
    params: { face_count: 24, edge_count: 36, hole_count: 4, volume_mm3: 18750, surface_area_mm2: 8940 },
    location: null,
    dependencies: [],
  },
];

// ── Type icon mapping ──────────────────────────────────────────────────────────

function FeatureIcon({ type, size = 12 }: { type: string; size?: number }) {
  switch (type) {
    case 'hole':        return <Circle size={size} className="text-violet-400" />;
    case 'face':        return <Layers size={size} className="text-cadblue-400" />;
    case 'bounding_box': return <Box size={size} className="text-amber-400" />;
    case 'summary':     return <BarChart3 size={size} className="text-emerald-400" />;
    default:            return <Box size={size} className="text-slate-400" />;
  }
}

const TYPE_LABELS: Record<string, string> = {
  hole: 'Hole',
  face: 'Face',
  bounding_box: 'Bounding Box',
  summary: 'Summary',
};

function formatParamValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return '[' + (value as number[]).map(n => (typeof n === 'number' ? n.toFixed(2) : n)).join(', ') + ']';
  }
  if (typeof value === 'number') {
    if (key.includes('mm') || key.includes('area') || key.includes('volume')) {
      return value.toFixed(2);
    }
    return value.toFixed(3);
  }
  return String(value);
}

// ── Feature detail card ────────────────────────────────────────────────────────

function FeatureCard({ feature, defaultExpanded = false }: { feature: PartFeature; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const params = feature.params ?? {};

  return (
    <div className="rounded-xl border border-cadsurface-700 overflow-hidden bg-cadsurface-900/40 hover:bg-cadsurface-900/70 transition-colors">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <FeatureIcon type={feature.type} size={12} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{feature.name}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">{TYPE_LABELS[feature.type] ?? feature.type}</p>
        </div>
        {feature.location && (
          <MapPin size={10} className="text-slate-600 shrink-0" title="Has 3D coordinates" />
        )}
        <span className="text-slate-700 shrink-0">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          <div className="h-px bg-cadsurface-700/60" />

          {/* Location */}
          {feature.location && (
            <div className="flex items-start gap-2">
              <MapPin size={10} className="text-cadblue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Position (mm)</p>
                <p className="text-xs font-mono text-cadblue-300">
                  X:{(feature.location[0] ?? 0).toFixed(1)}
                  {' '}Y:{(feature.location[1] ?? 0).toFixed(1)}
                  {' '}Z:{(feature.location[2] ?? 0).toFixed(1)}
                </p>
              </div>
            </div>
          )}

          {/* Parameters table */}
          {Object.keys(params).length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Parameters</p>
              <div className="space-y-1">
                {Object.entries(params).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 justify-between">
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">{k}</span>
                    <span className="text-[10px] text-slate-300 text-right font-mono">
                      {formatParamValue(k, v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies */}
          {(feature.dependencies ?? []).length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Dependencies</p>
              <div className="flex flex-wrap gap-1">
                {feature.dependencies.map(dep => (
                  <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded bg-cadsurface-800 text-slate-400 border border-cadsurface-700 font-mono">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  projectId?: string;
}

export default function FeatureSearch({ projectId }: Props) {
  const [query, setQuery]       = useState('');
  const [allFeatures, setAll]   = useState<PartFeature[]>([]);
  const [results, setResults]   = useState<PartFeature[] | null>(null);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load all features on mount ──
  useEffect(() => {
    if (IS_DEMO || !projectId || projectId === 'demo') {
      setAll(DEMO_FEATURES);
      setFetching(false);
      return;
    }
    setFetching(true);
    fetchFeatures(projectId)
      .then((data: FeatureListResult | null) => {
        if (data?.features && data.features.length > 0) {
          setAll(data.features);
        } else if (data?.status && data.status !== 'ready') {
          setError(`Geometry ${data.status} — upload a STEP file to search features`);
          setAll(DEMO_FEATURES);
        } else {
          setAll(DEMO_FEATURES);
        }
      })
      .catch(() => {
        setAll(DEMO_FEATURES);
      })
      .finally(() => setFetching(false));
  }, [projectId]);

  // ── Debounced search ──
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (IS_DEMO || !projectId || projectId === 'demo') {
        // Client-side search on demo data
        const q = val.toLowerCase();
        const matched = allFeatures.filter(f =>
          f.name.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          Object.entries(f.params ?? {}).some(([k, v]) =>
            k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
          )
        );
        setResults(matched);
        return;
      }

      setLoading(true);
      try {
        const data = await searchFeatures(projectId, val);
        setResults(data?.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [projectId, allFeatures]);

  const displayFeatures = results ?? allFeatures;
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cadsurface-950">

      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Search size={14} className="text-cadblue-400" />
          <p className="text-xs font-bold text-slate-200">Feature Search</p>
          {(fetching || loading) && <Loader2 size={11} className="animate-spin text-slate-500" />}
        </div>
        <p className="text-xs text-slate-600">
          Search geometry by name, type, or parameter
        </p>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search features… (fillet, hole, face, datum)"
            className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg pl-7 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cadblue-500 focus:bg-cadsurface-700 transition-colors"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults(null); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">

        {fetching && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-slate-500" />
          </div>
        )}

        {!fetching && error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/40">
            <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">{error}</p>
          </div>
        )}

        {!fetching && (
          <>
            {/* Count header */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                {isSearching
                  ? `${displayFeatures.length} result${displayFeatures.length !== 1 ? 's' : ''} for "${query}"`
                  : `${allFeatures.length} feature${allFeatures.length !== 1 ? 's' : ''}`
                }
              </p>
              {isSearching && displayFeatures.length === 0 && (
                <span className="text-[10px] text-slate-600">No matches</span>
              )}
            </div>

            {/* Feature cards */}
            {displayFeatures.map(f => (
              <FeatureCard
                key={f.id}
                feature={f}
                defaultExpanded={isSearching && displayFeatures.length === 1}
              />
            ))}

            {!isSearching && allFeatures.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                <Box size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">No geometry features found.</p>
                <p className="text-xs">Upload a STEP file to analyse features.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer stats */}
      <div className="border-t border-cadsurface-700 px-3 py-2 shrink-0">
        <div className="flex items-center gap-3">
          {[
            { type: 'face',        label: 'Faces' },
            { type: 'hole',        label: 'Holes' },
            { type: 'bounding_box', label: 'Box' },
          ].map(({ type, label }) => {
            const count = allFeatures.filter(f => f.type === type).length;
            return (
              <div key={type} className="flex items-center gap-1">
                <FeatureIcon type={type} size={10} />
                <span className="text-[10px] text-slate-500">{count} {label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
