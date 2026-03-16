import { useState, useCallback } from 'react';
import { runValidation, IS_DEMO } from '../../lib/api';
import {
  ShieldAlert,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Printer,
  Wrench,
  Zap,
  Crosshair,
  FileCheck,
} from 'lucide-react';

type Method = 'fdm' | 'cnc' | 'laser' | 'functional' | 'standards';
type Severity = 'error' | 'warning' | 'info' | 'ok';

interface Issue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  location?: string;
  nodeRef?: string;
  fix?: string;
}

const ISSUES: Record<Method, Issue[]> = {
  fdm: [
    {
      id: 'fdm-e1',
      severity: 'error',
      title: 'Wall too thin — Clamp Slot ②',
      detail: 'Wall section at Clamp Slot ② measures 0.9mm. Minimum for PA12-CF at 0.4mm nozzle is 1.6mm (2× nozzle + margin). Will fail to print or produce a structurally weak section.',
      location: 'Clamp Slot ② — [105, 50, 15]',
      nodeRef: 'Clamp Slots ×2',
      fix: 'Increase wall to 1.8mm in node parameters',
    },
    {
      id: 'fdm-e2',
      severity: 'error',
      title: 'Clamp slots suppressed in model',
      detail: 'Clamp Slots ×2 node is suppressed. The fixture geometry will be exported without clamping features — incomplete for production use.',
      location: 'Clamp Slots ×2 node',
      nodeRef: 'Clamp Slots ×2',
      fix: 'Unsuppress node in Nodes view before export',
    },
    {
      id: 'fdm-w1',
      severity: 'warning',
      title: 'Bushing bore ④ tolerance not compensated',
      detail: 'Bushing seat ④ bore is modelled at nominal Ø10.0mm. With 0.4mm nozzle, FDM typically undersizes bores by 0.2–0.4mm. Pin will be too tight without tolerance offset.',
      location: 'Bushing Seat ④',
      nodeRef: 'Bushing Seats ×4',
      fix: 'Enable tolerance offset node (+0.20mm ID compensation)',
    },
    {
      id: 'fdm-w2',
      severity: 'warning',
      title: 'Elephant foot risk on Datum A face',
      detail: 'Datum A (Z=0 face) sits directly on print bed. First-layer squish expands the base perimeter by 0.1–0.2mm. This affects the flatness of the primary datum face.',
      location: 'Bottom face (Datum A)',
      nodeRef: 'Support Pads ×3',
      fix: 'Add 0.3mm elephant foot compensation, or print with brim + remove after',
    },
    {
      id: 'fdm-i1',
      severity: 'info',
      title: 'Estimated print time: 4 h 20 min',
      detail: '0.20mm layer height · Gyroid 25% infill · PA12-CF · Bambu X1C. Includes purge tower. Estimated weight: 187g.',
    },
    {
      id: 'fdm-i2',
      severity: 'info',
      title: 'PA12-CF requires pre-drying',
      detail: 'PA12 Nylon with carbon fibre fill must be dried at 80°C for 4–6h before printing to prevent moisture-related layer delamination. Store in sealed container with desiccant.',
    },
    {
      id: 'fdm-i3',
      severity: 'info',
      title: 'Add 0.5mm chamfer to external edges',
      detail: 'Sharp external edges on the top face produce stringing artifacts and stress risers. A 0.5mm chamfer improves print quality and part durability with no functional impact.',
      fix: 'Apply chamfer operation to Bushing Seats node outputs',
    },
  ],

  cnc: [
    {
      id: 'cnc-e1',
      severity: 'error',
      title: 'Internal corner radius too tight',
      detail: 'Locating pin recess has an internal corner radius of 0.5mm. Standard ⌀3/32" end mill minimum corner radius is 1.5mm. Feature is unmachineable on 3-axis CNC without EDM finish.',
      location: 'Locating pin recess — [0, 50, 7.5]',
      nodeRef: '3-2-1 Constraint Solver',
      fix: 'Increase corner radius to 2mm, or add "undercut relief" to spec EDM finishing',
    },
    {
      id: 'cnc-w1',
      severity: 'warning',
      title: 'Clamp slot width is non-standard',
      detail: 'Clamp slot is 14mm wide. Standard keyway cutters are 12mm or 16mm. A 14mm slot requires a special-order cutter or multiple passes, increasing machining cost and lead time.',
      location: 'Clamp Slots ×2',
      nodeRef: 'Clamp Slots ×2',
      fix: 'Change slot width to 12mm or 16mm to match standard tooling',
    },
    {
      id: 'cnc-ok1',
      severity: 'ok',
      title: 'Bushing counterbore depth-to-diameter: OK',
      detail: 'Counterbore depth 15mm / diameter 20mm = 0.75:1 ratio. Well within the 4:1 limit for standard boring bar access. No toolpath issues.',
      location: 'Bushing Seats ×4',
    },
    {
      id: 'cnc-ok2',
      severity: 'ok',
      title: 'All features accessible from top setup',
      detail: 'All holes, slots, and pockets are reachable from a single top-side 3-axis setup. No flip required. Estimated 2 setups total (top + datum face mill).',
    },
  ],

  laser: [
    {
      id: 'laser-e1',
      severity: 'error',
      title: '3D geometry — not laser-cuttable as-is',
      detail: 'Laser cutting is a 2D process. This part has 15mm extrusion depth, counterbores, and 3D chamfers. It cannot be produced by laser cutting in its current form.',
      fix: 'Simplify to a 2D flat plate profile if laser is required; use 3D printing or CNC for this design',
    },
    {
      id: 'laser-e2',
      severity: 'error',
      title: 'Multiple extrusion heights detected',
      detail: 'Bushing counterbores (depth 15mm) and clamp slots (depth 18mm) represent multiple Z-heights. Laser cutting cannot produce height variations.',
    },
    {
      id: 'laser-i1',
      severity: 'info',
      title: '2D plate profile is laser-cuttable',
      detail: 'If simplified to the outer profile + through-holes only (removing counterbores and slots), the base plate footprint 165×115mm is laser-cuttable from 15mm Al 6061-T6 plate. Post-process counterbores on CNC.',
      fix: 'Use hybrid process: laser cut outline + drill/bore critical features on CNC',
    },
  ],

  functional: [
    {
      id: 'func-ok1',
      severity: 'ok',
      title: '3-2-1 constraint complete — 6/6 DOF',
      detail: 'All 6 degrees of freedom are fully constrained. 3 support pads constrain Z-translation and X/Y rotation. 2 locating pins constrain X and Y translation. 1 clamp constrains Z rotation.',
    },
    {
      id: 'func-ok2',
      severity: 'ok',
      title: 'Clamping force adequate',
      detail: 'Combined clamping force: 810N (320N strap clamp + 490N toggle clamp). Required to resist machining forces on 150×100mm Al panel: ~200N. Safety factor: 4.05×.',
    },
    {
      id: 'func-w1',
      severity: 'warning',
      title: 'Datum A flatness spec requires ground surface',
      detail: 'GD&T callout requires ⏥ 0.05mm flatness on Datum A. As-printed PA12-CF surface roughness is Ra 4–8μm — flatness typically ±0.15mm. Spec cannot be met without post-print surface grinding or lapping.',
      location: 'Bottom face (Datum A)',
      fix: 'Add surface grinding note to manufacturing spec, or relax flatness to 0.15mm for printed fixtures',
    },
    {
      id: 'func-w2',
      severity: 'warning',
      title: 'Locating pin clearance not verified',
      detail: 'Nominal clearance between locating pin ⌀6mm and bushing bore ⌀6 H7 has not been confirmed against actual printer tolerance. Verify first article before full production run.',
      fix: 'Print test coupon with bushing bore + pin, verify fit before committing to full fixture',
    },
  ],

  standards: [
    {
      id: 'std-ok1',
      severity: 'ok',
      title: 'GD&T callouts valid — ASME Y14.5-2018',
      detail: 'All geometric tolerances checked: position ⊕ ⌀0.1(M)|A|B|C, flatness ⏥ 0.05|A, parallelism — valid symbol usage and datum reference frames per ASME Y14.5-2018.',
    },
    {
      id: 'std-w1',
      severity: 'warning',
      title: 'AS9100: Material cert not specified',
      detail: 'AS9100 Rev D requires documented material traceability. No material certification requirement is noted on the drawing for PA12-CF or Al 6061-T6 hardware. Add cert requirement to BOM.',
      fix: 'Add "Material cert required — Lot traceability to purchase order" note to drawing',
    },
    {
      id: 'std-w2',
      severity: 'warning',
      title: 'Drawing revision block undefined',
      detail: 'No revision history is defined. AS9100 requires formal document control. Drawing shows "Rev B" in the part info but no change log entry.',
      fix: 'Complete revision block in Drawing view before release',
    },
    {
      id: 'std-i1',
      severity: 'info',
      title: 'First Article Inspection (FAI) recommended',
      detail: 'For AS9100 production fixtures, an FAI per AS9102 is recommended on the first unit from each new print run. Key dimensions: bushing bore Ø, pin hole positions, datum face flatness.',
    },
  ],
};

