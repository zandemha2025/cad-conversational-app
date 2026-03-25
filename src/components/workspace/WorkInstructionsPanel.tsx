/**
 * Work Instructions Panel
 * Generates shop-floor machinist work instructions with real cutting parameters.
 * POST /api/projects/{id}/work-instructions
 */
import { useState } from 'react';
import { generateWorkInstructions, IS_DEMO } from '../../lib/api';
import type { WorkInstructionsResult } from '../../lib/api';
import {
  Wrench, Play, ChevronDown, ChevronRight, AlertCircle,
  CheckCircle2, FileText, Settings2, Gauge, Clock,
} from 'lucide-react';

const MATERIALS = [
  { value: 'aluminum_6061', label: 'Aluminum 6061-T6' },
  { value: 'aluminum_7075', label: 'Aluminum 7075-T6' },
  { value: 'mild_steel_1018', label: 'Mild Steel 1018' },
  { value: 'steel_4140', label: 'Steel 4140' },
  { value: 'stainless_304', label: 'Stainless 304' },
  { value: 'titanium_ti6al4v', label: 'Titanium Ti-6Al-4V' },
  { value: 'inconel_718', label: 'Inconel 718' },
  { value: 'cast_tooling_plate', label: 'Cast Tooling Plate' },
];

const PROCESSES = [
  { value: 'cnc_milling', label: '3-Axis CNC Milling' },
  { value: 'turning', label: 'CNC Turning' },
  { value: 'grinding', label: 'Surface Grinding' },
  { value: 'inspection', label: 'CMM Inspection' },
];

