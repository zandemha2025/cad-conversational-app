import { useState, useCallback } from 'react';
import { getBomItems, saveBomItems } from '../../lib/storage';
import {
  Search, Star, Package, ChevronDown, Drill, Grip,
  Crosshair, Settings, Cpu, Circle, Plus, Loader2,
} from 'lucide-react';
import { useHardwareCatalog } from '../../hooks/useHardwareCatalog';
import { addHardwareToBom } from '../../lib/api';
import type { HardwareCatalogItem } from '../../types';

type FilterCategory = HardwareCatalogItem['category'] | 'all';

const CATEGORY_META: Record<FilterCategory, { label: string; icon: React.ReactNode; color: string }> = {
  all:      { label: 'All',       icon: <Package size={12} />,   color: 'text-slate-400' },
  bushing:  { label: 'Bushings',  icon: <Drill size={12} />,     color: 'text-cadblue-400' },
  clamp:    { label: 'Clamps',    icon: <Grip size={12} />,      color: 'text-amber-400' },
  locator:  { label: 'Locators',  icon: <Crosshair size={12} />, color: 'text-emerald-400' },
  pin:      { label: 'Pins',      icon: <Settings size={12} />,  color: 'text-purple-400' },
  support:  { label: 'Supports',  icon: <Circle size={12} />,    color: 'text-teal-400' },
  fastener: { label: 'Fasteners', icon: <Settings size={12} />,  color: 'text-slate-400' },
  flange:   { label: 'Flanges',   icon: <Cpu size={12} />,       color: 'text-pink-400' },
  suction:  { label: 'Suction',   icon: <Circle size={12} />,    color: 'text-orange-400' },
};

const CATEGORY_ORDER: FilterCategory[] = ['all', 'bushing', 'clamp', 'pin', 'locator', 'support', 'flange', 'suction'];

function HardwareCard({ item, onAdd }: { item: HardwareCatalogItem; onAdd: (item: HardwareCatalogItem) => void }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.all;
  const specEntries = Object.entries(item.specs_json ?? {}).slice(0, 3);

  return (
    <div className="group bg-cadsurface-800 border border-cadsurface-700 hover:border-cadblue-600/50 rounded-lg p-2.5 cursor-pointer transition-all hover:bg-cadsurface-750 relative">
      {item.preferred && (
        <div className="absolute top-1.5 right-1.5">
          <Star size={10} className="text-amber-400 fill-amber-400" />
        </div>
      )}

      <div className="flex items-start gap-2 mb-1.5">
        <div className={`w-6 h-6 rounded-md bg-cadsurface-700 flex items-center justify-center shrink-0 ${meta.color}`}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-200 leading-tight truncate pr-4">{item.name}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{item.part_number}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-1.5">
        {specEntries.map(([k, v]) => (
          <span key={k} className="text-xs bg-cadsurface-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            {String(v)}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{item.supplier}</span>
          {item.price_usd != null && (
            <span className="text-xs text-emerald-400 font-medium">${item.price_usd.toFixed(2)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${
            item.in_stock
              ? 'bg-emerald-900/30 border-emerald-800/40 text-emerald-500'
              : 'bg-red-900/30 border-red-800/40 text-red-500'
          }`}>
            {item.in_stock ? 'In Stock' : 'Lead time'}
          </span>
          <button
            onClick={() => onAdd(item)}
            className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded bg-cadblue-600 hover:bg-cadblue-700 flex items-center justify-center"
            title="Add to BOM"
          >
            <Plus size={11} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HardwarePanel({ projectId = 'demo' }: { projectId?: string }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>('bushing');
  const [bomCount, setBomCount] = useState(() => getBomItems(projectId).length);

  const { items, loading } = useHardwareCatalog({
    q: search || undefined,
    category: category !== 'all' ? category : undefined,
  });

  const handleAdd = useCallback(async (item: HardwareCatalogItem) => {
    try { await addHardwareToBom(projectId, item.id); } catch {}
    const existing = getBomItems(projectId) as string[];
    if (!existing.includes(item.id)) {
      const next = [...existing, item.id];
      saveBomItems(projectId, next);
      setBomCount(next.length);
    }
  }, [projectId]);

  // Group by category for "all" view
  const grouped = CATEGORY_ORDER.filter((c) => c !== 'all').reduce<Record<string, HardwareCatalogItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col bg-cadsurface-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-600 flex items-center justify-center">
            <Package size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Hardware Library</span>
          {loading && <Loader2 size={11} className="animate-spin text-slate-500" />}
        </div>
        <div className="flex items-center gap-2">
          {bomCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-600 text-white font-bold">{bomCount} BOM</span>
          )}
          <span className="text-xs text-slate-500">{items.length} items</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2.5 py-1.5 focus-within:border-cadblue-500/60 transition-colors">
          <Search size={12} className="text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, P/N, supplier…"
            className="bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600 flex-1 min-w-0"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="px-3 py-1.5 border-b border-cadsurface-700 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-1">
          {CATEGORY_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-1 text-xs whitespace-nowrap px-2 py-1 rounded-md border transition-all ${
                  category === cat
                    ? 'bg-cadblue-900/50 border-cadblue-700/60 text-cadblue-300'
                    : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                <span className={meta.color}>{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {category === 'all' ? (
          Object.entries(grouped).map(([cat, catItems]) => {
            const meta = CATEGORY_META[cat as FilterCategory];
            return (
              <div key={cat}>
                <button
                  onClick={() => setExpandedItem(expandedItem === cat ? null : cat)}
                  className="flex items-center gap-1.5 w-full mb-1.5 group"
                >
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{meta.label}</span>
                  <span className="text-xs text-slate-600 ml-1">{catItems.length}</span>
                  <ChevronDown
                    size={11}
                    className={`text-slate-600 ml-auto transition-transform ${expandedItem === cat ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedItem === cat && (
                  <div className="space-y-1.5">
                    {catItems.map((item) => (
                      <HardwareCard key={item.id} item={item} onAdd={handleAdd} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <HardwareCard key={item.id} item={item} onAdd={handleAdd} />
            ))}
            {items.length === 0 && !loading && (
              <div className="text-center py-8">
                <Package size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No items match your search</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-cadsurface-700 px-3 py-2 shrink-0">
        <p className="text-xs text-slate-600">
          <Star size={10} className="inline text-amber-400 mr-1" />
          Preferred items are project-approved. Click + to add to BOM.
        </p>
      </div>
    </div>
  );
}
