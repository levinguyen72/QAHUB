import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@ospm/shared';
import { Prisma } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AppException, notFound } from '../common/errors';
import { AuthUser } from '../common/decorators';
import { clampLimit, decodeCursor, toPage } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { allocateIssueNumber, rankAtEnd, recordStatusChange } from '../issues/issue-core';
import { bugDescription, bugTitle } from './bug-content';
import { computeFingerprint } from './fingerprint';
import { ListResultsQuery, ListRunsQuery } from './automation.dto';

const passRate = (r: { total: number; passed: number; flaky: number }) => (r.total > 0 ? Math.round(((r.passed + r.flaky) / r.total) * 1000) / 10 : null);

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  async listRuns(projectId: bigint, q: ListRunsQuery) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor<{ id: string }>(q.cursor);
    const rows = await this.prisma.automationRun.findMany({
      where: {
        projectId, ...(q.branch ? { branch: q.branch } : {}), ...(q.environment ? { environment: q.environment } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
        ...(c ? { id: { lt: BigInt(c.id) } } : {}),
      },
      orderBy: { id: 'desc' }, take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ id: r.id.toString() }));
    return { items: page.items.map((r) => ({ ...r, passRate: passRate(r) })), nextCursor: page.nextCursor };
  }

  async getRun(id: bigint) {
    const r = await this.prisma.automationRun.findUniqueOrThrow({ where: { id }, include: { project: { select: { key: true } } } });
    const { project, ...rest } = r;
    return { ...rest, projectKey: project.key, passRate: passRate(r) };
  }

  async listResults(runId: bigint, q: ListResultsQuery) {
    const run = await this.prisma.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { project: { select: { key: true } } } });
    const limit = clampLimit(q.limit);
    const c = decodeCursor<{ id: string }>(q.cursor);
    const where: Prisma.AutomationResultWhereInput = {
      runId, ...(q.status ? { status: q.status } : {}), ...(c ? { id: { gt: BigInt(c.id) } } : {}),
      ...(q.q ? { OR: [{ file: { contains: q.q, mode: 'insensitive' } }, { titlePath: { has: q.q } }, { errorMessage: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const rows = await this.prisma.automationResult.findMany({
      where, orderBy: { id: 'asc' }, take: limit + 1,
      select: {
        id: true, testId: true, file: true, line: true, titlePath: true, browser: true, status: true, retries: true, durationMs: true,
        errorMessage: true, tags: true, fingerprint: true, issueId: true, issueAction: true,
        issue: { select: { id: true, number: true, title: true, status: { select: { name: true, color: true, category: true } } } },
      },
    });
    const page = toPage(rows, limit, (r) => ({ id: r.id.toString() }));
    return {
      items: page.items.map(({ issue, ...r }) => ({ ...r, issue: issue && { id: issue.id, key: `${run.project.key}-${issue.number}`, title: issue.title, status: issue.status } })),
      nextCursor: page.nextCursor,
    };
  }

  /** Chi tiết một kết quả: lỗi, stack, attachment (screenshot/video/trace). */
  async getResult(id: bigint) {
    const r = await this.prisma.automationResult.findUnique({
      where: { id }, include: { run: { select: { id: true, projectId: true, project: { select: { key: true } } } }, issue: { select: { id: true, number: true, title: true } } },
    });
    if (!r) throw notFound(ERROR_CODES.RESULT_NOT_FOUND, 'Không tìm thấy kết quả');
    const attachments = await this.prisma.attachment.findMany({ where: { entity: 'automation_result', entityId: id, status: 'ready' } });
    const { run, issue, ...rest } = r;
    return {
      ...rest, runId: run.id, projectKey: run.project.key,
      issue: issue && { id: issue.id, key: `${run.project.key}-${issue.number}`, title: issue.title },
      attachments: attachments.map((a) => ({ id: a.id, kind: a.kind, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    };
  }

  /** Tạo bug tay từ một kết quả (ví dụ khi fingerprint bị bỏ qua). */
  async createIssueFromResult(id: bigint, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.automationResult.findUnique({ where: { id }, include: { run: { include: { project: true } } } });
      if (!r) throw notFound(ERROR_CODES.RESULT_NOT_FOUND, 'Không tìm thấy kết quả');
      if (r.issueId) throw new AppException(409, 'RESULT_ALREADY_LINKED', 'Kết quả này đã có bug liên quan');
      const { run } = r;
      const settings = await tx.workflowSettings.findUniqueOrThrow({ where: { projectId: run.projectId } });
      const manual = await tx.label.findUniqueOrThrow({ where: { projectId_name: { projectId: run.projectId, name: 'manual' } } });
      const number = await allocateIssueNumber(tx, run.projectId);
      const fp = r.fingerprint ?? computeFingerprint(run.projectId, r.file, r.titlePath, r.errorMessage);
      const issue = await tx.issue.create({
        data: {
          projectId: run.projectId, number, type: 'bug', title: bugTitle(r.titlePath, r.errorMessage), description: bugDescription({ ...r, run }) as any,
          statusId: settings.initialManualStatusId, source: 'manual', reporterId: user.id, rank: await rankAtEnd(tx, run.projectId, null),
          fingerprint: fp, firstSeenAt: run.finishedAt ?? new Date(), lastSeenAt: run.finishedAt ?? new Date(), labels: { create: [{ labelId: manual.id }] },
        },
      });
      await recordStatusChange(tx, issue.id, null, issue.statusId, user.id);
      const atts = await tx.attachment.findMany({ where: { entity: 'automation_result', entityId: id, status: 'ready' } });
      if (atts.length) {
        await tx.attachment.createMany({
          data: atts.map((a) => ({ projectId: run.projectId, entity: 'issue', entityId: issue.id, kind: a.kind, objectKey: a.objectKey, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, status: 'ready', uploadedBy: user.id })),
        });
      }
      await tx.automationResult.update({ where: { id }, data: { issueId: issue.id, issueAction: 'created' } });
      await this.activity.log({ projectId: run.projectId, entity: 'issue', entityId: `${run.project.key}-${number}`, action: 'created', actorId: user.id, changes: { title: [null, issue.title], fromRun: [null, Number(run.id)] } }, tx);
      return { id: issue.id, key: `${run.project.key}-${number}` };
    });
  }
}
