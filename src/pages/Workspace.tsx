import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import FeatureTree from '../components/workspace/FeatureTree';
import Viewport3D from '../components/workspace/Viewport3D';
import ChatPanel from '../components/workspace/ChatPanel';
import PropertiesPanel from '../components/workspace/PropertiesPanel';
import HardwarePanel from '../components/workspace/HardwarePanel';
import TouchpointPanel from '../components/workspace/TouchpointPanel';
import ValidationPanel from '../components/workspace/ValidationPanel';
import DrawingView from '../components/workspace/DrawingView';
import NodeEditor from '../components/workspace/NodeEditor';
import StudyMode from '../components/workspace/StudyMode';
import ExportPanel from '../components/workspace/ExportPanel';
import ApprovalPanel from '../components/workspace/ApprovalPanel';
import InterferencePanel from '../components/workspace/InterferencePanel';
import ConstraintsPanel from '../components/workspace/ConstraintsPanel';
import ClampingForcePanel from '../components/workspace/ClampingForcePanel';
import WorkInstructionsPanel from '../components/workspace/WorkInstructionsPanel';
import QcChecklistPanel from '../components/workspace/QcChecklistPanel';
import ToleranceStackPanel from '../components/workspace/ToleranceStackPanel';
import CollaborationPanel from '../components/workspace/CollaborationPanel';
import FeatureSearch from '../components/workspace/FeatureSearch';
import ManufacturingPanel from '../components/workspace/ManufacturingPanel';
import AssemblyPanel from '../components/workspace/AssemblyPanel';
import ComponentLibraryPanel from '../components/workspace/ComponentLibraryPanel';
import UploadDialog from '../components/workspace/UploadDialog';
import VariationsPanel from '../components/workspace/VariationsPanel';
import VariationsModal from '../components/workspace/VariationsModal';
import TopBar from '../components/layout/TopBar';
import type { WorkspaceMode } from '../components/layout/TopBar';
import OnboardingTour from '../components/OnboardingTour';
import { WorkspaceProvider, useWorkspace } from '../store/workspaceStore';
import { useFixtureGeometry } from '../hooks/useFixtureGeometry';
import { useRealtimeProject } from '../hooks/useRealtimeProject';
import { useAuth } from '../hooks/useAuth';
import { fetchTouchpoints, fetchProject } from '../lib/api';
import type { ApiTouchpoint } from '../lib/api';
import {
  PanelLeftClose, PanelRightClose, MessageSquare, TreePine, Package,
  Target, ShieldAlert, Download, ClipboardCheck,
  Scan, Link2, Gauge, FileText, Microscope, Ruler, Users, Search, Wrench, Layers, BookOpen, Upload, Shuffle,
  MoreHorizontal,
} from 'lucide-react';
import type { ComponentSuggestion } from '../lib/api';
import { generateVariations } from '../lib/api';

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
  | 'team'
  | 'features'
  | 'manufacturing'
  | 'assembly'
  | 'parts'
  | 'variations';

// ── Inner workspace with access to WorkspaceContext ───────────────────────────

