import { useCallback, useState } from 'react';
import type { Op } from '../core';
import { useApp } from './store';

/** Applies ops as one undo step and keeps the refusal message (if any) for the panel to show. */
export function useRun() {
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback((ops: Op[], label: string) => {
    const r = useApp.getState().apply(ops, label);
    setMessage(r.ok ? null : (r.results.find((x) => !x.ok)?.message ?? 'Not possible'));
    return r.ok;
  }, []);
  return { run, message, setMessage };
}
