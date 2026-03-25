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
  Loader2,
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

const SEVERITY_META = {
  error:   { icon: <XCircle size={13} />,     color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-700/40',     label: 'ERROR' },
  warning: { icon: <AlertTriangle size={13} />,color: 'text-amber-400',  bg: 'bg-amber-950/30',   border: 'border-amber-700/40',   label: 'WARNING' },
  info:    { icon: <Info size={13} />,         color: 'text-cadblue-400',bg: 'bg-cadblue-950/30', border: 'border-cadblue-700/30', label: 'INFO' },
  ok:      { icon: <CheckCircle2 size={13} />, color: 'text-emerald-400',bg: 'bg-emerald-950/20', border: 'border-emerald-700/30', label: 'OK' },
};

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

export default function ValidationPanel({ projectId = '' }: { projectId?: string }) {
  const [activeMethod, setActiveMethod] = useState<Method>('fdm');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [issuesByMethod, setIssuesByMethod] = useState<Record<Method, Issue[]>>({
    fdm: [], cnc: [], laser: [], functional: [], standards: [],
  });

  const loadValidation = useCallback(async (method: Method) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await fetchValidationResults(projectId, method) as unknown as { issues?: Issue[] } | null;
      if (data?.issues) {
        setIssuesByMethod(prev => ({ ...prev, [method]: data.issues! }));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadValidation(activeMethod);
  }, [activeMethod, loadValidation]);

  const handleRerun = useCallback(async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      await runValidation(projectId, [activeMethod]);
      await loadValidation(activeMethod);
      setLastRun(new Date().toLocaleTimeString());
    } catch { /* ignore */ } finally {
      setRunning(false);
    }
  }, [projectId, activeMethod, loadValidation]);

  const issues = issuesByMethod[activeMethod];
  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos    = issues.filter((i) => i.severity === 'info');
  const oks      = issues.filter((i) => i.severity === 'ok');

  const totalErrors = Object.values(issuesByMethod).reduce((a, list) => a + list.filter(i => i.severity === 'error').length, 0);
  const totalWarns  = Object.values(issuesByMethod).reduce((a, list) => a + list.filter(i => i.severity === 'warning').length, 0);

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
            {totalErrors === 0 && totalWarns === 0 && issues.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-400 font-mono">
                ✓ pass
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
        {(Object.keys(METHOD_LABELS) as Method[]).map((id) => {
          const methodIssues = issuesByMethod[id];
          const errCount = methodIssues.filter(i => i.severity === 'error').length;
          const warnCount = methodIssues.filter(i => i.severity === 'warning').length;
          const isActive = activeMethod === id;
          const hasError = errCount > 0;
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
                  {errCount}
                </span>
              )}
              {hasWarn && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {warnCount}
                </span>
              )}
              {!hasError && !hasWarn && methodIssues.length > 0 && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-emerald-700 text-white font-bold" style={{ fontSize: '9px' }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-slate-600" />
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-600">
            <ShieldCheck size={28} className="opacity-30" />
            <p className="text-xs text-center">No validation results yet</p>
            <p className="text-xs text-center text-slate-700">Click Re-run to check this method</p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Footer gate status */}
      <div className="border-t border-cadsurface-700 px-3 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {totalErrors > 0 ? (
              <>
                <ShieldAlert size={11} className="text-red-400" />
                <span className="text-xs text-red-400 font-medium">
                  {running ? 'Running checks…' : `${totalErrors} error${totalErrors > 1 ? 's' : ''} block export`}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck size={11} className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">
                  {running ? 'Running checks…' : 'No blocking errors'}
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
