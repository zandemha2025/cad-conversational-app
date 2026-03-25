/**
 * SharedView — public read-only workspace view.
 * Accessible at /shared/:token without login.
 */
import { useState, useEffect, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Environment, useGLTF } from '@react-three/drei';
import { Wrench, Eye, Lock, MessageSquare, Box, AlertTriangle, ExternalLink, Users } from 'lucide-react';
import { getSharedProject, fetchComments, type SharedProjectResponse, type CommentResponse } from '../lib/api';

// ── Simple 3D scene ───────────────────────────────────────────────────────────

function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone(true)} />;
}

function PlaceholderScene() {
  return (
    <group>
      <mesh receiveShadow castShadow position={[0, 0, 0]}>
        <boxGeometry args={[8, 0.5, 5]} />
        <meshStandardMaterial color="#1a3a5c" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 0.6, 2.8]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.15} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Scene3D({ gltfUrl }: { gltfUrl?: string | null }) {
  return (
    <>
      <color attach="background" args={['#080e1a']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 15, 8]} intensity={1.1} castShadow />
      <directionalLight position={[-8, 8, -5]} intensity={0.45} color="#aaccff" />
      <Environment preset="warehouse" />
      {gltfUrl ? <GltfModel url={gltfUrl} /> : <PlaceholderScene />}
      <OrbitControls enableDamping dampingFactor={0.07} minDistance={3} maxDistance={60} />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ── Comment card ──────────────────────────────────────────────────────────────

function CommentCard({ comment }: { comment: CommentResponse }) {
  if (comment.resolved) return null;
  const initials = (comment.user_name || '?').slice(0, 2).toUpperCase();
  const diff = Date.now() - new Date(comment.created_at).getTime();
  const mins = Math.floor(diff / 60_000);
  const timeAgo = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

  return (
    <div className="bg-cadsurface-800/60 border border-cadsurface-700 rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <div
          className="w-6 h-6 rounded-full bg-cadblue-700 flex items-center justify-center text-white font-bold shrink-0"
          style={{ fontSize: '8px' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-slate-300 truncate">{comment.user_name || 'Unknown'}</span>
            <span className="text-xs text-slate-600 shrink-0">{timeAgo}</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed break-words">{comment.comment}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'loaded' | 'not_found' | 'expired' | 'error';

export default function SharedView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [project, setProject] = useState<SharedProjectResponse | null>(null);
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [showComments, setShowComments] = useState(true);

  useEffect(() => {
    if (!token) { setLoadState('not_found'); return; }

    getSharedProject(token).then(p => {
      if (!p) { setLoadState('not_found'); return; }
      setProject(p);
      setLoadState('loaded');
      // Load comments
      fetchComments(p.project_id, false).then(c => setComments(c ?? []));
    }).catch(() => setLoadState('error'));
  }, [token]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-cadsurface-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cadblue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading shared project…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'not_found' || loadState === 'expired') {
    return (
      <div className="flex h-screen items-center justify-center bg-cadsurface-950">
        <div className="text-center max-w-sm px-4">
          <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center mx-auto mb-4">
            <Lock size={20} className="text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-slate-200 mb-2">
            {loadState === 'expired' ? 'Link Expired' : 'Link Not Found'}
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            {loadState === 'expired'
              ? 'This share link has expired. Ask the project owner to generate a new one.'
              : 'This share link is invalid or has been revoked.'}
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-cadblue-600 hover:bg-cadblue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign in to ScaleCAD
          </button>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-cadsurface-950">
        <div className="text-center">
          <AlertTriangle size={24} className="text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Something went wrong loading this project.</p>
        </div>
      </div>
    );
  }

  // ── Loaded state ──────────────────────────────────────────────────────────

  const activeComments = comments.filter(c => !c.resolved);

  return (
    <div className="flex flex-col h-screen bg-cadsurface-950 overflow-hidden">
      {/* Top bar */}
      <header className="h-11 bg-cadsurface-900 border-b border-cadsurface-700 flex items-center px-3 gap-2 shrink-0 z-50">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 rounded-lg bg-cadblue-600 flex items-center justify-center">
            <Wrench size={13} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">
            Forge<span className="text-cadblue-400">AI</span>
          </span>
        </div>

        <div className="w-px h-5 bg-cadsurface-700" />

        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cadsurface-800/60 border border-cadsurface-700 rounded-lg text-xs">
          <Box size={11} className="text-cadblue-400" />
          <span className="font-medium text-slate-300">{project.project_name}</span>
          {project.part_number && (
            <>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-400">{project.part_number}</span>
            </>
          )}
          {project.revision && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400">Rev {project.revision}</span>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Read-only badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 border border-slate-700 rounded-lg">
          <Eye size={11} className="text-slate-400" />
          <span className="text-xs text-slate-400">
            {project.permission === 'edit' ? 'Edit access' : 'View only'}
          </span>
        </div>

        {/* Comments toggle */}
        <button
          onClick={() => setShowComments(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs transition-colors ${
            showComments
              ? 'bg-cadblue-600/20 border-cadblue-600/40 text-cadblue-300'
              : 'border-cadsurface-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          <MessageSquare size={11} />
          Comments
          {activeComments.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: '9px' }}>
              {activeComments.length}
            </span>
          )}
        </button>

        {/* Sign in CTA */}
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cadblue-600 hover:bg-cadblue-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <ExternalLink size={11} />
          Open in ScaleCAD
        </button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1 relative overflow-hidden">
          <Canvas
            shadows
            camera={{ position: [10, 7, 10], fov: 45 }}
            gl={{ antialias: true }}
            className="absolute inset-0"
          >
            <Suspense fallback={null}>
              <Scene3D gltfUrl={project.gltf_url} />
            </Suspense>
          </Canvas>

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(8,14,26,0.5) 100%)' }}
          />

          {/* Watermark */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs text-slate-700">
            <Users size={10} />
            Shared view — ScaleCAD
          </div>
        </div>

        {/* Comments panel */}
        {showComments && (
          <div className="w-72 shrink-0 border-l border-cadsurface-700 flex flex-col bg-cadsurface-900">
            <div className="px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={13} className="text-cadblue-400" />
                <span className="text-sm font-semibold text-slate-200">Comments</span>
                {activeComments.length > 0 && (
                  <span className="ml-auto text-xs bg-amber-900/40 border border-amber-800/50 text-amber-400 px-1.5 py-0.5 rounded-full">
                    {activeComments.length} open
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {activeComments.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare size={20} className="text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">No open comments.</p>
                </div>
              ) : (
                activeComments.map(c => <CommentCard key={c.id} comment={c} />)
              )}
            </div>

            {/* Sign in to comment CTA */}
            <div className="p-3 border-t border-cadsurface-700 shrink-0">
              <button
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 py-2 bg-cadsurface-800 hover:bg-cadsurface-700 border border-cadsurface-600 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Lock size={11} />
                Sign in to add comments
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
