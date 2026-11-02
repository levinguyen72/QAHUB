import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseIds } from '../common/bigint';
import { clampLimit, decodeCursor, toPage } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';

export interface SummaryFilter {
  assigneeIds?: bigint[];
  types?: string[];
  source?: string;
}

const filterSql = (f: SummaryFilter, alias = 'i'): Prisma.Sql => {
  const parts: Prisma.Sql[] = [];
  const col = (c: string) => Prisma.raw(`${alias}.${c}`);
  if (f.assigneeIds?.length) parts.push(Prisma.sql`AND ${col('assignee_id')} = ANY(${f.assigneeIds})`);
  if (f.types?.length) parts.push(Prisma.sql`AND ${col('type')} = ANY(${f.types})`);
  if (f.source) parts.push(Prisma.sql`AND ${col('source')} = ${f.source}`);
  return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
};

export function parseSummaryFilter(q: { assigneeIds?: string; type?: string; source?: string }): SummaryFilter {
  return { assigneeIds: parseIds(q.assigneeIds), types: q.type ? q.type.split(',').filter(Boolean) : undefined, source: q.source };
}

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bốn thẻ số liệu 7 ngày (định nghĩa ở mục 7). Dùng chung cho Summary và Dashboard. */
  async cards(projectIds: bigint[], f: SummaryFilter = {}) {
    const flt = filterSql(f);
    const [completed, updated, created, due] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT sc.issue_id) n FROM issue_status_changes sc
        JOIN issues i ON i.id = sc.issue_id JOIN workflow_statuses s ON s.id = sc.to_status_id
        WHERE i.project_id = ANY(${projectIds}) AND i.deleted_at IS NULL AND s.category = 'done'
          AND sc.changed_at >= now() - interval '7 days' ${flt}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) n FROM issues i WHERE i.project_id = ANY(${projectIds}) AND i.deleted_at IS NULL
          AND i.updated_at >= now() - interval '7 days' ${flt}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) n FROM issues i WHERE i.project_id = ANY(${projectIds}) AND i.deleted_at IS NULL
          AND i.created_at >= now() - interval '7 days' ${flt}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) n FROM issues i JOIN workflow_statuses s ON s.id = i.status_id
        WHERE i.project_id = ANY(${projectIds}) AND i.deleted_at IS NULL AND s.category <> 'done'
          AND i.due_date BETWEEN current_date AND current_date + 7 ${flt}`,
    ]);
    return { completedLast7d: Number(completed[0].n), updatedLast7d: Number(updated[0].n), createdLast7d: Number(created[0].n), dueNext7d: Number(due[0].n) };
  }

  async summary(projectId: bigint, f: SummaryFilter) {
    const flt = filterSql(f);
    const [cards, statuses, source, byType, byPriority, activity] = await Promise.all([
      this.cards([projectId], f),
      this.prisma.$queryRaw<{ id: bigint; name: string; category: string; color: string; position: number; n: bigint }[]>`
        SELECT s.id, s.name, s.category, s.color, s.position, count(i.id) n
        FROM workflow_statuses s LEFT JOIN issues i ON i.status_id = s.id AND i.deleted_at IS NULL ${flt}
        WHERE s.project_id = ${projectId} AND (NOT s.is_archived OR i.id IS NOT NULL)
        GROUP BY s.id ORDER BY s.position`,
      this.prisma.$queryRaw<{ source: string; pending: boolean; n: bigint }[]>`
        SELECT i.source, (s.category = 'triage') pending, count(*) n FROM issues i JOIN workflow_statuses s ON s.id = i.status_id
        WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL ${flt} GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ type: string; n: bigint }[]>`
        SELECT i.type, count(*) n FROM issues i WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL ${flt} GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ priority: string; n: bigint }[]>`
        SELECT i.priority, count(*) n FROM issues i WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL ${flt} GROUP BY 1
        ORDER BY array_position(ARRAY['highest','high','medium','low','lowest'], i.priority)`,
      this.recentActivity([projectId], undefined, 20),
    ]);
    const total = statuses.reduce((a, s) => a + Number(s.n), 0);
    const bySource = { manual: 0, auto: 0, pendingReview: 0 };
    for (const r of source) {
      bySource[r.source as 'manual' | 'auto'] += Number(r.n);
      if (r.pending) bySource.pendingReview += Number(r.n);
    }
    return {
      cards,
      statusOverview: {
        total,
        items: statuses.map((s) => ({ statusId: s.id, name: s.name, category: s.category, color: s.color, count: Number(s.n) })),
      },
      bySource,
      byType: byType.map((r) => ({ type: r.type, count: Number(r.n) })),
      byPriority: byPriority.map((r) => ({ priority: r.priority, count: Number(r.n) })),
      recentActivity: activity.items,
      recentActivityNextCursor: activity.nextCursor,
    };
  }

  /** Hoạt động item gần đây của các dự án, kèm tiêu đề item. */
  async recentActivity(projectIds: bigint[], cursor?: string, limitIn?: number) {
    const limit = clampLimit(limitIn, 100, 20);
    const c = decodeCursor<{ id: string }>(cursor);
    const rows = await this.prisma.activityLog.findMany({
      where: { projectId: { in: projectIds }, entity: 'issue', ...(c ? { id: { lt: BigInt(c.id) } } : {}) },
      include: { actor: { select: { id: true, displayName: true, avatarUrl: true } }, apiKey: { select: { id: true, name: true } }, project: { select: { key: true } } },
      orderBy: { id: 'desc' }, take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ id: r.id.toString() }));
    const keys = [...new Set(page.items.map((r) => r.entityId))];
    const issues = keys.length
      ? await this.prisma.$queryRaw<{ key: string; title: string }[]>`
          SELECT p.key || '-' || i.number AS key, i.title FROM issues i JOIN projects p ON p.id = i.project_id
          WHERE (p.key || '-' || i.number) = ANY(${keys})`
      : [];
    const titleByKey = new Map(issues.map((i) => [i.key, i.title]));
    return {
      items: page.items.map((r) => ({
        id: r.id, actor: r.actor ?? (r.apiKey ? { id: null, displayName: `API key: ${r.apiKey.name}` } : null), action: r.action,
        projectKey: r.project?.key, issueKey: r.entityId, issueTitle: titleByKey.get(r.entityId) ?? null, changes: r.changes, createdAt: r.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
