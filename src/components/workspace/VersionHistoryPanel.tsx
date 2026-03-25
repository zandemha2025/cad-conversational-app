/**
 * VersionHistoryPanel — fixture geometry version timeline with AI-powered diff.
 *
 * Shows all generated versions for the current project.  Clicking a version
 * loads it in the 3D viewer.  Clicking "Compare" between any two versions
 * triggers a Gemini diff and shows colour-coded change cards.
 */
import { useState, useEffect } from 'react';
import {
  History, Loader2, GitCompare, ChevronRight, CheckCircle2,
  PlusCircle, MinusCircle, RefreshCw, AlertCircle,
} from 'lucide-react';
import { fetchVersions, fetchVersionDiff, IS_DEMO } from '../../lib/api';
import type { FixtureVersion, VersionDiff } from '../../lib/api';
import { useWorkspace } from '../../store/workspaceStore';

// ── Demo data ──────────────────────────────────────────────────────────────────

const DEMO_VERSIONS: FixtureVersion[] = [
  { id: 'v3', version: 3, gltf_url: null, generation_prompt: 'Add 4× M5 mounting holes on 40mm bolt pattern and increase base thickness to 5mm', generated_at: '2026-03-25T14:30:00Z' },
  { id: 'v2', version: 2, gltf_url: null, generation_prompt: 'Increase fillet radius to 2mm on all edges, add side support tabs', generated_at: '2026-03-25T11:00:00Z' },
  { id: 'v1', version: 1, gltf_url: null, generation_prompt: 'Create a basic CNC fixture base plate 150×100mm with 3-2-1 locating', generated_at: '2026-03-24T09:00:00Z' },
];

const DEMO_DIFF: VersionDiff = {
  from_version: 2,
  to_version: 3,
  changes: [
    { type: 'modified', feature: 'Base Plate', detail: 'Thickness increased from 3mm to 5mm for rigidity' },
    { type: 'added',    feature: 'Mounting Holes', detail: '4× M5 through-holes on 40mm bolt circle pattern' },
    { type: 'removed',  feature: 'Side Tab', detail: 'Left-side reinforcement tab removed per user request' },
  ],
  summary: 'Strengthened base plate and added mounting provisions for bench-top installation',
};

// ── Change-type styling ────────────────────────────────────────────────────────

const CHANGE_STYLE = {
  added:    { bg: 'bg-emerald-900/30 border-emerald-700/40', text: 'text-emerald-400', icon: <PlusCircle size={12} />,  label: 'Added' },
  modified: { bg: 'bg-amber-900/30 border-amber-700/40',   text: 'text-amber-400',   icon: <RefreshCw size={12} />,   label: 'Modified' },
  removed:  { bg: 'bg-red-900/30 border-red-700/40',       text: 'text-red-400',     icon: <MinusCircle size={12} />, label: 'Removed' },
};

// ── Diff panel ─────────────────────────────────────────────────────────────────

