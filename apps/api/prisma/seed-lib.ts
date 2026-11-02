import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEST_CATEGORIES, generateRanks, SYSTEM_LABELS, WorkflowTemplateDefinition } from '@ospm/shared';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { applyTemplateDefinition } from '../src/workflows/workflow-bootstrap';

/** PRNG có seed để dữ liệu mẫu lặp lại được. */
export function rng(seed = 42) {
  let a = seed;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)], chance: (p: number) => next() < p };
}
export type Rng = ReturnType<typeof rng>;

export const daysAgo = (d: number, jitterHours = 0) => new Date(Date.now() - d * 86400_000 - jitterHours * 3600_000);

export async function ensureUser(prisma: PrismaClient, email: string, displayName: string, systemRole: 'admin' | 'member', password: string) {
  const hash = await argon2.hash(password);
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, displayName, systemRole, passwordHash: hash } });
}

/** Tạo dự án giống ProjectsService.create (template workflow, label hệ thống, category test case, thành viên). */
export async function createProject(prisma: PrismaClient, p: { key: string; name: string; description?: string; template: string; leadId: bigint; members: { userId: bigint; role: string }[] }) {
  const existing = await prisma.project.findUnique({ where: { key: p.key } });
  if (existing) return { project: existing, created: false };
  const tpl = await prisma.workflowTemplate.findUniqueOrThrow({ where: { name: p.template } });
  const project = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { key: p.key, name: p.name, description: p.description, leadId: p.leadId, settings: { createBugForFlaky: false } } });
    await applyTemplateDefinition(tx, project.id, tpl.definition as unknown as WorkflowTemplateDefinition);
    for (const name of SYSTEM_LABELS) await tx.label.create({ data: { projectId: project.id, name, color: name === 'auto' ? '#722ed1' : '#8c8c8c', isSystem: true } });
    await tx.label.createMany({ data: [{ projectId: project.id, name: 'qa-pending', color: '#fa8c16' }, { projectId: project.id, name: 'tech-debt', color: '#13c2c2' }, { projectId: project.id, name: 'regression', color: '#f5222d' }] });
    await tx.testCategory.createMany({ data: DEFAULT_TEST_CATEGORIES.map((name, position) => ({ projectId: project.id, name, position })) });
    await tx.projectMember.createMany({ data: p.members.map((m) => ({ projectId: project.id, userId: m.userId, role: m.role })), skipDuplicates: true });
    return project;
  });
  return { project, created: true };
}

const TITLES = ['Hiển thị điểm', 'Lọc theo lớp', 'Xuất báo cáo', 'Đăng nhập SSO', 'Phân quyền giáo viên', 'Tìm kiếm học sinh', 'Gửi thông báo', 'Đồng bộ danh sách', 'Chấm bài tự động', 'Lịch sử làm bài', 'Cập nhật hồ sơ', 'Import danh sách', 'Biểu đồ tiến độ', 'Đặt lại mật khẩu', 'Phân trang bảng điểm'];
const VERBS = ['Thêm', 'Sửa lỗi', 'Cải thiện', 'Tối ưu', 'Kiểm tra', 'Refactor', 'Thiết kế'];

export interface SeedIssuesOptions { total: number; epics: number; autoBugs: number; pendingAuto: number; activeSprint: boolean; seed?: number; bigBatch?: boolean }

