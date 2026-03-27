import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Wrench,
  Zap,
  Cpu,
  Target,
  Layers,
  Package,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  Box,
  Bot,
  Printer,
  Table2,
  Crosshair,
  MapPin,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

interface Template {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  description: string;
  features: string[];
  standards: string[];
  suggestedMaterial: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'drill-jig',
    label: 'Drill Jig',
    category: 'fixture',
    icon: <Wrench size={22} />,
    color: 'text-cadblue-400',
    border: 'border-cadblue-700/50',
    bg: 'bg-cadblue-950/40',
    description: 'Precision drill jig for fastener patterns. Pre-loaded with bushing seat geometry, 3-2-1 locating, and renewable bushing hardware.',
    features: ['Drill bushing seats', '3-2-1 locating scheme', 'Datum A/B/C setup', 'Toggle clamp slots', 'Drill relief cuts'],
    standards: ['ASME Y14.5-2018', 'AS9100 Rev D'],
    suggestedMaterial: 'Al 6061-T6 / Cast Tooling Plate',
  },
  {
    id: 'weld-fixture',
    label: 'Weld Fixture',
    category: 'fixture',
    icon: <Zap size={22} />,
    color: 'text-amber-400',
    border: 'border-amber-700/50',
    bg: 'bg-amber-950/40',
    description: 'MIG/TIG welding fixture for subassembly alignment. V-block and pin locators, strap clamps, heat-resistant support pads.',
    features: ['V-block locators', 'Pin locating holes', 'Strap clamp T-slots', 'Copper heat pads', 'Clamp force calc'],
    standards: ['ASME Y14.5-2018', 'IATF 16949'],
    suggestedMaterial: 'Mild Steel / Al 5052',
  },
  {
    id: 'vacuum-eoat',
    label: 'Vacuum Gripper (EOAT)',
    category: 'end-effector',
    icon: <Cpu size={22} />,
    color: 'text-purple-400',
    border: 'border-purple-700/50',
    bg: 'bg-purple-950/40',
    description: 'End-of-arm tool for robot pick-and-place. ISO 9409-1 flange, suction cup array, TCP definition, payload verification.',
    features: ['ISO 9409-1 robot flange', 'Suction cup positions', 'TCP offset definition', 'Payload / CoM check', 'Vacuum manifold sketch'],
    standards: ['ISO 9409-1', 'ISO 10218'],
    suggestedMaterial: 'Al 6061-T6',
  },
  {
    id: 'inspection-gauge',
    label: 'Go/No-Go Gauge',
    category: 'gauge',
    icon: <Target size={22} />,
    color: 'text-emerald-400',
    border: 'border-emerald-700/50',
    bg: 'bg-emerald-950/40',
    description: 'Plug or ring gauge for bore/shaft inspection. Go/No-Go limit dimensions auto-computed from H7/h6 tolerance bands.',
    features: ['Go dimension calc', 'No-Go dimension calc', 'Handle geometry', 'Hardness spec', 'GD&T callouts'],
    standards: ['ASME B47.1', 'ISO 1938'],
    suggestedMaterial: 'D2 Tool Steel / Carbide',
  },
  {
    id: 'assembly-fixture',
    label: 'Assembly Fixture',
    category: 'fixture',
    icon: <Layers size={22} />,
    color: 'text-teal-400',
    border: 'border-teal-700/50',
    bg: 'bg-teal-950/40',
    description: 'Subassembly fixture for aligning parts before fastening. Kinematic locating, adjustable supports, modular T-slot base.',
    features: ['T-slot base plate', 'Adjustable supports', 'Kinematic locators', 'Quick-change clamps', 'Reference datums'],
    standards: ['ASME Y14.5-2018', 'ISO 2768'],
    suggestedMaterial: 'Cast Tooling Plate',
  },
  {
    id: 'check-fixture',
    label: 'Check Fixture',
    category: 'gauge',
    icon: <Target size={22} />,
    color: 'text-cyan-400',
    border: 'border-cyan-700/50',
    bg: 'bg-cyan-950/40',
    description: 'CMM-style attribute check fixture. Functional gauging of formed/welded assemblies. CMM inspection plan generation.',
    features: ['Locating nest', 'Probe clearance zones', 'CMM inspection plan', 'Critical dims table', 'FAI checklist'],
    standards: ['ASME Y14.5-2018', 'VDA 5'],
    suggestedMaterial: 'Al 7075-T6',
  },
  {
    id: 'gripper-jaw',
    label: 'Gripper Jaw',
    category: 'end-effector',
    icon: <Package size={22} />,
    color: 'text-orange-400',
    border: 'border-orange-700/50',
    bg: 'bg-orange-950/40',
    description: 'Custom jaw for pneumatic or servo gripper. Part-specific profile, friction pads, fingertip force distribution.',
    features: ['Gripper adapter pattern', 'Part contact profile', 'Urethane pad recesses', 'Force distribution', 'Jaw clearance check'],
    standards: ['ISO 9409-1', 'SCHUNK spec'],
    suggestedMaterial: 'Al 6061-T6 / POM Delrin',
  },
  {
    id: 'locating-nest',
    label: 'Locating Nest',
    category: 'fixture',
    icon: <Box size={22} />,
    color: 'text-pink-400',
    border: 'border-pink-700/50',
    bg: 'bg-pink-950/40',
    description: 'Precision kinematic nest for part positioning. Three tooling ball seats, magnetic clamping, repeatability ±0.01mm.',
    features: ['Tooling ball seats ×3', 'Kinematic coupling', 'Magnetic clamping', 'Repeatability spec', 'CMM calibration holes'],
    standards: ['ISO 230-2', 'ASME B5.54'],
    suggestedMaterial: 'Invar 36 / Al 7075',
  },
];

