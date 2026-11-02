import { BadRequestException, Controller, Get, Param, Put, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ERROR_CODES, MAX_ATTACHMENT_BYTES } from '@ospm/shared';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rename, stat, unlink } from 'fs/promises';
import { dirname } from 'path';
import { Public } from '../common/decorators';
import { notFound } from '../common/errors';
import { verifyBlobToken } from './blob-token';
import { LocalStorageService, StorageService } from './storage.service';

/**
 * Điểm cuối nhận/trả file cho kho local (thay cho endpoint presigned của S3/MinIO).
 * Public: tự xác thực bằng token HMAC trong URL. Chỉ hoạt động khi STORAGE_DRIVER=local.
 */
@ApiExcludeController()
@Controller('blob')
export class BlobController {
  constructor(private readonly storage: StorageService) {}

  private local(): LocalStorageService {
    if (!(this.storage instanceof LocalStorageService)) throw notFound(ERROR_CODES.NOT_FOUND, 'Kho local không bật');
    return this.storage;
  }

  @Public()
  @Put(':token')
  async put(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const claims = verifyBlobToken(token, 'put');
    if (!claims) throw new BadRequestException('Link upload không hợp lệ hoặc đã hết hạn');
    const dest = this.local().resolveKey(claims.k);
    await mkdir(dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomUUID()}.part`;

    await new Promise<void>((resolveP, rejectP) => {
      let size = 0;
      let aborted = false;
      const out = createWriteStream(tmp);
      const fail = (err: Error) => {
        if (aborted) return;
        aborted = true;
        out.destroy();
        unlink(tmp).catch(() => {});
        rejectP(err);
      };
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_ATTACHMENT_BYTES) fail(new BadRequestException('File vượt quá 200 MB'));
      });
      req.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => !aborted && resolveP());
      req.pipe(out);
    });
    await rename(tmp, dest);
    res.status(200).json({ ok: true });
  }

  @Public()
  @Get(':token')
  async get(@Param('token') token: string, @Res() res: Response) {
    const claims = verifyBlobToken(token, 'get');
    if (!claims) throw new BadRequestException('Link tải không hợp lệ hoặc đã hết hạn');
    const path = this.local().resolveKey(claims.k);
    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      throw notFound(ERROR_CODES.ATTACHMENT_NOT_FOUND, 'Không tìm thấy file');
    }
    res.setHeader('Content-Type', claims.ct || 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // Cho phép trang web ở origin khác (vd web dev :5173) nhúng ảnh/video — helmet mặc định chặn same-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (claims.fn) res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(claims.fn)}`);
    createReadStream(path).pipe(res);
  }
}
