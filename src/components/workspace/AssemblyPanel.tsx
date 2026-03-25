import { useEffect, useState } from 'react';
import { Layers, Eye, EyeOff, ChevronRight, Box, Loader2, Info } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import type { AssemblyComponent } from '../../store/workspaceStore';

// ── API fetch ─────────────────────────────────────────────────────────────────

const API_URL: string | undefined =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://scalecad-api.fly.dev' : undefined);

async function fetchAssembly(projectId: string): Promise<{
  fixture_id: string | null;
  fixture_version: number | null;
  components: AssemblyComponent[];
  total: number;
} | null> {
  if (!API_URL) return null;
  const token = localStorage.getItem('scalecad_token');
  try {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/assembly`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Component type config ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  base:    { label: 'Base',    color: 'text-slate-300',  bg: 'bg-slate-700/40',   border: 'border-slate-600' },
  clamp:   { label: 'Clamp',   color: 'text-blue-300',   bg: 'bg-blue-900/30',    border: 'border-blue-700' },
  pin:     { label: 'Pin',     color: 'text-yellow-300', bg: 'bg-yellow-900/30',  border: 'border-yellow-700' },
  spacer:  { label: 'Spacer',  color: 'text-cyan-300',   bg: 'bg-cyan-900/30',    border: 'border-cyan-700' },
  bracket: { label: 'Bracket', color: 'text-purple-300', bg: 'bg-purple-900/30',  border: 'border-purple-700' },
  bushing: { label: 'Bushing', color: 'text-orange-300', bg: 'bg-orange-900/30',  border: 'border-orange-700' },
  custom:  { label: 'Custom',  color: 'text-slate-400',  bg: 'bg-slate-800/40',   border: 'border-slate-600' },
};

const TYPE_DOT: Record<string, string> = {
  base: 'bg-slate-400', clamp: 'bg-blue-400', pin: 'bg-yellow-400',
  spacer: 'bg-cyan-400', bracket: 'bg-purple-400', bushing: 'bg-orange-400', custom: 'bg-slate-500',
};

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AssemblyPanel({ projectId }: { projectId?: string }) {
  const { state, dispatch } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [fixtureVersion, setFixtureVersion] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const components = state.assemblyComponents;
  const hoveredId = state.hoveredComponentId;

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchAssembly(projectId)
      .then((data) => {
        if (data) {
          dispatch({ type: 'SET_ASSEMBLY_COMPONENTS', components: data.components });
          setFixtureVersion(data.fixture_version);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, dispatch]);

  function toggleHidden(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const typeCounts = components.reduce<Record<string, number>>((acc, c) => {
    acc[c.component_type] = (acc[c.component_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-cadsurface-900 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-slate-100">Assembly</span>
          {fixtureVersion !== null && (
            <span className="ml-auto text-xs text-slate-500 font-mono">v{fixtureVersion}</span>
          )}
        </div>
        {components.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(typeCounts).map(([type, count]) => {
              const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.custom;
              return (
                <span key={type}
                  className={`text-xs px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                  {count}× {cfg.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-24 gap-2 text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading assembly…</span>
          </div>
        )}

        {!loading && components.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 px-4 text-center">
            <Box size={28} className="text-slate-600" />
            <p className="text-xs text-slate-500 leading-relaxed">
              No assembly components yet.
              <br />
              Generate a fixture to populate the BOM.
            </p>
          </div>
        )}

        {!loading && components.length > 0 && (
          <div className="py-1">
            {components.map((comp, idx) => {
              const cfg = TYPE_CONFIG[comp.component_type] ?? TYPE_CONFIG.custom;
              const isHovered = hoveredId === comp.id;
              const isHidden = hiddenIds.has(comp.id);
              const isExpanded = expandedId === comp.id;

              return (
                <div key={comp.id}>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group ${
                      isHovered ? 'bg-indigo-900/30' : 'hover:bg-cadsurface-800'
                    } ${isHidden ? 'opacity-40' : ''}`}
                    onMouseEnter={() => dispatch({ type: 'SET_HOVERED_COMPONENT', id: comp.id })}
                    onMouseLeave={() => dispatch({ type: 'SET_HOVERED_COMPONENT', id: null })}
                    onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                  >
                    {/* Index badge */}
                    <span
                      className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold shrink-0 ${cfg.bg} ${cfg.color}`}
                    >
                      {idx + 1}
                    </span>

                    {/* Type dot */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[comp.component_type] ?? 'bg-slate-500'}`} />

                    {/* Name */}
                    <span className="text-xs font-medium text-slate-200 flex-1 truncate">{comp.name}</span>

                    {/* Type badge */}
                    <span className={`text-xs px-1 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color} shrink-0`}>
                      {cfg.label}
                    </span>

                    {/* Eye toggle */}
                    <button
                      title={isHidden ? 'Show' : 'Hide'}
                      onClick={(e) => { e.stopPropagation(); toggleHidden(comp.id); }}
                      className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>

                    {/* Expand chevron */}
                    <ChevronRight
                      size={12}
                      className={`shrink-0 text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mx-3 mb-2 p-2.5 rounded-lg bg-cadsurface-800 border border-cadsurface-700 text-xs space-y-1.5">
                      {comp.description && (
                        <div className="flex gap-1.5">
                          <Info size={11} className="text-slate-500 mt-0.5 shrink-0" />
                          <p className="text-slate-400 leading-relaxed">{comp.description}</p>
                        </div>
                      )}
                      {comp.material && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600 w-14 shrink-0">Material</span>
                          <span className="text-slate-300 font-mono">{comp.material}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-600 w-14 shrink-0">Type</span>
                        <span className={`font-mono ${cfg.color}`}>{comp.component_type}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {components.length > 0 && (
        <div className="px-3 py-2 border-t border-cadsurface-700 shrink-0">
          <p className="text-xs text-slate-500">
            {components.length} component{components.length !== 1 ? 's' : ''} · {components.filter(c => !hiddenIds.has(c.id)).length} visible
          </p>
        </div>
      )}
    </div>
  );
}
