import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { env } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { RunProcessor } from '../automation/run-processor';
import { StorageService } from '../attachments/storage.service';
import { JOBS, QueueService } from '../queue/queue.service';

/** Đăng ký handler cho các job; dùng bởi worker.ts và chế độ inline của test. */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, (data: any, ctx: { isLastAttempt: boolean }) => Promise<unknown>>();

  constructor(
    private readonly queue: QueueService,
    private readonly runs: RunProcessor,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.handlers.set(JOBS.PROCESS_RUN, (d, c) => this.runs.handle(d, c));
    this.handlers.set(JOBS.CLEANUP, () => this.cleanup());
  }

  /** Cho phép module khác (test-cases) thêm handler. */
  register(name: string, handler: (data: any, ctx: { isLastAttempt: boolean }) => Promise<unknown>) {
    this.handlers.set(name, handler);
    if (this.queue.inline) this.queue.registerInline(name, handler);
  }

  onModuleInit() {
    if (this.queue.inline) for (const [n, h] of this.handlers) this.queue.registerInline(n, h);
  }

  /** Gọi từ worker.ts */
  async startWorker() {
    for (const [name, handler] of this.handlers) await this.queue.work(name as any, handler);
    await this.queue.schedule(JOBS.CLEANUP, '0 3 * * *');
    this.logger.log(`Worker đang chạy: ${[...this.handlers.keys()].join(', ')}`);
  }

  /** Xóa attachment `pending` quá 24 giờ và file của lần chạy cũ (giữ file đang gắn với bug). */
  async cleanup() {
    const stale = await this.prisma.attachment.findMany({ where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
    for (const a of stale) {
      await this.storage.delete(a.objectKey).catch(() => undefined);
      await this.prisma.attachment.delete({ where: { id: a.id } });
    }
    const cutoff = new Date(Date.now() - env.runRetentionDays * 86400_000);
    const old = await this.prisma.attachment.findMany({ where: { entity: 'automation_result', createdAt: { lt: cutoff } } });
    let removed = 0;
    for (const a of old) {
      // Còn bug nào dùng chung object thì giữ lại
      const inUse = await this.prisma.attachment.count({ where: { objectKey: a.objectKey, entity: 'issue' } });
      if (inUse > 0) continue;
      await this.storage.delete(a.objectKey).catch(() => undefined);
      await this.prisma.attachment.delete({ where: { id: a.id } });
      removed++;
    }
    this.logger.log(`Cleanup: ${stale.length} pending, ${removed} file run cũ`);
    return { stalePending: stale.length, oldRunFiles: removed };
  }
}
