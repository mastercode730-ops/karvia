import { io, Socket } from 'socket.io-client';

/**
 * One authenticated socket per tab; reconnects with the latest access token.
 * `socketUrl` is the backend origin (e.g. https://karvia-api.onrender.com), or '' for the same origin.
 */
export function connectRealtime(socketUrl: string, getToken: () => string | null): Socket {
  return io(socketUrl || undefined, {
    path: '/api/socket.io',
    transports: ['websocket'],
    auth: (cb) => cb({ token: getToken() }),
    reconnectionDelay: 2000,
  });
}
