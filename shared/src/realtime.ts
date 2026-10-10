import { io, Socket } from 'socket.io-client';

/** One authenticated socket per tab; reconnects with the latest access token. */
export function connectRealtime(apiBaseUrl: string, getToken: () => string | null): Socket {
  const origin = apiBaseUrl.replace(/\/api$/, '');
  return io(origin, {
    path: '/api/socket.io',
    transports: ['websocket'],
    auth: (cb) => cb({ token: getToken() }),
    reconnectionDelay: 2000,
  });
}
