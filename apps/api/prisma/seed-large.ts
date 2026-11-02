import { PrismaClient } from '@prisma/client';
import { createProject, ensureUser, seedIssues, seedTestCases } from './seed-lib';

const prisma = new PrismaClient();

/** Dữ liệu lớn để đo hiệu năng: 20.000 item + 50.000 test case (một function 10.000 case) trong dự án PERF. */
async function main() {
  if (await prisma.project.findUnique({ where: { key: 'PERF' } })) { console.log('Dự án PERF đã có — bỏ qua.'); return; }
  const admin = await ensureUser(prisma, 'admin@local.test', 'System Admin', 'admin', process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345');
  const users = [];
  for (let i = 1; i <= 8; i++) users.push(await ensureUser(prisma, `perf${i}@local.test`, `Perf User ${i}`, 'member', 'Password1!'));
  const { seedBase } = await import('./seed-base');
  await seedBase(prisma);
  const { project } = await createProject(prisma, {
    key: 'PERF', name: 'Performance dataset', template: 'Có QA', leadId: admin.id,
    members: [{ userId: admin.id, role: 'admin' }, ...users.map((u, i) => ({ userId: u.id, role: i % 3 === 0 ? 'tester' : 'developer' }))],
  });
  const ids = [admin.id, ...users.map((u) => u.id)];
  console.time('issues');
  await seedIssues(prisma, project.id, 'PERF', ids, { total: 20000, epics: 60, autoBugs: 400, pendingAuto: 40, activeSprint: true, seed: 5 });
  console.timeEnd('issues');
  console.time('test-cases');
  await seedTestCases(prisma, project.id, ids, { epics: 5, functions: 30, total: 50000, bigFunctionCases: 10000, prefix: 'PRF' });
  console.timeEnd('test-cases');
  console.log('Seed lớn xong: dự án PERF.');
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