function WorkspaceInner({ projectId }: { projectId: string | undefined }) {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('chat');
  const [showLeft, setShowLeft]   = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showMore, setShowMore]   = useState(false);
  const [mode, setMode]           = useState<WorkspaceMode>('part');
  const [showTour, setShowTour]   = useState(false);
  const [projectName, setProjectName] = useState<string>('');
  const [componentSuggestions, setComponentSuggestions] = useState<ComponentSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showVariationsModal, setShowVariationsModal] = useState(false);
  const [variationsGenerating, setVariationsGenerating] = useState(false);
  const [variationsRefresh, setVariationsRefresh] = useState(0);
  const { state, dispatch }       = useWorkspace();
  const { user } = useAuth();
  const [viewers, setViewers]     = useState<import('../hooks/useRealtimeProject').PresenceUser[]>([]);

  // Show tour automatically on first visit
  useEffect(() => {
    if (!OnboardingTour.isCompleted()) {
      // Slight delay so layout is fully rendered
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  // Load project metadata
  useEffect(() => {
    if (!projectId) return;
    fetchProject(projectId)
      .then((p) => { if (p?.name) setProjectName(p.name); })
      .catch(() => {});
  }, [projectId]);

  // Load fixture geometry + part features
  const { gltfUrl, version: fixtureVersion, partFeatures, refetch: refetchGeometry } = useFixtureGeometry(projectId);

  // Poll for geometry when a generation job is in progress (fallback for Supabase Realtime)
  useEffect(() => {
    if (!isGenerating || gltfUrl || fixtureVersion !== null) return;
    const id = setInterval(refetchGeometry, 5000);
    return () => clearInterval(id);
  }, [isGenerating, gltfUrl, fixtureVersion, refetchGeometry]);

  // Stop polling once generation completes (gltfUrl set) or fixture record exists (even without GLTF)
  useEffect(() => {
    if (gltfUrl || fixtureVersion !== null) setIsGenerating(false);
  }, [gltfUrl, fixtureVersion]);

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
      setIsGenerating(false);
      refetchGeometry();
    },
    onPresenceChange: (users) => setViewers(users),
    onCommentChange: () => {
      // CollaborationPanel reloads comments itself; this could trigger a badge refresh
    },
  }, user?.id);

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
    { id: 'validation',   icon: <ShieldAlert size={15} />,     title: 'Validation' },
    { id: 'export',       icon: <Download size={15} />,        title: 'Export (STEP/IGES/STL/DXF)' },
    { id: 'approvals',    icon: <ClipboardCheck size={15} />,  title: 'Approval Workflow' },
    { id: 'interference',      icon: <Scan size={15} />,         title: 'Interference Check' },
    { id: 'constraints',       icon: <Link2 size={15} />,        title: 'Assembly Constraints' },
    { id: 'clamping',          icon: <Gauge size={15} />,        title: 'Clamping Force Calculator' },
    { id: 'work_instructions', icon: <FileText size={15} />,     title: 'Work Instructions' },
    { id: 'qc_checklist',      icon: <Microscope size={15} />,   title: 'QC Checklist' },
    { id: 'tolerance_stack',   icon: <Ruler size={15} />,        title: 'Tolerance Stack-Up' },
    { id: 'team',              icon: <Users size={15} />,        title: 'Team & Collaboration', badge: viewers.length > 1 ? viewers.length : undefined },
    { id: 'features',          icon: <Search size={15} />,       title: 'Feature Search' },
    { id: 'manufacturing',     icon: <Wrench size={15} />,       title: 'Manufacturing' },
    { id: 'assembly',          icon: <Layers size={15} />,       title: 'Assembly BOM' },
    { id: 'parts',             icon: <BookOpen size={15} />,     title: 'Parts Library' },
    { id: 'variations',        icon: <Shuffle size={15} />,      title: 'Design Variations' },
  ];

  function getPanelColor(id: LeftPanel, active: boolean) {
    if (!active) {
      if (id === 'validation') return 'text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300';
      return 'text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300';
    }
    switch (id) {
      case 'hardware':     return 'bg-amber-600 text-white';
      case 'touchpoints':  return 'bg-emerald-700 text-white';
      case 'validation':   return 'bg-emerald-700 text-white';
      case 'export':       return 'bg-violet-600 text-white';
      case 'approvals':    return 'bg-sky-700 text-white';
      case 'interference':      return 'bg-orange-700 text-white';
      case 'constraints':       return 'bg-teal-700 text-white';
      case 'clamping':          return 'bg-pink-700 text-white';
      case 'work_instructions': return 'bg-cadblue-700 text-white';
      case 'qc_checklist':      return 'bg-emerald-700 text-white';
      case 'tolerance_stack':   return 'bg-violet-700 text-white';
      case 'team':              return 'bg-cadblue-700 text-white';
      case 'features':          return 'bg-cadblue-700 text-white';
      case 'manufacturing':     return 'bg-orange-600 text-white';
      case 'assembly':          return 'bg-indigo-700 text-white';
      case 'parts':             return 'bg-violet-700 text-white';
      case 'variations':        return 'bg-violet-600 text-white';
      default:             return 'bg-cadblue-600 text-white';
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        mode={mode}
        onModeChange={setMode}
        projectId={projectId}
        onStartTour={() => setShowTour(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left icon rail — hidden on mobile */}
        {mode !== 'drawing' && mode !== 'nodes' && mode !== 'studies' && (
          <div className="hidden md:flex flex-col bg-cadsurface-900 border-r border-cadsurface-700 shrink-0">
            <div className="flex flex-col gap-1 p-1 pt-2">
              {/* Panel toggle */}
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

              {/* Core 5 panels */}
              {leftButtons.filter(b => ['chat', 'validation', 'export', 'variations'].includes(b.id)).map(btn => {
                const isActive = leftPanel === btn.id && showLeft;
                const tourId =
                  btn.id === 'chat'   ? 'tour-chat-btn'   :
                  btn.id === 'export' ? 'tour-export-btn' : undefined;
                return (
                  <button
                    key={btn.id}
                    id={tourId}
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

              {/* Upload STEP */}
              <button
                title="Upload STEP file"
                onClick={() => setShowUploadDialog(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300 transition-all"
              >
                <Upload size={15} />
              </button>

              {/* More tools flyout */}
              <div className="relative">
                <button
                  title="More tools"
                  onClick={() => setShowMore(p => !p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                    showMore
                      ? 'bg-cadsurface-700 text-slate-200'
                      : 'text-slate-500 hover:bg-cadsurface-800 hover:text-slate-300'
                  }`}
                >
                  <MoreHorizontal size={15} />
                </button>
                {showMore && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
                    <div className="absolute left-full top-0 ml-1.5 w-52 bg-cadsurface-900 border border-cadsurface-700 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                      <p className="px-3 py-1 text-xs font-semibold text-slate-600 uppercase tracking-wider">More Tools</p>
                      {leftButtons.filter(b => !['chat', 'validation', 'export', 'variations'].includes(b.id)).map(btn => (
                        <button
                          key={btn.id}
                          title={btn.title}
                          onClick={() => { setLeftPanel(btn.id); setShowLeft(true); setShowMore(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                            leftPanel === btn.id && showLeft
                              ? 'text-cadblue-400 bg-cadblue-900/20'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-cadsurface-800'
                          }`}
                        >
                          {btn.icon}
                          <span>{btn.title}</span>
                          {btn.badge !== undefined && (
                            <span className="ml-auto w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white font-bold" style={{ fontSize: '8px' }}>
                              {btn.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        {mode === 'nodes' ? (
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary label="Node editor error"><NodeEditor projectId={projectId} /></ErrorBoundary>
          </div>
        ) : mode === 'studies' ? (
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary label="Study mode error"><StudyMode projectId={projectId} /></ErrorBoundary>
          </div>
        ) : mode === 'drawing' ? (
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary label="Drawing view error"><DrawingView projectId={projectId} projectName={projectName} /></ErrorBoundary>
          </div>
        ) : (
          <>
            {showLeft && (
              <div className="w-full md:w-72 shrink-0 border-r border-cadsurface-700 overflow-hidden flex flex-col md:flex">
                <ErrorBoundary label="Panel error">
                  {leftPanel === 'chat'         && <ChatPanel projectId={projectId} projectName={projectName} onComponentSuggestions={setComponentSuggestions} onGenerationQueued={() => setIsGenerating(true)} onGenerationComplete={() => { setIsGenerating(false); refetchGeometry(); }} fixtureLoaded={!!gltfUrl} />}
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
                  {leftPanel === 'team'              && (
                    <CollaborationPanel projectId={projectId} viewers={viewers} currentUserId={user?.id} />
                  )}
                  {leftPanel === 'features'          && <FeatureSearch projectId={projectId} />}
                  {leftPanel === 'manufacturing'     && <ManufacturingPanel projectId={projectId} />}
                  {leftPanel === 'assembly'          && <AssemblyPanel projectId={projectId} />}
                  {leftPanel === 'parts'             && <ComponentLibraryPanel projectId={projectId} suggestions={componentSuggestions} />}
                  {leftPanel === 'variations'        && (
                    <VariationsPanel
                      projectId={projectId ?? ''}
                      onGenerateClick={() => setShowVariationsModal(true)}
                      triggerRefresh={variationsRefresh}
                    />
                  )}
                </ErrorBoundary>
              </div>
            )}

            <div id="tour-viewport" className="flex-1 overflow-hidden relative">
              <ErrorBoundary label="3D viewport error">
                <Viewport3D
                  touchpointMode={leftPanel === 'touchpoints' && showLeft}
                  gltfUrl={state.gltfUrl}
                  projectId={projectId}
                />
              </ErrorBoundary>
            </div>

            {showRight && (
              <div id="tour-right-panel" className="w-64 shrink-0 border-l border-cadsurface-700 overflow-hidden hidden md:flex flex-col">
                <ErrorBoundary label="Properties panel error">
                  <PropertiesPanel projectId={projectId} />
                </ErrorBoundary>
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

      {/* Upload dialog */}
      {showUploadDialog && projectId && (
        <UploadDialog
          projectId={projectId}
          onClose={() => setShowUploadDialog(false)}
          onComplete={() => refetchGeometry()}
        />
      )}

      {/* Onboarding tour */}
      <OnboardingTour active={showTour} onDone={() => setShowTour(false)} />

      {/* Generate Variations modal */}
      {showVariationsModal && (
        <VariationsModal
          projectId={projectId ?? ''}
          onClose={() => setShowVariationsModal(false)}
          isGenerating={variationsGenerating}
          onSubmit={async (prompt, numVariations, params) => {
            if (!projectId) return;
            setVariationsGenerating(true);
            try {
              await generateVariations(projectId, prompt, numVariations, params);
              setShowVariationsModal(false);
              // Switch to variations panel and trigger a poll
              setLeftPanel('variations');
              setShowLeft(true);
              // Poll for new group appearing
              const pollInterval = setInterval(() => {
                setVariationsRefresh(r => r + 1);
              }, 8000);
              setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000); // 10 min max
            } finally {
              setVariationsGenerating(false);
            }
          }}
        />
      )}
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
