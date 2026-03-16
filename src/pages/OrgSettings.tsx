import { useState, useEffect } from 'react';
import { Building2, Users, Plus, Trash2, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchOrgMembers, inviteOrgMember, removeOrgMember, updateOrgMemberRole } from '../lib/api';
import type { OrgMember, OrgRole } from '../types';
import { IS_DEMO } from '../lib/api';

const DEMO_MEMBERS: OrgMember[] = [
  { id: 'm1', org_id: 'org1', user_id: 'u1', role: 'admin', email: 'jsmith@boeing.com', full_name: 'James Smith', invited_at: '2026-01-15T00:00:00Z' },
  { id: 'm2', org_id: 'org1', user_id: 'u2', role: 'engineer', email: 'kwatson@boeing.com', full_name: 'Karen Watson', invited_at: '2026-02-01T00:00:00Z' },
  { id: 'm3', org_id: 'org1', user_id: 'u3', role: 'reviewer', email: 'mlee@boeing.com', full_name: 'Michael Lee', invited_at: '2026-02-15T00:00:00Z' },
  { id: 'm4', org_id: 'org1', user_id: 'u4', role: 'viewer', email: 'achen@boeing.com', full_name: 'Alice Chen', invited_at: '2026-03-01T00:00:00Z' },
];

const ROLE_CONFIG: Record<OrgRole, { label: string; color: string; desc: string }> = {
  admin:    { label: 'Admin',    color: 'bg-red-900/40 border-red-700/40 text-red-400',       desc: 'Full access + manage members' },
  engineer: { label: 'Engineer', color: 'bg-cadblue-900/40 border-cadblue-700/40 text-cadblue-300', desc: 'Create/edit/generate' },
  reviewer: { label: 'Reviewer', color: 'bg-amber-900/40 border-amber-700/40 text-amber-400', desc: 'View + approve revisions' },
  viewer:   { label: 'Viewer',   color: 'bg-slate-800 border-slate-700 text-slate-400',        desc: 'Read only' },
};

const orgId = 'org1'; // Replace with real org from auth context

export default function OrgSettings() {
  const [members, setMembers] = useState<OrgMember[]>(IS_DEMO ? DEMO_MEMBERS : []);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('engineer');
  const [inviting, setInviting] = useState(false);
  const [itarEnabled, setItarEnabled] = useState(false);

  useEffect(() => {
    if (IS_DEMO) return;
    setLoading(true);
    fetchOrgMembers(orgId)
      .then((data: unknown) => { if (Array.isArray(data)) setMembers(data as OrgMember[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      if (!IS_DEMO) await inviteOrgMember(orgId, inviteEmail, inviteRole);
      setMembers(prev => [...prev, {
        id: `new-${Date.now()}`, org_id: orgId, user_id: `u-${Date.now()}`,
        role: inviteRole, email: inviteEmail, invited_at: new Date().toISOString(),
      }]);
      setInviteEmail('');
    } finally { setInviting(false); }
  };

  const handleRemove = async (userId: string) => {
    if (!IS_DEMO) await removeOrgMember(orgId, userId).catch(() => {});
    setMembers(prev => prev.filter(m => m.user_id !== userId));
  };

  const handleRoleChange = async (userId: string, newRole: OrgRole) => {
    if (!IS_DEMO) await updateOrgMemberRole(orgId, userId, newRole).catch(() => {});
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
  };

  return (
    <div className="min-h-screen bg-cadsurface-950 text-slate-200">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Building2 size={24} className="text-cadblue-400" />
          <div>
            <h1 className="text-xl font-bold">Organization Settings</h1>
            <p className="text-sm text-slate-500">Manage team access, RBAC, and ITAR compliance</p>
          </div>
        </div>

        {/* ITAR flag */}
        <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={16} className={itarEnabled ? 'text-amber-400' : 'text-slate-500'} />
              <div>
                <p className="text-sm font-medium text-slate-200">ITAR Restricted</p>
                <p className="text-xs text-slate-500">Restrict STEP/PDF exports to cleared personnel only</p>
              </div>
            </div>
            <button onClick={() => setItarEnabled(p => !p)}
              className={`relative w-10 h-5 rounded-full transition-colors ${itarEnabled ? 'bg-amber-600' : 'bg-cadsurface-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${itarEnabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {itarEnabled && (
            <div className="mt-3 flex items-center gap-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded-lg">
              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">ITAR mode active — all export attempts are logged. Only itar_cleared users can download STEP/PDF files.</p>
            </div>
          )}
        </div>

        {/* Team members */}
        <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-cadsurface-700">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-slate-400" />
              <span className="text-sm font-semibold">Team Members</span>
              {loading && <Loader2 size={12} className="animate-spin text-slate-500" />}
            </div>
            <span className="text-xs text-slate-500">{members.length} members</span>
          </div>

          {/* Invite row */}
          <div className="p-4 border-b border-cadsurface-700 bg-cadsurface-950/40">
            <div className="flex gap-2">
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="engineer@company.com"
                className="flex-1 text-sm bg-cadsurface-800 border border-cadsurface-700 focus:border-cadblue-500 rounded-lg px-3 py-2 outline-none text-slate-200" />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as OrgRole)}
                className="text-sm bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-2 py-2 text-slate-200">
                {(Object.keys(ROLE_CONFIG) as OrgRole[]).map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                ))}
              </select>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail}
                className="flex items-center gap-2 px-4 py-2 bg-cadblue-600 hover:bg-cadblue-500 text-white rounded-lg text-sm disabled:opacity-50">
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Invite
              </button>
            </div>
          </div>

          {/* Member list */}
          <div className="divide-y divide-cadsurface-700">
            {members.map(member => {
              const roleCfg = ROLE_CONFIG[member.role];
              return (
                <div key={member.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cadblue-800 flex items-center justify-center text-xs font-bold text-cadblue-200">
                      {(member.full_name || member.email || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{member.full_name ?? member.email}</p>
                      {member.email && member.full_name && <p className="text-xs text-slate-500">{member.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select value={member.role} onChange={e => handleRoleChange(member.user_id, e.target.value as OrgRole)}
                      className={`text-xs px-2 py-1 rounded border bg-transparent ${roleCfg.color}`}>
                      {(Object.keys(ROLE_CONFIG) as OrgRole[]).map(r => (
                        <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                      ))}
                    </select>
                    <button onClick={() => handleRemove(member.user_id)}
                      className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RBAC legend */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(Object.entries(ROLE_CONFIG) as [OrgRole, typeof ROLE_CONFIG[OrgRole]][]).map(([role, cfg]) => (
            <div key={role} className={`p-3 rounded-lg border ${cfg.color}`}>
              <p className="text-xs font-semibold">{cfg.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{cfg.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
