import { auth, createTestApp, setupProject, TestCtx } from './helpers';

const api = (p: string) => `/api/v1${p}`;

/** Định nghĩa 4 thẻ số liệu 7 ngày (mục 7). */
describe('Summary cards', () => {
  let ctx: TestCtx;
  let t: Record<string, string>;
  const day = 86400_000;

  beforeAll(async () => {
    ctx = await createTestApp();
    ({ tokens: t } = await setupProject(ctx, 'ELMS', 'Mặc định', { developer: 'dev@x.test' }));
  });
  afterAll(() => ctx.close());

  it('completed / updated / created / due soon + filter assignee', async () => {
    const mk = async (title: string, extra: Record<string, unknown> = {}) => (await ctx.http().post(api('/projects/ELMS/issues')).set(auth(t.developer)).send({ type: 'task', title, ...extra }).expect(201)).body;
    const dev = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'dev@x.test' } });
    const a = await mk('A', { assigneeId: Number(dev.id), dueDate: new Date(Date.now() + 3 * day).toISOString().slice(0, 10) });
    const b = await mk('B', { dueDate: new Date(Date.now() + 30 * day).toISOString().slice(0, 10) });
    const c = await mk('C');
    const wf = (await ctx.http().get(api('/projects/ELMS/workflow')).set(auth(t.admin))).body;
    const done = wf.statuses.find((s: any) => s.name === 'Done');
    await ctx.http().post(api(`/issues/${c.key}/transitions`)).set(auth(t.admin)).send({ toStatusId: done.id }).expect(200);
    // item C đã xong; một item cũ ngoài 7 ngày
    await ctx.prisma.issue.update({ where: { id: BigInt(b.id) }, data: { createdAt: new Date(Date.now() - 20 * day), updatedAt: new Date(Date.now() - 20 * day) } });

    const s = (await ctx.http().get(api('/projects/ELMS/summary')).set(auth(t.developer)).expect(200)).body;
    expect(s.cards).toEqual({ completedLast7d: 1, updatedLast7d: 2, createdLast7d: 2, dueNext7d: 1 });
    expect(s.statusOverview.total).toBe(3);
    expect(s.bySource).toEqual({ manual: 3, auto: 0, pendingReview: 0 });
    expect(s.byType).toEqual([{ type: 'task', count: 3 }]);

    const mine = (await ctx.http().get(api(`/projects/ELMS/summary?assigneeIds=${dev.id}`)).set(auth(t.developer)).expect(200)).body;
    expect(mine.cards).toEqual({ completedLast7d: 0, updatedLast7d: 1, createdLast7d: 1, dueNext7d: 1 });
    expect(mine.statusOverview.total).toBe(1);
    void a;
  });

  it('dashboard aggregates across my projects and hides triage for non-testers', async () => {
    const d = (await ctx.http().get(api('/dashboard')).set(auth(t.developer)).expect(200)).body;
    expect(d.canTriage).toBe(false);
    expect(d.pendingReview).toEqual([]);
    expect(d.myWork[0].projectKey).toBe('ELMS');
    expect(d.cards.createdLast7d).toBeGreaterThan(0);
  });
});
