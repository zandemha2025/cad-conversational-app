/**
 * ApprovalPanel — Engineering Change Request / approval workflow.
 */
import { useState, useEffect } from 'react';
import {
  ClipboardCheck, CheckCircle2, XCircle, Clock, Send, Loader2, AlertCircle,
} from 'lucide-react';
import {
  fetchApprovals, submitForApproval, approveProject, rejectProject,
  type Approval, IS_DEMO,
} from '../../lib/api';

const DEMO_APPROVALS: Approval[] = [
  {
    id: 'apr-1',
    project_id: 'demo',
    status: 'approved',
    submitted_by: 'user-1',
    submitted_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    reviewed_by: 'reviewer-1',
    reviewed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    comments: 'Approved — fixture geometry meets design requirements.',
    revision_ref: 'Rev B',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'apr-2',
    project_id: 'demo',
    status: 'pending',
    submitted_by: 'user-1',
    submitted_at: new Date(Date.now() - 3600000).toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    comments: 'Requesting review for tolerance updates.',
    revision_ref: 'Rev C',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

const STATUS_CONFIG = {
  pending:  { icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-950/40',  border: 'border-amber-800/50',  label: 'Pending Review' },
  approved: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/50', label: 'Approved' },
  rejected: { icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-950/40',    border: 'border-red-800/50',    label: 'Rejected' },
};

interface Props {
  projectId?: string;
}

export default function ApprovalPanel({ projectId }: Props) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revRef, setRevRef] = useState('');
  const [comments, setComments] = useState('');
  const [actionComments, setActionComments] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_DEMO || !projectId) {
      setApprovals(DEMO_APPROVALS);
      setLoading(false);
      return;
    }
    fetchApprovals(projectId).then(data => {
      if (data) setApprovals(data);
      setLoading(false);
    });
  }, [projectId]);

  async function handleSubmit() {
    if (!projectId || IS_DEMO) {
      const newApproval: Approval = {
        id: `apr-${Date.now()}`,
        project_id: projectId || 'demo',
        status: 'pending',
        submitted_by: 'me',
        submitted_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        comments,
        revision_ref: revRef,
        created_at: new Date().toISOString(),
      };
      setApprovals(prev => [newApproval, ...prev]);
      setRevRef('');
      setComments('');
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await submitForApproval(projectId, revRef, comments);
    if (result) {
      setApprovals(prev => [result, ...prev]);
      setRevRef('');
      setComments('');
    } else {
      setError('Failed to submit for approval.');
    }
    setSubmitting(false);
  }

  async function handleApprove(apprId: string) {
    if (!projectId || IS_DEMO) {
      setApprovals(prev => prev.map(a => a.id === apprId ? { ...a, status: 'approved', comments: actionComments } : a));
      setReviewingId(null);
      return;
    }
    await approveProject(projectId, apprId, actionComments);
    setApprovals(prev => prev.map(a => a.id === apprId ? { ...a, status: 'approved' } : a));
    setReviewingId(null);
    setActionComments('');
  }

  async function handleReject(apprId: string) {
    if (!projectId || IS_DEMO) {
      setApprovals(prev => prev.map(a => a.id === apprId ? { ...a, status: 'rejected', comments: actionComments } : a));
      setReviewingId(null);
      return;
    }
    await rejectProject(projectId, apprId, actionComments);
    setApprovals(prev => prev.map(a => a.id === apprId ? { ...a, status: 'rejected' } : a));
    setReviewingId(null);
    setActionComments('');
  }

  const hasPending = approvals.some(a => a.status === 'pending');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <ClipboardCheck size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Approvals</span>
        {hasPending && (
          <span className="ml-auto w-5 h-5 flex items-center justify-center rounded-full bg-amber-600 text-white font-bold" style={{ fontSize: '9px' }}>
            {approvals.filter(a => a.status === 'pending').length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="flex items-start gap-2 p-2 rounded bg-red-950/50 border border-red-800/50">
            <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Submit form */}
        <div className="p-2.5 rounded-lg bg-cadsurface-800 border border-cadsurface-700 space-y-2">
          <p className="text-xs font-medium text-slate-300">Submit for Review</p>
          <input
            value={revRef}
            onChange={e => setRevRef(e.target.value)}
            placeholder="Revision ref (e.g. Rev C)"
            className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cadblue-500"
          />
          <textarea
            value={comments}
            onChange={e => setComments(e.target.value)}
            rows={2}
            placeholder="Comments for reviewer…"
            className="w-full px-2 py-1.5 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cadblue-500 resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || hasPending}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-xs font-medium text-white transition-all"
          >
            {submitting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            {hasPending ? 'Review Pending' : 'Submit for Approval'}
          </button>
        </div>

        {/* Approval history */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <ClipboardCheck size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No approvals yet</p>
          </div>
        ) : (
          approvals.map(appr => {
            const cfg = STATUS_CONFIG[appr.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            const isReviewing = reviewingId === appr.id;

            return (
              <div key={appr.id} className={`rounded-lg border p-2.5 space-y-1.5 ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={cfg.color} />
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  {appr.revision_ref && (
                    <span className="ml-auto text-[10px] text-slate-400">{appr.revision_ref}</span>
                  )}
                </div>
                {appr.comments && (
                  <p className="text-[10px] text-slate-300 leading-relaxed">{appr.comments}</p>
                )}
                <p className="text-[10px] text-slate-500">
                  {new Date(appr.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>

                {/* Review actions */}
                {appr.status === 'pending' && (
                  isReviewing ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        value={actionComments}
                        onChange={e => setActionComments(e.target.value)}
                        rows={2}
                        placeholder="Review comments…"
                        className="w-full px-2 py-1 rounded bg-cadsurface-900 border border-cadsurface-600 text-xs text-slate-200 placeholder-slate-500 outline-none resize-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleApprove(appr.id)}
                          className="flex-1 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs text-white font-medium transition-all"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(appr.id)}
                          className="flex-1 py-1 rounded bg-red-800 hover:bg-red-700 text-xs text-white font-medium transition-all"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => { setReviewingId(null); setActionComments(''); }}
                          className="px-2 py-1 rounded bg-cadsurface-700 text-xs text-slate-400 transition-all"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(appr.id)}
                      className="w-full py-1 rounded bg-cadsurface-700 hover:bg-cadsurface-600 text-xs text-slate-300 transition-all"
                    >
                      Review
                    </button>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
