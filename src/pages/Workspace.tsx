import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import FeatureTree from '../components/workspace/FeatureTree';
import Viewport3D from '../components/workspace/Viewport3D';
import ChatPanel from '../components/workspace/ChatPanel';
import PropertiesPanel from '../components/workspace/PropertiesPanel';
import HardwarePanel from '../components/workspace/HardwarePanel';
import TouchpointPanel from '../components/workspace/TouchpointPanel';
import ValidationPanel from '../components/workspace/ValidationPanel';
import DrawingView from '../components/workspace/DrawingView';
import NodeEditor from '../components/workspace/NodeEditor';
import ExportPanel from '../components/workspace/ExportPanel';
import ApprovalPanel from '../components/workspace/ApprovalPanel';
import InterferencePanel from '../components/workspace/InterferencePanel';
import ConstraintsPanel from '../components/workspace/ConstraintsPanel';
import ClampingForcePanel from '../components/workspace/ClampingForcePanel';
import WorkInstructionsPanel from '../components/workspace/WorkInstructionsPanel';
import QcChecklistPanel from '../components/workspace/QcChecklistPanel';
import ToleranceStackPanel from '../components/workspace/ToleranceStackPanel';
import AssemblyPanel from '../components/workspace/AssemblyPanel';
import TopBar from '../components/layout/TopBar';
import type { WorkspaceMode } from '../components/layout/TopBar';
import { WorkspaceProvider, useWorkspace } from '../store/workspaceStore';
import { useFixtureGeometry } from '../hooks/useFixtureGeometry';
import { useRealtimeProject } from '../hooks/useRealtimeProject';
import { fetchTouchpoints } from '../lib/api';
import type { ApiTouchpoint } from '../lib/api';
import {
  PanelLeftClose, PanelRightClose, MessageSquare, TreePine, Package,
  SplitSquareHorizontal, Target, ShieldAlert, Download, ClipboardCheck,
  Scan, Link2, Gauge, FileText, Microscope, Ruler, Layers,
} from 'lucide-react';

type LeftPanel =
  | 'chat'
  | 'tree'
  | 'hardware'
  | 'touchpoints'
  | 'validation'
  | 'export'
  | 'approvals'
  | 'interference'
  | 'constraints'
  | 'clamping'
  | 'work_instructions'
  | 'qc_checklist'
  | 'tolerance_stack'
  | 'assembly';

// ── Inner workspace with access to WorkspaceContext ───────────────────────────

