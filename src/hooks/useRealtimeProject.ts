/**
 * Supabase Realtime subscription for a project.
 * Watches touchpoints, conversation_messages, and fixture_geometries tables
 * and fires callbacks on changes.
 *
 * NOTE: Realtime Postgres CDC requires an authenticated Supabase session with
 * RLS policies. Without it, the WebSocket floods the browser console with 401
 * errors. Workspace.tsx uses polling as a fallback — Realtime only activates
 * when a valid session token is found in localStorage.
 */
import { useEffect, useRef } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface RealtimeCallbacks {
  onTouchpointChange?: (payload: unknown) => void;
  onFixtureGenerated?: (payload: unknown) => void;
  onNewMessage?: (payload: unknown) => void;
  onPresenceChange?: (users: PresenceUser[]) => void;
  onCommentChange?: (payload: unknown) => void;
}

export interface PresenceUser {
  user_id: string;
  name: string;
  panel?: string;
  updated_at: string;
}

export function useRealtimeProject(
  projectId: string | undefined,
  callbacks: RealtimeCallbacks,
  currentUserId?: string,
) {
  const channelRef = useRef<unknown>(null);

  useEffect(() => {
    if (!projectId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    // Only connect Realtime if a Supabase-compatible access token exists.
    // The custom backend JWT (scalecad_token) is NOT recognized by Supabase
    // Realtime and causes WebSocket auth failures. Only use sb-access-token
    // which is set by Supabase Auth sign-in. Polling covers the same
    // functionality when Realtime is not available.
    const token = typeof localStorage !== 'undefined'
      ? localStorage.getItem('sb-access-token')
      : null;
    if (!token) return;

    let cleanup = () => {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('@supabase/supabase-js').then(({ createClient }: any) => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        realtime: { params: { eventsPerSecond: 10 } },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel = (supabase as any).channel(`project:${projectId}`, {
        config: { presence: { key: currentUserId ?? 'anon' } },
      });

      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'touchpoints', filter: `project_id=eq.${projectId}` },
          (payload: unknown) => callbacks.onTouchpointChange?.(payload))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fixture_geometries', filter: `project_id=eq.${projectId}` },
          (payload: unknown) => callbacks.onFixtureGenerated?.(payload))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `project_id=eq.${projectId}` },
          (payload: unknown) => callbacks.onNewMessage?.(payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_comments', filter: `project_id=eq.${projectId}` },
          (payload: unknown) => callbacks.onCommentChange?.(payload));

      channel.on('presence', { event: 'sync' }, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (channel as any).presenceState() as Record<string, PresenceUser[]>;
        callbacks.onPresenceChange?.(Object.values(state).flat());
      });

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && currentUserId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (channel as any).track({ user_id: currentUserId, name: 'You', updated_at: new Date().toISOString() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Silently remove channel on auth failure — polling covers the features
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          try { (supabase as any).removeChannel(channel); } catch (_) { /* ignore */ }
          cleanup = () => {};
        }
      });

      channelRef.current = channel;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cleanup = () => { try { (supabase as any).removeChannel(channel); } catch (_) { /* ignore */ } };
    }).catch(() => {});

    return () => cleanup();
  }, [projectId, currentUserId]);
}
