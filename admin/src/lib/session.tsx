'use client';

import { ApiError, createApi, type SessionUser } from '@karvia/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
export const api = createApi(API_URL);
export const STAFF = ['ADMIN', 'SUBADMIN', 'TELECALLER'];

interface Ctx {
  user: SessionUser | null;
  ready: boolean;
  can: (perm: string) => boolean;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}
const C = createContext<Ctx>({ user: null, ready: false, can: () => false, logout: async () => {}, reload: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const off = api.onSession(setUser);
    api
      .restore()
      .then(async (u) => {
        if (u && STAFF.includes(u.activeRole)) await api.reloadMe(); // pulls permissions + mfaPending
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => {
      off();
    };
  }, []);
  const can = useCallback((p: string) => !!user?.permissions?.includes(p), [user]);
  const logout = useCallback(async () => {
    await api.logout();
    router.replace('/login');
  }, [router]);
  const reload = useCallback(async () => {
    await api.reloadMe();
  }, []);
  const value = useMemo(() => ({ user, ready, can, logout, reload }), [user, ready, can, logout, reload]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useSession = () => useContext(C);

/** Staff only; staff without 2FA are sent to set it up before anything else. */
export function useStaff() {
  const s = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!s.ready) return;
    if (!s.user || !STAFF.includes(s.user.activeRole)) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (s.user.mfaPending && path !== '/mfa-setup') router.replace('/mfa-setup');
  }, [s.ready, s.user, router, path]);
  return s;
}

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
      if (n === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, 'Network error'));
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

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
