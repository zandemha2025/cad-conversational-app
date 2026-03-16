/**
 * Polls a backend job every 2 seconds until it completes or errors.
 * In demo mode (no API_URL), resolves immediately with a fake "done" status.
 */
import { useState, useEffect, useRef } from 'react';
import { getJobStatus, IS_DEMO } from '../lib/api';

export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export interface JobPollState {
  status: JobStatus;
  result: unknown;
  downloadUrl: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 2000;

export function useJobPoll(projectId: string | null, jobId: string | null) {
  const [state, setState] = useState<JobPollState>({
    status: 'idle',
    result: null,
    downloadUrl: null,
    error: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId || !projectId) {
      setState({ status: 'idle', result: null, downloadUrl: null, error: null });
      return;
    }

    setState(s => ({ ...s, status: 'queued' }));

    if (IS_DEMO) {
      // Simulate processing delay
      const t = setTimeout(() => {
        setState({ status: 'done', result: null, downloadUrl: null, error: null });
      }, 1500);
      return () => clearTimeout(t);
    }

    const poll = async () => {
      const res = await getJobStatus(projectId, jobId);
      if (!res) return;
      if (res.status === 'done' || res.status === 'completed') {
        setState({
          status: 'done',
          result: res.result ?? null,
          downloadUrl: res.download_url ?? null,
          error: null,
        });
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (res.status === 'failed' || res.status === 'error') {
        setState({ status: 'failed', result: null, downloadUrl: null, error: 'Job failed' });
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setState(s => ({ ...s, status: 'running' }));
      }
    };

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [projectId, jobId]);

  return state;
}