function PhaseCard({ phase }: { phase: WorkInstructionsResult['phases'][0] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-cadsurface-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-cadsurface-800 text-left hover:bg-cadsurface-750 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-cadblue-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {phase.phase}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200 truncate">{phase.title}</p>
          <p className="text-xs text-slate-500 truncate">{phase.operation}</p>
        </div>
        {open ? <ChevronDown size={11} className="text-slate-600 shrink-0" /> : <ChevronRight size={11} className="text-slate-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 py-2.5 space-y-2.5 bg-cadsurface-900">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(phase.parameters).map(([key, val]) => (
              <div key={key} className="bg-cadsurface-800 rounded-lg px-2 py-1.5">
                <p className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</p>
                <p className="text-xs font-mono text-cadblue-300 font-semibold">{String(val)}</p>
              </div>
            ))}
          </div>

          {phase.tool && (
            <div className="flex items-start gap-2">
              <Wrench size={11} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-400"><span className="text-amber-400 font-medium">Tool:</span> {phase.tool}</p>
            </div>
          )}

          {phase.setup && (
            <div className="flex items-start gap-2">
              <Settings2 size={11} className="text-slate-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500">{phase.setup}</p>
            </div>
          )}

          {phase.notes && (
            <div className="bg-amber-950/30 border border-amber-700/30 rounded-lg px-2.5 py-2">
              <p className="text-xs text-amber-300 leading-relaxed">{phase.notes}</p>
            </div>
          )}

          {phase.quality_check && (
            <div className="flex items-start gap-2">
              <CheckCircle2 size={11} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-400">{phase.quality_check}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Demo result shown when not connected to backend
const DEMO_RESULT: WorkInstructionsResult = {
  project_id: 'demo',
  material: 'aluminum_6061',
  process: 'cnc_milling',
  generated_at: new Date().toISOString(),
  summary: 'Demo — connect to live backend for project-specific work instructions.',
  phases: [
    {
      phase: 1, title: 'Stock Setup & Datum A Mill',
      operation: 'Face mill Datum A (bottom reference face)',
      tool: '63mm indexable face mill, APKT 1604 inserts',
      setup: 'Mount stock on parallels, indicate top face within 0.02mm. Zero Z on stock top.',
      parameters: { Vc_m_min: '300', fz_mm: '0.12', ap_mm: '1.0', ae_mm: '50', RPM: '1515' },
      notes: 'Flood coolant. Achieve Ra ≤ 1.6µm on datum face. Verify flatness with surface plate before proceeding.',
      quality_check: 'Check flatness with CMM or surface plate: max 0.02mm over full face',
    },
    {
      phase: 2, title: 'Rough Profile Milling',
      operation: 'Rough mill outer profile to +0.5mm stock',
      tool: '16mm carbide 4-flute end mill (TiAlN coated)',
      setup: 'Clamp on Datum A. Edge-find X/Y datum edges, set origin at part corner.',
      parameters: { Vc_m_min: '280', fz_mm: '0.08', ap_mm: '12', ae_mm: '10', RPM: '5570' },
      notes: 'Leave 0.5mm axial and radial stock for finishing. Use climb milling for better surface finish.',
      quality_check: 'Verify profile dimensions ±0.5mm with callipers before finishing',
    },
    {
      phase: 3, title: 'Bore & Ream M8 Through-holes',
      operation: 'Drill and ream mounting holes to H7 tolerance',
      tool: '7.8mm carbide drill → 8.0mm H7 reamer',
      setup: 'Fixture held on Datum A & B. Touchsetter to establish Z=0 on top face.',
      parameters: { drill_Vc: '80', drill_f: '0.12', ream_Vc: '15', ream_f: '0.30', coolant: 'flood' },
      notes: 'Peck drill with 3×D pecks. Ream at reduced speed with generous coolant. Deburr each hole.',
      quality_check: 'Go/No-Go gauge ⌀8 H7 (⌀8.000 / ⌀8.015mm). CMM true position ≤ ⌀0.1mm',
    },
    {
      phase: 4, title: 'Finish Profile & Dowel Holes',
      operation: 'Finish mill profile. Bore dowel pin holes to H7.',
      tool: '12mm carbide 4-flute (finishing geometry)',
      setup: 'Same setup as Phase 3. Re-indicate if fixture was moved.',
      parameters: { Vc_m_min: '320', fz_mm: '0.04', ap_mm: '15', ae_mm: '0.5', RPM: '8490' },
      notes: 'Single spring pass at 0.05mm radial. Measure dowel bores before reaming.',
      quality_check: 'Dowel holes ⌀6 H7 (⌀6.000/⌀6.012mm). Surface finish Ra ≤ 1.6µm',
    },
  ],
};

export default function WorkInstructionsPanel({ projectId = 'demo' }: { projectId?: string }) {
  const [material, setMaterial] = useState('aluminum_6061');
  const [process, setProcess] = useState('cnc_milling');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkInstructionsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLive = !IS_DEMO && projectId !== 'demo';

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise(r => setTimeout(r, 1200));
        setResult({ ...DEMO_RESULT, material, process });
      } else {
        const res = await generateWorkInstructions(projectId, { material, process, include_speeds_feeds: true });
        if (res) setResult(res);
        else setError('Failed to generate work instructions. Ensure the project has geometry data.');
      }
    } catch {
      setError('Request failed. Check backend connectivity.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cadsurface-950 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={14} className="text-cadblue-400" />
          <p className="text-xs font-bold text-slate-200">Work Instructions</p>
        </div>
        <p className="text-xs text-slate-500">Shop-floor machinist instructions with Vc, fz, ap from Kienzle Kc coefficients.</p>
      </div>

      {/* Config */}
      <div className="px-3 py-3 border-b border-cadsurface-700 shrink-0 space-y-2">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Material</label>
          <select
            value={material}
            onChange={e => setMaterial(e.target.value)}
            className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cadblue-500"
          >
            {MATERIALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Process</label>
          <select
            value={process}
            onChange={e => setProcess(e.target.value)}
            className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cadblue-500"
          >
            {PROCESSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn-primary w-full text-xs flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Clock size={13} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Play size={13} />
              Generate Work Instructions
            </>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
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
                <Gauge size={12} className="text-cadblue-400" />
                <span className="text-xs font-semibold text-slate-300">
                  {MATERIALS.find(m => m.value === result.material)?.label} · {PROCESSES.find(p => p.value === result.process)?.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{result.summary}</p>
            </div>

            {result.phases.map(phase => (
              <PhaseCard key={phase.phase} phase={phase} />
            ))}

            <p className="text-xs text-slate-700 text-center pt-1">
              {result.phases.length} phases · Generated {new Date(result.generated_at).toLocaleTimeString()}
            </p>
          </>
        ) : !loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <FileText size={32} className="text-slate-700" />
            <p className="text-xs text-slate-600 text-center leading-relaxed">
              Select material and process, then generate machinist-ready work instructions with cutting parameters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
