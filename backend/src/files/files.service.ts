import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FileKind, FileObject } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuditService } from '../common/audit.service';
import { AuthUser, STAFF_ROLES } from '../common/auth.types';
import { hmac, randomToken, safeEqual } from '../common/util';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const LINK_TTL_SEC = 300;

/** Real file type from the first bytes. The browser-sent content type is never trusted. */
export function sniffMime(buf: Buffer): string | null {
  const h = buf.subarray(0, 12);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (h.subarray(0, 4).toString('ascii') === 'RIFF' && h.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (h.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (h.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (h.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'audio/webm';
  if (h.subarray(0, 3).toString('ascii') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

const ALLOWED: Record<FileKind, string[]> = {
  PROFILE_PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  WORK_PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  DOCUMENT: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  REQUEST_MEDIA: ['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/webm', 'audio/mpeg', 'video/mp4'],
  EVIDENCE: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4'],
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mpeg': 'mp3',
};

/**
 * Private file storage on local disk (swap for S3 with the same interface in production).
 * Files are never served directly: callers get a short-lived signed link after an access check.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  private root() {
    return path.resolve(env().STORAGE_DIR);
  }

  async save(owner: AuthUser, kind: FileKind, buf: Buffer, originalName?: string): Promise<FileObject> {
    if (!buf?.length) throw new BadRequestException('Choose a file to upload');
    if (buf.length > MAX_FILE_BYTES) throw new BadRequestException('File is larger than 10 MB');
    const mime = sniffMime(buf);
    if (!mime || !ALLOWED[kind].includes(mime)) throw new BadRequestException('This file type is not allowed here');
    const key = `${kind.toLowerCase()}/${randomToken(18)}.${EXT[mime]}`;
    const full = path.join(this.root(), key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf, { mode: 0o600 });
    return this.prisma.fileObject.create({
      data: { ownerId: owner.id, kind, key, mime, size: buf.length, name: originalName?.replace(/[^\w.\- ]/g, '').slice(0, 120) || null },
    });
  }

  /** Throws unless this user may see this file. Document views by staff are audited. */
  async assertCanRead(user: AuthUser, file: FileObject) {
    if (file.ownerId === user.id) return;
    const staff = STAFF_ROLES.includes(user.role);
    const can = (p: string) => user.permissions.includes(p as any);

    switch (file.kind) {
      case 'PROFILE_PHOTO':
      case 'WORK_PHOTO':
        if (staff) return;
        if (user.role === 'CLIENT' && (await this.subs.hasClientAccess(user.id))) return;
        if (user.role === 'WORKER') return; // workers may see other workers' public photos (e.g. in shared views)
        break;
      case 'DOCUMENT':
        if (staff && can('documents.view')) {
          await this.audit.log(user, { action: 'document.view', entityType: 'File', entityId: file.id });
          return;
        }
        break;
      case 'REQUEST_MEDIA': {
        if (staff && can('bookings.view')) return;
        if (user.role === 'WORKER') {
          const offer = await this.prisma.requestOffer.findFirst({
            where: { workerId: user.id, request: { mediaFileIds: { has: file.id } } },
          });
          if (offer) return;
        }
        break;
      }
      case 'EVIDENCE':
        if (staff && can('complaints.view')) return;
        break;
    }
    throw new ForbiddenException('You cannot view this file');
  }

  async signedUrl(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    await this.assertCanRead(user, file);
    return { url: this.sign(file.id), expiresInSec: LINK_TTL_SEC };
  }

  /** Signs without an access check; only call after authorising the viewer yourself. */
  sign(fileId: string) {
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
    const sig = hmac(env().FILE_URL_SECRET, `${fileId}.${exp}`);
    return `/api/files/raw/${fileId}?exp=${exp}&sig=${sig}`;
  }

  async openSigned(fileId: string, exp: string, sig: string) {
    const e = Number(exp);
    if (!e || e < Date.now() / 1000 || !sig || !safeEqual(sig, hmac(env().FILE_URL_SECRET, `${fileId}.${e}`))) {
      throw new ForbiddenException('This link has expired');
    }
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    const full = path.join(this.root(), file.key);
    if (!full.startsWith(this.root() + path.sep)) throw new ForbiddenException();
    return { file, data: await fs.readFile(full) };
  }

  async ownedBy(userId: string, ids: string[], kinds: FileKind[]) {
    if (!ids.length) return;
    const n = await this.prisma.fileObject.count({ where: { id: { in: ids }, ownerId: userId, kind: { in: kinds } } });
    if (n !== new Set(ids).size) throw new BadRequestException('One or more attached files are invalid');
  }
}
