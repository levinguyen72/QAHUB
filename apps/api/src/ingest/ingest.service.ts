import { Injectable } from '@nestjs/common';
import { ERROR_CODES, MAX_ATTACHMENT_BYTES } from '@ospm/shared';
import { Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AppException, notFound, unprocessable } from '../common/errors';
import { env } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { safeName } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { ApiKeyPrincipal } from '../api-keys/api-key.guard';
import { JOBS, QueueService } from '../queue/queue.service';
import { IngestRunDto } from './ingest.dto';

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly activity: ActivityService,
  ) {}

  ping(key: ApiKeyPrincipal) {
    return { projectKey: key.projectKey, keyName: key.name, scopes: key.scopes };
  }

  /** Presigned URL cho các attachment còn `pending` của một run (dùng lúc tạo mới và lúc gửi lại cùng externalId). */
  private async pendingUploads(runId: bigint) {
    const rows = await this.prisma.attachment.findMany({
      where: { status: 'pending', entity: 'automation_result', entityId: { in: (await this.prisma.automationResult.findMany({ where: { runId }, select: { id: true } })).map((r) => r.id) } },
    });
    return Promise.all(
      rows.map(async (a) => ({
        ref: unb64(a.objectKey.split('/').at(-2)!),
        attachmentId: a.id,
        uploadUrl: await this.storage.presignPut(a.objectKey, a.mimeType),
      })),
    );
  }

  async createRun(key: ApiKeyPrincipal, dto: IngestRunDto) {
    if (dto.results.length > env.ingestMaxResults) {
      throw new AppException(413, ERROR_CODES.RUN_TOO_LARGE, `Một lần chạy tối đa ${env.ingestMaxResults} kết quả`);
    }
    for (const r of dto.results) for (const a of r.attachments ?? []) {
      if (a.size > MAX_ATTACHMENT_BYTES) throw unprocessable(ERROR_CODES.ATTACHMENT_TOO_LARGE, `File ${a.fileName} vượt quá 200 MB`);
    }
    const existing = await this.prisma.automationRun.findUnique({ where: { projectId_externalId: { projectId: key.projectId, externalId: dto.externalId } } });
    if (existing) return { http: 200, body: await this.existingResponse(existing) };

    try {
      const run = await this.prisma.$transaction(async (tx) => {
        const results = dto.results.map((r) => ({ ...r, status: (r.status === 'passed' && (r.retries ?? 0) > 0 ? 'flaky' : r.status) as string }));
        const count = (s: string) => results.filter((r) => r.status === s).length;
        const created = await tx.automationRun.create({
          data: {
            projectId: key.projectId, externalId: dto.externalId, name: dto.name, branch: dto.branch, commitSha: dto.commitSha,
            environment: dto.environment, ciUrl: dto.ciUrl, startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
            finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : null, apiKeyId: key.id,
            durationMs: dto.startedAt && dto.finishedAt ? BigInt(new Date(dto.finishedAt).getTime() - new Date(dto.startedAt).getTime()) : null,
            total: results.length, passed: count('passed'), failed: results.filter((r) => ['failed', 'timedOut', 'interrupted'].includes(r.status)).length,
            flaky: count('flaky'), skipped: count('skipped'),
          },
        });
        const rows = await tx.automationResult.createManyAndReturn({
          data: results.map((r) => ({
            runId: created.id, testId: r.testId, file: r.file, line: r.line ?? null, titlePath: r.titlePath, browser: r.browser ?? null,
            status: r.status, retries: r.retries ?? 0, durationMs: r.durationMs ?? null, errorMessage: r.error?.message ?? null,
            errorStack: r.error?.stack ?? null, errorSnippet: r.error?.snippet ?? null, tags: r.tags ?? [],
          })),
          select: { id: true },
        });
        // Chỉ tạo upload cho kết quả không `passed` (giảm dung lượng)
        const attachments: Prisma.AttachmentCreateManyInput[] = [];
        results.forEach((r, idx) => {
          if (r.status === 'passed') return;
          for (const a of r.attachments ?? []) {
            attachments.push({
              projectId: key.projectId, entity: 'automation_result', entityId: rows[idx].id, kind: a.kind, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: BigInt(a.size),
              objectKey: `${key.projectKey}/runs/${created.id}/${rows[idx].id}/${b64(a.ref)}/${safeName(a.fileName)}`, uploadedByApiKeyId: key.id,
            });
          }
        });
        if (attachments.length) await tx.attachment.createMany({ data: attachments });
        return created;
      });
      return { http: 201, body: { runId: run.id, status: run.status, uploads: await this.pendingUploads(run.id) } };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Hai request song song cùng externalId: trả run đã được tạo bởi request kia
        const again = await this.prisma.automationRun.findUniqueOrThrow({ where: { projectId_externalId: { projectId: key.projectId, externalId: dto.externalId } } });
        return { http: 200, body: await this.existingResponse(again) };
      }
      throw e;
    }
  }

  private async existingResponse(run: { id: bigint; status: string }) {
    return { runId: run.id, status: run.status, uploads: run.status === 'receiving' ? await this.pendingUploads(run.id) : [] };
  }

  private async ownRun(key: ApiKeyPrincipal, runId: bigint) {
    const run = await this.prisma.automationRun.findFirst({ where: { id: runId, projectId: key.projectId } });
    if (!run) throw notFound(ERROR_CODES.RUN_NOT_FOUND, 'Không tìm thấy lần chạy');
    return run;
  }

  /** Gọi nhiều lần vẫn chỉ xử lý một lần (chuyển receiving → processing là nguyên tử). */
  async complete(key: ApiKeyPrincipal, runId: bigint) {
    const run = await this.ownRun(key, runId);
    const moved = await this.prisma.automationRun.updateMany({ where: { id: run.id, status: 'receiving' }, data: { status: 'processing' } });
    if (moved.count === 1) {
      await this.activity.log({ projectId: run.projectId, entity: 'project', entityId: key.projectKey, action: 'run_received', actorApiKeyId: key.id, changes: { runId: run.id, externalId: run.externalId } });
      await this.queue.send(JOBS.PROCESS_RUN, { runId: run.id.toString() }, { singletonKey: `run-${run.id}` });
    }
    const current = await this.prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    return { runId: current.id, status: current.status === 'receiving' ? 'processing' : current.status };
  }

  async summary(key: ApiKeyPrincipal, runId: bigint) {
    const r = await this.ownRun(key, runId);
    return {
      runId: r.id, externalId: r.externalId, status: r.status, total: r.total, passed: r.passed, failed: r.failed, flaky: r.flaky, skipped: r.skipped,
      bugsCreated: r.bugsCreated, bugsUpdated: r.bugsUpdated, processingError: r.processingError, reportUrl: `${env.webOrigin}/reports/runs/${r.id}`,
    };
  }
}
