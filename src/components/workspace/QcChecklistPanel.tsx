/**
 * QC Checklist Panel
 * Generates inspection checklists per ASME Y14.5-2018 / AS9100D / ISO 1101.
 * POST /api/projects/{id}/qc-checklist
 */
import { useState } from 'react';
import { generateQcChecklist } from '../../lib/api';
import type { QcChecklistResult } from '../../lib/api';
import {
  ClipboardCheck, Play, AlertCircle, Clock,
  CheckCircle2, ChevronDown, ChevronRight, Microscope,
} from 'lucide-react';

const STANDARDS = [
  { value: 'asme_y14_5', label: 'ASME Y14.5-2018' },
  { value: 'iso_1101', label: 'ISO 1101:2017' },
  { value: 'as9100', label: 'AS9100 Rev D + AS9102B (FAI)' },
];

const CATEGORY_COLORS: Record<string, string> = {
  dimensional:    'bg-cadblue-950/40 border-cadblue-700/40 text-cadblue-400',
  geometric:      'bg-violet-950/40 border-violet-700/40 text-violet-400',
  surface_finish: 'bg-emerald-950/40 border-emerald-700/40 text-emerald-400',
  material:       'bg-amber-950/40 border-amber-700/40 text-amber-400',
  functional:     'bg-teal-950/40 border-teal-700/40 text-teal-400',
};

function ChecklistItem({ item }: { item: QcChecklistResult['items'][0] }) {
  const [open, setOpen] = useState(false);
  const colorClass = CATEGORY_COLORS[item.category] ?? 'bg-cadsurface-800 border-cadsurface-700 text-slate-400';

  return (
    <div className={`border rounded-xl overflow-hidden ${colorClass.split(' ').slice(0, 2).join(' ')} border-opacity-50`}>
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <CheckCircle2 size={12} className={colorClass.split(' ').pop() ?? 'text-slate-400'} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{item.characteristic}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500 font-mono">{item.nominal}</span>
            <span className="text-xs text-slate-600">±</span>
            <span className="text-xs text-slate-400 font-mono">{item.tolerance}</span>
          </div>
        </div>
        {open ? <ChevronDown size={11} className="text-slate-600 shrink-0" /> : <ChevronRight size={11} className="text-slate-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 bg-cadsurface-900">
          <div className="h-px bg-cadsurface-700/60" />
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-cadsurface-800 rounded-lg p-2">
              <p className="text-slate-500 mb-0.5">Instrument</p>
              <p className="text-slate-200 font-medium">{item.instrument}</p>
            </div>
            <div className="bg-cadsurface-800 rounded-lg p-2">
              <p className="text-slate-500 mb-0.5">Frequency</p>
              <p className="text-slate-200 font-medium">{item.frequency}</p>
            </div>
            <div className="bg-cadsurface-800 rounded-lg p-2 col-span-2">
              <p className="text-slate-500 mb-0.5">Method</p>
              <p className="text-slate-200">{item.method}</p>
            </div>
            <div className="bg-cadsurface-800 rounded-lg p-2 col-span-2">
              <p className="text-slate-500 mb-0.5">Accept criteria</p>
              <p className="text-emerald-400 font-medium">{item.accept_criteria}</p>
            </div>
          </div>
          {item.reference && (
            <p className="text-xs text-slate-600 font-mono">{item.reference}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function QcChecklistPanel({ projectId = '' }: { projectId?: string }) {
  const [standard, setStandard] = useState('asme_y14_5');
  const [includeCmm, setIncludeCmm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QcChecklistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateQcChecklist(projectId, { standard, include_cmm: includeCmm });
      if (res) setResult(res);
      else setError('Failed to generate QC checklist. Ensure the project has geometry and GD&T data.');
    } catch {
      setError('Request failed. Check backend connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const categories = result
    ? [...new Set((result.items ?? []).map(i => i.category))]
    : [];

  return (
    <div className="flex flex-col h-full bg-cadsurface-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck size={14} className="text-emerald-400" />
          <p className="text-xs font-bold text-slate-200">QC Checklist</p>
        </div>
        <p className="text-xs text-slate-500">
          Inspection plan per ASME Y14.5 / AS9100D. References CMM, profilometer, Go/No-Go gauges.
        </p>
      </div>

      {/* Config */}
      <div className="px-3 py-3 border-b border-cadsurface-700 shrink-0 space-y-2">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Standard</label>
          <select
            value={standard}
            onChange={e => setStandard(e.target.value)}
            className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {STANDARDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeCmm}
            onChange={e => setIncludeCmm(e.target.checked)}
            className="rounded border-cadsurface-600 bg-cadsurface-800"
          />
          <span className="text-xs text-slate-400">Include CMM measurement plan</span>
        </label>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full text-xs py-2 px-3 rounded-lg border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <><Clock size={13} className="animate-spin" />Generating…</>
          ) : (
            <><Play size={13} />Generate QC Checklist</>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-red-950/40 border border-red-700/40 rounded-xl px-3 py-2.5">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400 leading-relaxed">{error}</p>
          </div>
        )}

        {result ? (
          <>
            <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <Microscope size={12} className="text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">
                  {STANDARDS.find(s => s.value === result.standard)?.label ?? result.standard} · {result.items.length} checks
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{result.summary}</p>
            </div>

            {categories.map(cat => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 capitalize">
                  {cat.replace(/_/g, ' ')}
                </p>
                <div className="space-y-2">
                  {result.items.filter(i => i.category === cat).map(item => (
                    <ChecklistItem key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}

            <p className="text-xs text-slate-700 text-center pt-1">
              {result.items.length} inspection items · {new Date(result.generated_at).toLocaleTimeString()}
            </p>
          </>
        ) : !loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
              <ClipboardCheck size={16} className="text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300 font-medium mb-1">Generate your QC checklist</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Select a quality standard above and click Generate.<br />
                Produces an inspection plan with CMM routines and Go/No-Go gauges.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
