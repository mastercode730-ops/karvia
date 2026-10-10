'use client';

import { ApiError, connectRealtime, createApi, type SessionUser } from '@karvia/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const api = createApi(API_URL);

interface SessionCtx {
  user: SessionUser | null;
  ready: boolean;
  socket: Socket | null;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>({ user: null, ready: false, socket: null, refreshUser: async () => {}, logout: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const router = useRouter();

  useEffect(() => {
    const off = api.onSession(setUser);
    api.restore().finally(() => setReady(true));
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const s = connectRealtime(API_URL, () => api.token);
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id, user?.activeRole]);

  const refreshUser = useCallback(async () => {
    await api.reloadMe();
  }, []);
  const logout = useCallback(async () => {
    await api.logout();
    router.push('/');
  }, [router]);

  const value = useMemo(() => ({ user, ready, socket, refreshUser, logout }), [user, ready, socket, refreshUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** Sends visitors who are not logged in (or logged in with another role) to the login page. */
export function useRequireRole(role: 'CLIENT' | 'WORKER') {
  const { user, ready } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!ready) return;
    if (!user || user.activeRole !== role) router.replace(`/login?as=${role.toLowerCase()}&next=${encodeURIComponent(path)}`);
  }, [ready, user, role, router, path]);
  return { user: user?.activeRole === role ? user : null, ready };
}

/** Small data hook: loads on mount and when deps change; exposes reload and error. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await api.get<T>(path);
      if (n === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, 'Network error. Check your connection.'));
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Re-runs `fn` whenever any of the given realtime events arrives. */
export function useLive(events: string[], fn: (payload: any) => void) {
  const { socket } = useSession();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!socket) return;
    const h = (p: any) => ref.current(p);
    events.forEach((e) => socket.on(e, h));
    return () => {
      events.forEach((e) => socket.off(e, h));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, events.join()]);
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
