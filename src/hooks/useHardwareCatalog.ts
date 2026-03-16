import { useState, useEffect } from 'react';
import { fetchHardwareCatalog, IS_DEMO } from '../lib/api';
import type { HardwareCatalogItem } from '../types';

// Demo fallback catalog (250+ items represented by key entries per supplier/category)
const DEMO_CATALOG: HardwareCatalogItem[] = [
  // ── Carr Lane Bushings ──────────────────────────────────────────────────────
  { id: 'cl-01', part_number: 'CL-4-CBH', name: 'Fixed Renewable Bushing ⌀4mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 8, id_mm: 4, length_mm: 16, material: 'H13 Tool Steel' }, price_usd: 4.85, in_stock: true, preferred: true },
  { id: 'cl-02', part_number: 'CL-6-CBH', name: 'Fixed Renewable Bushing ⌀6mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 10, id_mm: 6, length_mm: 20, material: 'H13 Tool Steel' }, price_usd: 5.20, in_stock: true, preferred: false },
  { id: 'cl-03', part_number: 'CL-8-CBH', name: 'Fixed Renewable Bushing ⌀8mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 14, id_mm: 8, length_mm: 22, material: 'H13 Tool Steel' }, price_usd: 6.15, in_stock: true, preferred: true },
  { id: 'cl-04', part_number: 'CL-10-CBH', name: 'Fixed Renewable Bushing ⌀10mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 16, id_mm: 10, length_mm: 25, material: 'H13 Tool Steel' }, price_usd: 7.40, in_stock: true, preferred: false },
  { id: 'cl-05', part_number: 'CL-12-CBH', name: 'Fixed Renewable Bushing ⌀12mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 20, id_mm: 12, length_mm: 28, material: 'H13 Tool Steel' }, price_usd: 8.90, in_stock: true, preferred: true },
  { id: 'cl-06', part_number: 'CL-16-CBH', name: 'Fixed Renewable Bushing ⌀16mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 26, id_mm: 16, length_mm: 32, material: 'H13 Tool Steel' }, price_usd: 11.25, in_stock: false, preferred: false },
  { id: 'cl-07', part_number: 'CL-20-CBH', name: 'Fixed Renewable Bushing ⌀20mm', category: 'bushing', supplier: 'Carr Lane', specs_json: { od_mm: 32, id_mm: 20, length_mm: 36, material: 'H13 Tool Steel' }, price_usd: 14.80, in_stock: true, preferred: false },
  // ── Carr Lane Clamps ────────────────────────────────────────────────────────
  { id: 'cl-10', part_number: 'CL-150-STC', name: 'Strap Clamp 150mm', category: 'clamp', supplier: 'Carr Lane', specs_json: { reach_mm: 150, force_n: 4500, bolt_size: 'M12' }, price_usd: 18.50, in_stock: true, preferred: true },
  { id: 'cl-11', part_number: 'CL-100-STC', name: 'Strap Clamp 100mm', category: 'clamp', supplier: 'Carr Lane', specs_json: { reach_mm: 100, force_n: 3200, bolt_size: 'M10' }, price_usd: 14.20, in_stock: true, preferred: false },
  { id: 'cl-12', part_number: 'CL-200-STC', name: 'Strap Clamp 200mm', category: 'clamp', supplier: 'Carr Lane', specs_json: { reach_mm: 200, force_n: 6000, bolt_size: 'M16' }, price_usd: 26.80, in_stock: true, preferred: false },
  { id: 'cl-13', part_number: 'CL-TCC-1', name: 'Toe Clamp Set (4 pc)', category: 'clamp', supplier: 'Carr Lane', specs_json: { force_n: 2800, slot_width_mm: 14, height_mm: 25 }, price_usd: 42.00, in_stock: true, preferred: true },
  // ── Destaco Toggle Clamps ───────────────────────────────────────────────────
  { id: 'dc-01', part_number: '225-U', name: 'Vertical Hold-Down Toggle Clamp 225N', category: 'clamp', supplier: 'Destaco', specs_json: { holding_force_n: 2250, spindle_travel_mm: 22, base_w_mm: 60 }, price_usd: 28.90, in_stock: true, preferred: true },
  { id: 'dc-02', part_number: '237-U', name: 'Vertical Hold-Down Toggle Clamp 500N', category: 'clamp', supplier: 'Destaco', specs_json: { holding_force_n: 5000, spindle_travel_mm: 28, base_w_mm: 76 }, price_usd: 38.50, in_stock: true, preferred: false },
  { id: 'dc-03', part_number: '5-202', name: 'Swing Clamp 200N', category: 'clamp', supplier: 'Destaco', specs_json: { holding_force_n: 2000, swing_angle_deg: 90, bore_mm: 16 }, price_usd: 45.00, in_stock: true, preferred: true },
  { id: 'dc-04', part_number: '827', name: 'Horizontal Handle Toggle Clamp 900N', category: 'clamp', supplier: 'Destaco', specs_json: { holding_force_n: 9000, bar_height_mm: 50, base_w_mm: 95 }, price_usd: 52.75, in_stock: false, preferred: false },
  { id: 'dc-05', part_number: '8M-200', name: 'Pneumatic Toggle Clamp 2kN', category: 'clamp', supplier: 'Destaco', specs_json: { holding_force_n: 20000, cylinder_bore_mm: 50, stroke_mm: 25, pressure_bar: 6 }, price_usd: 185.00, in_stock: true, preferred: false },
  // ── Jergens Locating ─────────────────────────────────────────────────────────
  { id: 'jr-01', part_number: 'JER-DP-10', name: 'Diamond Locating Pin ⌀10mm', category: 'locator', supplier: 'Jergens', specs_json: { body_dia_mm: 10, relief_dia_mm: 8, length_mm: 45, material: 'D2 Tool Steel' }, price_usd: 22.40, in_stock: true, preferred: true },
  { id: 'jr-02', part_number: 'JER-DP-12', name: 'Diamond Locating Pin ⌀12mm', category: 'locator', supplier: 'Jergens', specs_json: { body_dia_mm: 12, relief_dia_mm: 10, length_mm: 50, material: 'D2 Tool Steel' }, price_usd: 26.80, in_stock: true, preferred: false },
  { id: 'jr-03', part_number: 'JER-RP-10', name: 'Round Locating Pin ⌀10mm', category: 'locator', supplier: 'Jergens', specs_json: { dia_mm: 10, length_mm: 45, material: 'D2 Tool Steel', tolerance: 'h6' }, price_usd: 19.50, in_stock: true, preferred: true },
  { id: 'jr-04', part_number: 'JER-RP-12', name: 'Round Locating Pin ⌀12mm', category: 'locator', supplier: 'Jergens', specs_json: { dia_mm: 12, length_mm: 50, material: 'D2 Tool Steel', tolerance: 'h6' }, price_usd: 23.10, in_stock: true, preferred: false },
  { id: 'jr-05', part_number: 'JER-RP-16', name: 'Round Locating Pin ⌀16mm', category: 'locator', supplier: 'Jergens', specs_json: { dia_mm: 16, length_mm: 60, material: 'D2 Tool Steel', tolerance: 'h6' }, price_usd: 31.50, in_stock: false, preferred: false },
  // ── Misumi Rest Buttons ──────────────────────────────────────────────────────
  { id: 'ms-01', part_number: 'SMABT25', name: 'Rest Button ⌀25mm Flat Head', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 25, height_mm: 15, load_kn: 12, material: 'SUJ2 Bearing Steel' }, price_usd: 9.80, in_stock: true, preferred: true },
  { id: 'ms-02', part_number: 'SMABT20', name: 'Rest Button ⌀20mm Flat Head', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 20, height_mm: 12, load_kn: 8, material: 'SUJ2 Bearing Steel' }, price_usd: 7.50, in_stock: true, preferred: false },
  { id: 'ms-03', part_number: 'SMABT32', name: 'Rest Button ⌀32mm Flat Head', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 32, height_mm: 18, load_kn: 20, material: 'SUJ2 Bearing Steel' }, price_usd: 12.30, in_stock: true, preferred: false },
  { id: 'ms-04', part_number: 'PCBG25', name: 'Counterbored Rest Pad ⌀25mm', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 25, pad_height_mm: 7.5, bore_dia_mm: 8, material: 'S45C Carbon Steel' }, price_usd: 11.20, in_stock: true, preferred: true },
  { id: 'ms-05', part_number: 'PCBG32', name: 'Counterbored Rest Pad ⌀32mm', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 32, pad_height_mm: 10, bore_dia_mm: 10, material: 'S45C Carbon Steel' }, price_usd: 14.60, in_stock: true, preferred: false },
  { id: 'ms-06', part_number: 'SMABT25-V', name: 'Rest Button ⌀25mm V-Notch', category: 'support', supplier: 'Misumi', specs_json: { dia_mm: 25, height_mm: 15, v_angle_deg: 90, load_kn: 10, material: 'SUJ2 Bearing Steel' }, price_usd: 11.40, in_stock: true, preferred: false },
  // ── Misumi Suction Cups ──────────────────────────────────────────────────────
  { id: 'ms-10', part_number: 'ZPT-40-BS', name: 'Suction Cup ⌀40mm Bellows', category: 'suction', supplier: 'Misumi', specs_json: { dia_mm: 40, type: 'bellows', max_load_n: 120, thread: 'M5' }, price_usd: 6.40, in_stock: true, preferred: true },
  { id: 'ms-11', part_number: 'ZPT-25-BS', name: 'Suction Cup ⌀25mm Bellows', category: 'suction', supplier: 'Misumi', specs_json: { dia_mm: 25, type: 'bellows', max_load_n: 55, thread: 'M5' }, price_usd: 4.80, in_stock: true, preferred: false },
  { id: 'ms-12', part_number: 'ZPT-60-BS', name: 'Suction Cup ⌀60mm Bellows', category: 'suction', supplier: 'Misumi', specs_json: { dia_mm: 60, type: 'bellows', max_load_n: 280, thread: 'M8' }, price_usd: 9.20, in_stock: true, preferred: false },
  { id: 'ms-13', part_number: 'ZPT-40-FLT', name: 'Suction Cup ⌀40mm Flat', category: 'suction', supplier: 'Misumi', specs_json: { dia_mm: 40, type: 'flat', max_load_n: 100, thread: 'M5' }, price_usd: 4.20, in_stock: true, preferred: true },
  // ── Holo-Krome Fasteners ────────────────────────────────────────────────────
  { id: 'hk-01', part_number: 'HK-M8-25-A2', name: 'SHCS M8×25 A2 Stainless', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M8', length_mm: 25, grade: 'A2-70', drive: 'hex socket' }, price_usd: 0.85, in_stock: true, preferred: false },
  { id: 'hk-02', part_number: 'HK-M10-30-12', name: 'SHCS M10×30 Grade 12.9', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M10', length_mm: 30, grade: '12.9', drive: 'hex socket' }, price_usd: 1.20, in_stock: true, preferred: true },
  { id: 'hk-03', part_number: 'HK-M12-40-12', name: 'SHCS M12×40 Grade 12.9', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M12', length_mm: 40, grade: '12.9', drive: 'hex socket' }, price_usd: 1.85, in_stock: true, preferred: true },
  { id: 'hk-04', part_number: 'HK-M16-50-12', name: 'SHCS M16×50 Grade 12.9', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M16', length_mm: 50, grade: '12.9', drive: 'hex socket' }, price_usd: 3.40, in_stock: true, preferred: false },
  { id: 'hk-05', part_number: 'HK-M8-TB-12', name: 'T-Bolt M8 Grade 12.9', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M8', slot_width_mm: 14, grade: '12.9' }, price_usd: 2.90, in_stock: true, preferred: true },
  { id: 'hk-06', part_number: 'HK-M12-TB-12', name: 'T-Bolt M12 Grade 12.9', category: 'fastener', supplier: 'Holo-Krome', specs_json: { thread: 'M12', slot_width_mm: 18, grade: '12.9' }, price_usd: 5.60, in_stock: true, preferred: false },
  // ── ISO Flanges (robot end effector) ────────────────────────────────────────
  { id: 'fl-01', part_number: 'ISO-9409-50', name: 'ISO 9409-1 Flange ⌀50mm (D=50)', category: 'flange', supplier: 'Misumi', specs_json: { flange_dia_mm: 50, bolt_circle_mm: 40, bolts: '4×M6', centering_pin_mm: 6, standard: 'ISO 9409-1' }, price_usd: 68.00, in_stock: true, preferred: true },
  { id: 'fl-02', part_number: 'ISO-9409-63', name: 'ISO 9409-1 Flange ⌀63mm (D=63)', category: 'flange', supplier: 'Misumi', specs_json: { flange_dia_mm: 63, bolt_circle_mm: 50, bolts: '4×M8', centering_pin_mm: 8, standard: 'ISO 9409-1' }, price_usd: 92.00, in_stock: true, preferred: false },
  { id: 'fl-03', part_number: 'ISO-9409-100', name: 'ISO 9409-1 Flange ⌀100mm (D=100)', category: 'flange', supplier: 'Misumi', specs_json: { flange_dia_mm: 100, bolt_circle_mm: 80, bolts: '4×M10', centering_pin_mm: 12, standard: 'ISO 9409-1' }, price_usd: 145.00, in_stock: false, preferred: false },
  // ── Additional pins ──────────────────────────────────────────────────────────
  { id: 'jp-01', part_number: 'JER-CP-M8', name: 'Chamfered Locating Pin M8 thread', category: 'pin', supplier: 'Jergens', specs_json: { dia_mm: 8, thread: 'M8', length_mm: 38, chamfer_deg: 15, material: 'D2 Tool Steel' }, price_usd: 16.80, in_stock: true, preferred: false },
  { id: 'jp-02', part_number: 'JER-CP-M10', name: 'Chamfered Locating Pin M10 thread', category: 'pin', supplier: 'Jergens', specs_json: { dia_mm: 10, thread: 'M10', length_mm: 45, chamfer_deg: 15, material: 'D2 Tool Steel' }, price_usd: 21.50, in_stock: true, preferred: true },
  { id: 'jp-03', part_number: 'JER-CP-M12', name: 'Chamfered Locating Pin M12 thread', category: 'pin', supplier: 'Jergens', specs_json: { dia_mm: 12, thread: 'M12', length_mm: 52, chamfer_deg: 15, material: 'D2 Tool Steel' }, price_usd: 25.90, in_stock: true, preferred: false },
];

interface HardwareCatalogResult {
  items: HardwareCatalogItem[];
  loading: boolean;
  error: string | null;
}

interface Query {
  q?: string;
  category?: string;
  supplier?: string;
}

export function useHardwareCatalog(query: Query = {}): HardwareCatalogResult {
  const [items, setItems] = useState<HardwareCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_DEMO) {
      // Filter demo catalog
      let filtered = DEMO_CATALOG;
      if (query.q) {
        const q = query.q.toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.part_number.toLowerCase().includes(q) ||
            i.supplier.toLowerCase().includes(q),
        );
      }
      if (query.category) {
        filtered = filtered.filter((i) => i.category === query.category);
      }
      if (query.supplier) {
        filtered = filtered.filter((i) => i.supplier === query.supplier);
      }
      setItems(filtered);
      return;
    }

    setLoading(true);
    fetchHardwareCatalog(query)
      .then((data) => { if (data) setItems(data); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [query.q, query.category, query.supplier]);

  return { items, loading, error };
}

export { DEMO_CATALOG };
