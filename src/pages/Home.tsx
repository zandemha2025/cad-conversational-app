import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchAuditLog } from '../lib/api';
import NewProjectModal from '../components/workspace/NewProjectModal';
import {
  Plus,
  Search,
  Filter,
  Grid2x2,
  List,
  FolderOpen,
  Clock,
  Users,
  Box,
  Layers,
  FileText,
  Star,
  MoreHorizontal,
  Cpu,
  Zap,
  ChevronRight,
  ArrowRight,
  Wrench,
  Target,
  GitBranch,
  Package,
} from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import type { Project } from '../types';

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  draft:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
  archived: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  shared:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
  released: 'bg-cadblue-500/20 text-cadblue-400 border-cadblue-500/30',
};

const CATEGORY_COLORS: Record<string, string> = {
  fixture:      'from-cadblue-900 to-cadblue-950',
  'end-effector': 'from-purple-900 to-purple-950',
  gauge:        'from-emerald-900 to-emerald-950',
  tooling:      'from-amber-900 to-amber-950',
  part:         'from-slate-800 to-slate-900',
  assembly:     'from-slate-800 to-slate-900',
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  fixture:        <Wrench size={16} className="text-cadblue-400/60" />,
  'end-effector': <Cpu size={16} className="text-purple-400/60" />,
  gauge:          <Target size={16} className="text-emerald-400/60" />,
  tooling:        <Package size={16} className="text-amber-400/60" />,
  part:           <Box size={16} className="text-cadblue-400/60" />,
  assembly:       <Layers size={16} className="text-cadblue-400/60" />,
};

