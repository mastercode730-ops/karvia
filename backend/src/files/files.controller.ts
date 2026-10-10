import { Body, Controller, Get, Global, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { FileKind } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Public } from '../common/decorators';
import { Z } from '../common/zod.pipe';
import { FilesService, MAX_FILE_BYTES } from './files.service';

const UploadBody = z.object({ kind: z.nativeEnum(FileKind) });

@Controller('files')
class FilesController {
  constructor(private readonly files: FilesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 } }))
  async upload(@CurrentUser() me: AuthUser, @UploadedFile() file: Express.Multer.File, @Body(Z(UploadBody)) body: z.infer<typeof UploadBody>) {
    const f = await this.files.save(me, body.kind, file?.buffer, file?.originalname);
    return { id: f.id, kind: f.kind, mime: f.mime, size: f.size, name: f.name, url: this.files.sign(f.id) };
  }

  @Get(':id/url')
  url(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.files.signedUrl(me, id);
  }

  @Public()
  @Get('raw/:id')
  async raw(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const { file, data } = await this.files.openSigned(id, exp, sig);
    res.set({
      'Content-Type': file.mime,
      'Content-Length': String(data.length),
      'Content-Disposition': file.mime === 'application/pdf' ? 'inline; filename="document.pdf"' : 'inline',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(data);
  }
}

@Global()
@Module({ controllers: [FilesController], providers: [FilesService], exports: [FilesService] })
export class FilesModule {}