/** Sinh item đủ loại, trạng thái, sprint, lịch sử đổi trạng thái và activity. Trả về map số → id cho bước kế tiếp. */
export async function seedIssues(prisma: PrismaClient, projectId: bigint, projectKey: string, userIds: bigint[], o: SeedIssuesOptions) {
  const r = rng(o.seed ?? 7);
  const statuses = await prisma.workflowStatus.findMany({ where: { projectId, isArchived: false }, orderBy: { position: 'asc' } });
  const settings = await prisma.workflowSettings.findUniqueOrThrow({ where: { projectId } });
  const work = statuses.filter((s) => s.category !== 'triage' && s.name !== 'Rejected');
  const doneSt = statuses.filter((s) => s.category === 'done' && s.name !== 'Rejected');
  const rejected = statuses.find((s) => s.name === 'Rejected') ?? doneSt[0];
  const triage = statuses.find((s) => s.category === 'triage')!;
  const labels = await prisma.label.findMany({ where: { projectId } });
  const L = Object.fromEntries(labels.map((l) => [l.name, l.id]));
  const sprints = {
    active: o.activeSprint ? await prisma.sprint.create({ data: { projectId, name: `${projectKey} Sprint 22`, state: 'active', startDate: daysAgo(6), endDate: daysAgo(-8), goal: 'Hoàn thiện luồng làm bài và báo cáo điểm', position: 1 } }) : null,
    future: await prisma.sprint.create({ data: { projectId, name: `${projectKey} Sprint 23`, state: 'future', position: 2 } }),
  };
  await prisma.sprint.create({ data: { projectId, name: `${projectKey} Sprint 21`, state: 'closed', startDate: daysAgo(21), endDate: daysAgo(7), completedAt: daysAgo(7), position: 0 } });

  const nManual = o.total - o.autoBugs;
  const types: ('epic' | 'story' | 'task' | 'bug' | 'subtask')[] = [];
  for (let i = 0; i < o.epics; i++) types.push('epic');
  const rest = nManual - o.epics;
  const nSub = Math.floor(rest * 0.14), nBug = Math.floor(rest * 0.2), nTask = Math.floor(rest * 0.27);
  for (let i = 0; i < nSub; i++) types.push('subtask');
  for (let i = 0; i < nBug; i++) types.push('bug');
  for (let i = 0; i < nTask; i++) types.push('task');
  while (types.length < nManual) types.push('story');
  const ranks = generateRanks(o.total + 10);
  let seq = 0;
  const proj = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const base = Number(proj.issueSeq);
  const rowsFor = (kind: 'manual' | 'auto') => (kind === 'manual' ? types : Array(o.autoBugs).fill('bug')) as typeof types;

  type Draft = { number: bigint; type: string; title: string; statusId: bigint; priority: string; source: string; assigneeId: bigint | null; reporterId: bigint | null; rank: string; estimateMinutes: number | null; dueDate: Date | null; sprintId: bigint | null; createdAt: Date; updatedAt: Date; resolvedAt: Date | null; resolution: string | null; fingerprint: string | null; occurrenceCount: number; firstSeenAt: Date | null; lastSeenAt: Date | null; parentIdx: number | null };
  const drafts: Draft[] = [];
  const epicIdx: number[] = [];
  const parentable: number[] = [];

  for (const kind of ['manual', 'auto'] as const) {
    rowsFor(kind).forEach((type, i) => {
      const number = BigInt(base + (++seq));
      const created = daysAgo(r.int(30), r.int(24));
      let status = r.pick(work);
      let sprintId: bigint | null = null;
      let resolution: string | null = null;
      let source = kind;
      let reporterId: bigint | null = r.pick(userIds);
      let fingerprint: string | null = null;
      let occ = 1;
      let first: Date | null = null, last: Date | null = null;
      if (kind === 'auto') {
        reporterId = null; first = daysAgo(r.int(10) + 1); last = daysAgo(r.int(2)); occ = 1 + r.int(6);
        fingerprint = createHash('sha256').update(`${projectKey}|auto|${i}`).digest('hex');
        if (i < o.pendingAuto) status = triage;
        else if (i < o.pendingAuto + 3) { status = rejected; resolution = 'rejected'; }
        else if (i < o.pendingAuto + 5) { status = rejected; resolution = 'duplicate'; }
        else if (i < o.pendingAuto + 7) { status = r.pick(doneSt); resolution = 'done'; }
        else status = r.pick(work.filter((s) => s.category !== 'done'));
      } else if (type === 'epic') status = r.pick(work.filter((s) => s.category !== 'done'));
      else if (type === 'subtask') status = r.pick(work);
      if (status.category === 'done' && !resolution) resolution = 'done';
      if (type !== 'epic' && status.category !== 'triage' && status.name !== 'Rejected') {
        // Sprint thật chỉ có vài chục item: giữ xác suất nhỏ khi tổng số item lớn
        const scale = Math.min(1, 300 / o.total);
        if (o.activeSprint && sprints.active && r.chance((status.category === 'done' ? 0.2 : 0.16) * scale)) sprintId = sprints.active.id;
        else if (r.chance(0.07 * scale)) sprintId = sprints.future.id;
      }
      const updated = new Date(Math.max(created.getTime(), daysAgo(r.int(8), r.int(24)).getTime()));
      const title = `${type === 'bug' ? 'Lỗi: ' : r.pick(VERBS) + ' '}${r.pick(TITLES)} #${seq}`;
      if (type === 'epic') epicIdx.push(drafts.length);
      else if (type !== 'subtask' && kind === 'manual') parentable.push(drafts.length);
      drafts.push({
        number, type, title: kind === 'auto' ? `[Auto] Học sinh › ${r.pick(TITLES)} — expect(locator).toHaveText failed #${seq}` : title, statusId: kind === 'auto' && i < o.pendingAuto ? settings.initialAutoStatusId : status.id,
        priority: r.pick(['highest', 'high', 'medium', 'medium', 'medium', 'low', 'lowest']), source, assigneeId: status.category === 'triage' || kind === 'auto' && i < o.pendingAuto ? null : r.chance(0.8) ? r.pick(userIds) : null,
        reporterId, rank: ranks[drafts.length], estimateMinutes: type === 'epic' ? null : r.pick([30, 60, 120, 240, 480, null]),
        dueDate: status.category !== 'done' && r.chance(0.12) ? daysAgo(-r.int(9)) : null, sprintId, createdAt: created, updatedAt: updated,
        resolvedAt: resolution ? updated : null, resolution, fingerprint, occurrenceCount: occ, firstSeenAt: first, lastSeenAt: last,
        parentIdx: null,
      });
    });
  }
  // gán cha: story/task/bug -> epic, subtask -> story/task/bug
  drafts.forEach((d, idx) => {
    if (d.type === 'subtask' && parentable.length) d.parentIdx = r.pick(parentable.filter((p) => p !== idx));
    else if ((d.type === 'story' || d.type === 'task' || d.type === 'bug') && d.source === 'manual' && epicIdx.length && r.chance(0.7)) d.parentIdx = r.pick(epicIdx);
  });

  const ids: bigint[] = [];
  const BATCH = 2000;
  for (let i = 0; i < drafts.length; i += BATCH) {
    const chunk = drafts.slice(i, i + BATCH);
    const created = await prisma.issue.createManyAndReturn({
      data: chunk.map((d) => ({ projectId, number: d.number, type: d.type, title: d.title.slice(0, 255), statusId: d.statusId, priority: d.priority, source: d.source, assigneeId: d.assigneeId, reporterId: d.reporterId, rank: d.rank, estimateMinutes: d.estimateMinutes, dueDate: d.dueDate, sprintId: d.sprintId, createdAt: d.createdAt, updatedAt: d.updatedAt, resolvedAt: d.resolvedAt, resolution: d.resolution, fingerprint: d.fingerprint, occurrenceCount: d.occurrenceCount, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt })),
      select: { id: true },
    });
    ids.push(...created.map((c) => c.id));
  }
  // cha
  const withParent = drafts.map((d, idx) => ({ d, idx })).filter((x) => x.d.parentIdx !== null);
  for (let i = 0; i < withParent.length; i += 500) {
    await prisma.$transaction(withParent.slice(i, i + 500).map(({ d, idx }) => prisma.issue.update({ where: { id: ids[idx] }, data: { parentId: ids[d.parentIdx!] } })));
  }
  // label + lịch sử trạng thái + activity
  const labelRows: { issueId: bigint; labelId: bigint }[] = [];
  const changeRows: { issueId: bigint; fromStatusId: bigint | null; toStatusId: bigint; changedBy: bigint | null; changedAt: Date }[] = [];
  const activityRows: any[] = [];
  drafts.forEach((d, idx) => {
    labelRows.push({ issueId: ids[idx], labelId: d.source === 'auto' ? L['auto'] : L['manual'] });
    if (d.source === 'manual' && r.chance(0.18)) labelRows.push({ issueId: ids[idx], labelId: r.pick([L['qa-pending'], L['tech-debt'], L['regression']]) });
    const initial = d.source === 'auto' ? settings.initialAutoStatusId : settings.initialManualStatusId;
    changeRows.push({ issueId: ids[idx], fromStatusId: null, toStatusId: initial, changedBy: d.reporterId, changedAt: d.createdAt });
    if (d.statusId !== initial) changeRows.push({ issueId: ids[idx], fromStatusId: initial, toStatusId: d.statusId, changedBy: d.assigneeId ?? d.reporterId, changedAt: d.updatedAt });
    if (idx % 6 === 0 || idx >= drafts.length - 40) {
      activityRows.push({ projectId, entity: 'issue', entityId: `${projectKey}-${d.number}`, action: 'created', actorId: d.reporterId, changes: { title: [null, d.title] }, createdAt: d.createdAt });
      if (d.statusId !== initial) activityRows.push({ projectId, entity: 'issue', entityId: `${projectKey}-${d.number}`, action: 'status_changed', actorId: d.assigneeId ?? d.reporterId, changes: { status: [statuses.find((s) => s.id === initial)?.name, statuses.find((s) => s.id === d.statusId)?.name] }, createdAt: d.updatedAt });
    }
  });
  for (let i = 0; i < labelRows.length; i += 5000) await prisma.issueLabel.createMany({ data: labelRows.slice(i, i + 5000), skipDuplicates: true });
  for (let i = 0; i < changeRows.length; i += 5000) await prisma.issueStatusChange.createMany({ data: changeRows.slice(i, i + 5000) });
  for (let i = 0; i < activityRows.length; i += 5000) await prisma.activityLog.createMany({ data: activityRows.slice(i, i + 5000) });
  await prisma.project.update({ where: { id: projectId }, data: { issueSeq: base + seq } });
  return { ids, drafts };
}

