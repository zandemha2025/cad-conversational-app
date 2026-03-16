/**
 * Supabase Realtime subscription for a project.
 * Watches touchpoints, conversation_messages, and fixture_geometries tables
 * and fires callbacks on changes.
 *
 * In demo mode or when Supabase is not configured, this is a no-op.
 */
import { useEffect, useRef } from 'react';
import { IS_DEMO } from '../lib/api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface RealtimeCallbacks {
  onTouchpointChange?: (payload: unknown) => void;
  onFixtureGenerated?: (payload: unknown) => void;
  onNewMessage?: (payload: unknown) => void;
  onPresenceChange?: (users: PresenceUser[]) => void;
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
    if (!projectId || IS_DEMO || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    // Dynamically import supabase-js to avoid bundling it when not needed
    let cleanup = () => {};

    import('@supabase/supabase-js').then(({ createClient }) => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      const channel = supabase.channel(`project:${projectId}`, {
        config: { presence: { key: currentUserId ?? 'anon' } },
      });

      // ── Postgres CDC changes ──────────────────────────────────────────────
      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'touchpoints',
          filter: `project_id=eq.${projectId}`,
        }, (payload) => callbacks.onTouchpointChange?.(payload))
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'fixture_geometries',
          filter: `project_id=eq.${projectId}`,
        }, (payload) => callbacks.onFixtureGenerated?.(payload))
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `project_id=eq.${projectId}`,
        }, (payload) => callbacks.onNewMessage?.(payload));

      // ── Presence ──────────────────────────────────────────────────────────
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, PresenceUser[]>;
        const users = Object.values(state).flat();
        callbacks.onPresenceChange?.(users);
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && currentUserId) {
          channel.track({
            user_id: currentUserId,
            name: 'You',
            updated_at: new Date().toISOString(),
          });
        }
      });

      channelRef.current = channel;

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    }).catch(() => {
      // @supabase/supabase-js not installed — silently skip
    });

    return () => cleanup();
  }, [projectId, currentUserId]);
}
