/**
 * ClampingForcePanel — Calculate required clamping forces.
 */
import { useState } from 'react';
import { Gauge, Calculator, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { calculateClampingForce, type ClampingForceResult, IS_DEMO } from '../../lib/api';

const MATERIALS = [
  { value: 'aluminum_6061', label: 'Aluminum 6061' },
  { value: 'aluminum_7075', label: 'Aluminum 7075' },
  { value: 'steel_mild',    label: 'Mild Steel' },
  { value: 'steel_4140',    label: '4140 Steel' },
  { value: 'stainless_304', label: 'Stainless 304' },
  { value: 'titanium_ti6al4v', label: 'Titanium Ti-6Al-4V' },
  { value: 'inconel_718',   label: 'Inconel 718' },
  { value: 'plastic_abs',   label: 'ABS Plastic' },
  { value: 'plastic_peek',  label: 'PEEK Plastic' },
  { value: 'composite_cfrp',label: 'CFRP Composite' },
];

const SURFACES = [
  { value: 'siegmund',   label: 'Siegmund Table' },
  { value: 't_slot',     label: 'T-Slot Table' },
  { value: 'rubber_pad', label: 'Rubber Pad' },
  { value: 'bare_steel', label: 'Bare Steel' },
  { value: 'anodized',   label: 'Anodized' },
  { value: 'nitrided',   label: 'Nitrided' },
];

const DEMO_RESULT: ClampingForceResult = {
  project_id: 'demo',
  material: 'Aluminum 6061',
  cutting_force_n: 847.3,
  friction_force_required_n: 847.3,
  clamping_force_per_clamp_n: 1411.2,
  total_clamping_force_n: 2822.4,
  safety_factor: 2.5,
  recommended_clamp_type: 'LC-1000-V (Power Clamp 1000N)',
  recommendations: [
    'Clamping setup is within normal operating parameters for Aluminum 6061.',
    'Verify clamp placement follows 3-2-1 locating rule for deterministic fixturing.',
  ],
  breakdown: {
    tangential_cutting_force_n: 720.5,
    feed_force_n: 252.2,
    radial_force_n: 158.5,
    weight_force_n: 19.6,
    friction_coefficient: 0.15,
    material_removal_rate_mm3_min: 6000,
    cutting_speed_m_min: 113.1,
    contact_pressure_mpa: 0.565,
    num_clamps: 2,
    fixture_surface: 'siegmund',
  },
};

interface Props {
  projectId?: string;
}

export default function ClampingForcePanel({ projectId }: Props) {
  const [result, setResult] = useState<ClampingForceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [params, setParams] = useState({
    material: 'aluminum_6061',
    depth_of_cut_mm: 2,
    width_of_cut_mm: 10,
    feed_rate_mm_per_rev: 0.1,
    spindle_speed_rpm: 3000,
    tool_diameter_mm: 12,
    num_clamps: 2,
    fixture_surface: 'siegmund',
    safety_factor: 2.5,
    part_mass_kg: 1.0,
  });

  function setParam<K extends keyof typeof params>(key: K, value: (typeof params)[K]) {
    setParams(prev => ({ ...prev, [key]: value }));
  }

  async function handleCalculate() {
    if (IS_DEMO || !projectId) {
      setLoading(true);
      await new Promise(r => setTimeout(r, 1000));
      setResult(DEMO_RESULT);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await calculateClampingForce(projectId, params);
    if (r) setResult(r);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <Gauge size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Clamping Force</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Input form */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Material & Process</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 mb-0.5 block">Material</label>
              <select
                value={params.material}
                onChange={e => setParam('material', e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-cadsurface-800 border border-cadsurface-700 text-xs text-slate-200 outline-none focus:border-cadblue-500"
              >
                {MATERIALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <NumInput label="Depth of Cut (mm)" value={params.depth_of_cut_mm} step={0.5} min={0.1}
              onChange={v => setParam('depth_of_cut_mm', v)} />
            <NumInput label="Width of Cut (mm)" value={params.width_of_cut_mm} step={1} min={0.1}
              onChange={v => setParam('width_of_cut_mm', v)} />
            <NumInput label="Feed (mm/rev)" value={params.feed_rate_mm_per_rev} step={0.01} min={0.01}
              onChange={v => setParam('feed_rate_mm_per_rev', v)} />
            <NumInput label="Speed (RPM)" value={params.spindle_speed_rpm} step={100} min={100}
              onChange={v => setParam('spindle_speed_rpm', v)} />
            <NumInput label="Tool Ø (mm)" value={params.tool_diameter_mm} step={1} min={1}
              onChange={v => setParam('tool_diameter_mm', v)} />
            <NumInput label="Part Mass (kg)" value={params.part_mass_kg} step={0.1} min={0.01}
              onChange={v => setParam('part_mass_kg', v)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Fixture Surface</label>
              <select
                value={params.fixture_surface}
                onChange={e => setParam('fixture_surface', e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-cadsurface-800 border border-cadsurface-700 text-xs text-slate-200 outline-none focus:border-cadblue-500"
              >
                {SURFACES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <NumInput label="# Clamps" value={params.num_clamps} step={1} min={1} max={12}
              onChange={v => setParam('num_clamps', Math.round(v))} />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 mb-0.5 block">Safety Factor (ASME B5.50 rec: 2.5)</label>
            <input
              type="range" min={1} max={5} step={0.5} value={params.safety_factor}
              onChange={e => setParam('safety_factor', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>1.0 (min)</span>
              <span className="text-cadblue-400 font-medium">{params.safety_factor}×</span>
              <span>5.0 (max)</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-xs font-medium text-white transition-all"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
          Calculate Clamping Force
        </button>

        {/* Results */}
        {result && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Results — {result.material}</p>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Per Clamp" value={`${result.clamping_force_per_clamp_n.toLocaleString()} N`} highlight />
              <MetricCard label="Total Force" value={`${result.total_clamping_force_n.toLocaleString()} N`} />
              <MetricCard label="Cutting Force" value={`${result.cutting_force_n.toLocaleString()} N`} />
              <MetricCard label="Safety Factor" value={`${result.safety_factor}×`} />
            </div>

            {/* Recommended clamp */}
            <div className="p-2.5 rounded-lg bg-cadblue-950/30 border border-cadblue-800/40">
              <p className="text-[10px] text-slate-400">Recommended Clamp Type</p>
              <p className="text-xs font-medium text-cadblue-300 mt-0.5">{result.recommended_clamp_type}</p>
            </div>

            {/* Recommendations */}
            {result.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-cadsurface-800 border border-cadsurface-700">
                {rec.toLowerCase().includes('warning') || rec.toLowerCase().includes('exceeds') || rec.toLowerCase().includes('below') ? (
                  <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 size={11} className="text-emerald-400 mt-0.5 shrink-0" />
                )}
                <p className="text-[10px] text-slate-300 leading-relaxed">{rec}</p>
              </div>
            ))}

            {/* Breakdown toggle */}
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className="w-full flex items-center gap-1.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-all"
            >
              {showBreakdown ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Technical Breakdown
            </button>

            {showBreakdown && (
              <div className="p-2.5 rounded-lg bg-cadsurface-800 border border-cadsurface-700 space-y-1">
                {Object.entries(result.breakdown).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[10px]">
                    <span className="text-slate-400">{k.replace(/_/g, ' ')}</span>
                    <span className="text-slate-200 font-medium">{typeof v === 'number' ? v.toLocaleString() : v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NumInput({ label, value, step, min, max, onChange }: {
  label: string;
  value: number;
  step: number;
  min: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-400 mb-0.5 block">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1.5 rounded bg-cadsurface-800 border border-cadsurface-700 text-xs text-slate-200 outline-none focus:border-cadblue-500"
      />
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2.5 rounded-lg border ${highlight ? 'bg-cadblue-950/40 border-cadblue-800/50' : 'bg-cadsurface-800 border-cadsurface-700'}`}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? 'text-cadblue-300' : 'text-slate-100'}`}>{value}</p>
    </div>
  );
}