export interface SeedTestCasesOptions { epics: number; functions: number; total: number; bigFunctionCases?: number; seed?: number; prefix?: string }

/** Epic → Function → test case (mẫu checklist). */
export async function seedTestCases(prisma: PrismaClient, projectId: bigint, userIds: bigint[], o: SeedTestCasesOptions) {
  const r = rng(o.seed ?? 11);
  const prefix = o.prefix ?? 'NDS';
  const cats = await prisma.testCategory.findMany({ where: { projectId } });
  const epicRanks = generateRanks(o.epics);
  const fnRanks = generateRanks(o.functions);
  const epics = [];
  for (let i = 0; i < o.epics; i++) {
    epics.push(await prisma.requirement.create({ data: { projectId, kind: 'epic', code: `${prefix}-E-${String(946 + i).padStart(5, '0')}`, name: `Epic ${i + 1}: ${r.pick(TITLES)}`, rank: epicRanks[i], traceRef: `UC ${i + 1}` } }));
  }
  const fns = [];
  for (let i = 0; i < o.functions; i++) {
    const fn = await prisma.requirement.create({ data: { projectId, kind: 'function', code: `${prefix}-U-${String(796 + i).padStart(5, '0')}`, name: `${r.pick(TITLES)} (${i + 1})`, rank: fnRanks[i], traceRef: `UC ${48 + i}, BA_MENU_TRACEABILITY Row ${48 + i}/69` } });
    await prisma.requirementLink.create({ data: { epicId: epics[i % epics.length].id, functionId: fn.id } });
    await prisma.requirementSource.create({ data: { requirementId: fn.id, path: `docs/ba/uc${48 + i}.docx`, position: 0 } });
    fns.push(fn);
  }
  const big = o.bigFunctionCases ?? 0;
  const per = Math.floor((o.total - big) / (big ? fns.length - 1 : fns.length));
  let created = 0;
  for (let f = 0; f < fns.length; f++) {
    const fn = fns[f];
    const n = big && f === 0 ? big : f === fns.length - 1 ? o.total - created : per;
    const ranks = generateRanks(n);
    const rows = Array.from({ length: n }, (_, i) => {
      const seq = i + 1;
      const code = `CL_${fn.code}-${String(seq).padStart(3, '0')}`;
      const st = r.pick(['not_started', 'not_started', 'passed', 'passed', 'passed', 'failed', 'blocked', 'na']);
      return {
        projectId, functionId: fn.id, seq, code, title: `Kiểm tra ${r.pick(TITLES).toLowerCase()} — trường hợp ${seq}`, priority: r.pick(['critical', 'high', 'medium', 'medium', 'low']), categoryId: r.pick(cats).id,
        preconditions: r.chance(0.5) ? 'Đã đăng nhập bằng tài khoản giáo viên' : null,
        steps: Array.from({ length: 2 + r.int(3) }, (_, k) => ({ id: `${code}-s${k + 1}`, no: k + 1, action: `Thực hiện bước ${k + 1}`, expected: `Kết quả mong đợi ${k + 1}` })) as any,
        status: st, notes: st === 'failed' ? 'Cần xem lại' : null, automationTag: `@${code}`, rank: ranks[i], createdBy: r.pick(userIds), updatedBy: r.pick(userIds), updatedAt: daysAgo(r.int(20)),
      };
    });
    for (let i = 0; i < rows.length; i += 2000) await prisma.testCase.createMany({ data: rows.slice(i, i + 2000) });
    await prisma.requirement.update({ where: { id: fn.id }, data: { lastCaseSeq: n } });
    created += n;
  }
  // phiên bản v1 cho mọi test case
  await prisma.$executeRaw`
    INSERT INTO test_case_versions (test_case_id, version, snapshot, changed_by)
    SELECT id, 1, jsonb_build_object('title', title, 'priority', priority, 'categoryId', category_id, 'preconditions', preconditions,
           'steps', steps, 'status', status, 'notes', notes, 'automationTag', automation_tag, 'functionId', function_id), created_by
    FROM test_cases WHERE project_id = ${projectId} ON CONFLICT DO NOTHING`;
  return { epics, fns, total: created };
}
