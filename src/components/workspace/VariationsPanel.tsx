/**
 * VariationsPanel — shows variation groups with a side-by-side 3D comparison grid.
 *
 * Features:
 * - List of past variation groups (newest first)
 * - For a selected group: grid of GLB previews, one per variation
 * - Click a variation to load it into the main viewport as the active fixture
 * - Key metrics shown below each card: parameter, value, variation label
 */
import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import {
  Shuffle, RefreshCw, CheckCircle2, Loader2, Box,
  Clock, Layers,
} from 'lucide-react';
import { fetchVariationGroups, fetchVariationGroup } from '../../lib/api';
import type { VariationGroup, VariationItem } from '../../lib/api';
import { useWorkspace } from '../../store/workspaceStore';

// ── Mini 3D viewer for a single variation ──────────────────────────────────────

function VariationGlb({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone(true)} />;
}

function VariationMiniViewer({ gltfUrl }: { gltfUrl: string | null }) {
  if (!gltfUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-cadsurface-800 rounded-lg">
        <Box size={28} className="text-slate-600" />
      </div>
    );
  }
  return (
    <Canvas
      camera={{ position: [0.4, 0.3, 0.6], fov: 45 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <Suspense fallback={null}>
        <VariationGlb url={gltfUrl} />
      </Suspense>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={1.5}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.6}
      />
    </Canvas>
  );
}

// ── Single variation card ──────────────────────────────────────────────────────

