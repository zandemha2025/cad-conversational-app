import { useState, useCallback, useEffect } from 'react';
import { fetchValidationResults, runValidation } from '../../lib/api';
import {
  ShieldAlert,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Printer,
  Wrench,
  Zap,
  Crosshair,
  FileCheck,
  Loader2,
} from 'lucide-react';

type Method = 'fdm' | 'cnc' | 'laser' | 'functional' | 'standards';
type Severity = 'error' | 'warning' | 'info' | 'ok';

interface Issue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  location?: number[] | string | null;
  node_ref?: string | null;
  fix_suggestion?: string | null;
  // legacy demo fields
  fix?: string;
  nodeRef?: string;
}

// ── API data transformation ────────────────────────────────────────────────────

interface ApiIssue {
  id: string;
  method: string;
  severity: string;
  title: string;
  detail: string;
  location?: number[] | null;
  node_ref?: string | null;
  fix_suggestion?: string | null;
}

interface ApiResult {
  id: string;
  project_id: string;
  method: string;
  issues: ApiIssue[];
  error_count: number;
  warning_count: number;
  ran_at: string;
}

function apiToIssues(results: ApiResult[]): Record<Method, Issue[]> {
  const out: Record<Method, Issue[]> = { fdm: [], cnc: [], laser: [], functional: [], standards: [] };
  for (const res of results) {
    const method = res.method as Method;
    if (!(method in out)) continue;
    // Parse issues_json if issues is a string (Supabase stores JSONB)
    let issues: ApiIssue[] = [];
    if (Array.isArray(res.issues)) {
      issues = res.issues;
    } else if (res.issues && typeof (res.issues as unknown) === 'string') {
      try { issues = JSON.parse(res.issues as unknown as string); } catch { issues = []; }
    }
    out[method] = issues.map(i => ({
      id: i.id,
      severity: (i.severity ?? 'info') as Severity,
      title: i.title,
      detail: i.detail,
      location: i.location,
      node_ref: i.node_ref,
      fix_suggestion: i.fix_suggestion,
    }));
  }
  return out;
}

// ── Method metadata ────────────────────────────────────────────────────────────

const METHOD_ICONS: Record<Method, React.ReactNode> = {
  fdm:        <Printer size={12} />,
  cnc:        <Wrench size={12} />,
  laser:      <Zap size={12} />,
  functional: <Crosshair size={12} />,
  standards:  <FileCheck size={12} />,
};

const METHOD_LABELS: Record<Method, string> = {
  fdm: 'FDM', cnc: 'CNC', laser: 'Laser', functional: 'Functional', standards: 'Standards',
};

const SEVERITY_META: Record<Severity, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  error:   { icon: <XCircle size={13} />,      color: 'text-red-400',      bg: 'bg-red-950/30',      border: 'border-red-700/40',      label: 'ERROR' },
  warning: { icon: <AlertTriangle size={13} />, color: 'text-amber-400',   bg: 'bg-amber-950/30',    border: 'border-amber-700/40',    label: 'WARNING' },
  info:    { icon: <Info size={13} />,          color: 'text-cadblue-400', bg: 'bg-cadblue-950/30',  border: 'border-cadblue-700/30',  label: 'INFO' },
  ok:      { icon: <CheckCircle2 size={13} />,  color: 'text-emerald-400', bg: 'bg-emerald-950/20',  border: 'border-emerald-700/30',  label: 'OK' },
};

