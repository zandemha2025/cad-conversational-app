import { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, AlertCircle, EyeOff, Box, Circle, Minus, Move3d, Layers,
  Copy, Scissors, SquareAsterisk, SquareDashedBottomCode, Triangle, Target, Drill, Tag,
  Crosshair, Loader2,
} from 'lucide-react';
import { mockFeatureTree } from '../../data/mockData';
import type { FeatureTreeItem, FeatureType, PartFeatures } from '../../types';
import { useWorkspace } from '../../store/workspaceStore';
import { fetchPartGeometry, IS_DEMO } from '../../lib/api';

const featureIcon: Record<FeatureType, React.ReactNode> = {
  sketch:      <SquareDashedBottomCode size={13} className="text-amber-400" />,
  extrude:     <Box size={13} className="text-cadblue-400" />,
  revolve:     <Circle size={13} className="text-purple-400" />,
  fillet:      <SquareAsterisk size={13} className="text-emerald-400" />,
  chamfer:     <Triangle size={13} className="text-emerald-400" />,
  shell:       <Layers size={13} className="text-teal-400" />,
  pattern:     <Copy size={13} className="text-orange-400" />,
  mirror:      <Move3d size={13} className="text-pink-400" />,
  sweep:       <Minus size={13} className="text-indigo-400" />,
  loft:        <Layers size={13} className="text-violet-400" />,
  cut:         <Scissors size={13} className="text-red-400" />,
  plane:       <Layers size={13} className="text-slate-500" />,
  assembly:    <Box size={13} className="text-cadblue-400" />,
  mate:        <Move3d size={13} className="text-slate-400" />,
  datum:       <Target size={13} className="text-yellow-400" />,
  hole:        <Crosshair size={13} className="text-cyan-400" />,
  counterbore: <Drill size={13} className="text-cadblue-300" />,
  annotation:  <Tag size={13} className="text-violet-400" />,
};

// Convert OCCT features_json → FeatureTreeItem[]
function featuresToTree(features: PartFeatures): FeatureTreeItem[] {
  const items: FeatureTreeItem[] = [
    {
      id: 'origin', name: 'Origin', type: 'plane', suppressed: false,
    },
  ];

  // Datum candidates as datum features
  features.datum_candidates.slice(0, 3).forEach((faceId, i) => {
    const face = features.faces.find(f => f.id === faceId);
    const labels = ['A', 'B', 'C'];
    items.push({
      id: `datum-${i}`,
      name: `Datum ${labels[i]} (${faceId})`,
      type: 'datum',
      params: face ? {
        area: Math.round(face.area_mm2),
        nx: face.normal[0].toFixed(2),
        ny: face.normal[1].toFixed(2),
        nz: face.normal[2].toFixed(2),
      } : {},
    });
  });

  // Detected holes
  features.detected_holes.forEach((hole, i) => {
    const type: FeatureType = hole.type === 'counterbore' ? 'counterbore' : 'hole';
    items.push({
      id: `hole-${i}`,
      name: `${hole.type === 'counterbore' ? 'Counterbore' : 'Hole'} ⌀${hole.diameter.toFixed(1)} ×${i + 1}`,
      type,
      params: {
        diameter: hole.diameter,
        depth: hole.depth,
        cx: hole.center[0].toFixed(1),
        cy: hole.center[1].toFixed(1),
        cz: hole.center[2].toFixed(1),
      },
    });
  });

  // Planar faces as extrude/sketch features
  const planarFaces = features.faces.filter(f => f.is_planar && !features.datum_candidates.includes(f.id));
  if (planarFaces.length > 0) {
    items.push({
      id: 'faces-group',
      name: `Planar Faces (${planarFaces.length})`,
      type: 'extrude',
      children: planarFaces.slice(0, 8).map(face => ({
        id: face.id,
        name: face.id,
        type: 'plane' as FeatureType,
        params: { area: Math.round(face.area_mm2) },
      })),
    });
  }

  return items;
}

