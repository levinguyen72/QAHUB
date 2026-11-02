import { Injectable } from '@nestjs/common';
import { ERROR_CODES, SYSTEM_LABELS, WorkflowTemplateDefinition, DEFAULT_TEST_CATEGORIES } from '@ospm/shared';
import { ActivityService } from '../activity/activity.service';
import { AppException, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { applyTemplateDefinition } from '../workflows/workflow-bootstrap';
import { AddMemberDto, CreateProjectDto, UpdateMemberDto, UpdateProjectDto, UpdateSettingsDto } from './projects.dto';
import type { AuthUser } from '../common/decorators';

const LABEL_COLORS: Record<string, string> = { manual: '#8c8c8c', auto: '#722ed1' };

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly activity: ActivityService) {}

  async list(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, ...(user.systemRole === 'admin' ? {} : { members: { some: { userId: user.id } } }) },
      include: { lead: { select: { id: true, displayName: true, avatarUrl: true } }, members: { where: { userId: user.id }, select: { role: true } } },
      orderBy: { key: 'asc' },
    });
    const ids = projects.map((p) => p.id);
    const [open, pending, sprints] = await Promise.all([
      this.prisma.$queryRaw<{ project_id: bigint; n: bigint }[]>`
        SELECT i.project_id, count(*) n FROM issues i JOIN workflow_statuses s ON s.id = i.status_id
        WHERE i.deleted_at IS NULL AND s.category <> 'done' AND i.project_id = ANY(${ids}) GROUP BY i.project_id`,
      this.prisma.$queryRaw<{ project_id: bigint; n: bigint }[]>`
        SELECT i.project_id, count(*) n FROM issues i JOIN workflow_statuses s ON s.id = i.status_id
        WHERE i.deleted_at IS NULL AND s.category = 'triage' AND i.project_id = ANY(${ids}) GROUP BY i.project_id`,
      this.prisma.sprint.findMany({ where: { projectId: { in: ids }, state: 'active', deletedAt: null }, select: { projectId: true, id: true, name: true } }),
    ]);
    const openBy = new Map(open.map((r) => [r.project_id, Number(r.n)]));
    const pendBy = new Map(pending.map((r) => [r.project_id, Number(r.n)]));
    const sprintBy = new Map(sprints.map((s) => [s.projectId, s]));
    return projects.map((p) => ({
      id: p.id, key: p.key, name: p.name, description: p.description, lead: p.lead, createdAt: p.createdAt,
      myRole: user.systemRole === 'admin' ? 'admin' : p.members[0]?.role ?? null,
      openIssues: openBy.get(p.id) ?? 0,
      pendingReview: pendBy.get(p.id) ?? 0,
      activeSprint: sprintBy.get(p.id) ?? null,
    }));
  }

  async create(dto: CreateProjectDto, actor: AuthUser) {
    if (await this.prisma.project.findUnique({ where: { key: dto.key } })) {
      throw new AppException(409, ERROR_CODES.PROJECT_KEY_TAKEN, `Mã dự án ${dto.key} đã tồn tại`);
    }
    const tpl = await this.prisma.workflowTemplate.findUnique({ where: { id: BigInt(dto.workflowTemplateId) } });
    if (!tpl) throw notFound(ERROR_CODES.NOT_FOUND, 'Không tìm thấy workflow template');
    if (dto.leadId && !(await this.prisma.user.findUnique({ where: { id: BigInt(dto.leadId) } }))) {
      throw notFound(ERROR_CODES.USER_NOT_FOUND, 'Không tìm thấy lead');
    }
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { key: dto.key, name: dto.name, description: dto.description, leadId: dto.leadId ? BigInt(dto.leadId) : null, settings: { createBugForFlaky: false } },
      });
      await applyTemplateDefinition(tx, project.id, tpl.definition as unknown as WorkflowTemplateDefinition);
      for (const name of SYSTEM_LABELS) {
        await tx.label.create({ data: { projectId: project.id, name, color: LABEL_COLORS[name], isSystem: true } });
      }
      await tx.testCategory.createMany({ data: DEFAULT_TEST_CATEGORIES.map((name, position) => ({ projectId: project.id, name, position })) });
      const adminIds = new Set<bigint>([actor.id]);
      if (dto.leadId) adminIds.add(BigInt(dto.leadId));
      await tx.projectMember.createMany({ data: [...adminIds].map((userId) => ({ projectId: project.id, userId, role: 'admin' })) });
      await this.activity.log({ projectId: project.id, entity: 'project', entityId: project.key, action: 'created', actorId: actor.id }, tx);
      return project;
    });
  }

  async get(projectId: bigint, role: string) {
    const p = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { lead: { select: { id: true, displayName: true, avatarUrl: true } } } });
    return { id: p.id, key: p.key, name: p.name, description: p.description, lead: p.lead, settings: p.settings, createdAt: p.createdAt, myRole: role };
  }

  async update(projectId: bigint, dto: UpdateProjectDto, actorId: bigint) {
    const p = await this.prisma.project.update({
      where: { id: projectId },
      data: { name: dto.name, description: dto.description, leadId: dto.leadId === undefined ? undefined : dto.leadId === null ? null : BigInt(dto.leadId) },
    });
    await this.activity.log({ projectId, entity: 'project', entityId: p.key, action: 'updated', actorId, changes: dto as any });
    return p;
  }

  async remove(projectId: bigint, actorId: bigint) {
    const p = await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    await this.activity.log({ projectId, entity: 'project', entityId: p.key, action: 'deleted', actorId });
  }

  async updateSettings(projectId: bigint, dto: UpdateSettingsDto, actorId: bigint) {
    const p = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const settings = { ...(p.settings as object), ...dto };
    await this.prisma.project.update({ where: { id: projectId }, data: { settings } });
    await this.activity.log({ projectId, entity: 'project', entityId: p.key, action: 'settings_updated', actorId, changes: dto as any });
    return settings;
  }

  // ----- Thành viên -----
  listMembers(projectId: bigint) {
    return this.prisma.projectMember
      .findMany({ where: { projectId }, include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true, isActive: true } } }, orderBy: { joinedAt: 'asc' } })
      .then((rows) => rows.map((m) => ({ userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user })));
  }

  async addMember(projectId: bigint, dto: AddMemberDto) {
    const userId = BigInt(dto.userId);
    if (!(await this.prisma.user.findUnique({ where: { id: userId } }))) throw notFound(ERROR_CODES.USER_NOT_FOUND, 'Không tìm thấy người dùng');
    if (await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })) {
      throw new AppException(409, ERROR_CODES.MEMBER_EXISTS, 'Người dùng đã là thành viên dự án');
    }
    await this.prisma.projectMember.create({ data: { projectId, userId, role: dto.role } });
    return { userId, role: dto.role };
  }

  private async assertNotLastAdmin(projectId: bigint, userId: bigint) {
    const member = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw notFound(ERROR_CODES.MEMBER_NOT_FOUND, 'Không tìm thấy thành viên');
    if (member.role === 'admin' && (await this.prisma.projectMember.count({ where: { projectId, role: 'admin' } })) <= 1) {
      throw new AppException(422, ERROR_CODES.WORKFLOW_INVALID, 'Dự án phải còn ít nhất một admin');
    }
  }

  async updateMember(projectId: bigint, userId: bigint, dto: UpdateMemberDto) {
    if (dto.role !== 'admin') await this.assertNotLastAdmin(projectId, userId);
    const m = await this.prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: dto.role } }).catch(() => {
      throw notFound(ERROR_CODES.MEMBER_NOT_FOUND, 'Không tìm thấy thành viên');
    });
    return { userId: m.userId, role: m.role };
  }

  async removeMember(projectId: bigint, userId: bigint) {
    await this.assertNotLastAdmin(projectId, userId);
    await this.prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  }
}
