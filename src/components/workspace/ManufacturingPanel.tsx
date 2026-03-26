import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wrench, ChevronDown, ChevronRight, Plus, Trash2, Loader2,
  DollarSign, ShoppingCart, Package, CheckCircle2,
  Download, RefreshCw, Upload, AlertCircle,
} from 'lucide-react';
import {
  fetchMachines, deleteMachine, estimateManufacturingCost,
  fetchShoppingList, uploadInventory, matchInventory,
} from '../../lib/api';
import type { Machine, InventoryMatch, ShoppingListItem } from '../../lib/api';
import { useWorkspace } from '../../store/workspaceStore';
import MachineSetupModal from './MachineSetupModal';

const MACHINE_TYPE_LABEL: Record<Machine['machine_type'], string> = {
  fdm_printer:  'FDM Printer',
  sla_printer:  'SLA Printer',
  cnc_3axis:    'CNC 3-axis',
  cnc_5axis:    'CNC 5-axis',
  laser_cutter: 'Laser Cutter',
  manual_shop:  'Manual Shop',
};

const MACHINE_TYPE_ICON: Record<Machine['machine_type'], string> = {
  fdm_printer:  '🖨️',
  sla_printer:  '💡',
  cnc_3axis:    '⚙️',
  cnc_5axis:    '🔧',
  laser_cutter: '✂️',
  manual_shop:  '🔨',
};

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-cadsurface-700 last:border-0">
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
        onClick={() => setOpen(p => !p)}
      >
        <span className="text-orange-400">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

// ── Section A: Your Machines ──────────────────────────────────────────────────