const SURFACE_OPTIONS = [
  { id: 'siegmund', label: 'Welding Table', sub: 'Siegmund 28mm grid', icon: <Table2 size={16} />, color: 'text-amber-400', bg: 'bg-amber-950/30', border: 'border-amber-700/50' },
  { id: 'tslot',    label: 'T-Slot Table',  sub: '25mm T-slot grid',   icon: <Table2 size={16} />, color: 'text-slate-300', bg: 'bg-cadsurface-800', border: 'border-cadsurface-600' },
  { id: 'robot',    label: 'Robot Cell',    sub: 'Floor plate / riser', icon: <Bot size={16} />,   color: 'text-purple-400', bg: 'bg-purple-950/30', border: 'border-purple-700/50' },
  { id: 'cmm',      label: 'CMM Table',     sub: 'Granite surface',    icon: <Crosshair size={16} />, color: 'text-cadblue-400', bg: 'bg-cadblue-950/30', border: 'border-cadblue-700/50' },
  { id: 'vise',     label: 'Mill Vise',     sub: 'Kurt / Chick style', icon: <Wrench size={16} />, color: 'text-slate-300', bg: 'bg-cadsurface-800', border: 'border-cadsurface-600' },
  { id: 'custom',   label: 'Custom',        sub: 'Define manually',    icon: <RotateCcw size={16} />, color: 'text-slate-300', bg: 'bg-cadsurface-800', border: 'border-cadsurface-600' },
];

const MOUNTING_PATTERNS = [
  { id: 'siegmund-28', label: 'Siegmund 28mm', sub: 'Ø28mm / 28mm pitch' },
  { id: 'tslot-25',    label: 'T-slot 25mm',   sub: '25mm pitch grooves' },
  { id: 'ceroni-50',   label: 'Ceroni 50mm',   sub: 'Ø16mm / 50mm pitch' },
  { id: 'none',        label: 'No pattern',    sub: 'Freestanding' },
];

const ROBOT_MODELS = [
  'UR10 / UR10e', 'UR5 / UR5e', 'KUKA KR10 R1100', 'Fanuc M-10iA', 'ABB IRB 1200', 'Custom / Other',
];

const FACE_LABELS = ['TOP', 'BTM', 'FRT', 'BCK', 'LFT', 'RGT'];

