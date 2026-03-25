/**
 * ConstraintsPanel — Assembly constraints editor.
 */
import { useState, useEffect } from 'react';
import {
  Link2, Plus, Trash2, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  fetchConstraints, createConstraint, deleteConstraint, validateAllConstraints,
  type AssemblyConstraint, IS_DEMO,
} from '../../lib/api';

type ConstraintType = 'fixed' | 'coincident' | 'parallel' | 'perpendicular' | 'distance' | 'angle';

const CONSTRAINT_TYPES: { value: ConstraintType; label: string; icon: string; params?: string[] }[] = [
  { value: 'fixed',        label: 'Fixed',         icon: '🔒', params: [] },
  { value: 'coincident',   label: 'Coincident',    icon: '⊙', params: [] },
  { value: 'parallel',     label: 'Parallel',      icon: '∥', params: [] },
  { value: 'perpendicular',label: 'Perpendicular', icon: '⊥', params: [] },
  { value: 'distance',     label: 'Distance',      icon: '↔', params: ['distance_mm'] },
  { value: 'angle',        label: 'Angle',         icon: '∠', params: ['angle_deg'] },
];

const DEMO_CONSTRAINTS: AssemblyConstraint[] = [
  {
    id: 'c1', project_id: 'demo', type: 'fixed', part_a: 'Base Plate', part_b: '',
    params_json: {}, is_valid: true, error_msg: null, created_at: new Date().toISOString(),
  },
  {
    id: 'c2', project_id: 'demo', type: 'distance', part_a: 'Locator Pin A', part_b: 'Locator Pin B',
    params_json: { distance_mm: 50 }, is_valid: true, error_msg: null, created_at: new Date().toISOString(),
  },
  {
    id: 'c3', project_id: 'demo', type: 'angle', part_a: 'Clamp Arm', part_b: 'Base Plate',
    params_json: { angle_deg: 90 }, is_valid: true, error_msg: null, created_at: new Date().toISOString(),
  },
];

interface Props {
  projectId?: string;
}

