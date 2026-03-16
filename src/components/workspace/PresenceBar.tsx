/**
 * PresenceBar — shows real-time collaborators in the current project.
 * Uses Supabase Realtime Presence channel via useRealtimeProject hook.
 */
import { Circle } from 'lucide-react';
import type { PresenceUser } from '../../hooks/useRealtimeProject';

const AVATAR_COLORS = [
  'bg-cadblue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-violet-600', 'bg-rose-600',
];

interface Props {
  users: PresenceUser[];
  currentUserId?: string;
}

export default function PresenceBar({ users, currentUserId }: Props) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-cadsurface-900/80 border border-cadsurface-700 rounded-lg backdrop-blur-sm">
      <div className="flex items-center gap-1">
        <Circle size={7} className="text-emerald-400 fill-emerald-400" />
        <span className="text-xs text-slate-500">Live</span>
      </div>
      <div className="flex -space-x-1.5">
        {users.slice(0, 5).map((user, i) => {
          const isMe = user.user_id === currentUserId;
          const initials = (user.name || '?').slice(0, 2).toUpperCase();
          return (
            <div
              key={user.user_id}
              title={isMe ? 'You' : user.name}
              className={`w-6 h-6 rounded-full border-2 border-cadsurface-900 flex items-center justify-center text-white font-bold ring-1 ${
                isMe ? 'ring-cadblue-400' : 'ring-transparent'
              } ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
              style={{ fontSize: '8px' }}
            >
              {initials}
            </div>
          );
        })}
        {users.length > 5 && (
          <div className="w-6 h-6 rounded-full border-2 border-cadsurface-900 bg-cadsurface-700 flex items-center justify-center text-slate-400" style={{ fontSize: '8px' }}>
            +{users.length - 5}
          </div>
        )}
      </div>
      <span className="text-xs text-slate-500">
        {users.length === 1 ? '1 person' : `${users.length} people`} online
      </span>
      {users.some(u => u.panel) && (
        <span className="text-xs text-slate-600 truncate max-w-[120px]">
          · {users.find(u => u.panel && u.user_id !== currentUserId)?.name} is in {users.find(u => u.panel && u.user_id !== currentUserId)?.panel}
        </span>
      )}
    </div>
  );
}
