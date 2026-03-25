/**
 * ComponentLibraryPanel — Standard fixture component catalog + project parts list.
 *
 * Three sections:
 *   1. "Suggested" — AI-recommended components after fixture generation
 *   2. "In This Project" — components already added
 *   3. Browsable catalog with category filter + search
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  Search, X, Lightbulb, Package,
} from 'lucide-react';
import {
  fetchComponentLibrary, fetchProjectComponents,
  addComponentToProject, removeProjectComponent,
  IS_DEMO,
  type StandardComponent, type ProjectComponent, type ComponentLibraryResponse,
  type ComponentSuggestion,
} from '../../lib/api';

// ── Category icon map (Lucide names → emoji fallbacks for simplicity) ──────────
const CATEGORY_EMOJI: Record<string, string> = {
  clamps:       '🔩',
  pins:         '📍',
  fasteners:    '🔧',
  supports:     '🏗️',
  bases:        '⬛',
  end_effectors:'🤖',
};

// ── Demo data ──────────────────────────────────────────────────────────────────

const DEMO_PROJECT_COMPONENTS: ProjectComponent[] = [
  {
    id: 'pc1', project_id: 'demo', component_id: 'toggle_clamp_medium',
    component_name: 'Toggle Clamp - Medium (GH-225D)', category: 'clamps',
    quantity: 2, position_notes: '', specifications: { holding_force_lbs: 500 },
  },
  {
    id: 'pc2', project_id: 'demo', component_id: 'dowel_pin_6mm',
    component_name: 'Dowel Pin - 6mm × 20mm', category: 'pins',
    quantity: 2, position_notes: '', specifications: { diameter_mm: 6, length_mm: 20 },
  },
];

const DEMO_SUGGESTIONS: ComponentSuggestion[] = [
  { component_id: 'rest_pad_25mm', quantity: 3, reason: 'Three rest pads define the primary datum plane.' },
  { component_id: 'diamond_pin_6mm', quantity: 1, reason: 'Diamond pin for secondary datum prevents over-constraint.' },
];

// ── Spec pill ──────────────────────────────────────────────────────────────────

function SpecPills({ specs }: { specs: Record<string, string | number> }) {
  const entries = Object.entries(specs).slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([k, v]) => (
        <span key={k} className="px-1.5 py-0.5 rounded bg-cadsurface-700 text-[9px] text-slate-400">
          {String(v)}{typeof v === 'number' && k.endsWith('_mm') ? 'mm' : ''}
        </span>
      ))}
    </div>
  );
}

// ── Component card ─────────────────────────────────────────────────────────────

interface ComponentCardProps {
  component: StandardComponent;
  onAdd: (id: string, qty: number) => Promise<void>;
  adding: boolean;
  suggestionReason?: string;
}

function ComponentCard({ component, onAdd, adding, suggestionReason }: ComponentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState(1);
  const emoji = CATEGORY_EMOJI[component.category] ?? '📦';

  return (
    <div className={`rounded-lg bg-cadsurface-800 border transition-all ${
      suggestionReason ? 'border-amber-700/60' : 'border-cadsurface-700 hover:border-cadsurface-600'
    }`}>
      <div className="flex items-start gap-2 p-2.5">
        <span className="text-base mt-0.5 shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-1 cursor-pointer"
            onClick={() => setExpanded(v => !v)}
          >
            <span className="text-xs font-medium text-slate-200 leading-tight">{component.name}</span>
            {expanded
              ? <ChevronDown size={10} className="text-slate-500 shrink-0" />
              : <ChevronRight size={10} className="text-slate-500 shrink-0" />
            }
          </div>
          {suggestionReason && (
            <p className="text-[10px] text-amber-400 mt-0.5">{suggestionReason}</p>
          )}
          {expanded && (
            <>
              {component.description && (
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{component.description}</p>
              )}
              <SpecPills specs={component.specifications} />
            </>
          )}
        </div>
        {/* Qty + Add */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-9 px-1 py-0.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-[10px] text-slate-300 text-center outline-none"
          />
          <button
            onClick={() => onAdd(component.id, qty)}
            disabled={adding}
            className="w-6 h-6 flex items-center justify-center rounded bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-40 transition-all"
            title="Add to project"
          >
            {adding ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project component row ──────────────────────────────────────────────────────

function ProjectComponentRow({
  item,
  onRemove,
}: {
  item: ProjectComponent;
  onRemove: (id: string) => void;
}) {
  const emoji = CATEGORY_EMOJI[item.category] ?? '📦';
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-cadsurface-800 border border-cadsurface-700 group hover:border-cadsurface-600 transition-all">
      <span className="text-sm shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-200 truncate block">{item.component_name}</span>
        {item.position_notes && (
          <span className="text-[10px] text-slate-500">{item.position_notes}</span>
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 shrink-0">×{item.quantity}</span>
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-all"
        title="Remove"
      >
        <Trash2 size={9} />
      </button>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  projectId?: string;
  /** AI-suggested components from the chat WebSocket */
  suggestions?: ComponentSuggestion[];
}

export default function ComponentLibraryPanel({ projectId, suggestions: externalSuggestions }: Props) {
  const [library, setLibrary] = useState<ComponentLibraryResponse | null>(null);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [loadingProj, setLoadingProj] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(true);
  const [showProject, setShowProject] = useState(true);

  const suggestions = externalSuggestions ?? (IS_DEMO ? DEMO_SUGGESTIONS : []);

  // Load catalog
  useEffect(() => {
    if (IS_DEMO) {
      // Build a minimal library from demo data for display
      setLibrary(null);
      setLoadingLib(false);
      return;
    }
    fetchComponentLibrary().then(data => {
      if (data) setLibrary(data);
      setLoadingLib(false);
    });
  }, []);

  // Load project components
  useEffect(() => {
    if (IS_DEMO || !projectId) {
      setProjectComponents(DEMO_PROJECT_COMPONENTS);
      setLoadingProj(false);
      return;
    }
    fetchProjectComponents(projectId).then(data => {
      if (data) setProjectComponents(data);
      setLoadingProj(false);
    });
  }, [projectId]);

  const handleAdd = useCallback(async (componentId: string, qty: number) => {
    if (!projectId && !IS_DEMO) return;
    setAddingId(componentId);

    if (IS_DEMO || !projectId) {
      // Demo: synthesise a row from the catalog
      const found = library?.components.find(c => c.id === componentId);
      if (found) {
        const fake: ProjectComponent = {
          id: `pc-${Date.now()}`,
          project_id: projectId || 'demo',
          component_id: componentId,
          component_name: found.name,
          category: found.category,
          quantity: qty,
          position_notes: '',
          specifications: found.specifications,
        };
        setProjectComponents(prev => [...prev, fake]);
      }
    } else {
      const result = await addComponentToProject(projectId, { component_id: componentId, quantity: qty });
      if (result) setProjectComponents(prev => [...prev, result]);
    }

    setAddingId(null);
  }, [projectId, library]);

  const handleRemove = useCallback(async (itemId: string) => {
    setProjectComponents(prev => prev.filter(c => c.id !== itemId));
    if (!IS_DEMO && projectId) {
      await removeProjectComponent(projectId, itemId);
    }
  }, [projectId]);

  // Filter catalog
  const allComponents = library?.components ?? [];
  const categories = library?.categories ?? {};
  const filtered = allComponents.filter(c => {
    if (activeCategory && c.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Map suggestion component_ids to catalog entries
  const suggestedComponents = suggestions
    .map(s => ({ ...s, component: allComponents.find(c => c.id === s.component_id) }))
    .filter(s => s.component);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <BookOpen size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Parts Library</span>
        <span className="ml-auto text-[10px] text-slate-500">{projectComponents.length} in project</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* ── AI Suggestions ────────────────────────────────────────────────── */}
        {suggestedComponents.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={11} className="text-amber-400" />
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">AI Suggested</span>
            </div>
            <div className="space-y-1.5">
              {suggestedComponents.map(s => (
                <ComponentCard
                  key={s.component_id}
                  component={s.component!}
                  onAdd={handleAdd}
                  adding={addingId === s.component_id}
                  suggestionReason={s.reason}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── In This Project ───────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setShowProject(v => !v)}
            className="flex items-center gap-1.5 w-full mb-2"
          >
            {showProject ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
            <Package size={11} className="text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">In This Project</span>
            <span className="ml-auto text-[10px] text-slate-600">{projectComponents.length}</span>
          </button>
          {showProject && (
            loadingProj ? (
              <div className="flex justify-center py-4">
                <Loader2 size={14} className="animate-spin text-slate-500" />
              </div>
            ) : projectComponents.length === 0 ? (
              <p className="text-[10px] text-slate-500 text-center py-3">No parts added yet. Browse the catalog below.</p>
            ) : (
              <div className="space-y-1">
                {projectComponents.map(item => (
                  <ProjectComponentRow key={item.id} item={item} onRemove={handleRemove} />
                ))}
              </div>
            )
          )}
        </section>

        {/* ── Catalog ───────────────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setShowCatalog(v => !v)}
            className="flex items-center gap-1.5 w-full mb-2"
          >
            {showCatalog ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
            <BookOpen size={11} className="text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Catalog</span>
            {!loadingLib && <span className="ml-auto text-[10px] text-slate-600">{filtered.length}</span>}
          </button>

          {showCatalog && (
            <>
              {/* Search */}
              <div className="relative mb-2">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search components…"
                  className="w-full pl-6 pr-6 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cadblue-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Category tabs */}
              {Object.keys(categories).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                      activeCategory === null
                        ? 'bg-cadblue-600 text-white'
                        : 'bg-cadsurface-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  {Object.entries(categories).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                        activeCategory === key
                          ? 'text-white'
                          : 'bg-cadsurface-700 text-slate-400 hover:text-slate-200'
                      }`}
                      style={activeCategory === key ? { backgroundColor: cat.color } : {}}
                    >
                      {CATEGORY_EMOJI[key]} {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Component list */}
              {loadingLib ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-slate-500" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-[10px] text-slate-500 text-center py-4">
                  {search ? 'No components match your search.' : 'No components in this category.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(component => (
                    <ComponentCard
                      key={component.id}
                      component={component}
                      onAdd={handleAdd}
                      adding={addingId === component.id}
                    />
                  ))}
                </div>
              )}

              {IS_DEMO && (
                <p className="text-[10px] text-slate-600 text-center mt-3">
                  Demo mode — catalog loads from live API in production.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
