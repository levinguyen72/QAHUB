import { Injectable } from '@nestjs/common';
import { API_KEY_PREFIX, ERROR_CODES } from '@ospm/shared';
import { createHash, randomBytes } from 'node:crypto';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { CreateApiKeyDto } from './api-keys.dto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** 32 byte ngẫu nhiên mã hóa base62. */
export function randomBase62(bytes = 32): string {
  let n = BigInt('0x' + randomBytes(bytes).toString('hex'));
  let out = '';
  const base = BigInt(62);
  while (n > 0n) {
    out = BASE62[Number(n % base)] + out;
    n /= base;
  }
  return out.padStart(43, '0');
}

export function keyStatus(k: { revokedAt: Date | null; expiresAt: Date | null }): 'active' | 'expired' | 'revoked' {
  if (k.revokedAt) return 'revoked';
  if (k.expiresAt && k.expiresAt <= new Date()) return 'expired';
  return 'active';
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  async list(projectId: bigint) {
    const keys = await this.prisma.apiKey.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, include: { creator: { select: { id: true, displayName: true } } } });
    return keys.map((k) => ({
      id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, expiresAt: k.expiresAt, lastUsedAt: k.lastUsedAt, lastUsedIp: k.lastUsedIp,
      createdAt: k.createdAt, createdBy: k.creator, revokedAt: k.revokedAt, status: keyStatus(k),
    }));
  }

  /** Chỉ lúc này mới trả key đầy đủ; DB chỉ giữ hash. */
  async create(projectId: bigint, dto: CreateApiKeyDto, actorId: bigint) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = API_KEY_PREFIX + randomBase62();
      const prefix = key.slice(0, 12);
      if (await this.prisma.apiKey.findUnique({ where: { prefix } })) continue;
      const row = await this.prisma.apiKey.create({
        data: {
          projectId, name: dto.name.trim(), prefix, keyHash: hashKey(key), scopes: dto.scopes?.length ? dto.scopes : ['runs:write'],
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, createdBy: actorId,
        },
      });
      await this.activity.log({ projectId, entity: 'api_key', entityId: row.id, action: 'created', actorId, changes: { name: [null, row.name] } });
      return { id: row.id, key, prefix, name: row.name, scopes: row.scopes, expiresAt: row.expiresAt };
    }
    throw new Error('Không sinh được prefix API key duy nhất');
  }

  async revoke(id: string, actorId: bigint) {
    const k = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!k) throw notFound(ERROR_CODES.API_KEY_NOT_FOUND, 'Không tìm thấy API key');
    if (k.revokedAt) return { id, status: 'revoked' };
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date(), revokedBy: actorId } });
    await this.activity.log({ projectId: k.projectId, entity: 'api_key', entityId: id, action: 'revoked', actorId });
    return { id, status: 'revoked' };
  }
}