// ── IssueCard ──────────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(issue.severity === 'error');
  const meta = SEVERITY_META[issue.severity];
  const locationStr = Array.isArray(issue.location)
    ? `[${(issue.location as number[]).map(n => n.toFixed(1)).join(', ')}]`
    : (issue.location as string | null | undefined) ?? null;
  const fix = issue.fix_suggestion ?? issue.fix ?? null;
  const nodeRef = issue.node_ref ?? issue.nodeRef ?? null;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${meta.border} ${meta.bg}`}>
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-snug ${meta.color}`}>{issue.title}</p>
          {locationStr && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{locationStr}</p>
          )}
        </div>
        <span className="text-slate-700 shrink-0 mt-0.5">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="h-px bg-cadsurface-700/60" />
          <p className="text-xs text-slate-400 leading-relaxed">{issue.detail}</p>

          {nodeRef && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Node:</span>
              <span className="text-xs font-mono text-violet-400 bg-violet-950/30 border border-violet-700/30 px-1.5 py-0.5 rounded">
                {nodeRef}
              </span>
            </div>
          )}

          {fix && (
            <div className="flex items-start gap-1.5 bg-cadsurface-900/60 rounded-lg px-2.5 py-2">
              <ArrowRight size={11} className="text-cadblue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-cadblue-300 leading-relaxed">{fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export default function ValidationPanel({ projectId = 'demo' }: { projectId?: string }) {
  const [activeMethod, setActiveMethod] = useState<Method>('fdm');
  const EMPTY_ISSUES: Record<Method, Issue[]> = { fdm: [], cnc: [], laser: [], functional: [], standards: [] };
  const [issues, setIssues] = useState<Record<Method, Issue[]>>(EMPTY_ISSUES);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!projectId && projectId !== 'demo');
  const [lastRun, setLastRun] = useState<string | null>(null);

  // ── Load results on mount ──
  useEffect(() => {
    if (!projectId || projectId === 'demo') {
      setFetching(false);
      return;
    }
    setFetching(true);
    fetchValidationResults(projectId)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const transformed = apiToIssues(data as ApiResult[]);
          // Only replace methods that returned data
          setIssues(prev => {
            const next = { ...prev };
            for (const m of Object.keys(transformed) as Method[]) {
              if (transformed[m].length > 0) next[m] = transformed[m];
            }
            return next;
          });
          const latest = (data as ApiResult[]).map(r => r.ran_at).sort().at(-1);
          if (latest) setLastRun(new Date(latest).toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [projectId]);

  // ── Re-run ──
  const handleRerun = useCallback(async () => {
    setLoading(true);
    if (!projectId || projectId === 'demo') {
      setLoading(false);
      return;
    }
    await runValidation(projectId, [activeMethod]);
    // Poll once after 2.5s
    await new Promise(r => setTimeout(r, 2500));
    const data = await fetchValidationResults(projectId, activeMethod);
    if (Array.isArray(data) && data.length > 0) {
      const transformed = apiToIssues(data as ApiResult[]);
      setIssues(prev => ({ ...prev, [activeMethod]: transformed[activeMethod] }));
    }
    setLastRun(new Date().toLocaleTimeString());
    setLoading(false);
  }, [projectId, activeMethod]);

  const methodIssues = issues[activeMethod] ?? [];
  const errors   = methodIssues.filter(i => i.severity === 'error');
  const warnings = methodIssues.filter(i => i.severity === 'warning');
  const oks      = methodIssues.filter(i => i.severity === 'ok');
  const infos    = methodIssues.filter(i => i.severity === 'info');

  const totalErrors = Object.values(issues).flat().filter(i => i.severity === 'error').length;
  const totalWarns  = Object.values(issues).flat().filter(i => i.severity === 'warning').length;
  const totalOks    = Object.values(issues).flat().filter(i => i.severity === 'ok').length;

  function methodBadge(id: Method) {
    const m = issues[id] ?? [];
    const e = m.filter(i => i.severity === 'error').length;
    const w = m.filter(i => i.severity === 'warning').length;
    return { errorCount: e, warnCount: w };
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cadsurface-950">

      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {totalErrors > 0
              ? <ShieldAlert size={14} className="text-red-400" />
              : <ShieldCheck size={14} className="text-emerald-400" />
            }
            <p className="text-xs font-bold text-slate-200">Validation</p>
            {fetching && <Loader2 size={11} className="animate-spin text-slate-500" />}
          </div>
          <div className="flex items-center gap-1.5">
            {totalOks > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-400 font-mono">
                {totalOks} pass
              </span>
            )}
            {totalErrors > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-950/60 border border-red-700/50 text-red-400 font-mono">
                {totalErrors} err
              </span>
            )}
            {totalWarns > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-700/50 text-amber-400 font-mono">
                {totalWarns} warn
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Pre-flight checks per manufacturing method — resolve errors before sending to production.
        </p>
      </div>

      {/* Method tabs */}
      <div className="flex border-b border-cadsurface-700 shrink-0 overflow-x-auto">
        {(['fdm', 'cnc', 'laser', 'functional', 'standards'] as Method[]).map(id => {
          const { errorCount, warnCount } = methodBadge(id);
          const isActive = activeMethod === id;
          const hasError = errorCount > 0;
          const hasWarn  = warnCount > 0 && !hasError;
          return (
            <button
              key={id}
              onClick={() => setActiveMethod(id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                isActive
                  ? 'border-cadblue-500 text-slate-200 bg-cadsurface-900/40'
                  : 'border-transparent text-slate-600 hover:text-slate-400 hover:bg-cadsurface-800/40'
              }`}
            >
              <span className={isActive ? 'text-cadblue-400' : 'text-slate-600'}>{METHOD_ICONS[id]}</span>
              {METHOD_LABELS[id]}
              {hasError && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {errorCount}
                </span>
              )}
              {hasWarn && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {warnCount}
                </span>
              )}
              {!hasError && !hasWarn && (issues[id] ?? []).length > 0 && (
                <CheckCircle2 size={11} className="text-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

        {fetching && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-slate-500" />
          </div>
        )}

        {!fetching && (
          <>
            {/* Passed checks — shown first and prominently */}
            {oks.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 size={11} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Passed — {oks.length} check{oks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {oks.map(i => <IssueCard key={i.id} issue={i} />)}
                </div>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <XCircle size={11} className="text-red-400" />
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                    Errors — {errors.length} (blocks export)
                  </p>
                </div>
                <div className="space-y-2">
                  {errors.map(i => <IssueCard key={i.id} issue={i} />)}
                </div>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle size={11} className="text-amber-400" />
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Warnings — {warnings.length}
                  </p>
                </div>
                <div className="space-y-2">
                  {warnings.map(i => <IssueCard key={i.id} issue={i} />)}
                </div>
              </div>
            )}

            {/* Info */}
            {infos.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Info size={11} className="text-cadblue-400" />
                  <p className="text-xs font-semibold text-cadblue-400 uppercase tracking-wider">
                    Info — {infos.length}
                  </p>
                </div>
                <div className="space-y-2">
                  {infos.map(i => <IssueCard key={i.id} issue={i} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-cadsurface-700 px-3 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {totalErrors > 0 ? (
              <><ShieldAlert size={11} className="text-red-400" />
              <span className="text-xs text-red-400 font-medium">
                {loading ? 'Running checks…' : `${totalErrors} error${totalErrors !== 1 ? 's' : ''} block export`}
              </span></>
            ) : (
              <><ShieldCheck size={11} className="text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">
                {loading ? 'Running checks…' : 'All checks passed — ready to export'}
              </span></>
            )}
          </div>
          <button
            onClick={handleRerun}
            disabled={loading || fetching}
            className="text-xs btn-ghost px-2.5 py-1.5 rounded-lg border border-cadsurface-700 text-slate-500 hover:text-slate-200 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Running…' : 'Re-run'}
          </button>
        </div>
        <p className="text-xs text-slate-700 mt-1">
          {totalOks} passed · {totalErrors} errors · {totalWarns} warnings
          {lastRun && ` · Last run ${lastRun}`}
        </p>
      </div>
    </div>
  );
}
