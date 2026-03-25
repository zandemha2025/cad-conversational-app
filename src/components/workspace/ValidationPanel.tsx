import { useState, useCallback, useEffect } from 'react';
import { runValidation, fetchValidationResults } from '../../lib/api';
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
} from 'lucide-react';

type Method = 'fdm' | 'cnc' | 'laser' | 'functional' | 'standards';
type Severity = 'error' | 'warning' | 'info' | 'ok';

interface Issue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  location?: string;
  nodeRef?: string;
  fix?: string;
}

const METHOD_META: Record<Method, { label: string; icon: React.ReactNode }> = {
  fdm:        { label: 'FDM',        icon: <Printer size={12} /> },
  cnc:        { label: 'CNC',        icon: <Wrench size={12} /> },
  laser:      { label: 'Laser',      icon: <Zap size={12} /> },
  functional: { label: 'Functional', icon: <Crosshair size={12} /> },
  standards:  { label: 'Standards',  icon: <FileCheck size={12} /> },
};

const SEVERITY_META = {
  error:   { icon: <XCircle size={13} />,      color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-700/40',     label: 'ERROR' },
  warning: { icon: <AlertTriangle size={13} />, color: 'text-amber-400',  bg: 'bg-amber-950/30',   border: 'border-amber-700/40',   label: 'WARNING' },
  info:    { icon: <Info size={13} />,          color: 'text-cadblue-400', bg: 'bg-cadblue-950/30', border: 'border-cadblue-700/30', label: 'INFO' },
  ok:      { icon: <CheckCircle2 size={13} />,  color: 'text-emerald-400', bg: 'bg-emerald-950/20', border: 'border-emerald-700/30', label: 'OK' },
};

function mapApiIssue(raw: Record<string, unknown>, idx: number): Issue {
  const severity = (['error', 'warning', 'info', 'ok'].includes(raw.severity as string)
    ? raw.severity
    : 'info') as Severity;
  return {
    id: String(raw.id ?? `issue-${idx}`),
    severity,
    title: String(raw.title ?? raw.rule ?? raw.message ?? 'Issue'),
    detail: String(raw.detail ?? raw.description ?? raw.message ?? ''),
    location: raw.location ? String(raw.location) : undefined,
    nodeRef: raw.node_ref ? String(raw.node_ref) : undefined,
    fix: raw.fix ?? raw.fix_suggestion ? String(raw.fix ?? raw.fix_suggestion) : undefined,
  };
}

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(issue.severity === 'error');
  const meta = SEVERITY_META[issue.severity];

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${meta.border} ${meta.bg}`}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-snug ${meta.color}`}>{issue.title}</p>
          {issue.location && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{issue.location}</p>
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

          {issue.nodeRef && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Node:</span>
              <span className="text-xs font-mono text-violet-400 bg-violet-950/30 border border-violet-700/30 px-1.5 py-0.5 rounded">
                {issue.nodeRef}
              </span>
            </div>
          )}

          {issue.fix && (
            <div className="flex items-start gap-1.5 bg-cadsurface-900/60 rounded-lg px-2.5 py-2">
              <ArrowRight size={11} className="text-cadblue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-cadblue-300 leading-relaxed">{issue.fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_ISSUES: Record<Method, Issue[]> = {
  fdm: [], cnc: [], laser: [], functional: [], standards: [],
};

export default function ValidationPanel({ projectId = '' }: { projectId?: string }) {
  const [activeMethod, setActiveMethod] = useState<Method>('fdm');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [issuesByMethod, setIssuesByMethod] = useState<Record<Method, Issue[]>>(EMPTY_ISSUES);

  const loadResults = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const raw = await fetchValidationResults(projectId) as unknown;
      if (!raw) { setLoading(false); return; }

      const newIssues = { ...EMPTY_ISSUES };
      const items = Array.isArray(raw) ? raw : (raw as Record<string, unknown[]>);

      if (Array.isArray(items)) {
        // Flat list: [{method, severity, title, ...}]
        items.forEach((item: unknown, idx) => {
          const obj = item as Record<string, unknown>;
          const method = String(obj.method ?? 'functional') as Method;
          if (method in newIssues) {
            newIssues[method] = [...newIssues[method], mapApiIssue(obj, idx)];
          }
        });
      } else if (typeof items === 'object' && items !== null) {
        // Keyed by method: {fdm: [...], cnc: [...]}
        for (const [key, val] of Object.entries(items)) {
          if (key in newIssues && Array.isArray(val)) {
            newIssues[key as Method] = val.map((v, i) => mapApiIssue(v as Record<string, unknown>, i));
          }
        }
      }
      setIssuesByMethod(newIssues);
    } catch {
      // leave empty state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadResults(); }, [loadResults]);

  const handleRerun = useCallback(async () => {
    if (!projectId) return;
    setRunning(true);
    await runValidation(projectId, [activeMethod]);
    // Brief pause for async job, then refetch
    await new Promise(r => setTimeout(r, 1500));
    await loadResults();
    setRunning(false);
    setLastRun(new Date().toLocaleTimeString());
  }, [projectId, activeMethod, loadResults]);

  const issues = issuesByMethod[activeMethod];
  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos    = issues.filter((i) => i.severity === 'info');
  const oks      = issues.filter((i) => i.severity === 'ok');

  const totalErrors = Object.values(issuesByMethod).reduce((a, m) => a + m.filter(i => i.severity === 'error').length, 0);
  const totalWarns  = Object.values(issuesByMethod).reduce((a, m) => a + m.filter(i => i.severity === 'warning').length, 0);
  const hasAnyData  = Object.values(issuesByMethod).some(m => m.length > 0);

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
          </div>
          {hasAnyData && (
            <div className="flex items-center gap-1.5">
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
          )}
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Pre-flight checks per manufacturing method — resolve errors before sending to production.
        </p>
      </div>

      {/* Method tabs */}
      <div className="flex border-b border-cadsurface-700 shrink-0 overflow-x-auto">
        {(Object.entries(METHOD_META) as [Method, typeof METHOD_META[Method]][]).map(([id, meta]) => {
          const isActive = activeMethod === id;
          const methodErrors  = issuesByMethod[id].filter(i => i.severity === 'error').length;
          const methodWarns   = issuesByMethod[id].filter(i => i.severity === 'warning').length;
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
              <span className={isActive ? 'text-cadblue-400' : 'text-slate-600'}>{meta.icon}</span>
              {meta.label}
              {methodErrors > 0 && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {methodErrors}
                </span>
              )}
              {methodErrors === 0 && methodWarns > 0 && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {methodWarns}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-600 text-xs gap-2">
            <span className="animate-spin text-slate-500">⟳</span> Loading…
          </div>
        )}

        {!loading && !hasAnyData && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-10 h-10 rounded-xl bg-cadblue-900/30 border border-cadblue-700/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-cadblue-500" />
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300 font-medium mb-1">Describe your fixture in the chat</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Once your design is generated,<br />click Re-run to analyze it for DFM issues.
              </p>
            </div>
          </div>
        )}

        {!loading && hasAnyData && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-600">
            <CheckCircle2 size={20} className="text-emerald-600 opacity-60" />
            <p className="text-xs">No issues for this method</p>
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
              {errors.map((i) => <IssueCard key={i.id} issue={i} />)}
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
              {warnings.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}

        {/* OK checks */}
        {oks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={11} className="text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Passed — {oks.length}
              </p>
            </div>
            <div className="space-y-2">
              {oks.map((i) => <IssueCard key={i.id} issue={i} />)}
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
              {infos.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-cadsurface-700 px-3 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {totalErrors > 0 ? (
              <>
                <ShieldAlert size={11} className="text-red-400" />
                <span className="text-xs text-red-400 font-medium">
                  {running ? 'Running checks…' : `${totalErrors} error${totalErrors !== 1 ? 's' : ''} block export`}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck size={11} className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">
                  {running ? 'Running checks…' : hasAnyData ? 'No blocking errors' : 'Not yet run'}
                </span>
              </>
            )}
          </div>
          <button
            onClick={handleRerun}
            disabled={running || !projectId}
            className="text-xs btn-ghost px-2.5 py-1.5 rounded-lg border border-cadsurface-700 text-slate-500 hover:text-slate-200 disabled:opacity-50 transition-colors"
          >
            {running ? 'Running…' : 'Re-run'}
          </button>
        </div>
        {lastRun && (
          <p className="text-xs text-slate-700 mt-1">Last run {lastRun}</p>
        )}
      </div>
    </div>
  );
}
