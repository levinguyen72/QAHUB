import { Injectable } from '@nestjs/common';
import { ERROR_CODES, WorkflowTemplateDefinition } from '@ospm/shared';
import { ActivityService } from '../activity/activity.service';
import { AppException, notFound, unprocessable } from '../common/errors';
import { PrismaService, Tx } from '../common/prisma.service';
import { SaveWorkflowDto } from './workflows.dto';

export interface WorkflowSnapshot {
  statuses: { id: bigint; name: string; category: string; color: string; position: number; showOnBoard: boolean; isArchived: boolean; issueCount?: number }[];
  transitions: { id: bigint; fromStatusId: bigint | null; toStatusId: bigint; name: string | null }[];
  settings: { initialManualStatusId: bigint; initialAutoStatusId: bigint; acceptStatusId: bigint | null; rejectStatusId: bigint | null; allowAnyTransition: boolean } | null;
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  listTemplates() {
    return this.prisma.workflowTemplate.findMany({ orderBy: { id: 'asc' } });
  }

  async get(projectId: bigint, db: Tx | PrismaService = this.prisma): Promise<WorkflowSnapshot> {
    const [statuses, transitions, settings, counts] = await Promise.all([
      db.workflowStatus.findMany({ where: { projectId }, orderBy: { position: 'asc' } }),
      db.workflowTransition.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
      db.workflowSettings.findUnique({ where: { projectId } }),
      db.issue.groupBy({ by: ['statusId'], where: { projectId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.statusId, c._count._all]));
    return {
      statuses: statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, color: s.color, position: s.position, showOnBoard: s.showOnBoard, isArchived: s.isArchived, issueCount: countBy.get(s.id) ?? 0 })),
      transitions: transitions.map((t) => ({ id: t.id, fromStatusId: t.fromStatusId, toStatusId: t.toStatusId, name: t.name })),
      settings: settings && {
        initialManualStatusId: settings.initialManualStatusId,
        initialAutoStatusId: settings.initialAutoStatusId,
        acceptStatusId: settings.acceptStatusId,
        rejectStatusId: settings.rejectStatusId,
        allowAnyTransition: settings.allowAnyTransition,
      },
    };
  }

  /** Quy tắc 3, mục 6: bước chuyển hợp lệ khi có dòng khớp hoặc allow_any_transition. */
  async isTransitionAllowed(db: Tx | PrismaService, projectId: bigint, fromId: bigint, toId: bigint): Promise<boolean> {
    if (fromId === toId) return false;
    const settings = await db.workflowSettings.findUnique({ where: { projectId } });
    const to = await db.workflowStatus.findFirst({ where: { id: toId, projectId, isArchived: false } });
    if (!to) return false;
    if (settings?.allowAnyTransition) return true;
    const hit = await db.workflowTransition.findFirst({
      where: { projectId, toStatusId: toId, OR: [{ fromStatusId: fromId }, { fromStatusId: null }] },
      select: { id: true },
    });
    return !!hit;
  }

  /** Các trạng thái có thể chuyển tới từ `fromId` (cho StatusTag dropdown và board). */
  async availableTransitions(projectId: bigint, fromId: bigint, opts: { includeAll?: boolean } = {}) {
    const [statuses, settings, transitions] = await Promise.all([
      this.prisma.workflowStatus.findMany({ where: { projectId, isArchived: false }, orderBy: { position: 'asc' } }),
      this.prisma.workflowSettings.findUnique({ where: { projectId } }),
      this.prisma.workflowTransition.findMany({ where: { projectId, OR: [{ fromStatusId: fromId }, { fromStatusId: null }] } }),
    ]);
    const nameByTo = new Map(transitions.map((t) => [t.toStatusId, t.name]));
    return statuses
      .filter((s) => s.id !== fromId && (opts.includeAll || settings?.allowAnyTransition || nameByTo.has(s.id)))
      .map((s) => ({ statusId: s.id, name: s.name, category: s.category, color: s.color, label: nameByTo.get(s.id) ?? null }));
  }

  /** Cột board = trạng thái chưa lưu trữ, show_on_board và không thuộc triage (mục 6). */
  async boardColumns(projectId: bigint) {
    return this.prisma.workflowStatus.findMany({
      where: { projectId, isArchived: false, showOnBoard: true, category: { not: 'triage' } },
      orderBy: { position: 'asc' },
    });
  }

  async save(projectId: bigint, projectKey: string, dto: SaveWorkflowDto, actorId: bigint) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.workflowStatus.findMany({ where: { projectId } });
      const existingById = new Map(existing.map((s) => [s.id.toString(), s]));

      // --- Kiểm tra đầu vào ---
      const refToIdMap = new Map<string, bigint | null>(); // null = sẽ tạo mới
      const names = new Set<string>();
      for (const s of dto.statuses) {
        if (names.has(s.name.trim().toLowerCase())) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, `Tên trạng thái bị trùng: ${s.name}`);
        names.add(s.name.trim().toLowerCase());
        if (s.id !== undefined) {
          if (!existingById.has(String(s.id))) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, `Trạng thái ${s.id} không thuộc dự án`);
          refToIdMap.set(String(s.id), BigInt(s.id));
        } else {
          if (!s.tempKey) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, `Trạng thái mới "${s.name}" cần tempKey`);
          refToIdMap.set(s.tempKey, null);
        }
        if (s.category === 'triage' && s.showOnBoard) {
          throw unprocessable('TRIAGE_STATUS_NOT_ON_BOARD', 'Trạng thái nhóm triage không được hiển thị trên board');
        }
      }
      const active = dto.statuses;
      if (!active.some((s) => s.category === 'todo' || s.category === 'in_progress') || !active.some((s) => s.category === 'done')) {
        throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, 'Cần ít nhất một trạng thái todo/in_progress và một trạng thái done');
      }
      const catByRef = new Map<string, string>(dto.statuses.map((s) => [s.id !== undefined ? String(s.id) : s.tempKey!, s.category]));
      const requireRef = (ref: string | null | undefined, what: string) => {
        if (ref === null || ref === undefined) return;
        if (!catByRef.has(ref)) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, `${what} tham chiếu trạng thái không có trong workflow (hoặc đã bị lưu trữ)`);
      };
      requireRef(dto.settings.initialManual, 'Trạng thái khởi tạo manual');
      requireRef(dto.settings.initialAuto, 'Trạng thái khởi tạo auto');
      requireRef(dto.settings.accept, 'Đích Accept');
      requireRef(dto.settings.reject, 'Đích Reject');
      if (!dto.settings.initialManual) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, 'Thiếu trạng thái khởi tạo manual');
      if (catByRef.get(dto.settings.initialManual) === 'triage') {
        throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, 'Trạng thái khởi tạo manual không được thuộc nhóm triage');
      }
      for (const t of dto.transitions) {
        requireRef(t.from, 'Bước chuyển (từ)');
        requireRef(t.to, 'Bước chuyển (đến)');
      }

      // --- Trạng thái bị bỏ: phải có chỗ thay thế nếu còn item ---
      const keptIds = new Set(dto.statuses.filter((s) => s.id !== undefined).map((s) => String(s.id)));
      const removed = existing.filter((s) => !s.isArchived && !keptIds.has(s.id.toString()));
      const replacements = dto.statusReplacements ?? {};
      for (const r of removed) {
        const n = await tx.issue.count({ where: { statusId: r.id } });
        if (n > 0 && !replacements[r.id.toString()]) {
          throw new AppException(422, ERROR_CODES.STATUS_IN_USE, `Trạng thái "${r.name}" đang có ${n} item, cần chọn trạng thái thay thế`, { statusId: r.id, count: n });
        }
      }
      // Trạng thái đang lưu trữ mà payload muốn dùng lại
      const unarchive = dto.statuses.filter((s) => s.id !== undefined && existingById.get(String(s.id))!.isArchived);

      // --- Ghi: trước hết đổi tên các trạng thái sắp bị lưu trữ để nhường tên (UNIQUE project_id,name) ---
      for (const r of removed) {
        await tx.workflowStatus.update({ where: { id: r.id }, data: { name: `${r.name} (archived #${r.id})`, showOnBoard: false } });
      }
      // Tạm đổi tên các trạng thái giữ lại để tránh đụng UNIQUE khi hoán đổi tên
      for (const s of dto.statuses.filter((x) => x.id !== undefined)) {
        await tx.workflowStatus.update({ where: { id: BigInt(s.id!) }, data: { name: `__tmp_${s.id}` } });
      }
      let position = 0;
      for (const s of dto.statuses) {
        const data = {
          name: s.name.trim(), category: s.category, color: s.color ?? '#8c8c8c', position: position++,
          showOnBoard: s.category === 'triage' ? false : s.showOnBoard ?? true, isArchived: false,
        };
        if (s.id !== undefined) {
          await tx.workflowStatus.update({ where: { id: BigInt(s.id) }, data });
        } else {
          const created = await tx.workflowStatus.create({ data: { projectId, ...data } });
          refToIdMap.set(s.tempKey!, created.id);
        }
      }
      void unarchive;
      const resolve = (ref: string | null | undefined): bigint | null => (ref == null ? null : refToIdMap.get(ref) ?? null);

      // --- Chuyển item của các trạng thái bị bỏ sang trạng thái thay thế rồi lưu trữ ---
      for (const r of removed) {
        const repId = resolve(replacements[r.id.toString()]);
        const n = await tx.issue.count({ where: { statusId: r.id } });
        if (n > 0) {
          if (!repId) throw unprocessable(ERROR_CODES.WORKFLOW_INVALID, 'Trạng thái thay thế không hợp lệ');
          const rep = dto.statuses.find((s) => (s.id !== undefined ? String(s.id) : s.tempKey) === replacements[r.id.toString()]);
          await tx.$executeRaw`INSERT INTO issue_status_changes (issue_id, from_status_id, to_status_id, changed_by) SELECT id, ${r.id}, ${repId}, ${actorId} FROM issues WHERE status_id = ${r.id}`;
          if (rep?.category === 'done') {
            await tx.$executeRaw`UPDATE issues SET status_id = ${repId}, resolved_at = coalesce(resolved_at, now()), resolution = coalesce(resolution, 'done'), version = version + 1, updated_at = now() WHERE status_id = ${r.id}`;
          } else {
            await tx.$executeRaw`UPDATE issues SET status_id = ${repId}, version = version + 1, updated_at = now() WHERE status_id = ${r.id}`;
          }
        }
        await tx.workflowStatus.update({ where: { id: r.id }, data: { isArchived: true, showOnBoard: false } });
      }

      // --- Bước chuyển & cấu hình ---
      await tx.workflowTransition.deleteMany({ where: { projectId } });
      const seen = new Set<string>();
      for (const t of dto.transitions) {
        const from = resolve(t.from);
        const to = resolve(t.to)!;
        const key = `${from ?? 'any'}->${to}`;
        if (seen.has(key) || from === to) continue;
        seen.add(key);
        await tx.workflowTransition.create({ data: { projectId, fromStatusId: from, toStatusId: to, name: t.name ?? null } });
      }
      const settingsData = {
        initialManualStatusId: resolve(dto.settings.initialManual)!,
        initialAutoStatusId: resolve(dto.settings.initialAuto)!,
        acceptStatusId: resolve(dto.settings.accept),
        rejectStatusId: resolve(dto.settings.reject),
        allowAnyTransition: dto.settings.allowAnyTransition ?? false,
      };
      await tx.workflowSettings.upsert({ where: { projectId }, update: settingsData, create: { projectId, ...settingsData } });

      await this.activity.log({ projectId, entity: 'workflow', entityId: projectKey, action: 'updated', actorId, changes: { statuses: dto.statuses.length, archived: removed.length } }, tx);
      return this.get(projectId, tx);
    });
    return result;
  }

  /** Thay toàn bộ workflow bằng một template ("Áp dụng template"). Trạng thái cũ bị lưu trữ, item chuyển theo `statusReplacements`. */
  async applyTemplate(projectId: bigint, projectKey: string, templateId: bigint, replacements: Record<string, string> | undefined, actorId: bigint) {
    const tpl = await this.prisma.workflowTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) throw notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy template');
    const def = tpl.definition as unknown as WorkflowTemplateDefinition;
    const current = await this.get(projectId);
    const live = current.statuses.filter((s) => !s.isArchived);
    // Giữ lại trạng thái trùng tên để không phải chuyển item không cần thiết
    const byName = new Map(live.map((s) => [s.name.toLowerCase(), s]));
    const statuses = def.statuses.map((s) => {
      const hit = byName.get(s.name.toLowerCase());
      return hit
        ? { id: Number(hit.id), name: s.name, category: s.category, color: s.color, showOnBoard: s.category !== 'triage' }
        : { tempKey: s.key, name: s.name, category: s.category, color: s.color, showOnBoard: s.category !== 'triage' };
    });
    const refOf = (key: string) => {
      const i = def.statuses.findIndex((s) => s.key === key);
      const st = statuses[i] as any;
      return st.id !== undefined ? String(st.id) : st.tempKey;
    };
    // Mặc định: trạng thái cũ bị bỏ được chuyển sang trạng thái cùng category đầu tiên trong template
    const auto: Record<string, string> = {};
    const kept = new Set(statuses.filter((s: any) => s.id !== undefined).map((s: any) => String(s.id)));
    for (const s of live.filter((x) => !kept.has(x.id.toString()))) {
      const target = def.statuses.find((d) => d.category === s.category) ?? def.statuses.find((d) => d.category === 'todo' || d.category === 'in_progress')!;
      auto[s.id.toString()] = refOf(target.key);
    }
    return this.save(
      projectId,
      projectKey,
      {
        statuses: statuses as any,
        transitions: def.transitions.map((t) => ({ from: t.from ? refOf(t.from) : null, to: refOf(t.to), name: t.name })),
        settings: { initialManual: refOf(def.initialManual), initialAuto: refOf(def.initialAuto), accept: refOf(def.accept), reject: refOf(def.reject), allowAnyTransition: false },
        statusReplacements: { ...auto, ...(replacements ?? {}) },
      },
      actorId,
    );
  }
}