const METHOD_META: Record<Method, {
  label: string;
  icon: React.ReactNode;
  errorCount: number;
  warnCount: number;
}> = {
  fdm:        { label: 'FDM',       icon: <Printer size={12} />,     errorCount: 2, warnCount: 2 },
  cnc:        { label: 'CNC',       icon: <Wrench size={12} />,      errorCount: 1, warnCount: 1 },
  laser:      { label: 'Laser',     icon: <Zap size={12} />,         errorCount: 2, warnCount: 0 },
  functional: { label: 'Functional',icon: <Crosshair size={12} />,   errorCount: 0, warnCount: 2 },
  standards:  { label: 'Standards', icon: <FileCheck size={12} />,   errorCount: 0, warnCount: 2 },
};

const SEVERITY_META = {
  error:   { icon: <XCircle size={13} />,     color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-700/40',     label: 'ERROR' },
  warning: { icon: <AlertTriangle size={13} />,color: 'text-amber-400',  bg: 'bg-amber-950/30',   border: 'border-amber-700/40',   label: 'WARNING' },
  info:    { icon: <Info size={13} />,         color: 'text-cadblue-400',bg: 'bg-cadblue-950/30', border: 'border-cadblue-700/30', label: 'INFO' },
  ok:      { icon: <CheckCircle2 size={13} />, color: 'text-emerald-400',bg: 'bg-emerald-950/20', border: 'border-emerald-700/30', label: 'OK' },
};

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(issue.severity === 'error');
  const meta = SEVERITY_META[issue.severity];

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${meta.border} ${meta.bg}`}>
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-snug ${meta.color}`}>{issue.title}</p>
          {issue.location && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{issue.location}</p>
          )}
        </div>
        <span className="text-slate-700 shrink-0 mt-0.5">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="h-px bg-cadsurface-700/60" />
          <p className="text-xs text-slate-400 leading-relaxed">{issue.detail}</p>

          {issue.nodeRef && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Node:</span>
              <span className="text-xs font-mono text-violet-400 bg-violet-950/30 border border-violet-700/30 px-1.5 py-0.5 rounded">
                {issue.nodeRef}
              </span>
            </div>
          )}

          {issue.fix && (
            <div className="flex items-start gap-1.5 bg-cadsurface-900/60 rounded-lg px-2.5 py-2">
              <ArrowRight size={11} className="text-cadblue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-cadblue-300 leading-relaxed">{issue.fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ValidationPanel({ projectId = 'demo' }: { projectId?: string }) {
  const [activeMethod, setActiveMethod] = useState<Method>('fdm');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const handleRerun = useCallback(async () => {
    setRunning(true);
    if (IS_DEMO) {
      await new Promise(r => setTimeout(r, 1200));
    } else {
      await runValidation(projectId, [activeMethod]);
    }
    setRunning(false);
    setLastRun(new Date().toLocaleTimeString());
  }, [projectId, activeMethod]);

  const issues = ISSUES[activeMethod];
  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos    = issues.filter((i) => i.severity === 'info');
  const oks      = issues.filter((i) => i.severity === 'ok');

  const totalErrors = Object.values(METHOD_META).reduce((a, m) => a + m.errorCount, 0);
  const totalWarns  = Object.values(METHOD_META).reduce((a, m) => a + m.warnCount, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-cadsurface-950">

      {/* Header */}
      <div className="px-4 py-3 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {totalErrors > 0
              ? <ShieldAlert size={14} className="text-red-400" />
              : <ShieldCheck size={14} className="text-emerald-400" />
            }
            <p className="text-xs font-bold text-slate-200">Validation</p>
          </div>
          <div className="flex items-center gap-1.5">
            {totalErrors > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-950/60 border border-red-700/50 text-red-400 font-mono">
                {totalErrors} err
              </span>
            )}
            {totalWarns > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-700/50 text-amber-400 font-mono">
                {totalWarns} warn
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Pre-flight checks per manufacturing method — resolve errors before sending to production.
        </p>
      </div>

      {/* Method tabs */}
      <div className="flex border-b border-cadsurface-700 shrink-0 overflow-x-auto">
        {(Object.entries(METHOD_META) as [Method, typeof METHOD_META[Method]][]).map(([id, meta]) => {
          const isActive = activeMethod === id;
          const hasError = meta.errorCount > 0;
          const hasWarn  = meta.warnCount > 0 && !hasError;
          return (
            <button
              key={id}
              onClick={() => setActiveMethod(id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                isActive
                  ? 'border-cadblue-500 text-slate-200 bg-cadsurface-900/40'
                  : 'border-transparent text-slate-600 hover:text-slate-400 hover:bg-cadsurface-800/40'
              }`}
            >
              <span className={isActive ? 'text-cadblue-400' : 'text-slate-600'}>{meta.icon}</span>
              {meta.label}
              {hasError && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {meta.errorCount}
                </span>
              )}
              {hasWarn && (
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-600 text-white font-bold" style={{ fontSize: '9px' }}>
                  {meta.warnCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

        {/* Errors */}
        {errors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <XCircle size={11} className="text-red-400" />
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Errors — {errors.length} (blocks export)
              </p>
            </div>
            <div className="space-y-2">
              {errors.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={11} className="text-amber-400" />
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Warnings — {warnings.length}
              </p>
            </div>
            <div className="space-y-2">
              {warnings.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}

        {/* OK checks */}
        {oks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={11} className="text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Passed — {oks.length}
              </p>
            </div>
            <div className="space-y-2">
              {oks.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}

        {/* Info */}
        {infos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Info size={11} className="text-cadblue-400" />
              <p className="text-xs font-semibold text-cadblue-400 uppercase tracking-wider">
                Info — {infos.length}
              </p>
            </div>
            <div className="space-y-2">
              {infos.map((i) => <IssueCard key={i.id} issue={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* Footer gate status */}
      <div className="border-t border-cadsurface-700 px-3 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={11} className="text-red-400" />
            <span className="text-xs text-red-400 font-medium">
              {running ? 'Running checks…' : '2 errors block export'}
            </span>
          </div>
          <button
            onClick={handleRerun}
            disabled={running}
            className="text-xs btn-ghost px-2.5 py-1.5 rounded-lg border border-cadsurface-700 text-slate-500 hover:text-slate-200 disabled:opacity-50 transition-colors"
          >
            {running ? 'Running…' : 'Re-run'}
          </button>
        </div>
        <p className="text-xs text-slate-700 mt-1">
          Gates: Geometry ✓ · DFM ✗ · Functional ⚠ · Standards ⚠
          {lastRun && ` · Last run ${lastRun}`}
        </p>
      </div>
    </div>
  );
}
