import { useState, useCallback, useEffect, useRef } from 'react';
import {
  IS_DEMO, createStudy, fetchStudy, fetchStudies, selectStudyVariation,
} from '../../lib/api';
import type { ApiStudy, ApiStudyVariation } from '../../lib/api';
import { useWorkspace } from '../../store/workspaceStore';
import {
  Sparkles, FlaskConical, RefreshCw, CheckCircle2, XCircle, Loader2,
  SplitSquareHorizontal, BarChart3, X, Star, Zap, Clock, Box,
  ArrowRight, ChevronRight,
} from 'lucide-react';

// ── Goal definitions ──────────────────────────────────────────────────────────

const GOALS = [
  { id: 'strength',          label: 'Strength',      desc: 'Max load bearing capacity'  },
  { id: 'weight',            label: 'Lightweight',   desc: 'Minimize material usage'     },
  { id: 'manufacturability', label: 'Printability',  desc: 'Print-friendly geometry'     },
  { id: 'cost',              label: 'Cost',          desc: 'Minimize material cost'       },
  { id: 'grip_area',         label: 'Grip Area',     desc: 'Maximize contact surface'    },
] as const;

type GoalId = typeof GOALS[number]['id'];

// ── Demo data generator ───────────────────────────────────────────────────────

function makeDemoVariation(i: number, count: number, goals: string[]): ApiStudyVariation {
  const isLight = goals.includes('weight');
  const isStrength = goals.includes('strength');
  const seed = (i + 1) / count;

  const weight = isLight
    ? 55 + i * 18 + Math.round(seed * 25)
    : 110 + i * 22 + Math.round(seed * 40);
  const material = Math.round(weight * (1.4 + seed * 0.7));
  const printTime = isLight
    ? 140 + i * 45 + Math.round(seed * 50)
    : 200 + i * 65 + Math.round(seed * 80);
  const score = isStrength
    ? Math.max(0.42, 0.95 - i * 0.07 + seed * 0.05)
    : Math.max(0.42, 0.72 + seed * 0.22 - i * 0.04);

  return {
    id: `demo-v${i}`,
    study_id: 'demo-study',
    variant_index: i,
    status: 'ready',
    goals,
    metrics: { estimated_weight_g: weight, material_usage_cc: material, print_time_min: printTime },
    gltf_url: null,
    score: Math.round(score * 100) / 100,
  };
}

function makeDemoStudy(count: number, goals: string[]): ApiStudy {
  return {
    id: 'demo-study',
    project_id: 'demo',
    status: 'complete',
    count,
    goals,
    variations: Array.from({ length: count }, (_, i) => makeDemoVariation(i, count, goals)),
    created_at: new Date().toISOString(),
  };
}

function formatPrintTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Variation thumbnail ───────────────────────────────────────────────────────

const THUMB_PALETTES = [
  ['#1e3a5f', '#3b82f6'],
  ['#1a3a2a', '#10b981'],
  ['#3a2a10', '#f59e0b'],
  ['#2d1a4a', '#8b5cf6'],
  ['#3a1a1a', '#ef4444'],
  ['#1a3040', '#06b6d4'],
  ['#2a3a1a', '#84cc16'],
  ['#3a2a40', '#a855f7'],
  ['#3a1a30', '#ec4899'],
  ['#1a2040', '#6366f1'],
];

function VariationThumbnail({ index, score }: { index: number; score: number }) {
  const [bg, accent] = THUMB_PALETTES[index % THUMB_PALETTES.length];
  const pid = `g${index}`;
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{ height: 110, background: `linear-gradient(135deg, ${bg} 0%, #0d1424 100%)` }}
    >
      <svg className="absolute inset-0 w-full h-full opacity-15">
        <defs>
          <pattern id={pid} width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M 18 0 L 0 0 0 18" fill="none" stroke={accent} strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pid})`} />
      </svg>
      <svg width="72" height="72" viewBox="0 0 80 80" className="relative z-10">
        <polygon points="40,8 68,24 68,56 40,72 12,56 12,24"
          fill="none" stroke={accent} strokeWidth="1.5" opacity="0.65" />
        <polygon points="40,8 68,24 40,40 12,24" fill={accent} opacity="0.14" />
        <polygon points="12,24 40,40 40,72 12,56" fill={accent} opacity="0.09" />
        <polygon points="68,24 40,40 40,72 68,56" fill={accent} opacity="0.07" />
        <line x1="40" y1="40" x2="40" y2="8"  stroke={accent} strokeWidth="0.8" opacity="0.45" />
        <line x1="40" y1="40" x2="12" y2="24" stroke={accent} strokeWidth="0.8" opacity="0.45" />
        <line x1="40" y1="40" x2="68" y2="24" stroke={accent} strokeWidth="0.8" opacity="0.45" />
      </svg>
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-full px-1.5 py-0.5">
        <Star size={8} className="text-amber-400 fill-amber-400" />
        <span className="font-mono text-amber-300" style={{ fontSize: '9px' }}>{Math.round(score * 100)}%</span>
      </div>
    </div>
  );
}

