import { useState, useEffect } from 'react';
import { GitBranch, Plus, Loader2, CheckCircle, Clock, Archive } from 'lucide-react';
import { fetchRevisions, createRevision, approveRevision, releaseRevision } from '../../lib/api';
import type { Revision } from '../../types';

const STATUS_CONFIG = {
  released:  { color: 'text-emerald-400 border-emerald-700/40 bg-emerald-900/30', icon: <CheckCircle size={10} /> },
  'in-review':{ color: 'text-amber-400 border-amber-700/40 bg-amber-900/30', icon: <Clock size={10} /> },
  prototype: { color: 'text-slate-400 border-slate-700 bg-slate-800', icon: <GitBranch size={10} /> },
  obsolete:  { color: 'text-red-400 border-red-700/40 bg-red-900/30', icon: <Archive size={10} /> },
};

interface Props { projectId?: string; }

export default function RevisionHistory({ projectId }: Props) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRevLetter, setNewRevLetter] = useState('C');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchRevisions(projectId)
      .then((data: unknown) => { if (Array.isArray(data)) setRevisions(data as Revision[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreate = async () => {
    if (!projectId || !newDesc) return;
    setCreating(true);
    try {
      await createRevision({ project_id: projectId, rev_letter: newRevLetter, description: newDesc, changes: [] });
      setNewDesc('');
      setShowCreate(false);
      // Refetch
      const data = await fetchRevisions(projectId) as unknown;
      if (Array.isArray(data)) setRevisions(data as Revision[]);
    } finally { setCreating(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Revision History</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={11} className="animate-spin text-slate-500" />}
          <button onClick={() => setShowCreate(p => !p)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadblue-700/50">
            <Plus size={11} />ECR
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="p-3 border-b border-cadsurface-700 bg-cadsurface-900/60 space-y-2">
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-xs text-slate-500">Rev</label>
              <input value={newRevLetter} onChange={e => setNewRevLetter(e.target.value)}
                className="w-full text-xs bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-1 outline-none text-slate-200 mt-0.5" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="ECR description..."
                className="w-full text-xs bg-cadsurface-800 border border-cadsurface-700 rounded px-2 py-1 outline-none text-slate-200 mt-0.5" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newDesc}
              className="flex-1 text-xs py-1 bg-cadblue-600 hover:bg-cadblue-500 text-white rounded disabled:opacity-50">
              {creating ? 'Creating…' : 'Create ECR'}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1 text-slate-400 border border-cadsurface-700 rounded hover:text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {revisions.length === 0 && !loading && (
          <div className="text-center py-8">
            <GitBranch size={24} className="text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-600">No revisions yet</p>
            <p className="text-xs text-slate-700 mt-1">Create an ECR to start the review process</p>
          </div>
        )}
        {revisions.map((rev, i) => {
          const cfg = STATUS_CONFIG[rev.status] ?? STATUS_CONFIG['in-review'];
          return (
            <div key={rev.id} className="relative">
              {i < revisions.length - 1 && <div className="absolute left-3 top-8 bottom-0 w-px bg-cadsurface-700" />}
              <div className="flex gap-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 relative shrink-0 mt-0.5 ${cfg.color}`}>
                  {rev.rev_letter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-200">Rev {rev.rev_letter}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border flex items-center gap-1 ${cfg.color}`}>
                      {cfg.icon}{rev.status}
                    </span>
                    {rev.ecr_number && <span className="text-xs text-slate-500 font-mono">{rev.ecr_number}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{rev.description}</p>
                  <div className="mt-1 space-y-0.5">
                    {rev.changes_json.slice(0, 3).map((ch, ci) => (
                      <p key={ci} className="text-xs text-slate-600 pl-2 border-l border-cadsurface-700">{ch}</p>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {new Date(rev.created_at).toLocaleDateString()} · {rev.author_name ?? rev.author_id.slice(0, 8)}
                  </p>
                  {rev.status === 'in-review' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => approveRevision(rev.id).then(() => setRevisions(prev => prev.map(r => r.id === rev.id ? {...r, approved_by: 'me'} : r)))}
                        className="text-xs px-2 py-0.5 bg-cadblue-900/40 border border-cadblue-700/40 text-cadblue-300 rounded hover:bg-cadblue-900/60">
                        Approve
                      </button>
                      <button onClick={() => releaseRevision(rev.id).then(() => setRevisions(prev => prev.map(r => r.id === rev.id ? {...r, status: 'released'} : r)))}
                        className="text-xs px-2 py-0.5 bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 rounded hover:bg-emerald-900/60">
                        Release
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
