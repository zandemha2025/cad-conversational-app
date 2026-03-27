import { useState, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Environment, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  Maximize2, Grid3x3, Eye, Sun, Box, Layers, RefreshCw,
  ZoomIn, ZoomOut, Move, RotateCw, Crosshair, Target, ChevronRight, Ruler,
} from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import { addTouchpoint, fetchDimensions, getToken } from '../../lib/api';
import type { ApiTouchpoint, DimensionEntry } from '../../lib/api';
import DimensionOverlay from '../DimensionOverlay';

// ── Auth-aware GLB fetcher ────────────────────────────────────────────────────

function useAuthGltfUrl(gltfUrl: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!gltfUrl) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(gltfUrl, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`GLB fetch failed: ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = url;
      })
      .catch(err => {
        if (!cancelled) console.error('[Viewport3D] GLB fetch error:', err);
      });
    return () => { cancelled = true; };
  }, [gltfUrl]);

  return blobUrl;
}

// ── Real glTF model ───────────────────────────────────────────────────────────

type OrbitCtrl = THREE.EventDispatcher & {
  target: THREE.Vector3;
  update: () => void;
  minDistance: number;
  maxDistance: number;
  reset: () => void;
};

function GltfModel({ url, touchpointMode, viewMode, onFaceClick, cameraAction, onCameraActionDone }: {
  url: string; touchpointMode: boolean; viewMode: string;
  onFaceClick?: (worldPos: THREE.Vector3) => void;
  cameraAction?: 'fit' | 'reset' | null;
  onCameraActionDone?: () => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { camera, controls } = useThree();
  const modelBoundsRef = useRef<{ maxDim: number; fitDistance: number } | null>(null);

  const fitCamera = useCallback(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1e-6) return;

    cloned.position.sub(center); // center model at origin

    const fitDistance = maxDim * 2.5;
    modelBoundsRef.current = { maxDim, fitDistance };

    camera.near = maxDim * 0.001;
    camera.far = maxDim * 500;
    camera.position.set(fitDistance, fitDistance * 0.8, fitDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (controls) {
      const ctrl = controls as OrbitCtrl;
      ctrl.target.set(0, 0, 0);
      ctrl.minDistance = maxDim * 0.01;
      ctrl.maxDistance = maxDim * 100;
      ctrl.update();
    }
  }, [cloned, camera, controls]);

  // Auto-fit camera to model bounds — handles mm-scale Zoo.dev models
  useEffect(() => {
    fitCamera();
  }, [fitCamera]);

  // Handle external camera actions (Fit All / Reset View)
  useEffect(() => {
    if (!cameraAction) return;
    if (cameraAction === 'fit') {
      fitCamera();
    } else if (cameraAction === 'reset') {
      const bounds = modelBoundsRef.current;
      if (bounds) {
        const { fitDistance } = bounds;
        camera.position.set(fitDistance, fitDistance * 0.8, fitDistance);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        if (controls) {
          const ctrl = controls as OrbitCtrl;
          ctrl.target.set(0, 0, 0);
          ctrl.update();
        }
      }
    }
    onCameraActionDone?.();
  }, [cameraAction, fitCamera, camera, controls, onCameraActionDone]);

  // Apply viewMode materials
  if (viewMode === 'wireframe') {
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(() => new THREE.MeshBasicMaterial({ wireframe: true, color: '#60a5fa' }));
        } else {
          mesh.material = new THREE.MeshBasicMaterial({ wireframe: true, color: '#60a5fa' });
        }
      }
    });
  } else if (viewMode === 'shaded-wireframe') {
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => { const n = (m as THREE.MeshStandardMaterial).clone(); n.wireframe = true; return n; });
        } else {
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mat.wireframe = true;
          mesh.material = mat;
        }
      }
    });
  }

  return (
    <primitive
      object={cloned}
      onPointerDown={(e: { point: THREE.Vector3; stopPropagation: () => void }) => {
        if (!touchpointMode) return;
        e.stopPropagation();
        onFaceClick?.(e.point.clone());
      }}
    />
  );
}

// ── 3D touchpoint marker with HTML label ─────────────────────────────────────

function TouchpointMarker({ tp, index }: { tp: ApiTouchpoint; index: number }) {
  const colorMap: Record<string, string> = {
    locating: '#22c55e', clamping: '#3b82f6', support: '#94a3b8',
  };
  const badgeClass: Record<string, string> = {
    locating: 'border-emerald-400 bg-emerald-900/80 text-emerald-300',
    clamping: 'border-blue-400 bg-blue-950/80 text-blue-300',
    support: 'border-slate-500 bg-slate-800/80 text-slate-400',
  };
  const color = colorMap[tp.type] ?? '#94a3b8';
  const badge = badgeClass[tp.type] ?? badgeClass.support;
  const [cx = 0, cy = 0, cz = 0] = tp.coords ?? [];
  const px = cx / 10;
  const py = cy === 0 ? 0.85 : cy / 10;
  const pz = cz / 10;

  return (
    <group position={[px, py, pz]}>
      <mesh>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <Html center distanceFactor={8}>
        <div className="relative pointer-events-none">
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${badge}`}>
            <span className="font-bold" style={{ fontSize: '8px' }}>{index + 1}</span>
          </div>
          {tp.label && (
            <div className="absolute left-6 top-0 bg-slate-900/90 border border-slate-700 rounded px-1.5 py-0.5 whitespace-nowrap">
              <span className="font-mono text-slate-400" style={{ fontSize: '9px' }}>
                TP-{String(index + 1).padStart(2, '0')} · {tp.label}{tp.force_n ? ` · ${tp.force_n} N` : ''}
              </span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

// ── Scene content ─────────────────────────────────────────────────────────────

function SceneContent({ gltfUrl, touchpointMode, viewMode, showGrid, showDimensions, dimensions, onFaceClick, cameraAction, onCameraActionDone }: {
  gltfUrl?: string | null; touchpointMode: boolean; viewMode: string;
  showGrid: boolean; showDimensions: boolean; dimensions: DimensionEntry[];
  onFaceClick?: (worldPos: THREE.Vector3) => void;
  cameraAction?: 'fit' | 'reset' | null;
  onCameraActionDone?: () => void;
}) {
  const { state } = useWorkspace();
  return (
    <>
      <color attach="background" args={['#080e1a']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 15, 8]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-8, 8, -5]} intensity={0.45} color="#aaccff" />
      <Environment preset="warehouse" />

      {gltfUrl && (
        <GltfModel url={gltfUrl} touchpointMode={touchpointMode} viewMode={viewMode} onFaceClick={onFaceClick}
          cameraAction={cameraAction} onCameraActionDone={onCameraActionDone} />
      )}

      {touchpointMode && state.touchpoints.map((tp, i) => (
        <TouchpointMarker key={tp.id} tp={tp} index={i} />
      ))}

      {showDimensions && dimensions.length > 0 && (
        <DimensionOverlay dimensions={dimensions} />
      )}

      {showGrid && (
        <Grid position={[0, -0.27, 0]} args={[40, 40]} cellSize={1} cellThickness={0.4}
          cellColor="#1e293b" sectionSize={5} sectionThickness={0.8} sectionColor="#334155"
          fadeDistance={35} infiniteGrid />
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.07} minDistance={0.001} maxDistance={100000}
        enabled={!touchpointMode} />

      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'shaded' | 'wireframe' | 'shaded-wireframe' | 'hidden-lines';
type ViewAngle = 'isometric' | 'front' | 'top' | 'right';

interface Viewport3DProps {
  touchpointMode?: boolean;
  gltfUrl?: string | null;
  projectId?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Viewport3D({ touchpointMode = false, gltfUrl, projectId }: Viewport3DProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('shaded');
  const [viewAngle, setViewAngle] = useState<ViewAngle>('isometric');
  const [showGrid, setShowGrid] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [dimensions, setDimensions] = useState<DimensionEntry[]>([]);
  const [cameraAction, setCameraAction] = useState<'fit' | 'reset' | null>(null);
  const { state, dispatch } = useWorkspace();

  const rawGltfUrl = gltfUrl ?? state.gltfUrl;
  const resolvedGltfUrl = useAuthGltfUrl(rawGltfUrl);
  const features = state.features;

  // Fetch dimensions whenever a fixture is loaded
  useEffect(() => {
    if (!projectId) return;
    fetchDimensions(projectId).then(dims => {
      if (dims && dims.length > 0) {
        setDimensions(dims.map(d => ({ ...d, tolerance_mm: d.tolerance_mm ?? 0 })));
        setShowDimensions(true); // auto-show when available
      }
    });
  }, [projectId, resolvedGltfUrl]);

  const handleFaceClick = useCallback(async (worldPos: THREE.Vector3) => {
    if (!touchpointMode) return;
    const label = `TP-${String(state.touchpoints.length + 1).padStart(2, '0')}`;

    const coordArr = [Math.round(worldPos.x * 100), Math.round(worldPos.y * 100), Math.round(worldPos.z * 100)];
    if (!projectId) return;
    try {
      const tp = await addTouchpoint(projectId, { label, type: 'locating', face_id: 'face_auto', coords: coordArr, detail: '', force_n: null });
      if (tp) dispatch({ type: 'ADD_TOUCHPOINT', tp: tp as ApiTouchpoint });
    } catch { /* silently skip */ }
  }, [touchpointMode, state.touchpoints.length, projectId, dispatch]);

  return (
    <div className="relative w-full h-full bg-cadsurface-950 overflow-hidden select-none">
      <Canvas shadows camera={{ position: [500, 400, 500], fov: 45, near: 0.01, far: 100000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }} className="absolute inset-0">
        <Suspense fallback={null}>
          <SceneContent gltfUrl={resolvedGltfUrl} touchpointMode={touchpointMode}
            viewMode={viewMode} showGrid={showGrid}
            showDimensions={showDimensions} dimensions={dimensions}
            onFaceClick={handleFaceClick}
            cameraAction={cameraAction}
            onCameraActionDone={() => setCameraAction(null)} />
        </Suspense>
      </Canvas>

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(8,14,26,0.5) 100%)' }} />

      {/* Empty state — shown when no model has been generated yet */}
      {!resolvedGltfUrl && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-4 text-center max-w-xs px-6">
            <div className="w-20 h-20 rounded-2xl bg-cadsurface-800/80 border border-cadsurface-700 flex items-center justify-center">
              <Box size={36} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">No model loaded</p>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Describe your design in the AI chat to generate a 3D model, or upload a STEP file to get started
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Left toolbar */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        {([{ icon: Move, label: 'Pan', action: null }, { icon: RotateCw, label: 'Rotate', action: null },
           { icon: ZoomIn, label: 'Zoom In', action: null }, { icon: ZoomOut, label: 'Zoom Out', action: null },
           { icon: Crosshair, label: 'Select', action: null }, { icon: Maximize2, label: 'Fit All', action: 'fit' }
        ] as { icon: React.FC<{ size?: number }>; label: string; action: 'fit' | 'reset' | null }[]).map(({ icon: Icon, label, action }) => (
          <button key={label} title={label}
            onClick={() => { if (action) setCameraAction(action); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-cadsurface-800/80 border border-cadsurface-700 text-slate-400 hover:text-slate-100 hover:bg-cadsurface-700 transition-all backdrop-blur-sm">
            <Icon size={14} />
          </button>
        ))}
      </div>

      {/* Bottom toolbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-cadsurface-800/90 border border-cadsurface-700 rounded-xl px-2 py-1 backdrop-blur-sm z-10">
        <ViewButton active={viewMode === 'shaded'} icon={<Box size={13} />} label="Shaded" onClick={() => setViewMode('shaded')} />
        <ViewButton active={viewMode === 'wireframe'} icon={<Layers size={13} />} label="Wireframe" onClick={() => setViewMode('wireframe')} />
        <ViewButton active={viewMode === 'shaded-wireframe'} icon={<Grid3x3 size={13} />} label="Shaded+Edges" onClick={() => setViewMode('shaded-wireframe')} />
        <div className="w-px h-4 bg-cadsurface-600 mx-1" />
        <ViewButton active={showGrid} icon={<Grid3x3 size={13} />} label="Grid" onClick={() => setShowGrid(p => !p)} />
        <ViewButton active={showAnnotations} icon={<Target size={13} />} label="GD&T" onClick={() => setShowAnnotations(p => !p)} />
        <ViewButton active={showDimensions} icon={<Ruler size={13} />} label="Dims" onClick={() => setShowDimensions(p => !p)} />
        <ViewButton active={false} icon={<Sun size={13} />} label="Lighting" onClick={() => {}} />
        <ViewButton active={false} icon={<Eye size={13} />} label="Section" onClick={() => {}} />
        <ViewButton active={false} icon={<RefreshCw size={13} />} label="Reset View" onClick={() => setCameraAction('reset')} />
      </div>

      {/* Part info — only shown when model is loaded */}
      {resolvedGltfUrl && (
        <div className="absolute top-3 left-3 bg-cadsurface-900/80 border border-cadsurface-700 rounded-lg px-3 py-2 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-slate-200">
              {state.assemblyComponents.length > 1 ? 'Assembly' : 'Fixture Model'}
            </p>
            <span className="text-xs bg-emerald-900/40 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded">
              Live
            </span>
            {state.assemblyComponents.length > 1 && (
              <span className="text-xs bg-indigo-900/40 border border-indigo-700/40 text-indigo-300 px-1.5 py-0.5 rounded">
                {state.assemblyComponents.length} parts
              </span>
            )}
          </div>
          {state.assemblyComponents.length > 1 ? (
            <p className="text-xs text-slate-500 mt-0.5">
              {state.assemblyComponents.map(c => c.name.replace(/_/g, ' ')).join(' · ')}
            </p>
          ) : features ? (
            <p className="text-xs text-slate-500 mt-0.5">{features.face_count} faces · {features.hole_count} holes · {Math.round(features.volume_mm3 / 1000)} cm³</p>
          ) : null}
        </div>
      )}

      {/* Selection info */}
      {state.selectedFeature && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-cadblue-600/20 border border-cadblue-500/40 rounded-full px-3 py-1 backdrop-blur-sm z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-cadblue-400 animate-pulse" />
          <span className="text-xs text-cadblue-300">
            {state.selectedFeature.label}{state.selectedFeature.area_mm2 ? ` · ${Math.round(state.selectedFeature.area_mm2)} mm²` : ''}
          </span>
        </div>
      )}


      {/* Assembly component hover banner */}
      {!touchpointMode && state.hoveredComponentId && (() => {
        const comp = state.assemblyComponents.find(c => c.id === state.hoveredComponentId);
        if (!comp) return null;
        const typeColors: Record<string, string> = {
          base: 'text-slate-300', clamp: 'text-blue-300', pin: 'text-yellow-300',
          spacer: 'text-cyan-300', bracket: 'text-purple-300', bushing: 'text-orange-300', custom: 'text-slate-400',
        };
        const color = typeColors[comp.component_type] ?? typeColors.custom;
        return (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-indigo-900/40 border border-indigo-700/60 rounded-full px-4 py-1.5 backdrop-blur-sm z-10">
            <Layers size={11} className="text-indigo-400" />
            <span className={`text-xs font-medium ${color}`}>{comp.name}</span>
            {comp.material && (
              <>
                <ChevronRight size={10} className="text-slate-600" />
                <span className="text-xs text-slate-400 font-mono">{comp.material}</span>
              </>
            )}
          </div>
        );
      })()}


      {/* Touchpoint mode banner */}
      {touchpointMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/50 rounded-full px-4 py-1.5 backdrop-blur-sm animate-pulse z-10">
          <Target size={11} className="text-emerald-400" />
          <span className="text-xs text-emerald-300 font-medium">
            Touchpoint mode — click any face to define a clamping point · {state.touchpoints.length} placed
          </span>
        </div>
      )}

      {/* View cube */}
      <div className="absolute top-3 right-3 z-10">
        <ViewCube current={viewAngle} onChange={setViewAngle} />
      </div>

      {/* Axis indicator */}
      <div className="absolute bottom-8 left-6 z-10"><AxisIndicator /></div>

      {/* Coordinates placeholder — updated via pointer move in future iteration */}

      {/* Legend */}
      <div className="absolute bottom-12 right-20 flex items-center gap-3 text-xs text-gray-500 z-10">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Locating</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-600 inline-block" />Support</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Clamping</span>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ViewButton({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button title={label} onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
        active ? 'bg-cadblue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-cadsurface-700'
      }`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ViewCube({ current, onChange }: { current: string; onChange: (v: ViewAngle) => void }) {
  return (
    <div className="flex flex-col gap-0.5 items-center">
      <div className="w-14 h-14 relative">
        <svg viewBox="0 0 56 56" className="w-full h-full">
          <polygon points="28,4 52,18 28,32 4,18" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1" />
          <polygon points="4,18 28,32 28,52 4,38" fill="#152a46" stroke="#3b82f6" strokeWidth="1" />
          <polygon points="52,18 28,32 28,52 52,38" fill="#1a3255" stroke="#3b82f6" strokeWidth="1" />
          <text x="28" y="21" textAnchor="middle" fill="#93c5fd" fontSize="6" fontFamily="sans-serif">TOP</text>
          <text x="14" y="36" textAnchor="middle" fill="#7da8d0" fontSize="5" fontFamily="sans-serif">FRONT</text>
          <text x="42" y="36" textAnchor="middle" fill="#7da8d0" fontSize="5" fontFamily="sans-serif">RIGHT</text>
        </svg>
      </div>
      <div className="flex gap-0.5">
        {(['front', 'top', 'right'] as ViewAngle[]).map((v) => (
          <button key={v} onClick={() => onChange(v)}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
              current === v ? 'bg-cadblue-600 text-white' : 'text-slate-500 hover:text-slate-300 bg-cadsurface-800/60'
            }`}>{v[0].toUpperCase()}</button>
        ))}
      </div>
    </div>
  );
}

function AxisIndicator() {
  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      <line x1="30" y1="50" x2="30" y2="15" stroke="#3b82f6" strokeWidth="2" />
      <polygon points="30,10 27,18 33,18" fill="#3b82f6" />
      <text x="33" y="12" fill="#3b82f6" fontSize="9" fontFamily="sans-serif">Z</text>
      <line x1="30" y1="50" x2="55" y2="50" stroke="#ef4444" strokeWidth="2" />
      <polygon points="58,50 50,47 50,53" fill="#ef4444" />
      <text x="53" y="48" fill="#ef4444" fontSize="9" fontFamily="sans-serif">X</text>
      <line x1="30" y1="50" x2="10" y2="36" stroke="#22c55e" strokeWidth="2" />
      <polygon points="8,35 13,30 16,37" fill="#22c55e" />
      <text x="4" y="30" fill="#22c55e" fontSize="9" fontFamily="sans-serif">Y</text>
    </svg>
  );
}
