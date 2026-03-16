/**
 * VersionCompare — side-by-side fixture version comparison.
 */
import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF } from '@react-three/drei';
import { Suspense } from 'react';
import { GitCompare, ArrowLeftRight } from 'lucide-react';

interface VersionEntry {
  version: number;
  gltf_url: string | null;
  generated_at: string;
  kcl_diff?: string;
}

interface Props {
  versions: VersionEntry[];
  projectId?: string;
}

function GltfViewer({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone(true)} />;
}

function VersionScene({ url }: { url: string | null }) {
  return (
    <Canvas camera={{ position: [8, 5, 8], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#080e1a']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <Environment preset="warehouse" />
      <Suspense fallback={null}>
        {url ? (
          <GltfViewer url={url} />
        ) : (
          <mesh>
            <boxGeometry args={[4, 0.3, 3]} />
            <meshStandardMaterial color="#1a3a5c" />
          </mesh>
        )}
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.07} />
    </Canvas>
  );
}

export default function VersionCompare({ versions }: Props) {
  const [leftIdx, setLeftIdx] = useState(Math.min(1, versions.length - 1));
  const [rightIdx, setRightIdx] = useState(0);

  if (versions.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <GitCompare size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Need at least 2 versions to compare</p>
          <p className="text-xs mt-1">Generate the fixture again to create a new version</p>
        </div>
      </div>
    );
  }

  const leftVer = versions[leftIdx];
  const rightVer = versions[rightIdx];

  return (
    <div className="h-full flex flex-col bg-cadsurface-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cadsurface-700 shrink-0 bg-cadsurface-900">
        <div className="flex items-center gap-2">
          <GitCompare size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Version Compare</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Left:</label>
            <select value={leftIdx} onChange={e => setLeftIdx(Number(e.target.value))}
              className="text-xs bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-0.5 text-slate-200">
              {versions.map((v, i) => (
                <option key={i} value={i}>v{v.version} — {new Date(v.generated_at).toLocaleDateString()}</option>
              ))}
            </select>
          </div>
          <ArrowLeftRight size={12} className="text-slate-600" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Right:</label>
            <select value={rightIdx} onChange={e => setRightIdx(Number(e.target.value))}
              className="text-xs bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-0.5 text-slate-200">
              {versions.map((v, i) => (
                <option key={i} value={i}>v{v.version} — {new Date(v.generated_at).toLocaleDateString()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Split viewports */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left */}
        <div className="flex-1 border-r border-cadsurface-700 relative">
          <div className="absolute top-2 left-2 z-10 bg-cadsurface-900/80 border border-cadsurface-700 rounded px-2 py-1">
            <span className="text-xs text-amber-400 font-mono">v{leftVer?.version} (older)</span>
          </div>
          <VersionScene url={leftVer?.gltf_url ?? null} />
        </div>
        {/* Right */}
        <div className="flex-1 relative">
          <div className="absolute top-2 left-2 z-10 bg-cadsurface-900/80 border border-cadsurface-700 rounded px-2 py-1">
            <span className="text-xs text-emerald-400 font-mono">v{rightVer?.version} (newer)</span>
          </div>
          <VersionScene url={rightVer?.gltf_url ?? null} />
        </div>
      </div>

      {/* Bottom: param diff */}
      <div className="h-20 shrink-0 border-t border-cadsurface-700 px-4 py-2 bg-cadsurface-900 overflow-x-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Changes</p>
        <div className="flex gap-4">
          {leftVer && rightVer && leftVer.version !== rightVer.version ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Version</span>
              <span className="text-amber-400 font-mono">v{leftVer.version}</span>
              <span className="text-slate-600">→</span>
              <span className="text-emerald-400 font-mono">v{rightVer.version}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                Generated {new Date(rightVer.generated_at).toLocaleString()}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-600">Same version selected</span>
          )}
        </div>
      </div>
    </div>
  );
}
