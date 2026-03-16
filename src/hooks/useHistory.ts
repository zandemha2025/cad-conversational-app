/**
 * Generic undo/redo history stack.
 * Usage:
 *   const { state, set, undo, redo, canUndo, canRedo } = useHistory(initialState);
 */
import { useState, useCallback } from 'react';

const MAX_HISTORY = 50;

export function useHistory<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback((newState: T) => {
    setPast(p => [...p.slice(-MAX_HISTORY), present]);
    setPresent(newState);
    setFuture([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [present, ...f]);
    setPresent(previous);
  }, [past, present]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setPast(p => [...p, present]);
    setPresent(next);
  }, [future, present]);

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
