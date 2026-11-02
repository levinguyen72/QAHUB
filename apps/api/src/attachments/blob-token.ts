import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../common/config';

/**
 * Token ký HMAC cho link upload/download của kho local — thay cho presigned URL của S3.
 * Payload gọn (base64url JSON) + chữ ký, tự xác thực nên client PUT/GET không cần JWT.
 */
export interface BlobClaims {
  k: string; // objectKey
  op: 'put' | 'get';
  exp: number; // epoch giây
  ct?: string; // content-type (put)
  fn?: string; // tên file gợi ý khi tải (get)
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const sign = (data: string) => b64url(createHmac('sha256', env.storageSecret).update(data).digest());

export function makeBlobToken(claims: BlobClaims): string {
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  return `${body}.${sign(body)}`;
}

/** Trả về claims nếu hợp lệ & chưa hết hạn, ngược lại null. */
export function verifyBlobToken(token: string, op: BlobClaims['op']): BlobClaims | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: BlobClaims;
  try {
    claims = JSON.parse(unb64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (claims.op !== op) return null;
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  return claims;
}
