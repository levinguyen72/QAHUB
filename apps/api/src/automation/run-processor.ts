import { Injectable, Logger } from '@nestjs/common';
import { ActivityService } from '../activity/activity.service';
import { StorageService } from '../attachments/storage.service';
import { PrismaService, Tx } from '../common/prisma.service';
import { allocateIssueNumber, doc, rankAtEnd, recordStatusChange } from '../issues/issue-core';
import { bugDescription, bugTitle } from './bug-content';
import { computeFingerprint } from './fingerprint';

const FAILING = ['failed', 'timedOut', 'interrupted'];

type ResultRow = Awaited<ReturnType<RunProcessor['loadResults']>>[number];

/** Worker: xử lý một lần chạy Playwright (mục 8, "Job xử lý lần chạy"). */
@Injectable()
export class RunProcessor {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly activity: ActivityService) {}

  private loadResults(runId: bigint) {
    return this.prisma.automationResult.findMany({ where: { runId }, orderBy: { id: 'asc' } });
  }

  async handle(data: { runId: string }, ctx: { isLastAttempt: boolean }) {
    const runId = BigInt(data.runId);
    try {
      await this.process(runId);
    } catch (e: any) {
      this.logger.error(`Xử lý run #${runId} lỗi: ${e?.message}`, e?.stack);
      if (ctx.isLastAttempt) {
        await this.prisma.automationRun.update({ where: { id: runId }, data: { status: 'failed', processingError: String(e?.message ?? e).slice(0, 2000) } });
      }
      throw e;
    }
  }

  async process(runId: bigint) {
    const run = await this.prisma.automationRun.findUnique({ where: { id: runId }, include: { project: true } });
    if (!run || run.status === 'completed') return;

    // 1. Đánh dấu attachment đã có object trên kho lưu trữ là ready, còn lại failed
    const results = await this.loadResults(runId);
    const pending = await this.prisma.attachment.findMany({ where: { entity: 'automation_result', entityId: { in: results.map((r) => r.id) }, status: 'pending' } });
    for (const a of pending) {
      const head = await this.storage.head(a.objectKey).catch(() => null);
      await this.prisma.attachment.update({ where: { id: a.id }, data: head ? { status: 'ready', sizeBytes: BigInt(head.size) } : { status: 'failed' } });
    }

    // 2. Fingerprint cho các kết quả có thể thành bug
    const createForFlaky = (run.project.settings as any)?.createBugForFlaky === true;
    const groups = new Map<string, ResultRow[]>();
    for (const r of results) {
      let fp: string | null = null;
      let action: string = 'none';
      if (FAILING.includes(r.status) || r.status === 'flaky') {
        fp = computeFingerprint(run.projectId, r.file, r.titlePath, r.errorMessage);
        if (r.status === 'flaky' && !createForFlaky) action = 'skipped_flaky';
        else action = 'pending';
      }
      if (r.fingerprint !== fp || r.issueAction !== action) {
        await this.prisma.automationResult.update({ where: { id: r.id }, data: { fingerprint: fp, ...(r.issueAction === 'created' || r.issueAction === 'updated' ? {} : { issueAction: action === 'pending' ? null : action }) } });
      }
      if (fp && action === 'pending') {
        // 3. Gom nhóm theo fingerprint (cùng lỗi trên nhiều browser = một bug)
        (groups.get(fp) ?? groups.set(fp, []).get(fp)!).push({ ...r, fingerprint: fp });
      }
    }

    // 4. Mỗi nhóm một transaction, khóa theo (project_id, fingerprint)
    let created = 0;
    let updated = 0;
    for (const [fp, rows] of groups) {
      const outcome = await this.prisma.$transaction(async (tx) => this.processGroup(tx, run, fp, rows), { timeout: 30_000 });
      if (outcome === 'created') created++;
      else if (outcome === 'updated') updated++;
    }

    // 5. Tổng hợp số liệu
    const fresh = await this.loadResults(runId);
    const [bugsCreated, bugsUpdated] = [fresh.filter((r) => r.issueAction === 'created'), fresh.filter((r) => r.issueAction === 'updated')].map((rs) => new Set(rs.map((r) => r.issueId?.toString())).size);
    void created; void updated;
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        total: fresh.length,
        passed: fresh.filter((r) => r.status === 'passed').length,
        failed: fresh.filter((r) => FAILING.includes(r.status)).length,
        flaky: fresh.filter((r) => r.status === 'flaky').length,
        skipped: fresh.filter((r) => r.status === 'skipped').length,
        bugsCreated, bugsUpdated, status: 'completed', processingError: null,
      },
    });
  }

  /** Trả 'created' | 'updated' | 'skipped' */
  private async processGroup(tx: Tx, run: { id: bigint; projectId: bigint; apiKeyId: string | null; environment: string | null; branch: string | null; commitSha: string | null; ciUrl: string | null; finishedAt: Date | null; project: { key: string } }, fp: string, rows: ResultRow[]) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${run.projectId}::int, hashtext(${fp}))`;
    const ids = rows.map((r) => r.id);
    // Idempotent khi job chạy lại: nhóm đã xử lý rồi thì bỏ qua
    const done = await tx.automationResult.count({ where: { id: { in: ids }, issueAction: { in: ['created', 'updated'] } } });
    if (done > 0) return 'skipped' as const;

    const first = rows[0];
    const seenAt = run.finishedAt ?? new Date();
    const latest = await tx.issue.findFirst({
      where: { projectId: run.projectId, fingerprint: fp, deletedAt: null },
      orderBy: { id: 'desc' }, include: { status: true },
    });
    const where = `${run.environment ?? '-'}, ${run.branch ?? '-'}@${run.commitSha ?? '-'}`;
    const mark = (issueId: bigint, action: 'created' | 'updated') =>
      tx.automationResult.updateMany({ where: { id: { in: ids } }, data: { issueId, issueAction: action } });

    if (latest && latest.status.category !== 'done') {
      // Bug chưa đóng: tăng số lần xuất hiện, thêm comment hệ thống, gắn attachment mới
      await tx.issue.update({ where: { id: latest.id }, data: { occurrenceCount: { increment: 1 }, lastSeenAt: seenAt, version: { increment: 1 } } });
      await tx.issueComment.create({ data: { issueId: latest.id, authorId: null, body: doc(`Xuất hiện lại ở run #${run.id} (${where})`) } });
      await this.copyAttachments(tx, first.id, latest.id, run);
      await this.activity.log({ projectId: run.projectId, entity: 'issue', entityId: `${run.project.key}-${latest.number}`, action: 'seen_again', actorApiKeyId: run.apiKeyId, changes: { run: [null, Number(run.id)] } }, tx);
      await mark(latest.id, 'updated');
      return 'updated' as const;
    }
    if (latest && latest.resolution !== 'done') {
      // Đã bị Reject/Duplicate/Won't fix: không tạo bug, chỉ tăng occurrence_count (của bug gốc nếu là duplicate)
      const targetId = latest.resolution === 'duplicate' && latest.duplicateOfId ? latest.duplicateOfId : latest.id;
      await tx.issue.update({ where: { id: targetId }, data: { occurrenceCount: { increment: 1 }, lastSeenAt: seenAt, version: { increment: 1 } } });
      await mark(latest.id, 'updated');
      return 'updated' as const;
    }

    // Chưa có, hoặc đã đóng với resolution=done (regression): tạo bug mới ở trạng thái khởi tạo auto
    const settings = await tx.workflowSettings.findUniqueOrThrow({ where: { projectId: run.projectId } });
    const autoLabel = await tx.label.findUniqueOrThrow({ where: { projectId_name: { projectId: run.projectId, name: 'auto' } } });
    const number = await allocateIssueNumber(tx, run.projectId);
    const issue = await tx.issue.create({
      data: {
        projectId: run.projectId, number, type: 'bug', title: bugTitle(first.titlePath, first.errorMessage),
        description: bugDescription({ ...first, run }) as any, statusId: settings.initialAutoStatusId, priority: 'medium', source: 'auto',
        reporterId: null, createdByApiKeyId: run.apiKeyId, rank: await rankAtEnd(tx, run.projectId, null),
        fingerprint: fp, occurrenceCount: 1, firstSeenAt: seenAt, lastSeenAt: seenAt, labels: { create: [{ labelId: autoLabel.id }] },
      },
    });
    await recordStatusChange(tx, issue.id, null, issue.statusId, null);
    if (latest) {
      await tx.issueLink.create({ data: { sourceId: issue.id, targetId: latest.id, type: 'regression_of' } });
      await tx.issueComment.create({ data: { issueId: issue.id, authorId: null, body: doc(`Lỗi quay lại sau khi ${run.project.key}-${latest.number} đã đóng (regression)`) } });
    }
    await this.copyAttachments(tx, first.id, issue.id, run);
    await this.activity.log({ projectId: run.projectId, entity: 'issue', entityId: `${run.project.key}-${number}`, action: 'created', actorApiKeyId: run.apiKeyId, changes: { title: [null, issue.title], source: [null, 'auto'] } }, tx);
    await mark(issue.id, 'created');
    return 'created' as const;
  }

  /** Gắn screenshot, video, trace của kết quả đầu tiên trong nhóm vào bug (trỏ cùng object, không copy file). */
  private async copyAttachments(tx: Tx, resultId: bigint, issueId: bigint, run: { projectId: bigint; apiKeyId: string | null }) {
    const atts = await tx.attachment.findMany({ where: { entity: 'automation_result', entityId: resultId, status: 'ready' } });
    if (!atts.length) return;
    await tx.attachment.createMany({
      data: atts.map((a) => ({
        projectId: run.projectId, entity: 'issue', entityId: issueId, kind: a.kind, objectKey: a.objectKey, fileName: a.fileName,
        mimeType: a.mimeType, sizeBytes: a.sizeBytes, status: 'ready', uploadedByApiKeyId: run.apiKeyId,
      })),
    });
  }
}

