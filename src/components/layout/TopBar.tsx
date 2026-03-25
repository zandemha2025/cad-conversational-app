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
} from 'lucide-react';
import { fetchProject, type ApiProject } from '../../lib/api';

export type WorkspaceMode = 'part' | 'assembly' | 'drawing' | 'nodes';

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
  const [project, setProject] = useState<ApiProject | null>(null);

  useEffect(() => {
    if (!projectId || !isWorkspace) return;
    fetchProject(projectId).then(p => { if (p) setProject(p); }).catch(() => {});
  }, [projectId, isWorkspace]);

  const partNumber = project?.part_number ?? '—';
  const revision   = project?.revision ?? '—';
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
          {/* Menu items */}
          {['File', 'Edit', 'View', 'Insert', 'Tooling', 'Simulate', 'Help'].map((item) => (
            <button
              key={item}
              className={`btn-ghost text-xs px-2 py-1 rounded flex items-center gap-0.5 ${
                item === 'Tooling' ? 'text-amber-400 hover:text-amber-300' : ''
              }`}
            >
              {item}
            </button>
          ))}

          <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

          {/* Undo/Redo */}
          <button className="btn-ghost p-1.5 rounded" title="Undo"><Undo2 size={14} /></button>
          <button className="btn-ghost p-1.5 rounded" title="Redo"><Redo2 size={14} /></button>

          <div className="w-px h-5 bg-cadsurface-700 mx-1 shrink-0" />

          {/* Mode switcher */}
          <div className="flex items-center bg-cadsurface-800 rounded-md p-0.5 gap-0.5 shrink-0">
            {([
              { id: 'part'     as const, icon: Box,       label: 'Part' },
              { id: 'assembly' as const, icon: Layers,    label: 'Assembly' },
              { id: 'drawing'  as const, icon: Grid2x2,   label: 'Drawing' },
              { id: 'nodes'    as const, icon: GitBranch, label: 'Nodes' },
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

          {/* Project info pill */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-cadsurface-800/60 border border-cadsurface-700 rounded-lg text-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <Wrench size={11} className="text-amber-400" />
              <span className="font-mono text-slate-300 font-medium">
                {partNumber !== '—' ? partNumber : 'No P/N'}
              </span>
            </div>
            <div className="w-px h-3 bg-cadsurface-600" />
            <div className="flex items-center gap-1">
              <GitBranch size={11} className="text-slate-500" />
              <span className="font-mono text-emerald-400 font-medium">
                {revision !== '—' ? `Rev ${revision}` : 'No Rev'}
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

          {/* Standards badge — based on project fields */}
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
            className="flex items-center gap-1.5 btn-ghost text-xs rounded-md px-2 py-1 border border-cadsurface-700 hover:border-cadblue-600/50"
          >
            <Share2 size={13} />Share<ChevronDown size={11} />
          </button>
        </>
      ) : (
        <>
          {['Dashboard', 'Projects', 'Library', 'Templates'].map((item) => (
            <button
              key={item}
              onClick={() => item === 'Projects' && navigate('/')}
              className={`btn-ghost text-xs px-2.5 py-1 rounded ${item === 'Projects' ? 'text-cadblue-400' : ''}`}
            >
              {item}
            </button>
          ))}

          <div className="flex-1" />

          <button className="flex items-center gap-1.5 text-xs btn-ghost rounded-md px-2 py-1 border border-cadsurface-700 hover:border-amber-600/50 text-amber-400 hover:text-amber-300 transition-colors">
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
            NK
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute top-full right-0 mt-1 w-48 bg-cadsurface-900 border border-cadsurface-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-cadsurface-800">
                  <p className="text-xs font-semibold text-slate-300">Nazeem K.</p>
                  <p className="text-xs text-slate-600">Engineer · Admin</p>
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
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-500 hover:text-red-400 hover:bg-cadsurface-800 transition-colors">
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
