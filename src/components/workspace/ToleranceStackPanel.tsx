/**
 * Tolerance Stack-Up Panel
 * Worst-Case and RSS analysis per ASME Y14.5.1M.
 * POST /api/projects/{id}/tolerance-stack
 */
import { useState } from 'react';
import { runToleranceStack } from '../../lib/api';
import type { ToleranceStackResult } from '../../lib/api';
import {
  Ruler, Plus, Trash2, Play, AlertTriangle, CheckCircle2,
  AlertCircle, Clock, TrendingUp,
} from 'lucide-react';

interface Dim {
  id: number;
  name: string;
  nominal_mm: number;
  tolerance_mm: number;
}

let _id = 0;
function newDim(): Dim {
  return { id: ++_id, name: `D${_id}`, nominal_mm: 10, tolerance_mm: 0.05 };
}

export default function ToleranceStackPanel({ projectId = '' }: { projectId?: string }) {
  const [dims, setDims] = useState<Dim[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToleranceStackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addDim = () => setDims(p => [...p, newDim()]);
  const removeDim = (id: number) => setDims(p => p.filter(d => d.id !== id));
  const updateDim = (id: number, field: keyof Dim, val: string) => {
    setDims(p => p.map(d => {
      if (d.id !== id) return d;
      if (field === 'name') return { ...d, name: val };
      const n = parseFloat(val);
      if (isNaN(n)) return d;
      return { ...d, [field]: n };
    }));
  };

  const handleRun = async () => {
    if (dims.length === 0 || !projectId) return;
    setLoading(true); setError(null);
    try {
      const res = await runToleranceStack(projectId, {
        dimensions: dims.map(d => ({ name: d.name, nominal_mm: d.nominal_mm, tolerance_mm: d.tolerance_mm })),
      });
      if (res) setResult(res);
      else setError('Stack-up failed. Check that all dimension values are valid.');
    } catch { setError('Request failed.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-cadsurface-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Ruler size={14} className="text-violet-400" />
          <p className="text-xs font-bold text-slate-200">Tolerance Stack-Up</p>
        </div>
        <p className="text-xs text-slate-500">Worst Case + RSS per ASME Y14.5.1M-1994.</p>
      </div>

      {/* Dimension inputs */}
      <div className="px-3 pt-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dimensions</span>
          <button onClick={addDim} className="flex items-center gap-1 text-xs text-cadblue-400 hover:text-cadblue-300 transition-colors">
            <Plus size={11} /> Add
          </button>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {dims.map(d => (
            <div key={d.id} className="flex gap-1.5 items-center">
              <input
                className="flex-1 bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                value={d.name}
                onChange={e => updateDim(d.id, 'name', e.target.value)}
                placeholder="Name"
              />
              <input
                className="w-16 bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-mono"
                value={d.nominal_mm}
                onChange={e => updateDim(d.id, 'nominal_mm', e.target.value)}
                placeholder="nom"
                title="Nominal (mm)"
              />
              <span className="text-slate-600 text-xs">±</span>
              <input
                className="w-14 bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 font-mono"
                value={d.tolerance_mm}
                onChange={e => updateDim(d.id, 'tolerance_mm', e.target.value)}
                placeholder="tol"
                title="Half-tolerance (mm)"
              />
              <button onClick={() => removeDim(d.id)} className="text-slate-700 hover:text-red-400 transition-colors shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleRun}
          disabled={loading || dims.length === 0}
          className="mt-3 mb-3 w-full text-xs py-2 px-3 rounded-lg border border-violet-700/50 bg-violet-900/30 text-violet-300 hover:bg-violet-900/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading
            ? <><Clock size={13} className="animate-spin" />Calculating…</>
            : <><Play size={13} />Run Stack-Up</>
          }
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-red-950/40 border border-red-700/40 rounded-xl px-3 py-2.5">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <>
            {/* Status banner */}
            <div className={`rounded-xl border px-3 py-2.5 ${
              result.assembly_ok
                ? 'bg-emerald-950/30 border-emerald-700/40'
                : 'bg-red-950/30 border-red-700/40'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {result.assembly_ok
                  ? <CheckCircle2 size={13} className="text-emerald-400" />
                  : <AlertTriangle size={13} className="text-red-400" />}
                <span className={`text-xs font-semibold ${result.assembly_ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.assembly_ok ? 'Assembly fits — both WC and RSS OK' : 'Assembly interference risk'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{result.summary}</p>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Worst Case</p>
                <p className="text-sm font-bold text-slate-100 font-mono">±{result.worst_case_mm?.toFixed(4) ?? '—'} mm</p>
                <p className="text-xs text-slate-500 mt-1">100% assemblies fit</p>
              </div>
              <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">RSS (3σ)</p>
                <p className="text-sm font-bold text-violet-300 font-mono">±{result.rss_mm?.toFixed(4) ?? '—'} mm</p>
                <p className="text-xs text-slate-500 mt-1">99.73% assemblies</p>
              </div>
              <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Gap Min (WC)</p>
                <p className="text-xs font-mono text-slate-200">{result.gap_min_mm?.toFixed(4) ?? '—'} mm</p>
              </div>
              <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Gap Max (WC)</p>
                <p className="text-xs font-mono text-slate-200">{result.gap_max_mm?.toFixed(4) ?? '—'} mm</p>
              </div>
            </div>

            {/* Contributions */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp size={11} className="text-violet-400" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tolerance Budget</p>
              </div>
              <div className="space-y-1.5">
                {result.dimensions?.map((d, i) => {
                  const pct = result.worst_case_mm > 0 ? (d.tolerance_mm / result.worst_case_mm) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-400 truncate">{d.name}</span>
                        <span className="text-slate-500 font-mono shrink-0 ml-2">±{d.tolerance_mm.toFixed(4)}</span>
                      </div>
                      <div className="h-1.5 bg-cadsurface-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-600 rounded-full"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Ruler size={28} className="text-slate-700" />
            <p className="text-xs text-slate-600 text-center leading-relaxed">
              Add dimensions with their bilateral tolerances, then run the stack-up.
              Supports Worst Case and RSS methods.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
