import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Shield, Filter, Download, ChevronLeft, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { fetchAuditLog } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata_json?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

const ACTION_META: Record<string, { color: string; icon: ReactNode; label: string }> = {
  'fixture.generate':  { color: 'text-cadblue-400 bg-cadblue-900/30 border-cadblue-700/40', icon: <Info size={10} />, label: 'Generate' },
  'drawing.export':    { color: 'text-amber-400 bg-amber-900/30 border-amber-700/40', icon: <AlertTriangle size={10} />, label: 'Export' },
  'revision.release':  { color: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40', icon: <CheckCircle size={10} />, label: 'Release' },
  'revision.approve':  { color: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40', icon: <CheckCircle size={10} />, label: 'Approve' },
  'member.invite':     { color: 'text-purple-400 bg-purple-900/30 border-purple-700/40', icon: <Info size={10} />, label: 'Invite' },
  'step.upload':       { color: 'text-slate-400 bg-slate-800 border-slate-700', icon: <Info size={10} />, label: 'Upload' },
  'project.create':    { color: 'text-teal-400 bg-teal-900/30 border-teal-700/40', icon: <Info size={10} />, label: 'Create' },
};

const ACTION_TYPES = ['all', 'fixture.generate', 'drawing.export', 'revision.release', 'revision.approve', 'member.invite', 'step.upload', 'project.create'];

export default function AuditLog() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAuditLog(undefined, 200)
      .then((data: unknown) => { if (Array.isArray(data)) setEntries(data as AuditEntry[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter((e) => {
    if (filterAction !== 'all' && e.action !== filterAction) return false;
    if (filterDate && !e.created_at.startsWith(filterDate)) return false;
    return true;
  });

  const exportCSV = () => {
    const header = 'Time,User,Action,Resource Type,Resource ID,IP\n';
    const rows = filtered.map((e) =>
      `"${e.created_at}","${e.user_id}","${e.action}","${e.resource_type}","${e.resource_id ?? ''}","${e.ip_address ?? ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit_log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-cadsurface-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-cadsurface-800 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-amber-400" />
            <div>
              <h1 className="text-xl font-bold">Audit Log</h1>
              <p className="text-sm text-slate-500">ITAR-compliant record of all org actions</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-cadsurface-900 border border-cadsurface-700 rounded-lg px-3 py-2">
            <Filter size={13} className="text-slate-500" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none"
            >
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a} className="bg-cadsurface-900">{a === 'all' ? 'All actions' : a}</option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-cadsurface-900 border border-cadsurface-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
          />
          <div className="flex-1" />
          <span className="text-xs text-slate-500">{filtered.length} entries</span>
          {loading && <Loader2 size={14} className="animate-spin text-slate-500" />}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 text-sm px-3 py-2 bg-cadsurface-900 border border-cadsurface-700 rounded-lg hover:border-cadblue-600/50 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2 border-b border-cadsurface-700 bg-cadsurface-950">
            <span>Time</span>
            <span className="px-3">User</span>
            <span className="px-3">Action</span>
            <span className="px-3">Resource</span>
            <span className="px-3">Details</span>
            <span className="px-3">IP</span>
          </div>

          <div className="divide-y divide-cadsurface-800">
            {loading ? (
              <div className="py-12 text-center text-slate-600">
                <Loader2 size={24} className="mx-auto mb-3 animate-spin opacity-40" />
                <p className="text-sm">Loading audit log…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-600">
                <Shield size={24} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No entries match your filter</p>
              </div>
            ) : filtered.map((entry) => {
              const meta = ACTION_META[entry.action] ?? { color: 'text-slate-400 bg-slate-800 border-slate-700', icon: <Info size={10} />, label: entry.action };
              const isItarWarning = !!(entry.metadata_json?.itar_blocked || entry.metadata_json?.itar_check);
              return (
                <div key={entry.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-0 items-center px-4 py-3 hover:bg-cadsurface-800/50 transition-colors ${isItarWarning ? 'bg-amber-900/5' : ''}`}>
                  <div>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                    {isItarWarning && (
                      <span className="flex items-center gap-1 text-xs text-amber-400 mt-0.5">
                        <AlertTriangle size={10} />
                        ITAR flagged
                      </span>
                    )}
                  </div>
                  <div className="px-3">
                    <span className="text-xs font-mono text-slate-300">{entry.user_id.slice(0, 8)}</span>
                  </div>
                  <div className="px-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-mono ${meta.color}`}>
                      {meta.icon}
                      {entry.action}
                    </span>
                  </div>
                  <div className="px-3 text-xs text-slate-400">
                    <span className="text-slate-500">{entry.resource_type}</span>
                    {entry.resource_id && <span className="ml-1 font-mono text-slate-600">/{entry.resource_id.slice(0, 8)}</span>}
                  </div>
                  <div className="px-3 text-xs text-slate-600 max-w-[200px] truncate">
                    {entry.metadata_json ? JSON.stringify(entry.metadata_json).slice(0, 60) : '—'}
                  </div>
                  <div className="px-3">
                    <span className="text-xs font-mono text-slate-600">{entry.ip_address ?? '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ITAR note */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
          <Shield size={12} className="text-amber-500/60" />
          All STEP, PDF and IGES exports are logged regardless of ITAR status. Logs are immutable and retained for 7 years.
        </div>
      </div>
    </div>
  );
}