function TreeNode({ item, depth = 0, selectedId, onSelect }: {
  item: FeatureTreeItem; depth?: number; selectedId: string; onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <div
        className={`tree-item ${selectedId === item.id ? 'active' : ''} ${item.suppressed ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => { onSelect(item.id); if (hasChildren) setExpanded(p => !p); }}
      >
        <span className="w-3 flex items-center justify-center shrink-0">
          {hasChildren ? (expanded ? <ChevronDown size={11} className="text-slate-500" /> : <ChevronRight size={11} className="text-slate-500" />) : null}
        </span>
        <span className="shrink-0">{featureIcon[item.type]}</span>
        <span className={`flex-1 text-xs truncate ${
          item.error ? 'text-red-400' : item.suppressed ? 'text-slate-500 line-through' :
          item.type === 'datum' ? 'text-yellow-300/90' : item.type === 'annotation' ? 'text-violet-300/90' : ''
        }`}>{item.name}</span>
        {item.error && <AlertCircle size={11} className="text-red-400 shrink-0" />}
        {item.suppressed && <EyeOff size={11} className="text-slate-600 shrink-0" />}
      </div>
      {hasChildren && expanded && (
        <div>
          {item.children!.map(child => (
            <TreeNode key={child.id} item={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FeatureTree() {
  const [selectedId, setSelectedId] = useState('');
  const [treeItems, setTreeItems] = useState<FeatureTreeItem[]>(mockFeatureTree);
  const [loading, setLoading] = useState(false);
  const { state, selectFeature } = useWorkspace();
  const projectId = state.projectId;

  useEffect(() => {
    if (IS_DEMO || !projectId) {
      setTreeItems(mockFeatureTree);
      return;
    }
    setLoading(true);
    fetchPartGeometry(projectId)
      .then((data: unknown) => {
        const partData = data as { features_json?: PartFeatures } | null;
        if (partData?.features_json) {
          const features = partData.features_json;
          setTreeItems(featuresToTree(features));
          // Sync to workspace state
        }
      })
      .catch(() => setTreeItems(mockFeatureTree))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Sync workspace features into tree when available
  useEffect(() => {
    if (state.features) {
      setTreeItems(featuresToTree(state.features));
    }
  }, [state.features]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // Find in features and publish to workspace
    if (state.features) {
      const face = state.features.faces.find(f => f.id === id);
      if (face) {
        selectFeature({
          id: face.id, type: face.is_datum_candidate ? 'datum' : 'face',
          label: face.id, area_mm2: face.area_mm2,
          normal: face.normal, centroid: face.centroid, is_planar: face.is_planar,
        });
        return;
      }
      const holeMatch = id.startsWith('hole-') ? state.features.detected_holes[parseInt(id.split('-')[1])] : null;
      if (holeMatch) {
        selectFeature({
          id, type: 'hole', label: `Hole ⌀${holeMatch.diameter.toFixed(1)}`,
          diameter: holeMatch.diameter, depth: holeMatch.depth,
        });
        return;
      }
    }
    selectFeature(null);
  };

  const featureCount = treeItems.filter(f => f.id !== 'origin').length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 shrink-0">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Feature Tree</span>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={11} className="text-slate-500 animate-spin" />}
          <span className="text-xs text-slate-500">{featureCount} features</span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Box size={14} className="text-cadblue-400 shrink-0" />
            <span className="text-xs text-slate-200 font-medium truncate">
              {projectId && !IS_DEMO ? `Project ${projectId.slice(0, 8)}` : 'wing_panel_drill_jig'}
            </span>
          </div>
          <span className="text-xs bg-emerald-900/40 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">
            {IS_DEMO ? 'Rev B' : 'OCCT'}
          </span>
        </div>
        {state.features && (
          <div className="flex items-center gap-3 mt-1 ml-5">
            <p className="text-xs text-slate-500">{state.features.face_count} faces · {state.features.hole_count} holes</p>
            <span className="text-xs text-amber-400/70 flex items-center gap-1">
              <Target size={10} />{state.features.datum_candidates.length} datums
            </span>
          </div>
        )}
        {!state.features && (
          <div className="flex items-center gap-3 mt-1 ml-5">
            <p className="text-xs text-slate-500">Part · TL-4471-A</p>
            <span className="text-xs text-amber-400/70 flex items-center gap-1"><Target size={10} />3-2-1 ✓</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {treeItems.map(item => (
          <TreeNode key={item.id} item={item} selectedId={selectedId} onSelect={handleSelect} />
        ))}
      </div>

      {/* Selected feature detail */}
      {state.selectedFeature && (
        <div className="border-t border-cadsurface-700 px-3 py-2 bg-cadsurface-900/60 shrink-0">
          <p className="text-xs font-medium text-slate-300 mb-1">{state.selectedFeature.label}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {state.selectedFeature.area_mm2 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Area</span>
                <span className="text-slate-300 font-mono">{Math.round(state.selectedFeature.area_mm2)} mm²</span>
              </div>
            )}
            {state.selectedFeature.diameter && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Bore ⌀</span>
                <span className="text-slate-300 font-mono">{state.selectedFeature.diameter.toFixed(1)}mm</span>
              </div>
            )}
            {state.selectedFeature.depth && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Depth</span>
                <span className="text-slate-300 font-mono">{state.selectedFeature.depth.toFixed(1)}mm</span>
              </div>
            )}
            {state.selectedFeature.normal && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Normal</span>
                <span className="text-slate-300 font-mono">
                  [{state.selectedFeature.normal.map(n => n.toFixed(1)).join(', ')}]
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-cadsurface-700 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-cadsurface-800 rounded-full overflow-hidden">
            <div className="h-full w-full bg-cadblue-600 rounded-full" />
          </div>
          <span className="text-xs text-slate-500">End</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">Rollback bar — drag to history point</p>
      </div>
    </div>
  );
}