const MACHINES = [
  { id: 'bambu-x1c', label: 'Bambu Lab X1C',    tag: 'Most common', color: 'text-emerald-400', border: 'border-emerald-700/50', bg: 'bg-emerald-950/30' },
  { id: 'bambu-p1s', label: 'Bambu Lab P1S',    tag: '',            color: 'text-slate-300',   border: 'border-cadsurface-600', bg: 'bg-cadsurface-800' },
  { id: 'prusa-mk4', label: 'Prusa MK4',        tag: '',            color: 'text-slate-300',   border: 'border-cadsurface-600', bg: 'bg-cadsurface-800' },
  { id: 'ultimaker', label: 'Ultimaker S5',     tag: '',            color: 'text-slate-300',   border: 'border-cadsurface-600', bg: 'bg-cadsurface-800' },
  { id: 'markforged',label: 'Markforged Mark Two', tag: 'Composite', color: 'text-slate-300',  border: 'border-cadsurface-600', bg: 'bg-cadsurface-800' },
  { id: 'custom',    label: 'Custom / Other',   tag: '',            color: 'text-slate-300',   border: 'border-cadsurface-600', bg: 'bg-cadsurface-800' },
];

const MATERIALS_FFF = ['PLA-CF', 'PETG', 'ABS', 'ASA', 'PA12-CF', 'TPU 95A'];
const NOZZLES = ['0.2mm', '0.4mm', '0.6mm', '0.8mm'];
const LAYER_HEIGHTS = ['0.10mm', '0.15mm', '0.20mm', '0.30mm'];
const ORIENTATIONS = [
  { id: 'auto',  label: 'Auto (AI recommended)', sub: 'Optimises strength + finish' },
  { id: 'horiz', label: 'Horizontal preferred',  sub: 'Best XY accuracy for fits' },
  { id: 'vert',  label: 'Vertical preferred',    sub: 'Better for tall features' },
];

type Step = 'pick' | 'configure' | 'environment' | 'printer';

const STEPS: { id: Step; label: string }[] = [
  { id: 'pick',        label: 'Template' },
  { id: 'configure',   label: 'Configure' },
  { id: 'environment', label: 'Environment' },
  { id: 'printer',     label: 'Printer' },
];

interface NewProjectModalProps {
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
  addProject?: (body: {
    name: string;
    partNumber?: string;
    revision?: string;
    templateId?: string;
    gdtStandard?: string;
    qualityStandard?: string;
    environment?: Record<string, unknown>;
    printerProfile?: Record<string, unknown>;
  }) => Promise<string | null>;
}

