/**
 * InterferencePanel — Part interference / collision detection.
 */
import { useState, useEffect } from 'react';
import {
  Scan, AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle,
} from 'lucide-react';
import { runInterferenceCheck, fetchLatestInterference, type InterferenceResult, IS_DEMO } from '../../lib/api';

const DEMO_RESULT: InterferenceResult = {
  project_id: 'demo',
  total_pairs_checked: 6,
  interfering_pairs: 1,
  status: 'interference_detected',
  ran_at: new Date().toISOString(),
  parts_checked: 4,
  summary: 'Detected 1 interference out of 6 pairs checked.',
  issues: [
    {
      part_a: { id: 'tp-1', label: 'Clamp A', type: 'clamping' },
      part_b: { id: 'tp-2', label: 'Locator B', type: 'locating' },
      overlap_volume_mm3: 234.5,
      severity: 'error',
      description: 'Clamp A and Locator B overlap by 234.50 mm³. Adjust positions to avoid collision.',
    },
  ],
};

interface Props {
  projectId?: string;
}

export default function InterferencePanel({ projectId }: Props) {
  const [result, setResult] = useState<InterferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Load last result on mount
  useEffect(() => {
    if (IS_DEMO || !projectId) {
      setResult(null);
      setFetching(false);
      return;
    }
    fetchLatestInterference(projectId).then(r => {
      if (r && r.status !== 'not_run') setResult(r);
      setFetching(false);
    });
  }, [projectId]);

  async function runCheck() {
    if (IS_DEMO || !projectId) {
      setLoading(true);
      await new Promise(r => setTimeout(r, 1500));
      setResult(DEMO_RESULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await runInterferenceCheck(projectId);
    if (r) setResult(r);
    setLoading(false);
  }

  const isClean = result?.status === 'clean';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <Scan size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Interference Check</span>
        {result && (
          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
            isClean
              ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50'
              : 'bg-red-950/50 text-red-400 border border-red-800/50'
          }`}>
            {isClean ? 'Clean' : `${result.interfering_pairs} Interference${result.interfering_pairs !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Run button */}
        <button
          onClick={runCheck}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-xs font-medium text-white transition-all"
        >
          {loading ? (
            <><Loader2 size={12} className="animate-spin" /> Running Check…</>
          ) : (
            <><RefreshCw size={12} /> Run Interference Check</>
          )}
        </button>

        {/* No result yet */}
        {fetching && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        )}

        {!fetching && !result && !loading && (
          <div className="text-center py-8 text-slate-500">
            <Scan size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Click &quot;Run Interference Check&quot; to detect</p>
            <p className="text-xs">collisions between fixture components.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Summary card */}
            <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${
              isClean
                ? 'bg-emerald-950/30 border-emerald-800/40'
                : 'bg-red-950/30 border-red-800/40'
            }`}>
              {isClean ? (
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-xs font-medium ${isClean ? 'text-emerald-300' : 'text-red-300'}`}>
                  {result.summary}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {result.parts_checked} components · {result.total_pairs_checked} pairs checked ·{' '}
                  {new Date(result.ran_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Interference issues */}
            {result.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Issues Found
                </p>
                {result.issues.map((issue, i) => (
                  <div key={i} className={`p-2.5 rounded-lg border ${
                    issue.severity === 'error'
                      ? 'bg-red-950/30 border-red-800/40'
                      : 'bg-amber-950/30 border-amber-800/40'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={11} className={issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'} />
                      <span className="text-[10px] font-semibold uppercase text-slate-300">{issue.severity}</span>
                      <span className="ml-auto text-[10px] text-slate-400">{issue.overlap_volume_mm3} mm³</span>
                    </div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-xs font-medium text-slate-200">{issue.part_a.label}</span>
                      <span className="text-slate-500 text-xs">↔</span>
                      <span className="text-xs font-medium text-slate-200">{issue.part_b.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{issue.description}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