function DiffPanel({
  diff,
  loading,
  onClose,
}: {
  diff: VersionDiff | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (loading) {
    return (
      <div className="p-4 border-t border-cadsurface-700 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          Generating AI diff…
        </div>
      </div>
    );
  }
  if (!diff) return null;

  return (
    <div className="border-t border-cadsurface-700 bg-cadsurface-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          v{diff.from_version} → v{diff.to_version} Diff
        </span>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          ✕
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-400 italic">{diff.summary}</p>

      {/* Change cards */}
      <div className="space-y-1.5">
        {diff.changes.map((ch, i) => {
          const style = CHANGE_STYLE[ch.type] ?? CHANGE_STYLE.modified;
          return (
            <div key={i} className={`flex gap-2 items-start p-2 rounded border text-xs ${style.bg}`}>
              <span className={`mt-0.5 shrink-0 ${style.text}`}>{style.icon}</span>
              <div>
                <span className={`font-semibold ${style.text}`}>{ch.feature}</span>
                <span className="text-slate-400 ml-1">— {ch.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  projectId?: string;
}

export default function VersionHistoryPanel({ projectId }: Props) {
  const { state, dispatch } = useWorkspace();
  const [versions, setVersions]         = useState<FixtureVersion[]>(IS_DEMO ? DEMO_VERSIONS : []);
  const [loading, setLoading]           = useState(false);
  const [compareFrom, setCompareFrom]   = useState<number | null>(null);
  const [diff, setDiff]                 = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading]   = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Fetch versions on mount
  useEffect(() => {
    if (!projectId || IS_DEMO) return;
    setLoading(true);
    fetchVersions(projectId)
      .then(data => { if (data) setVersions(data); })
      .catch(() => setError('Failed to load versions'))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Sync versions into workspace store
  useEffect(() => {
    dispatch({ type: 'SET_VERSIONS', versions });
  }, [versions, dispatch]);

  const handleSelectVersion = (ver: FixtureVersion) => {
    dispatch({ type: 'SELECT_VERSION', version: ver.version });
    if (ver.gltf_url) {
      dispatch({ type: 'SET_GLTF_URL', url: ver.gltf_url });
    }
    setDiff(null);
    setCompareFrom(null);
  };

  const handleCompare = async (toVer: number) => {
    if (!projectId || compareFrom === null) return;
    setDiffLoading(true);
    setDiff(null);
    setError(null);
    try {
      if (IS_DEMO) {
        await new Promise(r => setTimeout(r, 900));
        setDiff(DEMO_DIFF);
      } else {
        const result = await fetchVersionDiff(projectId, toVer, compareFrom);
        if (result) setDiff(result);
        else setError('Diff failed — try again');
      }
    } catch {
      setError('Diff request failed');
    } finally {
      setDiffLoading(false);
    }
  };

  const selectedVer = state.selectedVersion;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2">
          <History size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Version History</span>
        </div>
        {loading && <Loader2 size={11} className="animate-spin text-slate-500" />}
      </div>

      {/* Compare-from hint */}
      {compareFrom !== null && (
        <div className="px-3 py-1.5 bg-amber-900/20 border-b border-amber-700/30 text-xs text-amber-400 flex items-center gap-2">
          <GitCompare size={11} />
          Comparing from v{compareFrom} — click a newer version to diff
          <button onClick={() => setCompareFrom(null)} className="ml-auto text-slate-500 hover:text-slate-300">✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-1.5 text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded p-2">
          <AlertCircle size={11} />
          {error}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {versions.length === 0 && !loading && (
          <div className="text-center py-8">
            <History size={24} className="text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No versions yet</p>
            <p className="text-xs text-slate-700 mt-1">Generate a fixture to create the first version</p>
          </div>
        )}

        {versions.map((ver, i) => {
          const isSelected = selectedVer === ver.version;
          const isNewest   = i === 0;
          const date       = new Date(ver.generated_at);

          return (
            <div key={ver.id} className="relative">
              {/* Timeline connector */}
              {i < versions.length - 1 && (
                <div className="absolute left-[11px] top-7 bottom-[-8px] w-px bg-cadsurface-700 z-0" />
              )}

              <div className={`relative z-10 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'border-cadblue-700/60 bg-cadblue-900/20'
                  : 'border-cadsurface-700 bg-cadsurface-900/60 hover:border-cadsurface-600'
              }`}>
                {/* Version header row */}
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  onClick={() => handleSelectVersion(ver)}
                >
                  {/* Version badge */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSelected
                      ? 'bg-cadblue-600 text-white'
                      : isNewest
                      ? 'bg-emerald-800/60 text-emerald-300 border border-emerald-700/50'
                      : 'bg-cadsurface-700 text-slate-400'
                  }`}>
                    {ver.version}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">v{ver.version}</span>
                      {isNewest && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/40 text-emerald-400">
                          latest
                        </span>
                      )}
                      {isSelected && <CheckCircle2 size={10} className="text-cadblue-400 ml-auto" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                </div>

                {/* Prompt preview */}
                {ver.generation_prompt && (
                  <div className="px-3 pb-2">
                    <p className="text-xs text-slate-500 italic truncate" title={ver.generation_prompt}>
                      "{ver.generation_prompt}"
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-3 pb-2 flex gap-2">
                  {/* Set as compare baseline */}
                  <button
                    onClick={e => { e.stopPropagation(); setCompareFrom(ver.version); setDiff(null); }}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      compareFrom === ver.version
                        ? 'bg-amber-900/40 border-amber-700/40 text-amber-300'
                        : 'border-cadsurface-700 text-slate-500 hover:text-slate-300 hover:border-cadsurface-600'
                    }`}
                  >
                    {compareFrom === ver.version ? 'Baseline' : 'Set baseline'}
                  </button>

                  {/* Compare to this version */}
                  {compareFrom !== null && compareFrom < ver.version && (
                    <button
                      onClick={e => { e.stopPropagation(); handleCompare(ver.version); }}
                      className="text-xs px-2 py-0.5 rounded border border-cadblue-700/50 bg-cadblue-900/30 text-cadblue-300 hover:bg-cadblue-900/50 flex items-center gap-1"
                    >
                      <GitCompare size={10} />
                      Diff v{compareFrom}→v{ver.version}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Diff panel */}
      <DiffPanel
        diff={diff}
        loading={diffLoading}
        onClose={() => setDiff(null)}
      />
    </div>
  );
}
