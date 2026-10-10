import { Global, Logger, Module } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { resolveAuthUser, verifyAccessToken } from '../common/auth.guard';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Pushes live events (new offers, request/booking updates, notifications) to a user's private room. */
@WebSocketGateway({
  path: '/api/socket.io',
  cors: { origin: () => env().CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private log = new Logger('Realtime');

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('no token');
      const user = await resolveAuthUser(this.prisma, verifyAccessToken(token));
      await client.join(`user:${user.id}`);
      client.data.userId = user.id;
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const id of userIds) this.emitToUser(id, event, payload);
  }
}

@Global()
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
