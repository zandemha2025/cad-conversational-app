/**
 * CollaborationPanel — Share the project and manage comments.
 * Shows: active viewers, share link generator, comment thread.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Copy, Check, Users, MessageSquare, CheckCircle2,
  Circle, Trash2, Plus, ChevronDown, ChevronUp, MapPin, X,
} from 'lucide-react';
import type { PresenceUser } from '../../hooks/useRealtimeProject';
import {
  createShareLink, listShares, revokeShare,
  fetchComments, addComment, resolveComment, deleteComment,
  type ShareResponse, type CommentResponse,
} from '../../lib/api';

const AVATAR_COLORS = ['bg-cadblue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-violet-600', 'bg-rose-600'];

interface Props {
  projectId?: string;
  viewers: PresenceUser[];
  currentUserId?: string;
}

export default function CollaborationPanel({ projectId, viewers, currentUserId }: Props) {
  const [tab, setTab] = useState<'share' | 'comments'>('share');

  // ── Share state ──────────────────────────────────────────────────────────
  const [shares, setShares] = useState<ShareResponse[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [copied, setCopied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Comment state ────────────────────────────────────────────────────────
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  // ── Load shares ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId || tab !== 'share') return;
    setSharesLoading(true);
    listShares(projectId).then(d => {
      setShares(d ?? []);
      setSharesLoading(false);
    });
  }, [projectId, tab]);

  // ── Load comments ────────────────────────────────────────────────────────
  const loadComments = useCallback(() => {
    if (!projectId) return;
    setCommentsLoading(true);
    fetchComments(projectId).then(d => {
      setComments(d ?? []);
      setCommentsLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    if (tab === 'comments') loadComments();
  }, [tab, loadComments]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleCreateShare() {
    if (!projectId) return;
    setCreating(true);
    const share = await createShareLink(projectId, { permission });
    if (share) setShares(prev => [share, ...prev]);
    setCreating(false);
  }

  async function handleRevoke(shareId: string) {
    if (!projectId) return;
    await revokeShare(projectId, shareId);
    setShares(prev => prev.filter(s => s.id !== shareId));
  }

  function handleCopy(token: string) {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newComment.trim()) return;
    setSubmitting(true);
    const c = await addComment(projectId, { comment: newComment.trim() });
    if (c) setComments(prev => [...prev, c]);
    setNewComment('');
    setSubmitting(false);
  }

  async function handleResolve(comment: CommentResponse) {
    if (!projectId) return;
    const updated = await resolveComment(projectId, comment.id, !comment.resolved);
    if (updated) {
      setComments(prev => prev.map(c => c.id === comment.id ? updated : c));
    }
  }

  async function handleDelete(commentId: string) {
    if (!projectId) return;
    await deleteComment(projectId, commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  const visibleComments = comments.filter(c => showResolved || !c.resolved);
  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <div className="flex flex-col h-full text-slate-300">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <Users size={14} className="text-cadblue-400" />
          <span className="text-sm font-semibold text-slate-200">Team</span>
        </div>

        {/* Live viewers */}
        {viewers.length > 0 && (
          <div className="flex items-center gap-2 mb-2.5 px-2 py-1.5 bg-emerald-950/30 border border-emerald-900/50 rounded-lg">
            <Circle size={6} className="text-emerald-400 fill-emerald-400 shrink-0" />
            <div className="flex -space-x-1.5 shrink-0">
              {viewers.slice(0, 4).map((u, i) => (
                <div
                  key={u.user_id}
                  title={u.user_id === currentUserId ? 'You' : u.name}
                  className={`w-5 h-5 rounded-full border border-cadsurface-900 flex items-center justify-center text-white font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  style={{ fontSize: '7px' }}
                >
                  {(u.name || '?').slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-xs text-emerald-400">
              {viewers.length === 1 ? '1 person' : `${viewers.length} people`} viewing
            </span>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex bg-cadsurface-800 rounded-md p-0.5">
          <button
            onClick={() => setTab('share')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded transition-all ${
              tab === 'share' ? 'bg-cadblue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link2 size={11} /> Share
          </button>
          <button
            onClick={() => setTab('comments')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs rounded transition-all relative ${
              tab === 'comments' ? 'bg-cadblue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare size={11} /> Comments
            {unresolvedCount > 0 && tab !== 'comments' && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-amber-500 text-white font-bold" style={{ fontSize: '7px' }}>
                {unresolvedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Share tab */}
      {tab === 'share' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Create new share */}
          <div className="bg-cadsurface-800/60 border border-cadsurface-700 rounded-lg p-3 space-y-2.5">
            <p className="text-xs font-medium text-slate-300">Create share link</p>
            <div className="flex gap-1.5">
              {(['view', 'edit'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPermission(p)}
                  className={`flex-1 py-1 text-xs rounded-md border transition-all ${
                    permission === p
                      ? p === 'edit'
                        ? 'bg-amber-600/20 border-amber-600/50 text-amber-300'
                        : 'bg-cadblue-600/20 border-cadblue-600/50 text-cadblue-300'
                      : 'border-cadsurface-600 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p === 'view' ? 'View only' : 'Can edit'}
                </button>
              ))}
            </div>
            <button
              onClick={handleCreateShare}
              disabled={creating || !projectId}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
            >
              <Plus size={12} />
              {creating ? 'Creating…' : 'Generate link'}
            </button>
          </div>

          {/* Existing shares */}
          {sharesLoading ? (
            <p className="text-xs text-slate-600 text-center py-2">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-4">No share links yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Active links</p>
              {shares.map(share => (
                <div key={share.id} className="bg-cadsurface-800/40 border border-cadsurface-700 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      share.permission === 'edit'
                        ? 'bg-amber-900/40 text-amber-400 border border-amber-800/50'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {share.permission === 'edit' ? 'Can edit' : 'View only'}
                    </span>
                    <button
                      onClick={() => handleRevoke(share.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                      title="Revoke link"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 font-mono text-xs text-slate-500 truncate">
                      /shared/{share.share_token.slice(0, 12)}…
                    </span>
                    <button
                      onClick={() => handleCopy(share.share_token)}
                      className="flex items-center gap-1 px-2 py-1 bg-cadsurface-700 hover:bg-cadsurface-600 rounded text-xs text-slate-300 transition-colors shrink-0"
                    >
                      {copied === share.share_token ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      {copied === share.share_token ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {share.expires_at && (
                    <p className="text-xs text-slate-600 mt-1">
                      Expires {new Date(share.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments tab */}
      {tab === 'comments' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Add comment form */}
          <form onSubmit={handleSubmitComment} className="p-3 border-b border-cadsurface-700 shrink-0">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              className="w-full bg-cadsurface-800 border border-cadsurface-600 rounded-lg px-2.5 py-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cadblue-500 transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitComment(e as unknown as React.FormEvent);
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-slate-600">⌘↵ to submit</span>
              <button
                type="submit"
                disabled={!newComment.trim() || submitting || !projectId}
                className="flex items-center gap-1.5 px-3 py-1 bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors"
              >
                <MessageSquare size={11} />
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {commentsLoading ? (
              <p className="text-xs text-slate-600 text-center py-4">Loading…</p>
            ) : visibleComments.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare size={20} className="text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600">No comments yet.</p>
                <p className="text-xs text-slate-700 mt-1">Be the first to leave a note.</p>
              </div>
            ) : (
              visibleComments.map(c => (
                <CommentCard
                  key={c.id}
                  comment={c}
                  isOwn={c.user_id === currentUserId}
                  onResolve={() => handleResolve(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))
            )}

            {/* Show resolved toggle */}
            {comments.some(c => c.resolved) && (
              <button
                onClick={() => setShowResolved(p => !p)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                {showResolved ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showResolved ? 'Hide' : `Show ${comments.filter(c => c.resolved).length}`} resolved
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comment card ──────────────────────────────────────────────────────────────

function CommentCard({
  comment, isOwn, onResolve, onDelete,
}: {
  comment: CommentResponse;
  isOwn: boolean;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const initials = (comment.user_name || '?').slice(0, 2).toUpperCase();
  const timeAgo = formatTimeAgo(comment.created_at);

  return (
    <div className={`rounded-lg border p-2.5 transition-colors ${
      comment.resolved
        ? 'bg-cadsurface-900/40 border-cadsurface-800 opacity-60'
        : 'bg-cadsurface-800/60 border-cadsurface-700'
    }`}>
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-cadblue-700 flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: '8px' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-slate-300 truncate">
              {comment.user_name || 'Unknown'}
            </span>
            <span className="text-xs text-slate-600 shrink-0">{timeAgo}</span>
            {comment.position_json && (
              <MapPin size={10} className="text-slate-600 shrink-0" aria-label="Pinned to 3D model" />
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed break-words">{comment.comment}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5 mt-1.5">
        <button
          onClick={onResolve}
          title={comment.resolved ? 'Mark unresolved' : 'Mark resolved'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
            comment.resolved
              ? 'text-slate-600 hover:text-slate-400'
              : 'text-slate-500 hover:text-emerald-400'
          }`}
        >
          <CheckCircle2 size={11} />
          {comment.resolved ? 'Reopen' : 'Resolve'}
        </button>
        {isOwn && (
          <button
            onClick={onDelete}
            className="text-slate-700 hover:text-red-400 transition-colors p-0.5 rounded"
            title="Delete comment"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
