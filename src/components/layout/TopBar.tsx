import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  ChevronDown,
  Grid2x2,
  HelpCircle,
  Layers,
  Play,
  RotateCcw,
  Save,
  Settings,
  Share2,
  Undo2,
  Redo2,
  Zap,
  Wrench,
  Target,
  GitBranch,
  CheckCircle2,
  Package,
  BarChart3,
  Shield,
  Users,
  LogOut,
  Copy,
  Check,
  X,
  Link2,
  FlaskConical,
} from 'lucide-react';
import { fetchProject, createShareLink, type ApiProject, type ShareResponse } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

// ── Share modal ───────────────────────────────────────────────────────────────

function ShareModal({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!projectId) return;
    setCreating(true);
    const s = await createShareLink(projectId, { permission });
    setShare(s);
    setCreating(false);
  }

  function handleCopy() {
    if (!share) return;
    const url = `${window.location.origin}/shared/${share.share_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const shareUrl = share ? `${window.location.origin}/shared/${share.share_token}` : '';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <div
          className="pointer-events-auto w-full max-w-sm bg-cadsurface-900 border border-cadsurface-700 rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-cadsurface-700">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-cadblue-400" />
              <span className="text-sm font-semibold text-slate-200">Share Project</span>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {!share ? (
              <>
                <p className="text-xs text-slate-400">
                  Generate a link so teammates can view (or edit) this project without logging in.
                </p>

                {/* Permission picker */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 font-medium">Access level</p>
                  <div className="flex gap-2">
                    {(['view', 'edit'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setPermission(p)}
                        className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                          permission === p
                            ? p === 'edit'
                              ? 'bg-amber-600/20 border-amber-600/50 text-amber-300 font-medium'
                              : 'bg-cadblue-600/20 border-cadblue-600/50 text-cadblue-300 font-medium'
                            : 'border-cadsurface-600 text-slate-500 hover:text-slate-300 hover:border-cadsurface-500'
                        }`}
                      >
                        {p === 'view' ? '👁 View only' : '✏️ Can edit'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={creating || !projectId}
                  className="w-full py-2 bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {creating ? 'Generating…' : 'Generate link'}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-950/30 border border-emerald-900/50 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-400">
                    Link created · {share.permission === 'edit' ? 'Can edit' : 'View only'}
                  </span>
                </div>

                <div className="bg-cadsurface-800 border border-cadsurface-600 rounded-lg p-3">
                  <p className="text-xs font-mono text-slate-400 break-all leading-relaxed">{shareUrl}</p>
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-cadsurface-700 hover:bg-cadsurface-600 text-sm text-slate-200 font-medium rounded-lg transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copied to clipboard!' : 'Copy link'}
                </button>

                <button
                  onClick={() => setShare(null)}
                  className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors"
                >
                  Create another link
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export type WorkspaceMode = 'part' | 'assembly' | 'drawing' | 'nodes' | 'studies';

interface TopBarProps {
  mode?: WorkspaceMode;
  onModeChange?: (m: WorkspaceMode) => void;
  projectId?: string;
  onStartTour?: () => void;
}

export default function TopBar({ mode = 'part', onModeChange, projectId, onStartTour }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith('/workspace');
  const [saved] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [project, setProject] = useState<ApiProject | null>(null);
  const { user, logout } = useAuth();

  const userInitials = (() => {
    if (!user) return '?';
    const name = user.name || user.email || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  })();
  const displayName = user ? (user.name || user.email || 'User') : 'Guest';

  useEffect(() => {
    if (!projectId || !isWorkspace) return;
    fetchProject(projectId).then(p => { if (p) setProject(p); }).catch(() => {});
  }, [projectId, isWorkspace]);

  const partNumber  = project?.part_number ?? '—';
  const revision    = project?.revision ?? '—';
  const projectName = project?.name ?? '';

  return (
    <header className="h-11 bg-cadsurface-900 border-b border-cadsurface-700 flex items-center px-3 gap-1 shrink-0 z-50 select-none">
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 mr-2 hover:opacity-80 transition-opacity shrink-0"
      >
        <div className="w-7 h-7 rounded-lg bg-cadblue-600 flex items-center justify-center glow-blue">
          <Wrench size={13} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">
          Forge<span className="text-cadblue-400">AI</span>
        </span>
      </button>

      <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

      {isWorkspace ? (
        <>
          {/* Undo/Redo */}
          <button className="btn-ghost p-1.5 rounded" title="Undo"><Undo2 size={14} /></button>
          <button className="btn-ghost p-1.5 rounded" title="Redo"><Redo2 size={14} /></button>

          <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

          {/* Mode switcher */}
          <div className="flex items-center bg-cadsurface-800 rounded-md p-0.5 gap-0.5 shrink-0">
            {([
              { id: 'part'     as const, icon: Box,           label: 'Part'     },
              { id: 'assembly' as const, icon: Layers,        label: 'Assembly' },
              { id: 'drawing'  as const, icon: Grid2x2,       label: 'Drawing'  },
              { id: 'nodes'    as const, icon: GitBranch,     label: 'Nodes'    },
              { id: 'studies'  as const, icon: FlaskConical,  label: 'Studies'  },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => onModeChange?.(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  mode === id
                    ? 'bg-cadblue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-cadsurface-700'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Project info pill — real data from API */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-cadsurface-800/60 border border-cadsurface-700 rounded-lg text-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <Wrench size={11} className="text-amber-400" />
              <span className={`font-mono font-medium ${partNumber !== '—' ? 'text-slate-300' : 'text-slate-600'}`}>
                {partNumber}
              </span>
            </div>
            <div className="w-px h-3 bg-cadsurface-600" />
            <div className="flex items-center gap-1">
              <GitBranch size={11} className="text-slate-500" />
              <span className={`font-mono font-medium ${revision !== '—' ? 'text-emerald-400' : 'text-slate-600'}`}>
                {revision !== '—' ? `Rev ${revision}` : '—'}
              </span>
            </div>
          </div>

          {/* Project name + save status */}
          {projectName && (
            <div className="flex items-center gap-1.5 text-xs px-2 max-w-40 overflow-hidden">
              <span className="text-slate-400 truncate">{projectName}</span>
              {saved && (
                <span className="text-emerald-400 flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={11} />
                </span>
              )}
            </div>
          )}

          <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

          {/* Standards badge — based on real project fields */}
          {project && (project.gdt_standard || project.quality_standard) && (
            <div className="flex items-center gap-1 text-xs btn-ghost px-2 py-1 rounded-md border border-cadsurface-700">
              <Target size={11} className="text-cadblue-400" />
              <span className="text-slate-400 hidden lg:inline">
                {[project.gdt_standard, project.quality_standard].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          <button className="btn-ghost p-1.5 rounded" title="Save"><Save size={14} /></button>
          <button className="btn-ghost p-1.5 rounded" title="Run simulation"><Play size={14} /></button>

          <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

          <button
            id="tour-share-btn"
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 btn-ghost text-xs rounded-md px-2 py-1 border border-cadsurface-700 hover:border-cadblue-600/50"
          >
            <Share2 size={13} />Share<ChevronDown size={11} />
          </button>

          {showShareModal && (
            <ShareModal projectId={projectId} onClose={() => setShowShareModal(false)} />
          )}
        </>
      ) : (
        <>
          {[
            { label: 'Dashboard', path: '/' },
            { label: 'Projects',  path: '/' },
            { label: 'Library',   path: '/' },
            { label: 'Templates', path: '/' },
          ].map(({ label, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className={`btn-ghost text-xs px-2.5 py-1 rounded ${label === 'Projects' ? 'text-cadblue-400' : ''}`}
            >
              {label}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs btn-ghost rounded-md px-2 py-1 border border-cadsurface-700 hover:border-amber-600/50 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Package size={13} />
            Hardware Library
          </button>
          <button className="flex items-center gap-1.5 text-xs btn-ghost rounded-md px-2 py-1 text-amber-400 hover:text-amber-300">
            <Zap size={13} />Upgrade
          </button>
        </>
      )}

      {/* Always-right */}
      <div className="flex items-center gap-1 ml-1">
        {isWorkspace && onStartTour && (
          <button
            onClick={onStartTour}
            className="btn-ghost p-1.5 rounded text-slate-500 hover:text-cadblue-400 transition-colors"
            title="Start guided tour"
          >
            <HelpCircle size={14} />
          </button>
        )}
        <button className="btn-ghost p-1.5 rounded" title="Refresh"><RotateCcw size={14} /></button>
        <button className="btn-ghost p-1.5 rounded" title="Settings" onClick={() => navigate('/settings')}>
          <Settings size={14} />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(p => !p)}
            className="w-7 h-7 rounded-full bg-cadblue-600 flex items-center justify-center text-xs font-bold ml-1 cursor-pointer hover:opacity-80"
          >
            {userInitials}
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute top-full right-0 mt-1 w-48 bg-cadsurface-900 border border-cadsurface-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-cadsurface-800">
                  <p className="text-xs font-semibold text-slate-300">{displayName}</p>
                  <p className="text-xs text-slate-600">{user?.email ?? ''}</p>
                </div>
                {[
                  { label: 'Team & Org', icon: Users, path: '/org-settings' },
                  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
                  { label: 'Audit Log', icon: Shield, path: '/audit-log' },
                  { label: 'Settings', icon: Settings, path: '/settings' },
                ].map(item => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-cadsurface-800 transition-colors"
                  >
                    <item.icon size={13} />
                    {item.label}
                  </button>
                ))}
                <div className="border-t border-cadsurface-800 mt-1">
                  <button
                    onClick={() => { logout(); setShowUserMenu(false); navigate('/login'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-cadsurface-800 transition-colors"
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
