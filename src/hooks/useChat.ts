/**
 * useChat — WebSocket hook for the ForgeAI chat panel.
 *
 * Falls back to smart keyword-matched fixture responses in DEMO MODE.
 *
 * Protocol:
 *   → { type: "auth", token: "..." }
 *   ← { type: "auth_ok" }
 *   → { type: "message", content: "...", attachments: [] }
 *   ← { type: "thinking", intent: "..." }
 *   ← { type: "chunk", content: "..." }   (streamed)
 *   ← { type: "done", intent: "...", job_id: null|"..." }
 *   ← { type: "generation_queued", job_id: "..." }
 *   ← { type: "error", detail: "..." }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL, getToken } from '../lib/api';
import type { ChatMessage } from '../types';
import type { ComponentSuggestion } from '../lib/api';

interface UseChatOptions {
  projectId: string | undefined;
  initialMessages?: ChatMessage[];
  onGenerationQueued?: () => void;
}

interface GenerationJob {
  jobId: string;
  message: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat({ projectId, initialMessages = [], onGenerationQueued }: UseChatOptions) {
  const [messages, setMessages]         = useState<ChatMessage[]>(initialMessages);
  const [isThinking, setIsThinking]     = useState(false);
  const [isConnected, setIsConnected]   = useState(false);
  const [activeGenJob, setActiveGenJob] = useState<GenerationJob | null>(null);
  const [componentSuggestions, setComponentSuggestions] = useState<ComponentSuggestion[]>([]);

  const wsRef          = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (!projectId || !WS_URL) return;

    const url = `${WS_URL}/api/projects/${projectId}/chat`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getToken() || 'demo';
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data) as Record<string, unknown>;

      if (msg.type === 'auth_ok') { setIsConnected(true); return; }

      if (msg.type === 'thinking') {
        setIsThinking(true);
        streamingIdRef.current = null;
        return;
      }

      if (msg.type === 'chunk') {
        const chunk = msg.content as string;
        setMessages(prev => {
          if (!streamingIdRef.current) {
            const id = `stream_${Date.now()}`;
            streamingIdRef.current = id;
            return [...prev, {
              id, role: 'assistant' as const, content: chunk,
              timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            }];
          }
          return prev.map(m => m.id === streamingIdRef.current ? { ...m, content: m.content + chunk } : m);
        });
        return;
      }

      if (msg.type === 'done') {
        setIsThinking(false);
        streamingIdRef.current = null;
        return;
      }

      if (msg.type === 'generation_queued') {
        setActiveGenJob({ jobId: msg.job_id as string, message: msg.message as string });
        onGenerationQueued?.();
        return;
      }

      if (msg.type === 'component_suggestions') {
        setComponentSuggestions(msg.suggestions as ComponentSuggestion[]);
        return;
      }

      if (msg.type === 'error') {
        setIsThinking(false);
        streamingIdRef.current = null;
        setMessages(prev => [...prev, {
          id: `err_${Date.now()}`, role: 'system' as const,
          content: `⚠ ${msg.detail}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        }]);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  const sendMessage = useCallback((content: string, attachments: unknown[] = []) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content, timestamp: ts };
    setMessages(prev => [...prev, userMsg]);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`, role: 'system' as const,
        content: 'Not connected to backend. Please wait for reconnection.',
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      }]);
      return;
    }

    setIsThinking(true);
    wsRef.current.send(JSON.stringify({ type: 'message', content, attachments }));
  }, []);

  const clearGenJob = useCallback(() => setActiveGenJob(null), []);

  return { messages, isThinking, isConnected, activeGenJob, sendMessage, setMessages, clearGenJob, componentSuggestions };
}