function ThumbnailSVG({ project }: { project: Project }) {
  if (project.category === 'fixture') {
    return (
      <svg viewBox="0 0 80 80" className="w-full h-full opacity-60">
        {/* Jig plate */}
        <rect x="10" y="28" width="60" height="28" fill="#1a3a5c" stroke="#3b82f6" strokeWidth="1.2" rx="1" />
        {/* Bushing holes */}
        {[[22, 38], [38, 38], [54, 38], [22, 48], [54, 48]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="5" fill="#0a1628" stroke="#60a5fa" strokeWidth="1" />
            <circle cx={cx} cy={cy} r="2.5" fill="#080e1a" stroke="#1d4ed8" strokeWidth="0.8" />
          </g>
        ))}
        {/* Datum label */}
        <rect x="34" y="60" width="12" height="8" rx="1" fill="#92400e" stroke="#f59e0b" strokeWidth="0.8" />
        <text x="40" y="67" textAnchor="middle" fill="#fcd34d" fontSize="5" fontWeight="bold">A</text>
      </svg>
    );
  }
  if (project.category === 'end-effector') {
    return (
      <svg viewBox="0 0 80 80" className="w-full h-full opacity-60">
        {/* Robot flange */}
        <circle cx="40" cy="35" r="18" fill="none" stroke="#8b5cf6" strokeWidth="1.2" />
        <circle cx="40" cy="35" r="8" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="1" />
        {/* Suction cups */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const r = (angle * Math.PI) / 180;
          const cx = 40 + 14 * Math.cos(r);
          const cy = 35 + 14 * Math.sin(r);
          return <circle key={i} cx={cx} cy={cy} r="3.5" fill="#2e1065" stroke="#a78bfa" strokeWidth="0.8" />;
        })}
        {/* TCP cross */}
        <line x1="36" y1="35" x2="44" y2="35" stroke="#ec4899" strokeWidth="1" />
        <line x1="40" y1="31" x2="40" y2="39" stroke="#ec4899" strokeWidth="1" />
        <text x="40" y="62" textAnchor="middle" fill="#a78bfa" fontSize="6">ISO 9409-1</text>
      </svg>
    );
  }
  if (project.category === 'gauge') {
    return (
      <svg viewBox="0 0 80 80" className="w-full h-full opacity-60">
        {/* Go gauge */}
        <rect x="20" y="25" width="15" height="32" rx="3" fill="#1a3a1a" stroke="#22c55e" strokeWidth="1.2" />
        <text x="27" y="44" textAnchor="middle" fill="#4ade80" fontSize="6" fontWeight="bold">GO</text>
        {/* No-Go gauge */}
        <rect x="45" y="30" width="15" height="27" rx="3" fill="#3a1a1a" stroke="#ef4444" strokeWidth="1.2" />
        <text x="52" y="46" textAnchor="middle" fill="#f87171" fontSize="5">NO-GO</text>
        {/* Handle */}
        <rect x="28" y="57" width="24" height="8" rx="2" fill="#1e293b" stroke="#475569" strokeWidth="1" />
      </svg>
    );
  }
  // Default part/assembly
  return (
    <svg viewBox="0 0 80 80" className="w-full h-full opacity-40">
      <rect x="20" y="25" width="40" height="30" rx="2" fill="none" stroke="#64748b" strokeWidth="1.5" />
      <rect x="28" y="20" width="24" height="8" rx="1" fill="none" stroke="#475569" strokeWidth="1" />
      <line x1="30" y1="35" x2="50" y2="35" stroke="#334155" strokeWidth="1" />
      <line x1="30" y1="42" x2="50" y2="42" stroke="#334155" strokeWidth="1" />
    </svg>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group bg-cadsurface-900 border border-cadsurface-700 hover:border-cadblue-600/50 rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:shadow-cadblue-950/50 hover:-translate-y-0.5"
    >
      {/* Thumbnail */}
      <div className={`h-36 bg-gradient-to-br ${CATEGORY_COLORS[project.category] || 'from-slate-800 to-slate-900'} relative flex items-center justify-center overflow-hidden`}>
        <div className="absolute inset-0 viewport-grid-fine opacity-40" />
        <ThumbnailSVG project={project} />

        {/* Badges */}
        <div className="absolute top-2 right-2 flex gap-1 flex-col items-end">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[project.status]}`}>
            {project.status}
          </span>
          {project.revision && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-cadsurface-800/80 border-cadsurface-600 text-slate-400">
              {project.revision}
            </span>
          )}
        </div>

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <span className="text-xs px-2 py-0.5 rounded-md bg-cadsurface-800/80 border border-cadsurface-600 text-slate-400 capitalize">
            {project.category.replace('-', ' ')}
          </span>
        </div>

        {/* Star */}
        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="w-6 h-6 rounded-md bg-black/50 flex items-center justify-center hover:bg-black/70">
            <Star size={11} className="text-amber-400" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              {project.partNumber && (
                <span className="text-xs text-slate-600 font-mono">{project.partNumber}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-100 group-hover:text-cadblue-300 transition-colors line-clamp-1">
              {project.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{project.description}</p>
          </div>
          <button onClick={(e) => e.stopPropagation()} className="shrink-0 opacity-0 group-hover:opacity-100 btn-ghost p-1 rounded transition-opacity">
            <MoreHorizontal size={13} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-2.5 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Box size={11} />{project.parts} parts</span>
          <span className="flex items-center gap-1"><Layers size={11} />{project.assemblies} asm</span>
          <span className="flex items-center gap-1"><FileText size={11} />{project.drawings} drw</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {project.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs bg-cadsurface-800 border border-cadsurface-700 text-slate-500 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-cadsurface-800">
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Clock size={10} />
            {project.updatedAt}
          </div>
          <div className="flex items-center gap-1">
            {project.collaborators.map((c) => (
              <div key={c} className="w-5 h-5 rounded-full bg-cadblue-800 flex items-center justify-center text-xs text-cadblue-300 font-medium border border-cadsurface-700">
                {c[0]}
              </div>
            ))}
            {project.collaborators.length === 0 && <span className="text-xs text-slate-600">Solo</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectListRow({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-3 bg-cadsurface-900 border border-cadsurface-700 hover:border-cadblue-600/40 rounded-xl cursor-pointer transition-all hover:bg-cadsurface-800 group"
    >
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${CATEGORY_COLORS[project.category] || 'from-slate-800 to-slate-900'} shrink-0 flex items-center justify-center`}>
        {CATEGORY_ICON[project.category]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-200 group-hover:text-cadblue-300 transition-colors">{project.name}</p>
          {project.revision && (
            <span className="text-xs text-slate-600 font-mono">{project.revision}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{project.description}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
        <span className="font-mono text-slate-600">{project.partNumber}</span>
        <span>{project.parts}p / {project.assemblies}a</span>
        <span className={`px-2 py-0.5 rounded-full border text-xs ${STATUS_COLORS[project.status]}`}>{project.status}</span>
        <span className="flex items-center gap-1"><Clock size={10} />{project.updatedAt}</span>
        <ArrowRight size={13} className="text-slate-600 group-hover:text-cadblue-400 transition-colors" />
      </div>
    </div>
  );
}

// Tooling-specific templates
const TOOLING_TEMPLATES = [
  { label: 'Drill Jig',       icon: <Wrench size={16} />,   color: 'text-cadblue-400', bg: 'group-hover:bg-cadblue-900/30' },
  { label: 'Weld Fixture',    icon: <Zap size={16} />,      color: 'text-amber-400',   bg: 'group-hover:bg-amber-900/30' },
  { label: 'Vacuum Gripper',  icon: <Cpu size={16} />,      color: 'text-purple-400',  bg: 'group-hover:bg-purple-900/30' },
  { label: 'Gripper Jaw',     icon: <Package size={16} />,  color: 'text-emerald-400', bg: 'group-hover:bg-emerald-900/30' },
  { label: 'Go/No-Go Gauge',  icon: <Target size={16} />,   color: 'text-teal-400',    bg: 'group-hover:bg-teal-900/30' },
  { label: 'Locating Nest',   icon: <GitBranch size={16} />,color: 'text-pink-400',    bg: 'group-hover:bg-pink-900/30' },
  { label: 'Check Fixture',   icon: <Target size={16} />,   color: 'text-cyan-400',    bg: 'group-hover:bg-cyan-900/30' },
  { label: 'Assy Fixture',    icon: <Layers size={16} />,   color: 'text-orange-400',  bg: 'group-hover:bg-orange-900/30' },
];

export default function Home() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'released'>('all');
  const [search, setSearch] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [recentActivity, setRecentActivity] = useState<Array<{ user_id: string; action: string; created_at: string }>>([]);

  const { user } = useAuth();
  const { projects: allProjects, addProject } = useProjects(search || undefined);

  useEffect(() => {
    fetchAuditLog('org1', 5).then((data) => {
      if (Array.isArray(data)) setRecentActivity(data as Array<{ user_id: string; action: string; created_at: string }>);
    }).catch(() => {});
  }, []);

  const filtered = allProjects.filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    return true;
  });

  const handleProjectCreated = async (projectId: string) => {
    navigate(`/workspace/${projectId}`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cadsurface-950">
      {showNewProjectModal && (
        <NewProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onProjectCreated={handleProjectCreated}
          addProject={addProject}
        />
      )}
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-cadsurface-900 via-cadblue-950/20 to-cadsurface-900 border-b border-cadsurface-700 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Wrench size={20} className="text-cadblue-400" />
              Welcome back, {user?.name ?? 'there'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              <span className="text-cadblue-400 font-medium">
                {allProjects.filter(p => p.status === 'active').length} active tooling projects
              </span>
            </p>
          </div>
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="flex items-center gap-2 bg-cadblue-600 hover:bg-cadblue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg shadow-cadblue-950/50 glow-blue"
          >
            <Plus size={16} />
            New Design
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <Cpu size={16} className="text-cadblue-400" />,    label: 'Start from prompt', desc: 'Describe your jig or fixture',   color: 'border-cadblue-700/40 hover:border-cadblue-500/60',   action: () => setShowNewProjectModal(true) },
            { icon: <FolderOpen size={16} className="text-amber-400" />, label: 'Import STEP/IGES',  desc: 'Bring in existing CAD files',    color: 'border-amber-700/40 hover:border-amber-500/60',       action: () => {} },
            { icon: <Package size={16} className="text-emerald-400" />, label: 'Hardware Library',  desc: 'Bushings, clamps, pins…',         color: 'border-emerald-700/40 hover:border-emerald-500/60',   action: () => navigate('/workspace/p1') },
            { icon: <Target size={16} className="text-purple-400" />,  label: 'GD&T Templates',    desc: 'Pre-configured callout sets',     color: 'border-purple-700/40 hover:border-purple-500/60',    action: () => {} },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex items-start gap-3 p-3.5 bg-cadsurface-900 border ${item.color} rounded-xl text-left transition-all hover:bg-cadsurface-800 group`}
            >
              <div className="mt-0.5">{item.icon}</div>
              <div>
                <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Projects header + filters */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1">
            {(['all', 'active', 'draft', 'released'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-cadblue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-cadsurface-800'
                }`}
              >
                {f}
                {f === 'active' && allProjects.filter(p => p.status === 'active').length > 0 && (
                  <span className="ml-1.5 bg-cadblue-900 text-cadblue-300 px-1 rounded text-xs">
                    {allProjects.filter(p => p.status === 'active').length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2.5 py-1.5 focus-within:border-cadblue-500/60 transition-colors">
              <Search size={13} className="text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or P/N…"
                className="bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600 w-36"
              />
            </div>
            <button className="btn-ghost p-1.5 rounded-lg border border-cadsurface-700"><Filter size={13} /></button>
            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="btn-ghost p-1.5 rounded-lg border border-cadsurface-700">
              {viewMode === 'grid' ? <List size={13} /> : <Grid2x2 size={13} />}
            </button>
          </div>
        </div>

        {/* Project grid */}
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'}>
          {filtered.map((project) =>
            viewMode === 'grid' ? (
              <ProjectCard key={project.id} project={project} onClick={() => navigate(`/workspace/${project.id}`)} />
            ) : (
              <ProjectListRow key={project.id} project={project} onClick={() => navigate(`/workspace/${project.id}`)} />
            )
          )}

          {viewMode === 'grid' && (
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="border-2 border-dashed border-cadsurface-700 hover:border-cadblue-600/50 rounded-xl h-64 flex flex-col items-center justify-center gap-3 transition-all hover:bg-cadsurface-900/50 group"
            >
              <div className="w-12 h-12 rounded-xl bg-cadsurface-800 group-hover:bg-cadblue-900/40 flex items-center justify-center transition-colors">
                <Plus size={20} className="text-slate-500 group-hover:text-cadblue-400 transition-colors" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">New Tooling Design</p>
                <p className="text-xs text-slate-600 mt-0.5">Jig, fixture, end effector, gauge…</p>
              </div>
            </button>
          )}
        </div>

        {/* Tooling Templates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              Tooling Templates
            </h2>
            <button className="text-xs text-cadblue-400 hover:text-cadblue-300 flex items-center gap-1">
              Browse all <ChevronRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {TOOLING_TEMPLATES.map((t) => (
              <button
                key={t.label}
                className={`flex flex-col items-center gap-2 p-3 bg-cadsurface-900 border border-cadsurface-700 hover:border-cadblue-600/40 rounded-xl transition-all ${t.bg} group`}
              >
                <div className="w-10 h-10 rounded-lg bg-cadsurface-800 group-hover:bg-cadsurface-700 flex items-center justify-center transition-colors">
                  <span className={t.color}>{t.icon}</span>
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom row: recents + team activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Files */}
          <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Clock size={13} className="text-slate-400" />
              Recently Opened
            </h3>
            <div className="space-y-2">
              {allProjects.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/workspace/${p.id}`)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-cadsurface-800 transition-colors group text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-cadsurface-800 flex items-center justify-center shrink-0">
                    {CATEGORY_ICON[p.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.partNumber} · {p.revision} · {p.updatedAt}</p>
                  </div>
                  <ArrowRight size={12} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Team Activity */}
          <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Users size={13} className="text-slate-400" />
              Team Activity
            </h3>
            <div className="space-y-2">
              {recentActivity.length === 0 ? (
                <p className="text-xs text-slate-600 py-4 text-center">No recent activity</p>
              ) : recentActivity.map((a, i) => {
                const initials = a.user_id.slice(0, 2).toUpperCase();
                const colors = ['bg-emerald-800 text-emerald-300', 'bg-cadblue-800 text-cadblue-300', 'bg-purple-800 text-purple-300', 'bg-amber-800 text-amber-300', 'bg-teal-800 text-teal-300'];
                return (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-cadsurface-800 transition-colors">
                    <div className={`w-6 h-6 rounded-full ${colors[i % colors.length]} border border-cadsurface-700 flex items-center justify-center text-xs font-bold shrink-0`}>
                      {initials}
                    </div>
                    <div>
                      <p className="text-xs text-slate-300 leading-relaxed">{a.action.replace('.', ' — ')}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