export default function ConstraintsPanel({ projectId }: Props) {
  const [constraints, setConstraints] = useState<AssemblyConstraint[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'fixed' as ConstraintType, part_a: '', part_b: '', param_value: '' });

  useEffect(() => {
    if (IS_DEMO || !projectId) {
      setConstraints(DEMO_CONSTRAINTS);
      setLoading(false);
      return;
    }
    fetchConstraints(projectId).then(data => {
      if (data) setConstraints(data);
      setLoading(false);
    });
  }, [projectId]);

  async function handleAdd() {
    if (!form.part_a.trim()) return;
    setAdding(true);

    const typeDef = CONSTRAINT_TYPES.find(t => t.value === form.type)!;
    const params: Record<string, unknown> = {};
    if (typeDef.params?.includes('distance_mm') && form.param_value) {
      params.distance_mm = parseFloat(form.param_value);
    }
    if (typeDef.params?.includes('angle_deg') && form.param_value) {
      params.angle_deg = parseFloat(form.param_value);
    }

    if (IS_DEMO || !projectId) {
      const demo: AssemblyConstraint = {
        id: `c-${Date.now()}`,
        project_id: projectId || 'demo',
        type: form.type,
        part_a: form.part_a,
        part_b: form.part_b,
        params_json: params,
        is_valid: true,
        error_msg: null,
        created_at: new Date().toISOString(),
      };
      setConstraints(prev => [...prev, demo]);
    } else {
      const result = await createConstraint(projectId, {
        type: form.type,
        part_a: form.part_a,
        part_b: form.part_b,
        params,
      });
      if (result) setConstraints(prev => [...prev, result]);
    }

    setForm({ type: 'fixed', part_a: '', part_b: '', param_value: '' });
    setShowForm(false);
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (IS_DEMO || !projectId) {
      setConstraints(prev => prev.filter(c => c.id !== id));
      return;
    }
    await deleteConstraint(projectId, id);
    setConstraints(prev => prev.filter(c => c.id !== id));
  }

  async function handleValidateAll() {
    if (IS_DEMO || !projectId) {
      setConstraints(prev => prev.map(c => ({ ...c, is_valid: true, error_msg: null })));
      return;
    }
    setValidating(true);
    const result = await validateAllConstraints(projectId) as Record<string, unknown> | null;
    if (result && Array.isArray(result.constraints)) {
      setConstraints(result.constraints as AssemblyConstraint[]);
    }
    setValidating(false);
  }

  const typeDef = CONSTRAINT_TYPES.find(t => t.value === form.type)!;
  const needsParam = (typeDef?.params?.length || 0) > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <Link2 size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Constraints</span>
        <span className="ml-auto text-[10px] text-slate-500">{constraints.length} defined</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Toolbar */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-cadsurface-700 hover:bg-cadsurface-600 text-xs text-slate-300 transition-all"
          >
            <Plus size={11} /> Add Constraint
          </button>
          <button
            onClick={handleValidateAll}
            disabled={validating || constraints.length === 0}
            title="Validate all constraints"
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-cadsurface-700 hover:bg-cadblue-600/50 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
          >
            {validating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="p-2.5 rounded-lg bg-cadsurface-800 border border-cadsurface-700 space-y-2">
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as ConstraintType }))}
              className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 outline-none"
            >
              {CONSTRAINT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
            <input
              value={form.part_a}
              onChange={e => setForm(f => ({ ...f, part_a: e.target.value }))}
              placeholder="Part A name *"
              className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cadblue-500"
            />
            {form.type !== 'fixed' && (
              <input
                value={form.part_b}
                onChange={e => setForm(f => ({ ...f, part_b: e.target.value }))}
                placeholder="Part B name"
                className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cadblue-500"
              />
            )}
            {needsParam && (
              <input
                type="number"
                value={form.param_value}
                onChange={e => setForm(f => ({ ...f, param_value: e.target.value }))}
                placeholder={typeDef.params?.[0] === 'distance_mm' ? 'Distance (mm)' : 'Angle (deg)'}
                className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cadblue-500"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={adding || !form.part_a.trim()}
                className="flex-1 py-1.5 rounded bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-40 text-xs text-white font-medium transition-all"
              >
                {adding ? <Loader2 size={10} className="animate-spin inline" /> : 'Add'}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm({ type: 'fixed', part_a: '', part_b: '', param_value: '' }); }}
                className="px-3 py-1.5 rounded bg-cadsurface-700 text-xs text-slate-400 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : constraints.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Link2 size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No constraints defined.</p>
            <p className="text-xs">Add constraints to define assembly relationships.</p>
          </div>
        ) : (
          constraints.map(c => {
            const typeDef = CONSTRAINT_TYPES.find(t => t.value === c.type);
            const params = c.params_json || {};
            const paramStr = Object.entries(params).map(([k, v]) => `${v}${k.includes('mm') ? 'mm' : '°'}`).join(', ');

            return (
              <div key={c.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-cadsurface-800 border border-cadsurface-700 hover:border-cadsurface-600 transition-all group">
                {/* Status indicator */}
                <div className="mt-0.5">
                  {c.is_valid === null ? (
                    <div className="w-3 h-3 rounded-full bg-slate-600" title="Not validated" />
                  ) : c.is_valid ? (
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  ) : (
                    <XCircle size={12} className="text-red-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">{typeDef?.icon}</span>
                    <span className="text-xs font-medium text-slate-200">{typeDef?.label}</span>
                    {paramStr && <span className="text-[10px] text-cadblue-400">{paramStr}</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-slate-300">{c.part_a}</span>
                    {c.part_b && (
                      <>
                        <span className="text-slate-500 text-[10px]">↔</span>
                        <span className="text-[10px] text-slate-300">{c.part_b}</span>
                      </>
                    )}
                  </div>
                  {c.error_msg && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle size={9} className="text-amber-400" />
                      <p className="text-[10px] text-amber-400">{c.error_msg}</p>
                    </div>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-all"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