// ── Variation card ────────────────────────────────────────────────────────────

function VariationCard({
  variation, isCompared, onToggleCompare, onUse,
}: {
  variation: ApiStudyVariation;
  isCompared: boolean;
  onToggleCompare: () => void;
  onUse: () => void;
}) {
  const ready = variation.status === 'ready';
  const failed = variation.status === 'failed';
  const generating = variation.status === 'generating';

  return (
    <div
      className={`relative flex flex-col rounded-xl border overflow-hidden transition-all ${
        isCompared
          ? 'border-cadblue-500 shadow-md shadow-cadblue-950/60 ring-1 ring-cadblue-500/25'
          : 'border-cadsurface-700 hover:border-cadsurface-500'
      }`}
      style={{ background: '#0d1424' }}
    >
      {/* Status stripe */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${
        ready ? 'bg-emerald-500' : failed ? 'bg-red-500' : 'bg-cadblue-500 animate-pulse'
      }`} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-300">Variant {variation.variant_index + 1}</span>
          {ready     && <CheckCircle2 size={10} className="text-emerald-400" />}
          {failed    && <XCircle size={10} className="text-red-400" />}
          {generating && <Loader2 size={10} className="text-cadblue-400 animate-spin" />}
        </div>
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none"
          onClick={e => { e.stopPropagation(); onToggleCompare(); }}
        >
          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
            isCompared ? 'bg-cadblue-600 border-cadblue-500' : 'border-cadsurface-600 bg-cadsurface-800'
          }`}>
            {isCompared && <CheckCircle2 size={8} className="text-white" />}
          </div>
          <span className="text-cadsurface-500" style={{ fontSize: '10px' }}>Compare</span>
        </label>
      </div>

      {/* Thumbnail */}
      {generating ? (
        <div className="flex items-center justify-center bg-cadsurface-900" style={{ height: 110 }}>
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={22} className="text-cadblue-400 animate-spin" />
            <span className="text-xs text-slate-500">Generating…</span>
          </div>
        </div>
      ) : failed ? (
        <div className="flex items-center justify-center bg-cadsurface-900" style={{ height: 110 }}>
          <div className="flex flex-col items-center gap-2">
            <XCircle size={22} className="text-red-400" />
            <span className="text-xs text-red-500">Failed</span>
          </div>
        </div>
      ) : (
        <VariationThumbnail index={variation.variant_index} score={variation.score} />
      )}

      {/* Metrics */}
      <div className="px-3 py-2 space-y-1 border-t border-cadsurface-700/50">
        {[
          { label: 'Weight',     value: `${variation.metrics.estimated_weight_g}g`,           icon: '⚖' },
          { label: 'Material',   value: `${variation.metrics.material_usage_cc}cc`,            icon: '◈' },
          { label: 'Print time', value: formatPrintTime(variation.metrics.print_time_min),    icon: '◷' },
        ].map(m => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-cadsurface-500" style={{ fontSize: '10px' }}>{m.icon} {m.label}</span>
            <span className="font-mono text-slate-300" style={{ fontSize: '10px' }}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-3 pb-3 pt-1.5">
        <button
          onClick={e => { e.stopPropagation(); onUse(); }}
          disabled={!ready}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-cadblue-600/80 hover:bg-cadblue-600 disabled:opacity-40 text-white font-medium transition-colors"
        >
          Use This <ArrowRight size={10} />
        </button>
      </div>
    </div>
  );
}

// ── Comparison view ───────────────────────────────────────────────────────────

function CompareView({
  variations, compareIds, onClose, onUse,
}: {
  variations: ApiStudyVariation[];
  compareIds: string[];
  onClose: () => void;
  onUse: (v: ApiStudyVariation) => void;
}) {
  const selected = variations.filter(v => compareIds.includes(v.id));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center gap-3">
          <SplitSquareHorizontal size={15} className="text-cadblue-400" />
          <div>
            <p className="text-sm font-bold text-slate-200">Side-by-Side Comparison</p>
            <p className="text-xs text-slate-500">{selected.length} variants selected</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-cadsurface-700 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: `repeat(${Math.min(selected.length, 4)}, minmax(220px, 1fr))` }}
        >
          {selected.map(v => (
            <div
              key={v.id}
              className="flex flex-col rounded-xl border border-cadsurface-700 overflow-hidden"
              style={{ background: '#0d1424' }}
            >
              <div className="px-4 py-3 border-b border-cadsurface-700 bg-cadsurface-900">
                <p className="text-sm font-bold text-slate-200">Variant {v.variant_index + 1}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Star size={10} className="text-amber-400 fill-amber-400" />
                  <span className="text-xs font-mono text-amber-300">{Math.round(v.score * 100)}% score</span>
                </div>
              </div>

              <div style={{ height: 180 }}>
                <VariationThumbnail index={v.variant_index} score={v.score} />
              </div>

              <div className="p-4 space-y-2.5 flex-1">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Metrics</p>
                {[
                  { label: 'Estimated Weight', value: `${v.metrics.estimated_weight_g}g`,         Icon: Box   },
                  { label: 'Material Usage',   value: `${v.metrics.material_usage_cc}cc`,          Icon: Box   },
                  { label: 'Print Time',       value: formatPrintTime(v.metrics.print_time_min),   Icon: Clock },
                  { label: 'Optim. Score',     value: `${Math.round(v.score * 100)}%`,             Icon: BarChart3 },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="bg-cadsurface-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon size={9} className="text-slate-600" />
                      <span className="text-slate-600" style={{ fontSize: '10px' }}>{label}</span>
                    </div>
                    <p className="text-sm font-mono text-slate-200">{value}</p>
                  </div>
                ))}

                <button
                  onClick={() => onUse(v)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white font-medium transition-colors"
                >
                  Use Variant {v.variant_index + 1} <ArrowRight size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main StudyMode ─────────────────────────────────────────────────────────────

export default function StudyMode({ projectId = 'demo' }: { projectId?: string }) {
  const { dispatch } = useWorkspace();
  const [count, setCount] = useState<3 | 5 | 10>(3);
  const [selectedGoals, setSelectedGoals] = useState<GoalId[]>(['strength', 'weight']);
  const [study, setStudy] = useState<ApiStudy | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [activeVariant, setActiveVariant] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing studies on mount
  useEffect(() => {
    if (IS_DEMO || !projectId || projectId === 'demo') return;
    fetchStudies(projectId).then(data => {
      if (data && data.length > 0) {
        dispatch({ type: 'SET_STUDIES', studies: data });
        setStudy(data[0]);
      }
    }).catch(() => {});
  }, [projectId, dispatch]);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setGeneratingIdx(0);
    setCompareIds([]);
    setCompareMode(false);

    if (IS_DEMO || projectId === 'demo') {
      // Simulate progressive generation with per-variant reveal
      const skeleton: ApiStudy = {
        id: 'demo-study',
        project_id: 'demo',
        status: 'running',
        count,
        goals: selectedGoals,
        variations: Array.from({ length: count }, (_, i) => ({
          id: `demo-v${i}`,
          study_id: 'demo-study',
          variant_index: i,
          status: 'generating' as const,
          goals: selectedGoals,
          metrics: { estimated_weight_g: 0, material_usage_cc: 0, print_time_min: 0 },
          gltf_url: null,
          score: 0,
        })),
        created_at: new Date().toISOString(),
      };
      setStudy(skeleton);

      const complete = makeDemoStudy(count, selectedGoals);
      for (let i = 0; i < count; i++) {
        await new Promise(r => setTimeout(r, 900 + Math.random() * 700));
        setGeneratingIdx(i + 1);
        const readyVar = { ...complete.variations[i], status: 'ready' as const };
        setStudy(prev => {
          if (!prev) return prev;
          const vars = prev.variations.map((v, idx) => idx === i ? readyVar : v);
          return { ...prev, variations: vars, status: i === count - 1 ? 'complete' : 'running' };
        });
      }
      dispatch({ type: 'ADD_STUDY', study: complete });
    } else {
      const result = await createStudy(projectId, { count, goals: selectedGoals });
      if (result) {
        setStudy(result);
        dispatch({ type: 'ADD_STUDY', study: result });
        pollRef.current = setInterval(async () => {
          const updated = await fetchStudy(projectId, result.id);
          if (updated) {
            setStudy(updated);
            if (updated.status === 'complete' || updated.status === 'failed') {
              clearInterval(pollRef.current!);
              setGenerating(false);
            }
          }
        }, 2000);
        return;
      }
    }

    setGenerating(false);
  }, [count, selectedGoals, projectId, generating, dispatch]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const toggleGoal = (goal: GoalId) => {
    setSelectedGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal],
    );
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleUse = useCallback(async (v: ApiStudyVariation) => {
    if (!IS_DEMO && study) {
      await selectStudyVariation(projectId, study.id, v.id).catch(() => {});
    }
    dispatch({ type: 'SET_ACTIVE_STUDY', study: study });
    setActiveVariant(v.variant_index + 1);
    setTimeout(() => setActiveVariant(null), 3000);
  }, [study, projectId, dispatch]);

  // ── Comparison view ──────────────────────────────────────────────────────────
  if (compareMode && compareIds.length >= 2) {
    return (
      <div className="flex flex-col h-full bg-cadsurface-950">
        <CompareView
          variations={study?.variations ?? []}
          compareIds={compareIds}
          onClose={() => setCompareMode(false)}
          onUse={v => { handleUse(v); setCompareMode(false); }}
        />
      </div>
    );
  }

  const readyCount = study?.variations.filter(v => v.status === 'ready').length ?? 0;

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-cadsurface-950 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-900/50 border border-violet-700/50 flex items-center justify-center">
              <FlaskConical size={15} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-200">Design Studies</h2>
              <p className="text-xs text-slate-500">Generate & compare AI-optimized variations</p>
            </div>
          </div>

          {study && !generating && compareIds.length >= 2 && (
            <button
              onClick={() => setCompareMode(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cadblue-600/20 border border-cadblue-600/40 text-cadblue-300 hover:bg-cadblue-600/30 transition-colors"
            >
              <SplitSquareHorizontal size={12} />
              Compare ({compareIds.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Config toolbar ── */}
      <div className="px-6 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Count */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">Variations</span>
            <div className="flex items-center bg-cadsurface-800 rounded-lg border border-cadsurface-700 p-0.5 gap-0.5">
              {([3, 5, 10] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    count === n ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-slate-500 shrink-0">Optimize for</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {GOALS.map(g => {
                const active = selectedGoals.includes(g.id as GoalId);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGoal(g.id as GoalId)}
                    title={g.desc}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                      active
                        ? 'bg-violet-600/20 border-violet-500/60 text-violet-300'
                        : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300 hover:border-cadsurface-500'
                    }`}
                  >
                    {active && <CheckCircle2 size={8} />}
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || selectedGoals.length === 0}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
              generating || selectedGoals.length === 0
                ? 'bg-cadsurface-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-600 to-cadblue-600 text-white shadow-lg shadow-violet-900/30 hover:brightness-110 active:scale-95'
            }`}
          >
            {generating ? (
              <><Loader2 size={13} className="animate-spin" /> Generating {generatingIdx}/{count}…</>
            ) : (
              <><Sparkles size={13} /> Generate Variations</>
            )}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto">
        {!study ? (
          /* Empty state */
          <div className="flex items-center justify-center h-full min-h-96">
            <div className="text-center max-w-lg px-6">
              <div className="w-20 h-20 rounded-2xl bg-violet-900/20 border border-violet-700/30 flex items-center justify-center mx-auto mb-5">
                <FlaskConical size={30} className="text-violet-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-300 mb-2">Design Study Lab</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                AI generates multiple optimized design variations based on your goals.
                Compare them side-by-side and pick the best one.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-7 text-left">
                {[
                  { Icon: Sparkles,              title: 'AI-Optimized',   desc: 'Each variant explores a different optimization angle' },
                  { Icon: BarChart3,             title: 'Compare Metrics',desc: 'Weight, material, print time scored side by side'      },
                  { Icon: Zap,                   title: 'One-Click Deploy',desc: 'Use any variant as your active design instantly'      },
                ].map(({ Icon, title, desc }) => (
                  <div key={title} className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-3">
                    <Icon size={13} className="text-violet-400 mb-2" />
                    <p className="text-xs font-semibold text-slate-300">{title}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-tight">{desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={selectedGoals.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-600 to-cadblue-600 text-white shadow-lg shadow-violet-900/40 hover:brightness-110 transition-all mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={15} />
                Generate {count} Variations
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* Study status row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                  study.status === 'complete' ? 'bg-emerald-950/40 border-emerald-700/40 text-emerald-300' :
                  study.status === 'failed'   ? 'bg-red-950/40 border-red-700/40 text-red-300' :
                                               'bg-cadblue-950/40 border-cadblue-700/40 text-cadblue-300'
                }`}>
                  {study.status === 'complete' ? <CheckCircle2 size={11} /> :
                   study.status === 'failed'   ? <XCircle size={11} /> :
                                                 <Loader2 size={11} className="animate-spin" />}
                  {study.status === 'complete'
                    ? `${readyCount} of ${study.count} variants ready`
                    : study.status === 'failed'
                    ? 'Study failed'
                    : `Generating ${generatingIdx}/${count}…`}
                </div>
                <span className="text-xs text-slate-600">
                  Goals: {study.goals
                    .map(g => GOALS.find(gl => gl.id === g)?.label ?? g)
                    .join(', ')}
                </span>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadsurface-500 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
                New Study
              </button>
            </div>

            {/* Gallery grid */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
            >
              {study.variations.map(v => (
                <VariationCard
                  key={v.id}
                  variation={v}
                  isCompared={compareIds.includes(v.id)}
                  onToggleCompare={() => toggleCompare(v.id)}
                  onUse={() => handleUse(v)}
                />
              ))}
            </div>

            {/* Compare banner */}
            {compareIds.length >= 2 && (
              <div className="mt-6 p-4 bg-cadblue-950/30 border border-cadblue-700/40 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SplitSquareHorizontal size={14} className="text-cadblue-400" />
                  <span className="text-sm text-cadblue-300 font-medium">
                    {compareIds.length} variants selected for comparison
                  </span>
                </div>
                <button
                  onClick={() => setCompareMode(true)}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-cadblue-600 text-white font-bold hover:bg-cadblue-500 transition-colors"
                >
                  Compare Side by Side <ChevronRight size={11} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Active variant banner ── */}
      {activeVariant !== null && (
        <div className="flex items-center gap-2 px-6 py-2 bg-emerald-950/60 border-t border-emerald-700/40 shrink-0">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <span className="text-xs text-emerald-300 font-medium">
            Variant {activeVariant} set as active design
          </span>
        </div>
      )}

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 px-6 py-1.5 border-t border-cadsurface-700 shrink-0 bg-cadsurface-900/60">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            generating          ? 'bg-cadblue-400 animate-pulse' :
            study?.status === 'complete' ? 'bg-emerald-400' : 'bg-slate-700'
          }`} />
          <span className="text-xs text-slate-500">
            {generating
              ? `Generating… ${generatingIdx}/${count}`
              : study?.status === 'complete'
              ? `Study complete · ${readyCount} variants`
              : 'Ready to generate'}
          </span>
        </div>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-slate-600">{IS_DEMO ? 'Demo mode' : `Project ${projectId?.slice(0, 8)}`}</span>
        {compareIds.length > 0 && (
          <>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-cadblue-400">{compareIds.length} selected</span>
            {compareIds.length >= 2 && (
              <button
                onClick={() => setCompareMode(true)}
                className="text-xs text-cadblue-300 underline hover:text-cadblue-200 transition-colors"
              >
                compare now
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