function MachinesSection() {
  const { state, dispatch } = useWorkspace();
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setLoadingMachines(true);
    fetchMachines().then(data => {
      if (data) dispatch({ type: 'SET_MACHINES', machines: data });
      setLoadingMachines(false);
    });
  }, [dispatch]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteMachine(id);
    dispatch({ type: 'SET_MACHINES', machines: state.machines.filter(m => m.id !== id) });
    setDeletingId(null);
  }

  return (
    <Section
      title="Your Machines"
      icon={<Wrench size={13} />}
      action={
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors"
        >
          <Plus size={10} /> Add
        </button>
      }
    >
      <div className="px-3 space-y-2">
        {loadingMachines ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : state.machines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Wrench size={22} className="text-slate-700" />
            <p className="text-xs text-slate-500">No machines added yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-orange-400 hover:text-orange-300 underline transition-colors"
            >
              Add your first machine
            </button>
          </div>
        ) : (
          state.machines.map(machine => (
            <div key={machine.id} className="group bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-base leading-none shrink-0 mt-0.5">{MACHINE_TYPE_ICON[machine.machine_type]}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{machine.name}</p>
                    {machine.make_model && (
                      <p className="text-xs text-slate-500 truncate">{machine.make_model}</p>
                    )}
                    <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-cadsurface-700 text-slate-400 border border-cadsurface-600">
                      {MACHINE_TYPE_LABEL[machine.machine_type]}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(machine.id)}
                  disabled={deletingId === machine.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-950/40 shrink-0"
                >
                  {deletingId === machine.id
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Trash2 size={11} />}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {machine.materials_available.slice(0, 4).map(mat => (
                  <span key={mat} className="text-xs bg-cadsurface-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                    {mat}
                  </span>
                ))}
                {machine.materials_available.length > 4 && (
                  <span className="text-xs text-slate-600">+{machine.materials_available.length - 4}</span>
                )}
              </div>

              {machine.build_volume_json && (
                <p className="text-xs text-slate-600 mt-1 font-mono">
                  {machine.build_volume_json.x_mm}×{machine.build_volume_json.y_mm}×{machine.build_volume_json.z_mm} mm
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <MachineSetupModal
          onClose={() => setShowModal(false)}
          onAdded={machine => dispatch({ type: 'SET_MACHINES', machines: [...state.machines, machine] })}
        />
      )}
    </Section>
  );
}

// ── Section B: Cost Estimate ──────────────────────────────────────────────────

function CostEstimateSection({ projectId }: { projectId?: string }) {
  const { state, dispatch } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const hasFixture = !!state.gltfUrl;
  const estimate = state.costEstimate;

  async function handleEstimate() {
    if (!projectId) return;
    setLoading(true);
    const result = await estimateManufacturingCost(projectId);
    if (result && result.length > 0) dispatch({ type: 'SET_COST_ESTIMATE', estimate: result[0] });
    setLoading(false);
  }

  return (
    <Section title="Cost Estimate" icon={<DollarSign size={13} />}>
      <div className="px-3">
        {state.machines.length === 0 ? (
          <div className="flex items-start gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2.5">
            <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">Add your machines above to get a cost estimate.</p>
          </div>
        ) : !hasFixture ? (
          <div className="flex items-start gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2.5">
            <AlertCircle size={13} className="text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500">Generate a fixture first to get a cost estimate.</p>
          </div>
        ) : !estimate ? (
          <button
            onClick={handleEstimate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
            {loading ? 'Estimating…' : 'Estimate Cost'}
          </button>
        ) : (
          <div className="space-y-2">
            {/* Machine info */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-emerald-900/20 border-emerald-700/40">
              <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200">{estimate.machine_name}</p>
                <p className="text-xs text-slate-400 truncate capitalize">{estimate.machine_type.replace('_', ' ')}</p>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="bg-cadsurface-800 border border-cadsurface-700 rounded-lg divide-y divide-cadsurface-700">
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-xs text-slate-400">Material</span>
                <span className="text-xs text-slate-200 font-mono">{fmt(estimate.material_cost)}</span>
              </div>
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-xs text-slate-400">
                  Machine time
                  <span className="text-slate-600 ml-1">({(estimate.estimated_hours + estimate.setup_hours).toFixed(1)} hr)</span>
                </span>
                <span className="text-xs text-slate-200 font-mono">{fmt(estimate.machine_cost)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-xs font-semibold text-slate-200">Total</span>
                <span className="text-xs font-semibold text-emerald-400 font-mono">{fmt(estimate.total_cost)}</span>
              </div>
            </div>

            <button
              onClick={handleEstimate}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Re-estimate
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Section C: Shopping List / BOM ────────────────────────────────────────────

function ShoppingListSection({ projectId }: { projectId?: string }) {
  const { state, dispatch } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const items: ShoppingListItem[] = state.shoppingList;

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchShoppingList(projectId).then(data => {
      if (data) dispatch({ type: 'SET_SHOPPING_LIST', items: data });
      setLoading(false);
    });
  }, [projectId, dispatch]);

  const totalCost = items.reduce((sum, i) => sum + i.estimated_price * i.quantity_needed, 0);

  function exportCsv() {
    const header = 'Name,Quantity,Part Number,Supplier,Estimated Price\n';
    const rows = items.map(i =>
      `"${i.name}",${i.quantity_needed},${i.part_number ?? ''},${i.supplier ?? ''},${i.estimated_price.toFixed(2)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopping-list-${projectId ?? 'project'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Section
      title="Parts Needed"
      icon={<ShoppingCart size={13} />}
      action={
        items.length > 0 ? (
          <button
            onClick={exportCsv}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cadsurface-700 hover:bg-cadsurface-600 text-slate-300 text-xs font-medium transition-colors"
          >
            <Download size={10} /> CSV
          </button>
        ) : undefined
      }
    >
      <div className="px-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <ShoppingCart size={22} className="text-slate-700" />
            <p className="text-xs text-slate-500">No parts listed yet.</p>
            <p className="text-xs text-slate-600">Generate a fixture to see the parts needed.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 leading-snug">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">Qty: {item.quantity_needed}</span>
                    {item.supplier && (
                      <span className="text-xs bg-cadsurface-700 text-slate-500 px-1.5 py-0.5 rounded">{item.supplier}</span>
                    )}
                    {item.part_number && (
                      <span className="text-xs text-cadblue-400 font-mono">{item.part_number}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-emerald-400 font-mono shrink-0">
                  {fmt(item.estimated_price * item.quantity_needed)}
                </span>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between pt-1 border-t border-cadsurface-700 mt-2">
              <span className="text-xs font-semibold text-slate-400">Total Hardware Cost</span>
              <span className="text-xs font-semibold text-emerald-400 font-mono">{fmt(totalCost)}</span>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Section D: Inventory ──────────────────────────────────────────────────────

function InventorySection({ projectId }: { projectId?: string }) {
  const { state } = useWorkspace();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<InventoryMatch[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shoppingItems = state.shoppingList;

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    await uploadInventory(file);
    setUploading(false);

    // Auto-match after upload if we have shopping list
    if (projectId && shoppingItems.length > 0) {
      setMatching(true);
      const match = await matchInventory(projectId);
      if (match) setMatchResult(match);
      setMatching(false);
    }
  }, [projectId, shoppingItems.length]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const hasInventory = state.inventory.length > 0;

  return (
    <Section title="Your Inventory" icon={<Package size={13} />} defaultOpen={false}>
      <div className="px-3 space-y-2">
        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
            dragging
              ? 'border-orange-500 bg-orange-950/20'
              : 'border-cadsurface-600 hover:border-cadsurface-500 hover:bg-cadsurface-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={18} className="animate-spin text-orange-400" />
              <p className="text-xs text-slate-400">Parsing inventory…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload size={18} className="text-slate-500" />
              <p className="text-xs font-medium text-slate-300">
                {hasInventory ? 'Re-upload inventory' : 'Upload your inventory'}
              </p>
              <p className="text-xs text-slate-600">CSV or Excel • drag & drop or click</p>
            </div>
          )}
        </div>

        {/* No inventory message */}
        {!hasInventory && !uploading && (
          <p className="text-xs text-slate-600 text-center leading-relaxed">
            Don't have an inventory list? No problem — use the shopping list above to order what you need.
          </p>
        )}

        {/* Match results */}
        {matching && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={13} className="animate-spin text-slate-500" />
            <span className="text-xs text-slate-400">Matching against your inventory…</span>
          </div>
        )}

        {matchResult && !matching && (
          <div className="space-y-2">
            {/* Summary banner */}
            <div className="flex items-center gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-2">
              <Package size={13} className="text-slate-400 shrink-0" />
              <p className="text-xs text-slate-300">
                <span className="font-semibold text-emerald-400">{matchResult.length}</span>
                {' inventory matches found.'}
              </p>
            </div>

            {/* Matched items */}
            {matchResult.map((m, i) => (
              <div key={i} className="flex items-start gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2.5">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-200 truncate">{m.inventory_item.name}</p>
                  <p className="text-xs text-slate-500">{m.match_reason}</p>
                </div>
                <span className="text-xs text-slate-500 font-mono shrink-0">{Math.round(m.match_score * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Inventory loaded but no match run yet */}
        {hasInventory && !matchResult && !matching && projectId && shoppingItems.length > 0 && (
          <button
            onClick={async () => {
              setMatching(true);
              const match = await matchInventory(projectId);
              if (match) setMatchResult(match);
              setMatching(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cadsurface-800 border border-cadsurface-700 hover:border-cadblue-600/50 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw size={12} /> Match Inventory to Shopping List
          </button>
        )}
      </div>
    </Section>
  );
}

// ── Main ManufacturingPanel ───────────────────────────────────────────────────

export default function ManufacturingPanel({ projectId }: { projectId?: string }) {
  return (
    <div className="h-full flex flex-col bg-cadsurface-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-600 flex items-center justify-center">
            <Wrench size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Manufacturing</span>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        <MachinesSection />
        <CostEstimateSection projectId={projectId} />
        <ShoppingListSection projectId={projectId} />
        <InventorySection projectId={projectId} />
      </div>
    </div>
  );
}