export default function NewProjectModal({ onClose, onProjectCreated, addProject }: NewProjectModalProps) {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [partNumber, setPartNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [step, setStep] = useState<Step>('pick');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Environment state (dummy)
  const [surface, setSurface] = useState('siegmund');
  const [mountPattern, setMountPattern] = useState('siegmund-28');
  const [robotEnabled, setRobotEnabled] = useState(false);
  const [robotModel, setRobotModel] = useState('UR10 / UR10e');
  const [faceUp, setFaceUp] = useState('TOP');

  // Printer state (dummy)
  const [process, setProcess] = useState<'fff' | 'sla' | 'metal'>('fff');
  const [machine, setMachine] = useState('bambu-x1c');
  const [material, setMaterial] = useState('PA12-CF');
  const [nozzle, setNozzle] = useState('0.4mm');
  const [layerHeight, setLayerHeight] = useState('0.20mm');
  const [orientation, setOrientation] = useState('auto');

  const handleSelectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    setStep('configure');
  };

  const handleCreate = async () => {
    if (!projectName.trim()) return;
    setIsCreating(true);

    const projectBody = {
      name: projectName,
      partNumber: partNumber || undefined,
      revision: 'A',
      templateId: selectedTemplate?.id,
      gdtStandard: selectedTemplate?.standards[0] ?? 'ASME Y14.5-2018',
      qualityStandard: selectedTemplate?.standards[1],
      environment: {
        surface_type: surface,
        mount_pattern: mountPattern,
        robot_enabled: robotEnabled,
        robot_model: robotEnabled ? robotModel : undefined,
        face_up: faceUp,
      },
      printerProfile: {
        process,
        machine,
        material,
        nozzle_diameter_mm: parseFloat(nozzle),
        layer_height_mm: parseFloat(layerHeight),
        orientation,
      },
    };

    let newId: string | null = null;
    if (addProject) {
      newId = await addProject(projectBody);
    }

    setIsCreating(false);

    if (newId && onProjectCreated) {
      onClose();
      onProjectCreated(newId);
    } else if (!addProject) {
      onClose();
      navigate('/workspace/new');
    } else {
      setCreateError('Failed to create project. Please check your connection and try again.');
    }
  };

  const goNext = () => {
    if (step === 'configure')   setStep('environment');
    if (step === 'environment') setStep('printer');
  };

  const goBack = () => {
    if (step === 'configure')   setStep('pick');
    if (step === 'environment') setStep('configure');
    if (step === 'printer')     setStep('environment');
  };

  // Dummy tolerance preview
  const nozzleMm = parseFloat(nozzle);
  const layerMm  = parseFloat(layerHeight);
  const xyOffset  = (nozzleMm * 0.5).toFixed(2);
  const zOffset   = (layerMm * 0.5).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-4xl mx-4 bg-cadsurface-900 border border-cadsurface-700 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cadsurface-700 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white">
              {step === 'pick'        && 'New Tooling Design'}
              {step === 'configure'   && `Configure: ${selectedTemplate?.label ?? 'Blank Design'}`}
              {step === 'environment' && 'Environment Context'}
              {step === 'printer'     && 'Printer Profile'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'pick'        && 'Choose a template — pre-loaded with geometry, hardware and GD&T'}
              {step === 'configure'   && 'Set part number, name and initial parameters'}
              {step === 'environment' && 'Where will this fixture be used? Define the physical context before generating.'}
              {step === 'printer'     && 'Select your printer and print parameters — drives tolerance compensation'}
            </p>
          </div>

          {/* Step indicator */}
          {step !== 'pick' && (
            <div className="flex items-center gap-1.5 mr-4">
              {STEPS.slice(1).map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                    s.id === step
                      ? 'bg-cadblue-600 text-white'
                      : STEPS.findIndex(x => x.id === step) > STEPS.findIndex(x => x.id === s.id)
                        ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
                        : 'text-slate-600'
                  }`}>
                    {STEPS.findIndex(x => x.id === step) > STEPS.findIndex(x => x.id === s.id) && (
                      <CheckCircle2 size={10} />
                    )}
                    {s.label}
                  </div>
                  {i < 2 && <ChevronRight size={12} className="text-slate-700" />}
                </div>
              ))}
            </div>
          )}

          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {/* ── STEP: PICK TEMPLATE ── */}
        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`group flex flex-col gap-3 p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5 ${t.border} ${t.bg} hover:shadow-lg`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-cadsurface-800 flex items-center justify-center ${t.color} transition-transform group-hover:scale-110`}>
                    {t.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{t.label}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{t.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {t.standards.map((s) => (
                      <span key={s} className="text-xs bg-cadsurface-800 border border-cadsurface-700 text-slate-500 px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                </button>
              ))}

              <button
                onClick={() => { setSelectedTemplate(null); setStep('configure'); }}
                className="flex flex-col gap-3 p-4 rounded-xl border border-dashed border-cadsurface-600 hover:border-cadblue-600/50 text-left transition-all hover:bg-cadsurface-800/50 group"
              >
                <div className="w-10 h-10 rounded-xl bg-cadsurface-800 flex items-center justify-center text-slate-600 group-hover:text-cadblue-400 transition-colors">
                  <X size={18} className="rotate-45" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-400 group-hover:text-slate-200">Start blank</p>
                  <p className="text-xs text-slate-600 mt-1">Empty workspace — describe your design from scratch with AI</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: CONFIGURE ── */}
        {step === 'configure' && (
          <div className="flex-1 overflow-y-auto">
            <div className={`flex ${selectedTemplate ? 'divide-x divide-cadsurface-700' : ''}`}>
              {/* Left: template summary (only when a template is selected) */}
              {selectedTemplate && (
              <div className={`w-64 shrink-0 p-5 ${selectedTemplate.bg}`}>
                <div className={`w-12 h-12 rounded-xl bg-cadsurface-800/60 flex items-center justify-center ${selectedTemplate.color} mb-3`}>
                  {selectedTemplate.icon}
                </div>
                <p className="text-sm font-bold text-white mb-1">{selectedTemplate.label}</p>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{selectedTemplate.description}</p>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pre-loaded features</p>
                <ul className="space-y-1">
                  {selectedTemplate.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-slate-400">
                      <CheckCircle2 size={11} className={selectedTemplate.color} />
                      {f}
                    </li>
                  ))}
                </ul>

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">Standards</p>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.standards.map((s) => (
                    <span key={s} className="text-xs bg-cadsurface-800/60 border border-cadsurface-700 text-slate-400 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
              )}

              {/* Right: config form */}
              <div className="flex-1 p-6">
                <div className="space-y-5 max-w-md">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Project Name</label>
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder={selectedTemplate ? `e.g. Wing Panel ${selectedTemplate.label}` : 'e.g. CNC Aluminum Bracket'}
                      className="w-full bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none placeholder-slate-600 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Part Number</label>
                    <input
                      value={partNumber}
                      onChange={(e) => setPartNumber(e.target.value)}
                      placeholder="e.g. TL-4471-A"
                      className="w-full bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none placeholder-slate-600 font-mono transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Material</label>
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={selectedTemplate?.suggestedMaterial ?? 'Al 6061-T6'}
                        className="flex-1 bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
                      />
                      <span className="text-xs text-slate-600">Suggested</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">GD&T Standard</label>
                    <div className="flex gap-2">
                      {['ASME Y14.5-2018', 'ISO 1101:2017'].map((s) => (
                        <button
                          key={s}
                          className={`flex-1 text-xs py-2 rounded-lg border transition-all ${
                            s === 'ASME Y14.5-2018'
                              ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                              : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Quality Standard</label>
                    <div className="flex gap-2">
                      {['AS9100 Rev D', 'IATF 16949', 'ISO 9001', 'None'].map((s) => (
                        <button
                          key={s}
                          className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${
                            s === 'AS9100 Rev D'
                              ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                              : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Initial Prompt (optional)</label>
                    <textarea
                      rows={3}
                      placeholder={`e.g. "Create a ${selectedTemplate ? selectedTemplate.label.toLowerCase() : 'fixture'} for 150×100mm aluminum panels with 4 bushing positions…"`}
                      className="w-full bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500/60 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none placeholder-slate-600 resize-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: ENVIRONMENT ── */}
        {step === 'environment' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-8">

              {/* Left col */}
              <div className="space-y-6">
                {/* Mounting surface */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Mounting Surface
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SURFACE_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSurface(s.id)}
                        className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-all ${
                          surface === s.id
                            ? `${s.border} ${s.bg} ${s.color}`
                            : 'border-cadsurface-700 bg-cadsurface-800/50 text-slate-500 hover:border-cadsurface-600 hover:text-slate-300'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">{s.icon}</span>
                        <div>
                          <p className="text-xs font-semibold">{s.label}</p>
                          <p className="text-xs opacity-60 mt-0.5">{s.sub}</p>
                        </div>
                        {surface === s.id && (
                          <CheckCircle2 size={12} className="ml-auto mt-0.5 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mounting pattern */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Mounting Hole Pattern
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {MOUNTING_PATTERNS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setMountPattern(p.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                          mountPattern === p.id
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span className="font-medium">{p.label}</span>
                        <span className="opacity-60">{p.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right col */}
              <div className="space-y-6">
                {/* Robot context */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Robot / Automation Context
                    </label>
                    <button
                      onClick={() => setRobotEnabled((p) => !p)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${robotEnabled ? 'bg-cadblue-600' : 'bg-cadsurface-700'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${robotEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {robotEnabled ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Robot Model</label>
                        <select
                          value={robotModel}
                          onChange={(e) => setRobotModel(e.target.value)}
                          className="w-full bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
                        >
                          {ROBOT_MODELS.map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Overhead clearance', value: '250mm' },
                          { label: 'Side clearance',     value: '80mm' },
                          { label: 'Reach envelope',     value: '1300mm' },
                          { label: 'Payload limit',      value: '10kg' },
                        ].map((field) => (
                          <div key={field.label} className="bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-3 py-2">
                            <p className="text-xs text-slate-500">{field.label}</p>
                            <p className="text-sm font-mono text-slate-200 mt-0.5">{field.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
                        <AlertCircle size={12} className="text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">AI will add robot clearance zones to the fixture geometry</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-16 flex items-center justify-center rounded-lg border border-dashed border-cadsurface-700 text-xs text-slate-600">
                      Enable to set robot arm constraints
                    </div>
                  )}
                </div>

                {/* Part orientation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Part Orientation (face up during use)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FACE_LABELS.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFaceUp(f)}
                        className={`py-2 rounded-lg border text-xs font-mono font-semibold transition-all ${
                          faceUp === f
                            ? 'bg-cadblue-600 border-cadblue-500 text-white'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-2">Affects gravity-direction in clamping force calculations</p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Additional Context (optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder='e.g. "Mounts to 1200×800mm Siegmund table, 600mm from robot base, need 50mm min clearance above top face for tooling access"'
                    className="w-full bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500/60 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none placeholder-slate-600 resize-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: PRINTER PROFILE ── */}
        {step === 'printer' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-8">

              {/* Left col */}
              <div className="space-y-6">
                {/* Process */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Print Process
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'fff',   label: 'FFF / FDM',   sub: 'Filament — most common' },
                      { id: 'sla',   label: 'SLA / Resin', sub: 'High detail' },
                      { id: 'metal', label: 'Metal SLS',   sub: 'DMLS / SLM' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setProcess(p.id as 'fff' | 'sla' | 'metal')}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-center text-xs transition-all ${
                          process === p.id
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Printer size={14} />
                        <span className="font-semibold">{p.label}</span>
                        <span className="opacity-60 text-xs">{p.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Machine */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Machine
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MACHINES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMachine(m.id)}
                        className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                          machine === m.id
                            ? `${m.border} ${m.bg} ${m.color}`
                            : 'border-cadsurface-700 bg-cadsurface-800 text-slate-500 hover:border-cadsurface-600 hover:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{m.label}</span>
                          {machine === m.id && <CheckCircle2 size={10} />}
                        </div>
                        {m.tag && <span className="text-xs opacity-70">{m.tag}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Material */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Filament Material
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MATERIALS_FFF.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMaterial(m)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          material === m
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right col */}
              <div className="space-y-6">
                {/* Nozzle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Nozzle Diameter
                  </label>
                  <div className="flex gap-2">
                    {NOZZLES.map((n) => (
                      <button
                        key={n}
                        onClick={() => setNozzle(n)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-mono font-semibold transition-all ${
                          nozzle === n
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer height */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Layer Height
                  </label>
                  <div className="flex gap-2">
                    {LAYER_HEIGHTS.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLayerHeight(l)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-mono font-semibold transition-all ${
                          layerHeight === l
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Print orientation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Print Orientation
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {ORIENTATIONS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setOrientation(o.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                          orientation === o.id
                            ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300'
                            : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span className="font-medium">{o.label}</span>
                        <span className="opacity-60">{o.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tolerance preview */}
                <div className="bg-cadsurface-800/80 border border-cadsurface-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={13} className="text-cadblue-400" />
                    <p className="text-xs font-semibold text-slate-300">Tolerance Compensation Preview</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: 'XY offset (critical fits)', value: `±${xyOffset}mm` },
                      { label: 'Z offset (layering)',       value: `±${zOffset}mm` },
                      { label: 'Overhang limit',            value: '45°' },
                      { label: 'Min wall thickness',        value: '1.2mm' },
                    ].map((row) => (
                      <div key={row.label} className="bg-cadsurface-900/60 rounded-lg px-2.5 py-2">
                        <p className="text-xs text-slate-600">{row.label}</p>
                        <p className="text-sm font-mono text-cadblue-300 mt-0.5">{row.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Applied to: bore seats, pin holes, bushing fits, clamp slots. Based on {nozzle} nozzle + {layerHeight} layer + {material}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-cadsurface-700 shrink-0 bg-cadsurface-900/60">
          {step !== 'pick' ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronRight size={13} className="rotate-180" />
              Back
            </button>
          ) : (
            <span className="text-xs text-slate-600">{TEMPLATES.length} templates available</span>
          )}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs btn-ghost px-3 py-2 rounded-lg border border-cadsurface-700">
              Cancel
            </button>

            {(step === 'configure' || step === 'environment') && (
              <button
                onClick={goNext}
                className="flex items-center gap-2 bg-cadblue-600 hover:bg-cadblue-700 text-white text-xs px-4 py-2 rounded-lg font-medium transition-all"
              >
                Next
                <ChevronRight size={13} />
              </button>
            )}

            {step === 'printer' && createError && (
              <span className="text-red-400 text-xs mr-2">{createError}</span>
            )}

            {step === 'printer' && (
              <button
                onClick={handleCreate}
                disabled={!projectName.trim() || isCreating}
                className="flex items-center gap-2 bg-cadblue-600 hover:bg-cadblue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-lg font-medium transition-all glow-blue"
              >
                {isCreating ? 'Creating…' : 'Create Design'}
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
