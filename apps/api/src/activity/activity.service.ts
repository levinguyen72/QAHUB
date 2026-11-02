import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';

export interface ActivityInput {
  projectId?: bigint | null;
  entity: 'issue' | 'sprint' | 'project' | 'workflow' | 'api_key' | 'test_case' | 'requirement';
  entityId: string | bigint | number;
  action: string;
  changes?: Record<string, unknown> | null;
  actorId?: bigint | null;
  actorApiKeyId?: string | null;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi nhật ký; truyền `tx` để nằm trong cùng transaction với thay đổi dữ liệu (mục 4). */
  async log(input: ActivityInput, tx: Tx | PrismaService = this.prisma) {
    return tx.activityLog.create({
      data: {
        projectId: input.projectId ?? null,
        entity: input.entity,
        entityId: String(input.entityId),
        action: input.action,
        changes: (input.changes ?? undefined) as any,
        actorId: input.actorId ?? null,
        actorApiKeyId: input.actorApiKeyId ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [ActivityService], exports: [ActivityService] })
export class ActivityModule {}
