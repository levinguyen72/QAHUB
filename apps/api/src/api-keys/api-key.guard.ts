import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope, ERROR_CODES } from '@ospm/shared';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { hashKey } from './api-keys.service';

export const API_KEY_SCOPE = 'apiKeyScope';
export const RequireScope = (scope: ApiKeyScope) => SetMetadata(API_KEY_SCOPE, scope);

export interface ApiKeyPrincipal {
  id: string;
  name: string;
  projectId: bigint;
  projectKey: string;
  scopes: string[];
}

/** Xác thực máy: Authorization: Bearer <key>. Gắn `req.apiKey` cho các handler /ingest/*. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw new AppException(401, ERROR_CODES.API_KEY_INVALID, 'Thiếu API key (Authorization: Bearer <key>)');

    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashKey(token) }, include: { project: { select: { id: true, key: true, deletedAt: true } } } });
    if (!key || key.project.deletedAt) throw new AppException(401, ERROR_CODES.API_KEY_INVALID, 'API key không hợp lệ');
    if (key.revokedAt) throw new AppException(401, ERROR_CODES.API_KEY_REVOKED, 'API key đã bị thu hồi');
    if (key.expiresAt && key.expiresAt <= new Date()) throw new AppException(401, ERROR_CODES.API_KEY_EXPIRED, 'API key đã hết hạn');

    const scope = this.reflector.getAllAndOverride<string>(API_KEY_SCOPE, [ctx.getHandler(), ctx.getClass()]);
    if (scope && !key.scopes.includes(scope)) throw new AppException(403, ERROR_CODES.API_KEY_SCOPE, `API key thiếu scope ${scope}`);

    // Ghi last_used tối đa mỗi phút một lần
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? '').replace('::ffff:', '').trim();
      await this.prisma.$executeRaw`UPDATE api_keys SET last_used_at = now(), last_used_ip = ${ip || null}::inet WHERE id = ${key.id}::uuid`.catch(() => undefined);
    }
    req.apiKey = { id: key.id, name: key.name, projectId: key.projectId, projectKey: key.project.key, scopes: key.scopes } satisfies ApiKeyPrincipal;
    return true;
  }
}
