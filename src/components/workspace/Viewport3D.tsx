import { useState, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Environment, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  Maximize2, Grid3x3, Eye, Sun, Box, Layers, RefreshCw,
  ZoomIn, ZoomOut, Move, RotateCw, Crosshair, Target, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import { addTouchpoint, IS_DEMO } from '../../lib/api';
import type { ApiTouchpoint } from '../../lib/api';

// ── Parametric jig plate scene (fallback / demo) ──────────────────────────────

function JigScene({ showAnnotations }: { showAnnotations: boolean }) {
  return (
    <group>
      <mesh receiveShadow castShadow position={[0, 0, 0]}>
        <boxGeometry args={[8, 0.5, 5]} />
        <meshStandardMaterial color="#1a3a5c" metalness={0.6} roughness={0.4} />
      </mesh>
      {([-3, 0, 3] as number[]).map((x) => (
        <mesh key={x} position={[x, 0.28, 0]} castShadow>
          <boxGeometry args={[0.4, 0.08, 5]} />
          <meshStandardMaterial color="#0f2236" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      {([[-2.5, 0.55, -1.5], [-2.5, 0.55, 1.5]] as [number, number, number][]).map(([x, y, z], i) => (
        <group key={`loc-${i}`} position={[x, y, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.55, 16]} />
            <meshStandardMaterial color="#22c55e" metalness={0.7} roughness={0.2} />
          </mesh>
        </group>
      ))}
      {([[-1.5, 0.3, -1.8], [0, 0.3, -1.8], [1.5, 0.3, -1.8],
         [-1.5, 0.3, 1.8], [0, 0.3, 1.8], [1.5, 0.3, 1.8]] as [number, number, number][]).map(([x, y, z], i) => (
        <mesh key={`sup-${i}`} position={[x, y, z]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.12, 12]} />
          <meshStandardMaterial color="#0891b2" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <group position={[2.8, 0.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.6, 0.3, 1.4]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[-0.5, 0.22, 0]} rotation={[0, 0, Math.PI / 5]}>
          <boxGeometry args={[1.0, 0.12, 0.35]} />
          <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 0.6, 2.8]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.15} transparent opacity={0.7} />
      </mesh>
      {([[-1, 0.85, -0.7], [1, 0.85, -0.7], [-1, 0.85, 0.7], [1, 0.85, 0.7]] as [number, number, number][]).map(([x, y, z], i) => (
        <mesh key={`b-${i}`} position={[x, y, z]}>
          <cylinderGeometry args={[0.18, 0.18, 0.65, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {showAnnotations && (
        <>
          <DatumArrow pos={[-5, 0.25, 0]} rot={[0, Math.PI / 2, 0]} color="#f59e0b" />
          <DatumArrow pos={[0, 0.25, -3.5]} rot={[0, 0, 0]} color="#3b82f6" />
          <DatumArrow pos={[0, 1.6, 0]} rot={[Math.PI / 2, 0, 0]} color="#10b981" />
        </>
      )}
    </group>
  );
}

function DatumArrow({ pos, rot, color }: {
  pos: [number, number, number]; rot: [number, number, number]; color: string;
}) {
  return (
    <group position={pos} rotation={rot}>
      <mesh><cylinderGeometry args={[0.05, 0.05, 0.7, 8]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.45, 0]}><coneGeometry args={[0.12, 0.25, 8]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  );
}

// ── Real glTF model ───────────────────────────────────────────────────────────

function GltfModel({ url, touchpointMode, onFaceClick }: {
  url: string; touchpointMode: boolean;
  onFaceClick?: (worldPos: THREE.Vector3) => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = scene.clone(true);
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

// ── Demo click plane ──────────────────────────────────────────────────────────

function DemoClickPlane({ touchpointMode, onFaceClick }: {
  touchpointMode: boolean; onFaceClick?: (worldPos: THREE.Vector3) => void;
}) {
  if (!touchpointMode) return null;
  return (
    <mesh position={[0, 0.85, 0]} onClick={(e) => { e.stopPropagation(); onFaceClick?.(e.point.clone()); }}>
      <boxGeometry args={[4.5, 0.6, 2.8]} />
      <meshStandardMaterial transparent opacity={0} />
    </mesh>
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

function SceneContent({ gltfUrl, touchpointMode, showAnnotations, showGrid, onFaceClick }: {
  gltfUrl?: string | null; touchpointMode: boolean; showAnnotations: boolean;
  showGrid: boolean; onFaceClick?: (worldPos: THREE.Vector3) => void;
}) {
  const { state } = useWorkspace();
  return (
    <>
      <color attach="background" args={['#080e1a']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 15, 8]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-8, 8, -5]} intensity={0.45} color="#aaccff" />
      <Environment preset="warehouse" />

      {gltfUrl ? (
        <GltfModel url={gltfUrl} touchpointMode={touchpointMode} onFaceClick={onFaceClick} />
      ) : (
        <>
          <JigScene showAnnotations={showAnnotations} />
          <DemoClickPlane touchpointMode={touchpointMode} onFaceClick={onFaceClick} />
        </>
      )}

      {touchpointMode && state.touchpoints.map((tp, i) => (
        <TouchpointMarker key={tp.id} tp={tp} index={i} />
      ))}

      {showGrid && (
        <Grid position={[0, -0.27, 0]} args={[40, 40]} cellSize={1} cellThickness={0.4}
          cellColor="#1e293b" sectionSize={5} sectionThickness={0.8} sectionColor="#334155"
          fadeDistance={35} infiniteGrid />
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.07} minDistance={3} maxDistance={60}
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
  const { state, dispatch } = useWorkspace();

  const resolvedGltfUrl = gltfUrl ?? state.gltfUrl;
  const features = state.features;

  const handleFaceClick = useCallback(async (worldPos: THREE.Vector3) => {
    if (!touchpointMode) return;
    const label = `TP-${String(state.touchpoints.length + 1).padStart(2, '0')}`;

    const coordArr = [Math.round(worldPos.x * 100), Math.round(worldPos.y * 100), Math.round(worldPos.z * 100)];
    if (IS_DEMO || !projectId) {
      const demoTp: ApiTouchpoint = {
        id: `demo-tp-${Date.now()}`, project_id: projectId ?? 'demo',
        label, type: 'locating', face_id: 'face_auto', coords: coordArr,
        detail: '', force_n: null, created_at: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_TOUCHPOINT', tp: demoTp });
    } else {
      try {
        const tp = await addTouchpoint(projectId, { label, type: 'locating', face_id: 'face_auto', coords: coordArr, detail: '', force_n: null });
        if (tp) dispatch({ type: 'ADD_TOUCHPOINT', tp: tp as ApiTouchpoint });
      } catch { /* silently skip */ }
    }
  }, [touchpointMode, state.touchpoints.length, projectId, dispatch]);

  return (
    <div className="relative w-full h-full bg-cadsurface-950 overflow-hidden select-none">
      <Canvas shadows camera={{ position: [10, 7, 10], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }} className="absolute inset-0">
        <Suspense fallback={null}>
          <SceneContent gltfUrl={resolvedGltfUrl} touchpointMode={touchpointMode}
            showAnnotations={showAnnotations} showGrid={showGrid} onFaceClick={handleFaceClick} />
        </Suspense>
      </Canvas>

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(8,14,26,0.5) 100%)' }} />

      {/* Left toolbar */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        {([{ icon: Move, label: 'Pan' }, { icon: RotateCw, label: 'Rotate' }, { icon: ZoomIn, label: 'Zoom In' },
           { icon: ZoomOut, label: 'Zoom Out' }, { icon: Crosshair, label: 'Select' }, { icon: Maximize2, label: 'Fit All' }
        ] as { icon: React.FC<{ size?: number }>; label: string }[]).map(({ icon: Icon, label }) => (
          <button key={label} title={label}
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
        <ViewButton active={false} icon={<Sun size={13} />} label="Lighting" onClick={() => {}} />
        <ViewButton active={false} icon={<Eye size={13} />} label="Section" onClick={() => {}} />
        <ViewButton active={false} icon={<RefreshCw size={13} />} label="Reset View" onClick={() => {}} />
      </div>

      {/* Part info */}
      <div className="absolute top-3 left-3 bg-cadsurface-900/80 border border-cadsurface-700 rounded-lg px-3 py-2 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-slate-200">{resolvedGltfUrl ? 'Fixture Model' : 'wing_panel_drill_jig'}</p>
          <span className="text-xs bg-emerald-900/40 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded">
            {resolvedGltfUrl ? 'Live' : 'Rev B'}
          </span>
        </div>
        {features ? (
          <p className="text-xs text-slate-500 mt-0.5">{features.face_count} faces · {features.hole_count} holes · {Math.round(features.volume_mm3 / 1000)} cm³</p>
        ) : (
          <p className="text-xs text-slate-500 mt-0.5">Part · TL-4471-A · Al 6061-T6 · 14 features</p>
        )}
      </div>

      {/* Selection info */}
      {state.selectedFeature && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-cadblue-600/20 border border-cadblue-500/40 rounded-full px-3 py-1 backdrop-blur-sm z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-cadblue-400 animate-pulse" />
          <span className="text-xs text-cadblue-300">
            {state.selectedFeature.label}{state.selectedFeature.area_mm2 ? ` · ${Math.round(state.selectedFeature.area_mm2)} mm²` : ''}
          </span>
        </div>
      )}

      {/* DFM warning */}
      {!touchpointMode && !state.selectedFeature && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-900/30 border border-red-700/50 rounded-full px-3 py-1 backdrop-blur-sm z-10">
          <AlertTriangle size={11} className="text-red-400" />
          <span className="text-xs text-red-300">DFM: Clamp slots suppressed — unsuppress before release</span>
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

      {/* Coordinates */}
      <div className="absolute bottom-3 left-10 text-xs text-slate-600 font-mono z-10">
        X: 130.00 &nbsp; Y: 20.00 &nbsp; Z: 15.00
      </div>

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
