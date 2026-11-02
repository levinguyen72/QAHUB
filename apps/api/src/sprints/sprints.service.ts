import { Injectable } from '@nestjs/common';
import { ERROR_CODES, rankBetween } from '@ospm/shared';
import { ActivityService } from '../activity/activity.service';
import { parseId } from '../common/bigint';
import { AppException, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { rankAtEnd } from '../issues/issue-core';
import { CompleteSprintDto, CreateSprintDto, StartSprintDto, UpdateSprintDto } from './sprints.dto';

@Injectable()
export class SprintsService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  private async get(id: bigint) {
    const s = await this.prisma.sprint.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw notFound(ERROR_CODES.SPRINT_NOT_FOUND, 'Không tìm thấy sprint');
    return s;
  }

  async create(projectId: bigint, projectKey: string, dto: CreateSprintDto, actorId: bigint) {
    const n = (await this.prisma.sprint.count({ where: { projectId } })) + 1;
    const last = await this.prisma.sprint.findFirst({ where: { projectId, deletedAt: null }, orderBy: { position: 'desc' } });
    const s = await this.prisma.sprint.create({
      data: { projectId, name: dto.name?.trim() || `${projectKey} Sprint ${n}`, goal: dto.goal, position: (last?.position ?? 0) + 1 },
    });
    await this.activity.log({ projectId, entity: 'sprint', entityId: s.id, action: 'created', actorId, changes: { name: [null, s.name] } });
    return s;
  }

  async update(id: bigint, dto: UpdateSprintDto, actorId: bigint) {
    const s = await this.get(id);
    if (s.state === 'closed') throw unprocessable(ERROR_CODES.VALIDATION_ERROR, 'Sprint đã đóng');
    const updated = await this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name?.trim(), goal: dto.goal,
        startDate: dto.startDate === undefined ? undefined : dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate === undefined ? undefined : dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    await this.activity.log({ projectId: s.projectId, entity: 'sprint', entityId: id, action: 'updated', actorId, changes: dto as any });
    return updated;
  }

  async start(id: bigint, dto: StartSprintDto, actorId: bigint) {
    const s = await this.get(id);
    if (s.state !== 'future') throw unprocessable(ERROR_CODES.VALIDATION_ERROR, 'Chỉ bắt đầu được sprint ở trạng thái future');
    if (dto.endDate < dto.startDate) throw unprocessable(ERROR_CODES.VALIDATION_ERROR, 'Ngày kết thúc phải sau ngày bắt đầu');
    const active = await this.prisma.sprint.findFirst({ where: { projectId: s.projectId, state: 'active', deletedAt: null } });
    if (active) throw new AppException(409, ERROR_CODES.SPRINT_ALREADY_ACTIVE, `Dự án đã có sprint đang chạy: ${active.name}`);
    const updated = await this.prisma.sprint
      .update({ where: { id }, data: { state: 'active', startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), goal: dto.goal ?? s.goal } })
      .catch((e) => {
        if (e?.code === 'P2002') throw new AppException(409, ERROR_CODES.SPRINT_ALREADY_ACTIVE, 'Dự án đã có sprint đang chạy');
        throw e;
      });
    await this.activity.log({ projectId: s.projectId, entity: 'sprint', entityId: id, action: 'started', actorId });
    return updated;
  }

  async complete(id: bigint, dto: CompleteSprintDto, actorId: bigint) {
    const s = await this.get(id);
    if (s.state !== 'active') throw unprocessable(ERROR_CODES.SPRINT_NOT_ACTIVE, 'Sprint không ở trạng thái active');
    let target: bigint | null = null;
    if (dto.moveOpenIssuesTo !== 'backlog') {
      target = parseId(dto.moveOpenIssuesTo, ERROR_CODES.SPRINT_NOT_FOUND);
      const t = await this.prisma.sprint.findFirst({ where: { id: target, projectId: s.projectId, deletedAt: null } });
      if (!t || t.state === 'closed' || t.id === s.id) throw unprocessable(ERROR_CODES.VALIDATION_ERROR, 'Sprint đích không hợp lệ');
    }
    return this.prisma.$transaction(async (tx) => {
      const issues = await tx.issue.findMany({ where: { sprintId: id, deletedAt: null }, include: { status: true }, orderBy: { rank: 'asc' } });
      const open = issues.filter((i) => i.status.category !== 'done');
      let r = await rankAtEnd(tx, s.projectId, target);
      for (const i of open) {
        await tx.issue.update({ where: { id: i.id }, data: { sprintId: target, rank: r, version: { increment: 1 } } });
        r = rankBetween(r, null);
      }
      await tx.sprint.update({ where: { id }, data: { state: 'closed', completedAt: new Date() } });
      await this.activity.log({ projectId: s.projectId, entity: 'sprint', entityId: id, action: 'completed', actorId, changes: { done: issues.length - open.length, moved: open.length } }, tx);
      return { id, done: issues.length - open.length, open: open.length, movedTo: target ?? 'backlog' };
    });
  }

  async remove(id: bigint, actorId: bigint) {
    const s = await this.get(id);
    if (s.state === 'active') throw unprocessable(ERROR_CODES.VALIDATION_ERROR, 'Hãy hoàn thành sprint trước khi xóa');
    await this.prisma.$transaction(async (tx) => {
      const issues = await tx.issue.findMany({ where: { sprintId: id, deletedAt: null }, orderBy: { rank: 'asc' } });
      let prev: string | null = (await tx.issue.findFirst({ where: { projectId: s.projectId, sprintId: null, deletedAt: null }, orderBy: { rank: 'desc' } }))?.rank ?? null;
      for (const i of issues) {
        prev = rankBetween(prev, null);
        await tx.issue.update({ where: { id: i.id }, data: { sprintId: null, rank: prev, version: { increment: 1 } } });
      }
      await tx.sprint.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.activity.log({ projectId: s.projectId, entity: 'sprint', entityId: id, action: 'deleted', actorId }, tx);
    });
  }
}
