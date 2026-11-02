import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { env } from '../common/config';
import { makeBlobToken } from './blob-token';

/** Lớp mỏng quanh S3/MinIO. Test thay bằng bản giả (xem test/helpers.ts). */
export abstract class StorageService {
  abstract presignPut(key: string, mimeType: string, expiresSec?: number): Promise<string>;
  abstract presignGet(key: string, fileName?: string, expiresSec?: number, mimeType?: string): Promise<string>;
  abstract head(key: string): Promise<{ size: number } | null>;
  abstract delete(key: string): Promise<void>;
  abstract putObject(key: string, body: Buffer, mimeType: string): Promise<void>;
  abstract getObject(key: string): Promise<Buffer>;
}

@Injectable()
export class S3StorageService extends StorageService {
  // Client để gọi MinIO từ server; client khác ký URL theo endpoint công khai mà trình duyệt/CI truy cập được.
  private readonly internal = new S3Client({
    region: 'us-east-1', endpoint: env.s3Endpoint, forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });
  private readonly signer = new S3Client({
    region: 'us-east-1', endpoint: env.s3PublicEndpoint, forcePathStyle: true,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  });

  presignPut(key: string, mimeType: string, expiresSec = 3600) {
    return getSignedUrl(this.signer, new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, ContentType: mimeType }), { expiresIn: expiresSec });
  }

  presignGet(key: string, fileName?: string, expiresSec = 3600, mimeType?: string) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: env.s3Bucket, Key: key,
        ...(mimeType ? { ResponseContentType: mimeType } : {}),
        ...(fileName ? { ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } : {}),
      }),
      { expiresIn: expiresSec },
    );
  }

  async head(key: string) {
    try {
      const r = await this.internal.send(new HeadObjectCommand({ Bucket: env.s3Bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0) };
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
      throw e;
    }
  }

  async delete(key: string) {
    await this.internal.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  }

  async putObject(key: string, body: Buffer, mimeType: string) {
    await this.internal.send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: body, ContentType: mimeType }));
  }

  async getObject(key: string): Promise<Buffer> {
    const r = await this.internal.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
}

/**
 * Lưu file trên đĩa thay cho S3/MinIO. Link upload/download là URL đã ký HMAC
 * trỏ về BlobController (`/api/v1/blob/*`) nên client PUT/GET y hệt luồng presigned.
 * Hợp cho chạy local và deploy VPS: chỉ cần một thư mục/volume cố định (STORAGE_DIR).
 */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly root = resolve(env.storageDir);

  /** Chặn path traversal: objectKey chỉ được nằm trong thư mục gốc. */
  resolveKey(key: string): string {
    const p = resolve(this.root, key);
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return p;
  }

  private link(token: string) {
    return `${env.storagePublicUrl}/api/v1/blob/${token}`;
  }

  async presignPut(key: string, mimeType: string, expiresSec = 3600) {
    return this.link(makeBlobToken({ k: key, op: 'put', ct: mimeType, exp: Math.floor(Date.now() / 1000) + expiresSec }));
  }

  async presignGet(key: string, fileName?: string, expiresSec = 3600, mimeType?: string) {
    return this.link(makeBlobToken({ k: key, op: 'get', fn: fileName, ct: mimeType, exp: Math.floor(Date.now() / 1000) + expiresSec }));
  }

  async head(key: string) {
    try {
      const s = await stat(this.resolveKey(key));
      return { size: s.size };
    } catch (e: any) {
      if (e?.code === 'ENOENT') return null;
      throw e;
    }
  }

  async delete(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }

  async putObject(key: string, body: Buffer) {
    const p = this.resolveKey(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }
}