function VariationCard({
  variation,
  isSelected,
  onSelect,
  onSetActive,
}: {
  variation: VariationItem;
  isSelected: boolean;
  onSelect: () => void;
  onSetActive: () => void;
}) {
  const meta = variation.variation_metadata;
  const label = meta?.label ?? `Variation ${variation.variation_index + 1}`;

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col rounded-xl border cursor-pointer transition-all overflow-hidden ${
        isSelected
          ? 'border-violet-500 ring-1 ring-violet-500/30 bg-violet-950/20'
          : 'border-cadsurface-700 bg-cadsurface-800 hover:border-cadsurface-500'
      }`}
    >
      {/* 3D Preview */}
      <div className="relative h-32 bg-cadsurface-900 rounded-t-xl overflow-hidden">
        <VariationMiniViewer gltfUrl={variation.gltf_url} />
        {/* Variation index badge */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-cadsurface-900/80 border border-cadsurface-700 rounded text-xs text-slate-400 font-mono">
          V{variation.variation_index + 1}
        </div>
        {isSelected && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 size={14} className="text-violet-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="font-medium text-sm text-slate-200 truncate">{label}</div>
        {meta && (
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-slate-500 font-mono truncate">
              {meta.varied_parameter}
            </div>
            <div className="text-xs text-violet-300 font-medium truncate">
              {meta.varied_value}
            </div>
          </div>
        )}
        {/* "Use this design" button */}
        <button
          onClick={e => { e.stopPropagation(); onSetActive(); }}
          className={`mt-1 w-full py-1 rounded text-xs font-medium transition-all ${
            isSelected
              ? 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-cadsurface-700 text-slate-400 hover:bg-cadsurface-600 hover:text-slate-200 opacity-0 group-hover:opacity-100'
          }`}
        >
          Use this design
        </button>
      </div>
    </div>
  );
}

// ── Group list item ────────────────────────────────────────────────────────────

function GroupListItem({
  group,
  isActive,
  onClick,
}: {
  group: VariationGroup;
  isActive: boolean;
  onClick: () => void;
}) {
  const ago = (() => {
    const ms = Date.now() - new Date(group.created_at).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  })();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
        isActive
          ? 'border-violet-500/50 bg-violet-950/30 text-slate-200'
          : 'border-transparent hover:border-cadsurface-600 hover:bg-cadsurface-800 text-slate-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-xs truncate flex-1">{group.prompt || 'Variation set'}</span>
        <span className="shrink-0 flex items-center gap-1 text-slate-500 text-xs">
          <Layers size={10} />
          {group.num_variations}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 text-slate-500 text-xs">
        <Clock size={9} />
        {ago}
      </div>
    </button>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  onGenerateClick: () => void;
  triggerRefresh?: number;   // increment to trigger a refetch
}

export default function VariationsPanel({ projectId, onGenerateClick, triggerRefresh = 0 }: Props) {
  const { dispatch } = useWorkspace();
  const [groups, setGroups] = useState<VariationGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<VariationGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

  // Load groups on mount / when triggerRefresh increments
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchVariationGroups(projectId)
      .then(data => {
        const list = data ?? [];
        setGroups(list);
        if (list.length > 0 && !activeGroup) {
          setActiveGroup(list[0]);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, triggerRefresh]);

  function selectGroup(group: VariationGroup) {
    // Fetch full group with proxied GLB URLs
    fetchVariationGroup(projectId, group.variation_group_id).then(full => {
      setActiveGroup(full ?? group);
    });
    setSelectedVariationId(null);
  }

  function setActiveDesign(variation: VariationItem) {
    if (variation.gltf_url) {
      dispatch({ type: 'SET_GLTF_URL', url: variation.gltf_url });
    }
    setSelectedVariationId(variation.id);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-violet-600/20 flex items-center justify-center">
            <Shuffle size={12} className="text-violet-400" />
          </div>
          <span className="text-xs font-semibold text-slate-300">Design Variations</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setLoading(true);
              fetchVariationGroups(projectId).then(d => { setGroups(d ?? []); }).finally(() => setLoading(false));
            }}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-cadsurface-700 transition-all"
            title="Refresh"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onGenerateClick}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Shuffle size={11} />
            Generate
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: group list */}
        <div className="w-36 shrink-0 border-r border-cadsurface-700 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {loading && groups.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-slate-600" />
            </div>
          )}
          {!loading && groups.length === 0 && (
            <div className="px-2 py-6 text-center">
              <Shuffle size={20} className="text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-600">No variations yet</p>
              <button
                onClick={onGenerateClick}
                className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline"
              >
                Generate now
              </button>
            </div>
          )}
          {groups.map(g => (
            <GroupListItem
              key={g.variation_group_id}
              group={g}
              isActive={activeGroup?.variation_group_id === g.variation_group_id}
              onClick={() => selectGroup(g)}
            />
          ))}
        </div>

        {/* Right: comparison grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {!activeGroup && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mb-3">
                <Shuffle size={22} className="text-violet-400" />
              </div>
              <p className="text-sm font-medium text-slate-300 mb-1">Generate Design Variations</p>
              <p className="text-xs text-slate-500 max-w-xs">
                ForgeAI generates multiple distinct fixture designs from your description — compare them side by side and pick the best one.
              </p>
              <button
                onClick={onGenerateClick}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Shuffle size={12} />
                Generate Variations
              </button>
            </div>
          )}

          {activeGroup && (
            <div>
              {/* Group header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-slate-300 leading-snug line-clamp-2">
                    {activeGroup.prompt || 'Design variations'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeGroup.num_variations} variations
                  </p>
                </div>
              </div>

              {/* Variation cards grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {activeGroup.variations.map(v => (
                  <VariationCard
                    key={v.id}
                    variation={v}
                    isSelected={selectedVariationId === v.id}
                    onSelect={() => setSelectedVariationId(v.id)}
                    onSetActive={() => setActiveDesign(v)}
                  />
                ))}
              </div>

              {/* "Load in study mode" hint */}
              <div className="mt-4 p-3 rounded-lg bg-cadsurface-800 border border-cadsurface-700 text-xs text-slate-500">
                <span className="text-slate-400 font-medium">Tip:</span> Click "Use this design" on any variation to load it in the main viewport. Then open Study Mode for detailed FEA comparison.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
