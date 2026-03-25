import { useState, useEffect } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { fetchMachinePresets, addMachine } from '../../lib/api';
import type { MachinePreset, Machine, MachineInput } from '../../lib/api';

const MACHINE_TYPE_META: Record<Machine['machine_type'], { label: string; icon: string; color: string }> = {
  fdm_printer:  { label: 'FDM Printer',   icon: '🖨️',  color: 'bg-blue-900/40 border-blue-700/40 text-blue-300' },
  sla_printer:  { label: 'SLA Printer',   icon: '💡',  color: 'bg-purple-900/40 border-purple-700/40 text-purple-300' },
  cnc_3axis:    { label: 'CNC 3-axis',    icon: '⚙️',  color: 'bg-orange-900/40 border-orange-700/40 text-orange-300' },
  cnc_5axis:    { label: 'CNC 5-axis',    icon: '🔧',  color: 'bg-amber-900/40 border-amber-700/40 text-amber-300' },
  laser_cutter: { label: 'Laser Cutter',  icon: '✂️',  color: 'bg-red-900/40 border-red-700/40 text-red-300' },
  manual_shop:  { label: 'Manual Shop',   icon: '🔨',  color: 'bg-slate-800 border-slate-700 text-slate-300' },
};

interface Props {
  onClose: () => void;
  onAdded: (machine: Machine) => void;
}

const emptyCustom: MachineInput = {
  name: '',
  machine_type: 'fdm_printer',
  make_model: '',
  build_volume_json: { x_mm: 0, y_mm: 0, z_mm: 0 },
  materials_available: [],
  hourly_rate: 0,
  setup_time_minutes: 0,
};

export default function MachineSetupModal({ onClose, onAdded }: Props) {
  const [presets, setPresets] = useState<MachinePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState<MachineInput>(emptyCustom);
  const [materialsInput, setMaterialsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMachinePresets().then(data => {
      if (data) setPresets(data);
      setLoading(false);
    });
  }, []);

  async function handleAddPreset(preset: MachinePreset) {
    setAdding(preset.id);
    const { id: _id, description: _desc, ...input } = preset;
    const result = await addMachine(input);
    setAdding(null);
    if (result) {
      onAdded(result);
      onClose();
    }
  }

  async function handleAddCustom() {
    if (!custom.name.trim()) return;
    setSubmitting(true);
    const materials = materialsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const result = await addMachine({ ...custom, materials_available: materials });
    setSubmitting(false);
    if (result) {
      onAdded(result);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cadsurface-700 shrink-0">
          <span className="text-sm font-semibold text-slate-200">Add Machine</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-cadsurface-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Presets */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-slate-500" />
            </div>
          ) : presets.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick Add — Presets</p>
              <div className="grid grid-cols-2 gap-2">
                {presets.map(preset => {
                  const meta = MACHINE_TYPE_META[preset.machine_type];
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleAddPreset(preset)}
                      disabled={adding === preset.id}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all hover:border-cadblue-600/50 hover:bg-cadsurface-800 ${meta.color}`}
                    >
                      <span className="text-lg leading-none shrink-0">{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold leading-tight truncate">{preset.name}</p>
                        {preset.make_model && (
                          <p className="text-xs opacity-60 mt-0.5 truncate">{preset.make_model}</p>
                        )}
                        {preset.description && (
                          <p className="text-xs opacity-50 mt-0.5 leading-tight">{preset.description}</p>
                        )}
                      </div>
                      {adding === preset.id && <Loader2 size={12} className="animate-spin shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Custom machine */}
          <div>
            <button
              onClick={() => setShowCustom(p => !p)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
            >
              <Plus size={12} />
              Custom Machine
            </button>

            {showCustom && (
              <div className="mt-3 space-y-3">
                {/* Name */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Machine Name *</label>
                  <input
                    value={custom.name}
                    onChange={e => setCustom(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Workshop Prusa MK4"
                    className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cadblue-500/60 transition-colors"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Machine Type</label>
                  <select
                    value={custom.machine_type}
                    onChange={e => setCustom(p => ({ ...p, machine_type: e.target.value as Machine['machine_type'] }))}
                    className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cadblue-500/60 transition-colors"
                  >
                    {Object.entries(MACHINE_TYPE_META).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.icon} {meta.label}</option>
                    ))}
                  </select>
                </div>

                {/* Make/Model */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Make / Model</label>
                  <input
                    value={custom.make_model ?? ''}
                    onChange={e => setCustom(p => ({ ...p, make_model: e.target.value }))}
                    placeholder="e.g. Prusa MK4"
                    className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cadblue-500/60 transition-colors"
                  />
                </div>

                {/* Build volume */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Build Volume (mm)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x_mm', 'y_mm', 'z_mm'] as const).map(axis => (
                      <div key={axis} className="relative">
                        <input
                          type="number"
                          min={0}
                          value={custom.build_volume_json?.[axis] ?? 0}
                          onChange={e => setCustom(p => ({
                            ...p,
                            build_volume_json: { ...(p.build_volume_json ?? { x_mm: 0, y_mm: 0, z_mm: 0 }), [axis]: Number(e.target.value) },
                          }))}
                          className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cadblue-500/60 transition-colors"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{axis[0].toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Materials */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Materials (comma-separated)</label>
                  <input
                    value={materialsInput}
                    onChange={e => setMaterialsInput(e.target.value)}
                    placeholder="e.g. PLA, PETG, ABS"
                    className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cadblue-500/60 transition-colors"
                  />
                </div>

                {/* Rate + Setup */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Hourly Rate ($/hr)</label>
                    <input
                      type="number"
                      min={0}
                      value={custom.hourly_rate}
                      onChange={e => setCustom(p => ({ ...p, hourly_rate: Number(e.target.value) }))}
                      className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cadblue-500/60 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Setup Time (min)</label>
                    <input
                      type="number"
                      min={0}
                      value={custom.setup_time_minutes}
                      onChange={e => setCustom(p => ({ ...p, setup_time_minutes: Number(e.target.value) }))}
                      className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cadblue-500/60 transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddCustom}
                  disabled={!custom.name.trim() || submitting}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cadblue-600 hover:bg-cadblue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                >
                  {submitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add Custom Machine
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
