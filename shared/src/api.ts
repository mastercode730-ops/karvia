/**
 * Browser API client. The access token lives only in memory (never localStorage); the refresh token is an
 * httpOnly cookie the page cannot read. On 401 the client refreshes once and retries.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public issues?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export interface SessionUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  roles: string[];
  activeRole: string;
  status: string;
  mfaEnabled: boolean;
  termsAccepted: boolean;
  permissions?: string[];
  mfaPending?: boolean;
}

type Listener = (user: SessionUser | null) => void;

export function createApi(baseUrl: string) {
  let token: string | null = null;
  let user: SessionUser | null = null;
  let refreshing: Promise<boolean> | null = null;
  const listeners = new Set<Listener>();

  const setSession = (t: string | null, u: SessionUser | null) => {
    token = t;
    user = u;
    listeners.forEach((l) => l(u));
  };

  async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include' });
    if (res.status === 401 && retry && !path.startsWith('/auth/')) {
      if (await refresh()) return raw(path, init, false);
    }
    return res;
  }

  async function parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(res.status, body?.message ?? 'Something went wrong', body?.code, body?.issues);
    }
    return body as T;
  }

  async function refresh(): Promise<boolean> {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const res = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
          if (!res.ok) {
            setSession(null, null);
            return false;
          }
          const b = await res.json();
          setSession(b.accessToken, b.user);
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => (refreshing = null), 0);
        }
      })();
    }
    return refreshing;
  }

  const req = <T>(method: string, path: string, body?: unknown) =>
    raw(path, { method, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) }).then((r) => parse<T>(r));

  return {
    get: <T = any>(path: string) => req<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => req<T>('POST', path, body ?? {}),
    patch: <T = any>(path: string, body?: unknown) => req<T>('PATCH', path, body ?? {}),
    put: <T = any>(path: string, body?: unknown) => req<T>('PUT', path, body ?? {}),
    del: <T = any>(path: string) => req<T>('DELETE', path),
    upload: (kind: string, file: File) => {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      return req<{ id: string; url: string; mime: string; name: string | null }>('POST', '/files', fd);
    },
    /** Turns an API-relative file URL into an absolute one for <img src>. */
    fileUrl: (path: string | null | undefined) => (path ? `${baseUrl.replace(/\/api$/, '')}${path}` : ''),

    async requestOtp(phone: string) {
      return req<{ sent: boolean; resendAfterSec: number; devCode?: string }>('POST', '/auth/otp/request', { phone });
    },
    async verifyOtp(phone: string, code: string, role: string, name?: string) {
      const r = await req<any>('POST', '/auth/otp/verify', { phone, code, role, name });
      if (r.accessToken) setSession(r.accessToken, r.user);
      return r as { accessToken?: string; user?: SessionUser; mfaRequired?: boolean; mfaToken?: string };
    },
    async verifyMfa(mfaToken: string, code: string) {
      const r = await req<any>('POST', '/auth/mfa/verify', { mfaToken, code });
      setSession(r.accessToken, r.user);
      return r;
    },
    async logout() {
      await fetch(`${baseUrl}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
      setSession(null, null);
    },
    /** Restores the session from the refresh cookie on page load. */
    async restore(): Promise<SessionUser | null> {
      if (user) return user;
      return (await refresh()) ? user : null;
    },
    async reloadMe() {
      const me = await req<SessionUser>('GET', '/auth/me');
      setSession(token, me);
      return me;
    },
    get user() {
      return user;
    },
    get token() {
      return token;
    },
    onSession(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type Api = ReturnType<typeof createApi>;