function WorkspaceInner({ projectId }: { projectId: string | undefined }) {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('chat');
  const [showLeft, setShowLeft]   = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [mode, setMode]           = useState<WorkspaceMode>('part');
  const { state, dispatch }       = useWorkspace();

  // Load fixture geometry + part features
  const { gltfUrl, partFeatures } = useFixtureGeometry(projectId);

  // Sync gltfUrl into workspace context
  useEffect(() => {
    if (gltfUrl) dispatch({ type: 'SET_GLTF_URL', url: gltfUrl });
  }, [gltfUrl, dispatch]);

  // Sync part features into workspace context
  useEffect(() => {
    if (partFeatures) dispatch({ type: 'SET_FEATURES', features: partFeatures });
  }, [partFeatures, dispatch]);

  // Load initial touchpoints
  useEffect(() => {
    if (!projectId) return;
    fetchTouchpoints(projectId)
      .then((tps: unknown) => {
        if (Array.isArray(tps)) {
          dispatch({ type: 'SET_TOUCHPOINTS', touchpoints: tps as ApiTouchpoint[] });
        }
      })
      .catch(() => {});
  }, [projectId, dispatch]);

  // Supabase Realtime subscriptions
  useRealtimeProject(projectId, {
    onTouchpointChange: () => {
      if (projectId) {
        fetchTouchpoints(projectId).then((tps: unknown) => {
          if (Array.isArray(tps)) {
            dispatch({ type: 'SET_TOUCHPOINTS', touchpoints: tps as ApiTouchpoint[] });
          }
        }).catch(() => {});
      }
    },
    onFixtureGenerated: () => {
      dispatch({ type: 'SET_GEN_PROGRESS', payload: { status: 'done', message: 'New fixture ready', progress: 100 } });
    },
  });

  // ── Left panel definitions ──────────────────────────────────────────────────
  const leftButtons: {
    id: LeftPanel;
    icon: React.ReactNode;
    title: string;
    badge?: number;
    color?: string;
  }[] = [
    { id: 'chat',         icon: <MessageSquare size={15} />,   title: 'AI Chat' },
    { id: 'tree',         icon: <TreePine size={15} />,        title: 'Feature Tree' },
    { id: 'hardware',     icon: <Package size={15} />,         title: 'Hardware Library' },
    { id: 'touchpoints',  icon: <Target size={15} />,          title: 'Clamping & Locating' },
    { id: 'validation',   icon: <ShieldAlert size={15} />,     title: 'Validation', badge: 5 },
    { id: 'export',       icon: <Download size={15} />,        title: 'Export (STEP/IGES/STL/DXF)' },
    { id: 'approvals',    icon: <ClipboardCheck size={15} />,  title: 'Approval Workflow' },
    { id: 'interference',      icon: <Scan size={15} />,         title: 'Interference Check' },
    { id: 'constraints',       icon: <Link2 size={15} />,        title: 'Assembly Constraints' },
    { id: 'clamping',          icon: <Gauge size={15} />,        title: 'Clamping Force Calculator' },
    { id: 'work_instructions', icon: <FileText size={15} />,     title: 'Work Instructions' },
    { id: 'qc_checklist',      icon: <Microscope size={15} />,   title: 'QC Checklist' },
    { id: 'tolerance_stack',   icon: <Ruler size={15} />,        title: 'Tolerance Stack-Up' },
    { id: 'assembly',          icon: <Layers size={15} />,       title: 'Assembly BOM' },
  ];

  function getPanelColor(id: LeftPanel, active: boolean) {
    if (!active) {
      if (id === 'validation') return 'text-red-400 hover:bg-red-950/40';
      return 'text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300';
    }
    switch (id) {
      case 'hardware':     return 'bg-amber-600 text-white';
      case 'touchpoints':  return 'bg-emerald-700 text-white';
      case 'validation':   return 'bg-red-700 text-white';
      case 'export':       return 'bg-violet-600 text-white';
      case 'approvals':    return 'bg-sky-700 text-white';
      case 'interference':      return 'bg-orange-700 text-white';
      case 'constraints':       return 'bg-teal-700 text-white';
      case 'clamping':          return 'bg-pink-700 text-white';
      case 'work_instructions': return 'bg-cadblue-700 text-white';
      case 'qc_checklist':      return 'bg-emerald-700 text-white';
      case 'tolerance_stack':   return 'bg-violet-700 text-white';
      case 'assembly':          return 'bg-indigo-700 text-white';
      default:             return 'bg-cadblue-600 text-white';
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar mode={mode} onModeChange={setMode} projectId={projectId} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left icon rail — hidden on mobile */}
        {mode !== 'drawing' && mode !== 'nodes' && (
          <div className="hidden md:flex flex-col bg-cadsurface-900 border-r border-cadsurface-700 shrink-0">
            <div className="flex flex-col gap-1 p-1 pt-2">
              <button
                title="Toggle left panel"
                onClick={() => setShowLeft(p => !p)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                  showLeft
                    ? 'bg-cadsurface-700 text-slate-200'
                    : 'text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300'
                }`}
              >
                <PanelLeftClose size={15} />
              </button>
              <div className="h-px bg-cadsurface-700 my-1" />
              {leftButtons.map(btn => {
                const isActive = leftPanel === btn.id && showLeft;
                return (
                  <button
                    key={btn.id}
                    title={btn.title}
                    onClick={() => { setLeftPanel(btn.id); setShowLeft(true); }}
                    className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-all ${getPanelColor(btn.id, isActive)}`}
                  >
                    {btn.icon}
                    {btn.badge !== undefined && !isActive && (
                      <span
                        className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white font-bold"
                        style={{ fontSize: '8px' }}
                      >
                        {btn.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="h-px bg-cadsurface-700 my-1" />
              <button
                title="Split view"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300 transition-all"
              >
                <SplitSquareHorizontal size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        {mode === 'nodes' ? (
          <div className="flex-1 overflow-hidden">
            <NodeEditor projectId={projectId} />
          </div>
        ) : mode === 'drawing' ? (
          <div className="flex-1 overflow-hidden">
            <DrawingView projectId={projectId} />
          </div>
        ) : (
          <>
            {showLeft && (
              <div className="w-full md:w-72 shrink-0 border-r border-cadsurface-700 overflow-hidden flex flex-col md:flex">
                {leftPanel === 'chat'         && <ChatPanel projectId={projectId} />}
                {leftPanel === 'tree'         && <FeatureTree />}
                {leftPanel === 'hardware'     && <HardwarePanel projectId={projectId} />}
                {leftPanel === 'touchpoints'  && <TouchpointPanel projectId={projectId} />}
                {leftPanel === 'validation'   && <ValidationPanel projectId={projectId} />}
                {leftPanel === 'export'       && <ExportPanel projectId={projectId} />}
                {leftPanel === 'approvals'    && <ApprovalPanel projectId={projectId} />}
                {leftPanel === 'interference' && <InterferencePanel projectId={projectId} />}
                {leftPanel === 'constraints'  && <ConstraintsPanel projectId={projectId} />}
                {leftPanel === 'clamping'          && <ClampingForcePanel projectId={projectId} />}
                {leftPanel === 'work_instructions' && <WorkInstructionsPanel projectId={projectId} />}
                {leftPanel === 'qc_checklist'      && <QcChecklistPanel projectId={projectId} />}
                {leftPanel === 'tolerance_stack'   && <ToleranceStackPanel projectId={projectId} />}
                {leftPanel === 'assembly'          && <AssemblyPanel projectId={projectId} />}
              </div>
            )}

            <div className="flex-1 overflow-hidden relative">
              <Viewport3D
                touchpointMode={leftPanel === 'touchpoints' && showLeft}
                gltfUrl={state.gltfUrl}
                projectId={projectId}
              />
            </div>

            {showRight && (
              <div className="w-64 shrink-0 border-l border-cadsurface-700 overflow-hidden hidden md:flex flex-col">
                <PropertiesPanel projectId={projectId} />
              </div>
            )}

            <button
              title="Toggle right panel"
              onClick={() => setShowRight(p => !p)}
              className="z-20 w-6 h-10 hidden md:flex items-center justify-center rounded-l-lg border border-r-0 border-cadsurface-700 bg-cadsurface-900 hover:bg-cadsurface-800 text-slate-500 hover:text-slate-200 transition-all"
              style={{ position: 'fixed', right: showRight ? '16rem' : '0', top: '50%', transform: 'translateY(-50%)' }}
            >
              <PanelRightClose size={12} className={showRight ? '' : 'rotate-180'} />
            </button>
          </>
        )}
      </div>

      {/* Mobile bottom navigation — first 5 panels only */}
      <div className="flex md:hidden border-t border-cadsurface-700 bg-cadsurface-900 shrink-0">
        {leftButtons.slice(0, 5).map(btn => (
          <button
            key={btn.id}
            onClick={() => { setLeftPanel(btn.id); setShowLeft(p => leftPanel === btn.id ? !p : true); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              leftPanel === btn.id && showLeft
                ? btn.id === 'validation' ? 'text-red-400' : 'text-cadblue-400'
                : 'text-slate-600'
            }`}
          >
            {btn.icon}
            <span style={{ fontSize: '9px' }}>{btn.title.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Exported Workspace page (wraps with provider) ─────────────────────────────

export default function Workspace() {
  const { id: projectId } = useParams<{ id: string }>();
  return (
    <WorkspaceProvider projectId={projectId}>
      <WorkspaceInner projectId={projectId} />
    </WorkspaceProvider>
  );
}
