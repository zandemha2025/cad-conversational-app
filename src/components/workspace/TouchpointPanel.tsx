import { useState } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
  Circle,
  Target,
  X,
} from 'lucide-react';
import { addTouchpoint, deleteTouchpoint } from '../../lib/api';
import { getTouchpoints } from '../../lib/storage';

type TouchpointType = 'locating' | 'clamping' | 'support';

interface Touchpoint {
  id: string;
  label: string;
  type: TouchpointType;
  face: string;
  coords: [number, number, number];
  detail: string;
  force?: string;
  expanded: boolean;
}

const TYPE_META: Record<TouchpointType, { color: string; bg: string; border: string; dot: string; label: string }> = {
  locating: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/30',
    border: 'border-emerald-700/50',
    dot: 'bg-emerald-400',
    label: 'Locating',
  },
  clamping: {
    color: 'text-cadblue-400',
    bg: 'bg-cadblue-950/30',
    border: 'border-cadblue-700/50',
    dot: 'bg-cadblue-400',
    label: 'Clamping',
  },
  support: {
    color: 'text-slate-400',
    bg: 'bg-cadsurface-800',
    border: 'border-cadsurface-600',
    dot: 'bg-slate-500',
    label: 'Support',
  },
};


const COUNT_LABELS: Record<TouchpointType, string> = {
  locating: 'Locating pins',
  clamping: 'Clamps',
  support:  'Support pads',
};

// ── Add Touchpoint Form ───────────────────────────────────────────────────────

interface AddFormProps {
  projectId: string;
  onClose: () => void;
  onAdd: (tp: Touchpoint) => void;
}

