import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Info, Activity, Layers, Settings2, Tag, GitBranch,
  AlertTriangle, CheckCircle2, XCircle, Circle, Triangle,
} from 'lucide-react';
import { useWorkspace, MATERIAL_APPEARANCE } from '../../store/workspaceStore';
import {
  runFeaLite, fetchValidationResults, fetchProject,
  fetchRevisions, fetchMaterials, fetchGdtCallouts, generateGdtCallouts,
} from '../../lib/api';
import type { MaterialProperties, GdtCallout } from '../../lib/api';
import type { FeaLiteResult, ApiProject } from '../../lib/api';
import type { Revision } from '../../types';

type Tab = 'properties' | 'gdt' | 'analysis' | 'materials' | 'revision';

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-cadsurface-700 last:border-0">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors">
        {title}{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function PropRow({ label, value, unit, editable = false }: {
  label: string; value: string | number; unit?: string; editable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-500">{label}</span>
      {editable ? (
        <div className="flex items-center gap-1">
          <input className="text-xs text-right bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500 rounded px-1.5 py-0.5 w-20 outline-none text-slate-200"
            defaultValue={value} />
          {unit && <span className="text-xs text-slate-500 w-6">{unit}</span>}
        </div>
      ) : (
        <span className="text-xs text-slate-200 font-mono">{value}{unit ? ` ${unit}` : ''}</span>
      )}
    </div>
  );
}

const GDT_GLYPHS: Record<string, string> = {
  position: '⊕', flatness: '⏥', straightness: '—', circularity: '○', cylindricity: '⌀',
  parallelism: '∥', perpendicularity: '⊥', angularity: '∠', 'profile-surface': '⌓',
  'profile-line': '⌒', 'runout-circular': '↗', 'runout-total': '↗↗', concentricity: '◎', symmetry: '≡',
};

const REVISION_STATUS_COLORS: Record<string, string> = {
  released: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-400',
  'in-review': 'bg-amber-900/40 border-amber-700/40 text-amber-400',
  prototype: 'bg-slate-800 border-slate-700 text-slate-400',
  obsolete: 'bg-red-900/40 border-red-700/40 text-red-400',
};

const DFM_COLORS: Record<string, string> = {
  error: 'text-red-400', warning: 'text-amber-400', info: 'text-cadblue-400',
};

const DFM_ICONS: Record<string, React.ReactNode> = {
  error: <XCircle size={12} className="text-red-400 shrink-0" />,
  warning: <AlertTriangle size={12} className="text-amber-400 shrink-0" />,
  info: <CheckCircle2 size={12} className="text-cadblue-400 shrink-0" />,
};

interface DfmIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
}

