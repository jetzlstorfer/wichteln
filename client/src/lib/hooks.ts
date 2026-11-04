import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

/** Loads data, keeps it fresh while the page is visible and exposes a manual reload. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const result = await loadRef.current();
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      // Keep showing stale data on transient errors during background refreshes.
      setError({ status, message: errorMessage(err) });
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setData(null);
    setError(null);
    void reload(false);
  }, [reload]);

  useEffect(() => {
    if (!pollMs) return;
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, pollMs);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs, reload]);

  return { data, setData, error, loading, reload };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Wichteln mit dem Christkind` : 'Wichteln mit dem Christkind';
  }, [title]);
}