function AddTouchpointForm({ projectId, onClose, onAdd }: AddFormProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<TouchpointType>('locating');
  const [face, setFace] = useState('');
  const [x, setX] = useState('0');
  const [y, setY] = useState('0');
  const [z, setZ] = useState('0');
  const [detail, setDetail] = useState('');
  const [force, setForce] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const coords: [number, number, number] = [parseFloat(x), parseFloat(y), parseFloat(z)];
    const newLabel = label || `TP-${Date.now().toString().slice(-4)}`;

    const res = await addTouchpoint(projectId, {
      label: newLabel,
      type,
      face_id: face,
      coords,
      detail: detail || null,
      force_n: force ? parseFloat(force) : null,
    });
    if (res) {
      const tp: Touchpoint = {
        id: res.id,
        label: res.label,
        type: res.type,
        face: res.face_id,
        coords: res.coords as [number, number, number],
        detail: res.detail ?? '',
        force: res.force_n ? `${res.force_n} N` : undefined,
        expanded: false,
      };
      onAdd(tp);
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-start z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-80 p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Add Touchpoint</span>
          <button onClick={onClose}><X size={16} className="text-gray-400 hover:text-white" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Label</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="TP-07"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as TouchpointType)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
                <option value="locating">Locating</option>
                <option value="clamping">Clamping</option>
                <option value="support">Support</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Face / Surface</label>
            <input value={face} onChange={e => setFace(e.target.value)} placeholder="e.g. Bottom face (Datum A)" required
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[['X', x, setX], ['Y', y, setY], ['Z', z, setZ]].map(([axis, val, setter]) => (
              <div key={String(axis)}>
                <label className="text-xs text-gray-500 block mb-1">{String(axis)} mm</label>
                <input type="number" value={String(val)} onChange={e => (setter as (v: string) => void)(e.target.value)} step="0.1"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Detail (optional)</label>
            <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Hardware spec, notes…"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>
          {type === 'clamping' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Force (N)</label>
              <input type="number" value={force} onChange={e => setForce(e.target.value)} placeholder="320"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white text-xs py-1.5 rounded transition-colors">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TouchpointPanel({ projectId = '' }: { projectId?: string }) {
  const [points, setPoints] = useState<Touchpoint[]>(() => {
    const stored = getTouchpoints(projectId);
    if (stored.length > 0) {
      return stored.map(s => ({
        id: s.id,
        label: s.label,
        type: s.type,
        face: s.face_id,
        coords: s.coords as [number, number, number],
        detail: s.detail ?? '',
        force: s.force_n ? `${s.force_n} N` : undefined,
        expanded: false,
      }));
    }
    return [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const toggle = (id: string) => {
    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, expanded: !p.expanded } : p))
    );
  };

  const remove = async (id: string) => {
    await deleteTouchpoint(projectId, id);
    setPoints((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const select = (id: string) => setSelectedId(selectedId === id ? null : id);

  const handleAdd = (tp: Touchpoint) => {
    setPoints(prev => [...prev, tp]);
  };

  const counts = {
    locating: points.filter((p) => p.type === 'locating').length,
    clamping: points.filter((p) => p.type === 'clamping').length,
    support:  points.filter((p) => p.type === 'support').length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cadsurface-950">

      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-cadblue-400" />
            <p className="text-xs font-bold text-slate-200">Clamping & Locating</p>
          </div>
          <span className="text-xs bg-cadsurface-800 border border-cadsurface-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
            {points.length} pts
          </span>
        </div>

        {/* Summary pills */}
        <div className="flex gap-1.5 mt-2">
          {(['locating', 'clamping', 'support'] as TouchpointType[]).map((t) => {
            const meta = TYPE_META[t];
            return (
              <div key={t} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${meta.border} ${meta.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                <span className={meta.color}>{counts[t]} {COUNT_LABELS[t]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mode banner */}
      <div className="mx-3 mt-3 flex items-start gap-2 bg-cadblue-950/40 border border-cadblue-700/40 rounded-lg px-3 py-2 shrink-0">
        <MapPin size={12} className="text-cadblue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-cadblue-300 leading-relaxed">
          Click any face or edge in the 3D view to add a touchpoint. Dots show current points.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0">
        {(['locating', 'clamping', 'support'] as TouchpointType[]).map((t) => (
          <div key={t} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${TYPE_META[t].dot}`} />
            <span className="text-xs text-slate-600">{TYPE_META[t].label}</span>
          </div>
        ))}
      </div>

      {/* Touchpoint list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {points.map((p) => {
          const meta = TYPE_META[p.type];
          const isSelected = selectedId === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-xl border transition-all ${
                isSelected
                  ? `${meta.border} ${meta.bg}`
                  : 'border-cadsurface-700 bg-cadsurface-900/60 hover:border-cadsurface-600'
              }`}
            >
              {/* Row header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                onClick={() => select(p.id)}
              >
                {/* Type dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />

                {/* Label + face */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold font-mono ${isSelected ? meta.color : 'text-slate-300'}`}>{p.label}</span>
                    <span className={`text-xs px-1.5 py-0 rounded border ${meta.border} ${meta.color} opacity-70`}>{meta.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">{p.face}</p>
                </div>

                {/* Coords */}
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-xs font-mono text-slate-600">
                    [{p.coords.map((c) => c.toFixed(1)).join(', ')}]
                  </p>
                </div>

                {/* Expand / delete */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
                    className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-slate-300"
                  >
                    {p.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                    className="w-5 h-5 flex items-center justify-center text-slate-700 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {p.expanded && (
                <div className="px-3 pb-3 pt-0 space-y-2">
                  <div className="h-px bg-cadsurface-700" />
                  <p className="text-xs text-slate-400 leading-relaxed">{p.detail}</p>
                  {p.force && (
                    <div className="flex items-center gap-2">
                      <Circle size={10} className="text-cadblue-400" />
                      <span className="text-xs text-slate-500">Clamping force:</span>
                      <span className="text-xs font-mono font-bold text-cadblue-300">{p.force}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1.5">
                    {['X', 'Y', 'Z'].map((axis, i) => (
                      <div key={axis} className="bg-cadsurface-900/60 rounded-lg px-2 py-1.5">
                        <p className="text-xs text-slate-600">{axis}</p>
                        <p className="text-xs font-mono text-slate-300">{p.coords[i].toFixed(2)} mm</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: add + validation note */}
      {showAddForm && (
        <AddTouchpointForm
          projectId={projectId}
          onClose={() => setShowAddForm(false)}
          onAdd={handleAdd}
        />
      )}
      <div className="border-t border-cadsurface-700 px-3 py-3 space-y-2 shrink-0">
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-cadsurface-600 hover:border-cadblue-600/60 text-xs text-slate-500 hover:text-cadblue-300 transition-all"
        >
          <Plus size={13} />
          Add touchpoint
        </button>
        <div className="flex items-start gap-2">
          <Info size={11} className="text-slate-600 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600 leading-relaxed">
            3-2-1 rule: 3 support pads, 2 locating pins, 1 clamp direction. Current: {counts.support}–{counts.locating}–{counts.clamping}
          </p>
        </div>
      </div>
    </div>
  );
}