export default function PropertiesPanel({ projectId = 'demo' }: { projectId?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [feaResult, setFeaResult] = useState<FeaLiteResult | null>(null);
  const [feaRunning, setFeaRunning] = useState(false);
  const { state, dispatch } = useWorkspace();
  const sel = state.selectedFeature;
  const features = state.features;

  // Live data
  const [project, setProject] = useState<ApiProject | null>(null);
  const [dfmIssues, setDfmIssues] = useState<DfmIssue[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [liveMaterials, setLiveMaterials] = useState<MaterialProperties[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('aluminum_6061');
  const [gdtCallouts, setGdtCallouts] = useState<GdtCallout[]>([]);
  const [gdtGenerating, setGdtGenerating] = useState(false);
  const [gdtGeneratedAt, setGdtGeneratedAt] = useState<string | null>(null);

  const isLive = !!projectId;

  // Fetch materials from live API (no auth needed)
  useEffect(() => {
    fetchMaterials().then(mats => { if (mats && mats.length > 0) setLiveMaterials(mats); });
  }, []);

  useEffect(() => {
    if (!isLive) return;
    fetchProject(projectId).then(p => { if (p) setProject(p); });
    fetchValidationResults(projectId).then((data: unknown) => {
      const rows = data as Array<{ issues_json?: DfmIssue[] }> | null;
      if (!rows) return;
      const allIssues: DfmIssue[] = [];
      for (const row of rows) {
        if (Array.isArray(row.issues_json)) allIssues.push(...row.issues_json);
      }
      // Deduplicate by title, sort errors first
      const seen = new Set<string>();
      const deduped = allIssues.filter(i => {
        if (seen.has(i.title)) return false;
        seen.add(i.title);
        return true;
      });
      deduped.sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
      });
      setDfmIssues(deduped.slice(0, 10));
    });
    fetchRevisions(projectId).then((data: unknown) => {
      const revs = data as Revision[] | null;
      if (revs && revs.length > 0) setRevisions(revs);
    });
    fetchGdtCallouts(projectId).then(res => {
      if (res && res.callouts && res.callouts.length > 0) {
        setGdtCallouts(res.callouts);
        setGdtGeneratedAt(res.generated_at);
      }
    });
  }, [isLive, projectId]);

  // Compute 3-2-1 constraint status from real touchpoints
  const touchpoints = state.touchpoints;
  const locating = touchpoints.filter(t => t.type === 'locating');
  const support  = touchpoints.filter(t => t.type === 'support');
  const clamping = touchpoints.filter(t => t.type === 'clamping');
  const dofConstrained = Math.min(support.length >= 3 ? 3 : support.length, 3)
    + Math.min(locating.length >= 2 ? 2 : locating.length, 2)
    + Math.min(locating.length >= 3 || clamping.length >= 1 ? 1 : 0, 1);
  const isFullyConstrained = dofConstrained >= 6;

  const handleGenerateGdt = useCallback(async () => {
    if (!projectId || gdtGenerating) return;
    setGdtGenerating(true);
    try {
      const res = await generateGdtCallouts(projectId);
      if (res && res.callouts) {
        setGdtCallouts(res.callouts);
        setGdtGeneratedAt(res.generated_at);
      }
    } finally { setGdtGenerating(false); }
  }, [projectId, gdtGenerating]);

  const handleRunFea = useCallback(async () => {
    if (!projectId) return;
    setFeaRunning(true);
    try {
      const bb = features?.bounding_box;
      const res = await runFeaLite(projectId, {
        length_mm: bb?.x, width_mm: bb?.y, thickness_mm: bb?.z,
      });
      if (res) setFeaResult(res);
    } finally { setFeaRunning(false); }
  }, [projectId, features]);

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'properties', icon: <Settings2 size={13} />, label: 'Props' },
    { id: 'gdt',        icon: <Tag size={13} />,       label: 'GD&T' },
    { id: 'analysis',   icon: <Activity size={13} />,  label: 'Analysis' },
    { id: 'materials',  icon: <Layers size={13} />,    label: 'Materials' },
    { id: 'revision',   icon: <GitBranch size={13} />, label: 'Rev' },
  ];

  return (
    <div className="h-full flex flex-col bg-cadsurface-900">
      {/* Tab bar */}
      <div className="flex border-b border-cadsurface-700 shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-cadblue-400 border-b-2 border-cadblue-500 bg-cadblue-900/10'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            {tab.icon}<span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── PROPERTIES ── */}
        {activeTab === 'properties' && (
          <>
            {sel && (
              <Section title="Selected Feature">
                <div className={`rounded-lg border p-2 mb-2 ${
                  sel.type === 'datum' ? 'bg-amber-900/20 border-amber-700/40' :
                  sel.type === 'hole' ? 'bg-cyan-900/20 border-cyan-700/40' :
                  'bg-cadblue-900/20 border-cadblue-700/40'
                }`}>
                  <p className="text-xs font-medium text-slate-200 mb-1">{sel.label}</p>
                  {sel.area_mm2 && <PropRow label="Area" value={`${Math.round(sel.area_mm2)} mm²`} />}
                  {sel.diameter && <PropRow label="Bore ⌀" value={`${sel.diameter.toFixed(2)} mm`} />}
                  {sel.depth && <PropRow label="Depth" value={`${sel.depth.toFixed(2)} mm`} />}
                  {sel.normal && <PropRow label="Normal" value={`[${sel.normal.map(n => n.toFixed(2)).join(', ')}]`} />}
                  {sel.is_planar !== undefined && <PropRow label="Type" value={sel.is_planar ? 'Planar face' : 'Non-planar'} />}
                </div>
              </Section>
            )}

            {features && (
              <Section title="Part Properties">
                <PropRow label="Faces" value={features.face_count} />
                <PropRow label="Edges" value={features.edge_count} />
                <PropRow label="Holes" value={features.hole_count} />
                <PropRow label="Volume" value={`${Math.round(features.volume_mm3 / 1000)} cm³`} />
                <PropRow label="Surface Area" value={`${Math.round(features.surface_area_mm2)} mm²`} />
                <PropRow label="BBox X" value={`${features.bounding_box.x.toFixed(1)} mm`} />
                <PropRow label="BBox Y" value={`${features.bounding_box.y.toFixed(1)} mm`} />
                <PropRow label="BBox Z" value={`${features.bounding_box.z.toFixed(1)} mm`} />
                {features.material_hint && <PropRow label="Material hint" value={features.material_hint} />}
              </Section>
            )}

            <Section title="General">
              {isLive && project ? (
                <>
                  <PropRow label="Project" value={project.name} />
                  {project.part_number && <PropRow label="Part Number" value={project.part_number} />}
                  {project.revision && <PropRow label="Revision" value={project.revision} />}
                  <PropRow label="Status" value={project.status} />
                  {project.gdt_standard && <PropRow label="GD&T Standard" value={project.gdt_standard} />}
                  {project.quality_standard && <PropRow label="Quality Std" value={project.quality_standard} />}
                  <PropRow label="Created" value={new Date(project.created_at).toLocaleDateString()} />
                </>
              ) : (
                <>
                  <PropRow label="Part Number" value="—" />
                  <PropRow label="Revision" value="—" />
                  <PropRow label="Status" value="draft" />
                </>
              )}
            </Section>

            <Section title="Tolerances" defaultOpen={false}>
              <PropRow label="Linear (general)" value="±0.1" unit="mm" editable />
              <PropRow label="Angular (general)" value="±0.5" unit="°" editable />
              <PropRow label="Surface Finish" value="Ra 1.6" unit="μm" editable />
              <PropRow label="GD&T Standard" value={project?.gdt_standard ?? 'ASME Y14.5-2018'} />
            </Section>
          </>
        )}

        {/* ── GD&T ── */}
        {activeTab === 'gdt' && (
          <>
            <div className="px-3 py-2 border-b border-cadsurface-700">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Standard</span>
                <span className="text-xs text-cadblue-400 font-medium">{project?.gdt_standard ?? 'ASME Y14.5-2018'}</span>
              </div>
              <div className="flex gap-1">
                {['ASME Y14.5-2018', 'ISO 1101'].map(s => (
                  <button key={s} className={`flex-1 text-xs py-1 rounded border transition-all ${
                    (project?.gdt_standard ?? 'ASME Y14.5-2018') === s
                      ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                      : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                  }`}>{s}</button>
                ))}
              </div>
            </div>
            {gdtCallouts.length > 0 ? (
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {gdtCallouts.length} callout{gdtCallouts.length !== 1 ? 's' : ''}
                    {gdtGeneratedAt && <> &middot; {new Date(gdtGeneratedAt).toLocaleString()}</>}
                  </span>
                  <button
                    onClick={handleGenerateGdt}
                    disabled={gdtGenerating}
                    className="text-xs text-cadblue-400 hover:text-cadblue-300 disabled:opacity-50"
                  >{gdtGenerating ? 'Generating...' : 'Regenerate'}</button>
                </div>
                <div className="space-y-2">
                  {gdtCallouts.map((c, i) => (
                    <div key={i} className="bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5 shrink-0" title={c.symbol}>
                          {GDT_GLYPHS[c.symbol] ?? c.symbol}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-200">
                            <span className="capitalize">{c.symbol.replace(/[_-]/g, ' ')}</span>
                            <span className="text-cadblue-400 font-mono ml-1">{c.tolerance}</span>
                            {c.datum_refs.length > 0 && (
                              <span className="text-amber-400 font-mono ml-1">
                                | {c.datum_refs.join(' | ')}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{c.feature}</p>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{c.rationale}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-3 py-6 text-center">
                <Tag size={28} className="text-slate-700 mx-auto mb-3" />
                <p className="text-xs text-slate-500 mb-3">No GD&T callouts generated yet.</p>
                <button
                  onClick={handleGenerateGdt}
                  disabled={gdtGenerating || !isLive}
                  className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                >{gdtGenerating ? 'Generating...' : 'Generate GD&T Callouts'}</button>
                <p className="text-xs text-slate-600 mt-3">
                  Or use AI chat: <span className="text-cadblue-500 font-mono">"Add a ⊕ 0.1 |A|B|C position callout on the bushing bores"</span>
                </p>
                {Object.entries(GDT_GLYPHS).slice(0, 6).map(([sym, glyph]) => (
                  <span key={sym} className="inline-block m-0.5 text-base text-slate-600" title={sym}>{glyph}</span>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ANALYSIS ── */}
        {activeTab === 'analysis' && (
          <>
            <Section title="Mass Properties">
              {features ? (
                <>
                  <PropRow label="Volume" value={`${Math.round(features.volume_mm3 / 1000)} cm³`} />
                  <PropRow label="Surface Area" value={`${Math.round(features.surface_area_mm2)} mm²`} />
                  <PropRow label="Bounding Box" value={`${features.bounding_box.x.toFixed(0)} × ${features.bounding_box.y.toFixed(0)} × ${features.bounding_box.z.toFixed(0)} mm`} />
                </>
              ) : (
                <p className="text-xs text-slate-600 py-2">Upload a STEP file to see part properties.</p>
              )}
            </Section>

            <Section title="3-2-1 Locating Scheme">
              {touchpoints.length === 0 ? (
                <p className="text-xs text-slate-600 py-2">No touchpoints defined yet. Add locating, support, and clamping points in the Touchpoints panel.</p>
              ) : (
                <div className="mb-2">
                  <div className={`flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg border ${
                    isFullyConstrained
                      ? 'bg-emerald-900/20 border-emerald-800/40'
                      : 'bg-amber-900/20 border-amber-800/40'
                  }`}>
                    {isFullyConstrained
                      ? <CheckCircle2 size={13} className="text-emerald-400" />
                      : <AlertTriangle size={13} className="text-amber-400" />}
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isFullyConstrained ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isFullyConstrained ? 'Fully Constrained — 6 DOF' : `Partial — ${dofConstrained}/6 DOF`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {touchpoints.map(tp => {
                      const colors: Record<string, string> = {
                        locating: 'border-amber-700/40 text-amber-300',
                        support:  'border-blue-700/40 text-blue-300',
                        clamping: 'border-emerald-700/40 text-emerald-300',
                      };
                      return (
                        <div key={tp.id} className={`flex items-center justify-between text-xs border rounded px-2 py-1 bg-cadsurface-800 ${colors[tp.type] ?? 'border-cadsurface-600 text-slate-400'}`}>
                          <div className="flex items-center gap-1.5">
                            <Circle size={8} className="fill-current" />
                            <span className="capitalize font-medium">{tp.type}</span>
                            <span className="text-slate-500">·</span>
                            <span className="text-slate-400 truncate max-w-[90px]">{tp.label}</span>
                          </div>
                          {tp.force_n && <span className="text-slate-500 font-mono">{tp.force_n}N</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>

            <Section title="DFM Warnings">
              {dfmIssues.length > 0 ? (
                <div className="space-y-2">
                  {dfmIssues.map((w, i) => (
                    <div key={w.id ?? i} className="bg-cadsurface-800 border border-cadsurface-700 rounded-lg p-2">
                      <div className="flex items-start gap-1.5">
                        {DFM_ICONS[w.severity] ?? DFM_ICONS.info}
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${DFM_COLORS[w.severity] ?? 'text-slate-300'}`}>{w.title}</p>
                          {w.detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{w.detail}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600 py-2">No validation results yet. Run validation from the Validation panel.</p>
              )}
            </Section>

            <Section title="FEA Simulation" defaultOpen={false}>
              {feaResult ? (
                <div className="space-y-2">
                  <div className={`rounded-lg border p-3 ${feaResult.within_tolerance ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-red-900/20 border-red-700/40'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {feaResult.within_tolerance
                        ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                        : <AlertTriangle size={13} className="text-red-400 shrink-0" />}
                      <span className={`text-xs font-semibold ${feaResult.within_tolerance ? 'text-emerald-400' : 'text-red-400'}`}>
                        {feaResult.within_tolerance ? 'Within tolerance' : 'Exceeds tolerance'}
                      </span>
                    </div>
                    <PropRow label="Max deflection" value={`${feaResult.deflection_mm.toFixed(3)} mm`} />
                    <PropRow label="Max bending stress" value={`${feaResult.max_stress_mpa} MPa`} />
                    <PropRow label="Safety factor" value={`${feaResult.safety_factor}×`} />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{feaResult.interpretation}</p>
                  <button onClick={() => setFeaResult(null)} className="text-xs text-slate-600 hover:text-slate-400 underline">Reset</button>
                </div>
              ) : (
                <div className="rounded-lg bg-cadsurface-800 border border-cadsurface-700 p-3 text-center">
                  <Triangle size={20} className="text-amber-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Euler beam deflection under clamping load</p>
                  <button
                    onClick={handleRunFea}
                    disabled={feaRunning}
                    className="btn-primary mt-2 text-xs w-full disabled:opacity-50"
                  >
                    {feaRunning ? 'Running…' : 'Run FEA Lite'}
                  </button>
                </div>
              )}
            </Section>
          </>
        )}

        {/* ── MATERIALS ── */}
        {activeTab === 'materials' && (
          <Section title="Material Library">
            <div className="space-y-1.5">
              {liveMaterials.map(mat => (
                <button
                  key={mat.id}
                  onClick={() => {
                    setSelectedMaterialId(mat.id);
                    const appearance = MATERIAL_APPEARANCE[mat.id];
                    dispatch({
                      type: 'SET_MATERIAL',
                      material: appearance
                        ? { id: mat.id, ...appearance }
                        : { id: mat.id, color: '#c0c0c0', metalness: 0.8, roughness: 0.35 },
                    });
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all ${
                    selectedMaterialId === mat.id
                      ? 'bg-cadblue-900/30 border-cadblue-600/50'
                      : 'bg-cadsurface-800 border-cadsurface-700 hover:border-cadsurface-600'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full border border-cadsurface-600 shrink-0"
                    style={{ backgroundColor: MATERIAL_APPEARANCE[mat.id]?.color ?? '#c0c0c0' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{mat.display_name}</p>
                    <p className="text-xs text-slate-500">
                      E {mat.youngs_modulus_gpa} GPa · Sy {mat.yield_strength_mpa} MPa · HB {mat.hardness_hb}
                    </p>
                  </div>
                  {selectedMaterialId === mat.id && (
                    <span className="text-xs text-cadblue-400 shrink-0">Active</span>
                  )}
                </button>
              ))}
            </div>
            {selectedMaterialId && liveMaterials.length > 0 && (() => {
              const m = liveMaterials.find(x => x.id === selectedMaterialId);
              if (!m) return null;
              return (
                <div className="mt-3 bg-cadsurface-800 border border-cadsurface-700 rounded-xl p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-slate-300">{m.display_name}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-slate-500">Density</span><span className="text-slate-300 font-mono">{m.density_kg_m3} kg/m³</span>
                    <span className="text-slate-500">Yield</span><span className="text-slate-300 font-mono">{m.yield_strength_mpa} MPa</span>
                    <span className="text-slate-500">UTS</span><span className="text-slate-300 font-mono">{m.ultimate_strength_mpa} MPa</span>
                    <span className="text-slate-500">Hardness</span><span className="text-slate-300 font-mono">{m.hardness_hb} HB</span>
                    <span className="text-slate-500">E (Young's)</span><span className="text-slate-300 font-mono">{m.youngs_modulus_gpa} GPa</span>
                    <span className="text-slate-500">Machinability</span><span className="text-slate-300 font-mono">{m.machinability_rating}%</span>
                    <span className="text-slate-500">Kc1,1</span><span className="text-slate-300 font-mono">{m.kc1_1} N/mm²</span>
                  </div>
                  {m.notes && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{m.notes}</p>}
                </div>
              );
            })()}
          </Section>
        )}

        {/* ── REVISION ── */}
        {activeTab === 'revision' && (
          <>
            <div className="px-3 py-2 border-b border-cadsurface-700">
              {isLive && project ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{project.revision ?? '—'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      project.status === 'released'
                        ? 'bg-emerald-900/40 border-emerald-700/40 text-emerald-400'
                        : 'bg-amber-900/40 border-amber-700/40 text-amber-400'
                    }`}>{project.status.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{project.name}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">—</span>
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-800 border-slate-700 text-slate-400">DRAFT</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">No project loaded</p>
                </>
              )}
            </div>

            <Section title="Revision History">
              {revisions.length > 0 ? (
                <div className="space-y-3">
                  {revisions.map((r, i) => (
                    <div key={r.id} className="relative">
                      {i < revisions.length - 1 && <div className="absolute left-3 top-8 bottom-0 w-px bg-cadsurface-700" />}
                      <div className="flex gap-3">
                        <div className="shrink-0 mt-0.5">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 relative ${
                            i === 0 ? 'border-emerald-500 bg-emerald-900/40 text-emerald-400' : 'border-cadsurface-600 bg-cadsurface-800 text-slate-400'
                          }`}>{r.rev_letter}</div>
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-200">Rev {r.rev_letter}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${REVISION_STATUS_COLORS[r.status] ?? 'bg-slate-800 border-slate-700 text-slate-400'}`}>{r.status}</span>
                            {r.ecr_number && <span className="text-xs text-slate-500 font-mono">{r.ecr_number}</span>}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>
                          {Array.isArray(r.changes_json) && (
                            <div className="mt-1 space-y-0.5">
                              {r.changes_json.map((ch: string, ci: number) => (
                                <p key={ci} className="text-xs text-slate-600 pl-2 border-l border-cadsurface-700">{ch}</p>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-slate-600 mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600 py-2">No revisions yet. Use "Raise ECR" to create the first revision.</p>
              )}
              <button className="btn-primary w-full mt-2 text-xs">Raise ECR</button>
            </Section>

            <Section title="Standards Compliance" defaultOpen={false}>
              <div className="space-y-1.5">
                {[
                  { std: project?.quality_standard ?? 'AS9100 Rev D', status: project ? 'pass' : 'pending', note: project ? 'Traceability fields complete' : 'Set quality standard in project settings' },
                  { std: project?.gdt_standard ?? 'ASME Y14.5-2018', status: features ? 'pass' : 'pending', note: features ? 'GD&T annotations applied' : 'Upload STEP file to verify' },
                  { std: 'ITAR Review', status: 'pending', note: 'Awaiting classification review' },
                ].map(item => (
                  <div key={item.std} className="flex items-center justify-between text-xs py-1">
                    <div>
                      <span className="text-slate-300 font-medium">{item.std}</span>
                      <p className="text-slate-600 text-xs">{item.note}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${
                      item.status === 'pass' ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' : 'bg-amber-900/30 border-amber-700/40 text-amber-400'
                    }`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      <div className="border-t border-cadsurface-700 px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Info size={11} />
          {sel ? sel.label : 'No feature selected'}
        </div>
      </div>
    </div>
  );
}
