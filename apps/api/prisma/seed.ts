import { PrismaClient } from '@prisma/client';
import { generateRanks } from '@ospm/shared';
import { createHash } from 'node:crypto';
import { seedBase } from './seed-base';
import { createProject, daysAgo, ensureUser, rng, seedIssues, seedTestCases } from './seed-lib';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Password1!';

async function main() {
  await seedBase(prisma);
  if (await prisma.project.findUnique({ where: { key: 'ELMS' } })) { console.log('Dữ liệu mẫu đã có (dự án ELMS) — bỏ qua. Dùng DB mới để seed lại.'); return; }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@local.test' } });

  // 6 người dùng đủ vai trò
  const users = {
    lead: await ensureUser(prisma, 'lead@local.test', 'Lan (Admin dự án)', 'member', PASSWORD),
    dev1: await ensureUser(prisma, 'dev1@local.test', 'Hoà (Developer)', 'member', PASSWORD),
    dev2: await ensureUser(prisma, 'dev2@local.test', 'Minh (Developer)', 'member', PASSWORD),
    tester1: await ensureUser(prisma, 'tester1@local.test', 'Trang (Tester)', 'member', PASSWORD),
    tester2: await ensureUser(prisma, 'tester2@local.test', 'Khoa (Tester)', 'member', PASSWORD),
    viewer: await ensureUser(prisma, 'viewer@local.test', 'Vy (Viewer)', 'member', PASSWORD),
  };
  const members = [
    { userId: users.lead.id, role: 'admin' }, { userId: users.dev1.id, role: 'developer' }, { userId: users.dev2.id, role: 'developer' },
    { userId: users.tester1.id, role: 'tester' }, { userId: users.tester2.id, role: 'tester' }, { userId: users.viewer.id, role: 'viewer' },
  ];
  const workUsers = [users.lead.id, users.dev1.id, users.dev2.id, users.tester1.id, users.tester2.id];

  // ===== ELMS (template "Có QA") =====
  const { project: elms } = await createProject(prisma, { key: 'ELMS', name: 'E-Learning Management System', description: 'Dự án mẫu', template: 'Có QA', leadId: users.lead.id, members });
  console.log('ELMS: tạo 300 item…');
  const { ids, drafts } = await seedIssues(prisma, elms.id, 'ELMS', workUsers, { total: 300, epics: 8, autoBugs: 20, pendingAuto: 5, activeSprint: true });
  console.log('ELMS: tạo 10 lần chạy Playwright giả…');
  await seedRuns(elms.id, ids, drafts);
  console.log('ELMS: tạo 3 epic / 20 function / 5.000 test case…');
  const tc = await seedTestCases(prisma, elms.id, workUsers, { epics: 3, functions: 20, total: 5000 });
  // vài test case liên kết bug
  const failed = await prisma.testCase.findMany({ where: { projectId: elms.id, status: 'failed' }, take: 30, select: { id: true } });
  const bugs = ids.filter((_, i) => drafts[i].type === 'bug' && drafts[i].source === 'manual').slice(0, 30);
  await prisma.testCaseBug.createMany({ data: failed.slice(0, bugs.length).map((t, i) => ({ testCaseId: t.id, issueId: bugs[i] })), skipDuplicates: true });

  // ===== DEMO (template "Tối giản": không có To Do) =====
  const { project: demo } = await createProject(prisma, { key: 'DEMO', name: 'Demo workflow tối giản', template: 'Tối giản', leadId: users.lead.id, members: members.concat([{ userId: admin.id, role: 'admin' }]) });
  await seedIssues(prisma, demo.id, 'DEMO', workUsers, { total: 30, epics: 2, autoBugs: 4, pendingAuto: 2, activeSprint: true, seed: 3 });

  console.log(`Seed xong. Đăng nhập: admin@local.test / $SEED_ADMIN_PASSWORD; các user mẫu (lead|dev1|dev2|tester1|tester2|viewer)@local.test / ${PASSWORD}`);
  void tc;
}

/** 10 lần chạy giả: kết quả pass/fail/flaky; lần fail gắn với các bug auto có sẵn. */
async function seedRuns(projectId: bigint, ids: bigint[], drafts: { source: string; fingerprint: string | null }[]) {
  const r = rng(99);
  const key = await prisma.apiKey.create({ data: { projectId, name: 'GitLab CI - nightly (mẫu)', prefix: 'pmk_live_seed', keyHash: createHash('sha256').update('seed-key-not-usable').digest('hex'), createdBy: (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@local.test' } })).id } });
  const autoIdx = drafts.map((d, i) => ({ d, i })).filter((x) => x.d.source === 'auto');
  for (let n = 0; n < 10; n++) {
    const total = 120 + r.int(60);
    const failed = 2 + r.int(6);
    const flaky = r.int(4);
    const started = daysAgo(10 - n, 2);
    const run = await prisma.automationRun.create({
      data: { projectId, externalId: `seed-pipeline-${1000 + n}`, name: 'Nightly regression', branch: 'develop', commitSha: `9f2c1a${n}`, environment: n % 3 ? 'staging' : 'uat', ciUrl: `https://gitlab.company.local/elms/-/pipelines/${1000 + n}`, status: 'completed', total, passed: total - failed - flaky - 3, failed, flaky, skipped: 3, bugsCreated: n % 4 === 0 ? 1 : 0, bugsUpdated: failed > 3 ? 1 : 0, durationMs: BigInt(900_000 + r.int(600_000)), startedAt: started, finishedAt: new Date(started.getTime() + 1_300_000), apiKeyId: key.id, createdAt: started },
    });
    const rows = [];
    for (let i = 0; i < total; i++) {
      const bucket = i < failed ? 'failed' : i < failed + flaky ? 'flaky' : i < failed + flaky + 3 ? 'skipped' : 'passed';
      const bug = bucket === 'failed' ? autoIdx[i % autoIdx.length] : null;
      rows.push({
        runId: run.id, testId: `t-${n}-${i}`, file: `tests/student/spec-${i % 12}.spec.ts`, line: 10 + (i % 80), titlePath: ['Học sinh', `Nhóm ${i % 12}`, `Test ${i}`], browser: i % 2 ? 'firefox' : 'chromium',
        status: bucket, retries: bucket === 'flaky' ? 1 : bucket === 'failed' ? 2 : 0, durationMs: 800 + r.int(9000), tags: i % 5 === 0 ? [`@CL_NDS-U-00796-${String(20 + (i % 9)).padStart(3, '0')}`] : [],
        errorMessage: bucket === 'failed' ? 'expect(locator).toHaveText(...) failed' : null, fingerprint: bug ? drafts[bug.i].fingerprint : null,
        issueId: bug ? ids[bug.i] : null, issueAction: bug ? 'updated' : bucket === 'flaky' ? 'skipped_flaky' : 'none',
      });
    }
    await prisma.automationResult.createMany({ data: rows });
  }
  void generateRanks;
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
