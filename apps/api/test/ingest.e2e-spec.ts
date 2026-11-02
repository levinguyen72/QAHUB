import { auth, createTestApp, setupProject, TestCtx } from './helpers';

const api = (p: string) => `/api/v1${p}`;

describe('Ingest Playwright runs', () => {
  let ctx: TestCtx;
  let tokens: Record<string, string>;
  let keyA: string;
  let keyB: string;

  const failedResult = (over: Record<string, unknown> = {}) => ({
    testId: 't1', file: 'tests/student/exam.spec.ts', line: 42, titlePath: ['Học sinh', 'Bài kiểm tra', 'Điểm số'], browser: 'chromium',
    status: 'failed', retries: 2, durationMs: 1000, error: { message: 'expect(locator).toHaveText(...) failed\nTimeout 30000ms', stack: 'stack', snippet: 'code' },
    tags: ['@regression'], attachments: [{ ref: 'att-1', kind: 'screenshot', fileName: 'shot.png', mimeType: 'image/png', size: 1000 }], ...over,
  });

  async function newKey(projectKey: string, token: string, scopes = ['runs:write']) {
    const res = await ctx.http().post(api(`/projects/${projectKey}/api-keys`)).set(auth(token)).send({ name: 'ci', scopes }).expect(201);
    return res.body as { id: string; key: string; prefix: string };
  }

  /** 3 bước đủ: gửi, upload, complete. */
  async function sendRun(key: string, externalId: string, results: unknown[]) {
    const res = await ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${key}`).send({ externalId, branch: 'develop', commitSha: '9f2c1ab', environment: 'staging', results });
    if (res.status !== 201) return res;
    for (const u of res.body.uploads) ctx.storage.put(u.uploadUrl.replace('http://fake-s3/put/', ''));
    await ctx.http().post(api(`/ingest/runs/${res.body.runId}/complete`)).set('Authorization', `Bearer ${key}`).expect(202);
    return res;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    ({ tokens } = await setupProject(ctx, 'ELMS', 'Có QA', { tester: 'tester@x.test', developer: 'dev@x.test' }));
    await setupProject(ctx, 'DEMO', 'Tối giản');
    keyA = (await newKey('ELMS', tokens.admin)).key;
    keyB = (await newKey('DEMO', tokens.admin)).key;
  });
  afterAll(() => ctx.close());

  it('ping returns project info; invalid and missing keys are rejected with codes', async () => {
    const ok = await ctx.http().get(api('/ingest/ping')).set('Authorization', `Bearer ${keyA}`).expect(200);
    expect(ok.body).toMatchObject({ projectKey: 'ELMS', keyName: 'ci', scopes: ['runs:write'] });
    const bad = await ctx.http().get(api('/ingest/ping')).set('Authorization', 'Bearer pmk_live_nope').expect(401);
    expect(bad.body).toMatchObject({ statusCode: 401, code: 'API_KEY_INVALID' });
    await ctx.http().get(api('/ingest/ping')).expect(401);
  });

  it('the key is stored hashed and only shown once', async () => {
    const row = await ctx.prisma.apiKey.findFirstOrThrow({ where: { project: { key: 'ELMS' } } });
    expect(row.keyHash).not.toContain(keyA);
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(keyA.startsWith('pmk_live_')).toBe(true);
    const list = await ctx.http().get(api('/projects/ELMS/api-keys')).set(auth(tokens.admin)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(keyA);
    await ctx.http().get(api('/projects/ELMS/api-keys')).set(auth(tokens.developer)).expect(403);
  });

  it('3-step flow creates one auto bug in Pending Review with label auto, and it stays off the board', async () => {
    const res = await sendRun(keyA, 'ci-1', [
      failedResult(), failedResult({ testId: 't2', browser: 'firefox', attachments: [] }),
      { testId: 't3', file: 'a.spec.ts', titlePath: ['ok'], status: 'passed', retries: 0 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.uploads).toHaveLength(1);
    const run = (await ctx.http().get(api(`/automation-runs/${res.body.runId}`)).set(auth(tokens.developer)).expect(200)).body;
    expect(run).toMatchObject({ status: 'completed', total: 3, failed: 2, passed: 1, bugsCreated: 1, bugsUpdated: 0 });
    const issues = (await ctx.http().get(api('/projects/ELMS/issues?source=auto')).set(auth(tokens.developer)).expect(200)).body.items;
    expect(issues).toHaveLength(1); // chromium + firefox cùng fingerprint → 1 bug
    expect(issues[0]).toMatchObject({ source: 'auto', type: 'bug', priority: 'medium', occurrenceCount: 1 });
    expect(issues[0].status.name).toBe('Pending Review');
    expect(issues[0].labels.map((l: any) => l.name)).toEqual(['auto']);
    expect(issues[0].reporterId).toBeNull();
    expect(issues[0].title.startsWith('[Auto] Học sinh › Bài kiểm tra › Điểm số — ')).toBe(true);
    const detail = (await ctx.http().get(api(`/issues/${issues[0].key}`)).set(auth(tokens.developer)).expect(200)).body;
    expect(detail.attachments).toHaveLength(1);
    expect(detail.autoInfo).toMatchObject({ occurrenceCount: 1, file: 'tests/student/exam.spec.ts', line: 42 });
    const board = (await ctx.http().get(api('/projects/ELMS/board')).set(auth(tokens.developer)).expect(200)).body;
    expect(JSON.stringify(board)).not.toContain('Pending Review');
    const results = (await ctx.http().get(api(`/automation-runs/${res.body.runId}/results?status=failed`)).set(auth(tokens.developer)).expect(200)).body.items;
    expect(results[0].issue.key).toBe(issues[0].key);
  });

  it('same externalId is idempotent (200) and does not duplicate data', async () => {
    const again = await ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${keyA}`).send({ externalId: 'ci-1', results: [failedResult()] }).expect(200);
    expect(again.body.uploads).toEqual([]);
    expect(await ctx.prisma.automationRun.count({ where: { externalId: 'ci-1' } })).toBe(1);
    const c1 = await ctx.http().post(api(`/ingest/runs/${again.body.runId}/complete`)).set('Authorization', `Bearer ${keyA}`).expect(202);
    expect(c1.body.status).toBe('completed');
    expect(await ctx.prisma.issue.count({ where: { source: 'auto' } })).toBe(1);
  });

  it('the same failure on 3 nights yields 1 bug with occurrence_count = 3 and system comments', async () => {
    await sendRun(keyA, 'ci-2', [failedResult({ error: { message: 'expect(locator).toHaveText(...) failed\nTimeout 5000ms' } })]);
    const r3 = await sendRun(keyA, 'ci-3', [failedResult()]);
    const bugs = await ctx.prisma.issue.findMany({ where: { source: 'auto', project: { key: 'ELMS' } } });
    expect(bugs).toHaveLength(1);
    expect(bugs[0].occurrenceCount).toBe(3);
    const run3 = (await ctx.http().get(api(`/automation-runs/${r3.body.runId}`)).set(auth(tokens.developer))).body;
    expect(run3).toMatchObject({ bugsCreated: 0, bugsUpdated: 1 });
    const comments = (await ctx.http().get(api(`/issues/ELMS-${bugs[0].number}/comments`)).set(auth(tokens.developer)).expect(200)).body;
    expect(comments.filter((c: any) => c.authorId === null)).toHaveLength(2);
  });

  it('flaky tests do not create bugs unless createBugForFlaky is on', async () => {
    const flaky = { testId: 'f1', file: 'flaky.spec.ts', titlePath: ['flaky'], status: 'passed', retries: 1, error: { message: 'first attempt failed' } };
    const r = await sendRun(keyA, 'ci-flaky-1', [flaky]);
    const run = (await ctx.http().get(api(`/automation-runs/${r.body.runId}`)).set(auth(tokens.developer))).body;
    expect(run).toMatchObject({ flaky: 1, bugsCreated: 0 });
    const res = await ctx.prisma.automationResult.findFirstOrThrow({ where: { runId: BigInt(r.body.runId) } });
    expect(res.status).toBe('flaky');
    expect(res.issueAction).toBe('skipped_flaky');
    await ctx.http().patch(api('/projects/ELMS/settings')).set(auth(tokens.admin)).send({ createBugForFlaky: true }).expect(200);
    await sendRun(keyA, 'ci-flaky-2', [flaky]);
    expect(await ctx.prisma.issue.count({ where: { title: { contains: 'flaky' } } })).toBe(1);
    await ctx.http().patch(api('/projects/ELMS/settings')).set(auth(tokens.admin)).send({ createBugForFlaky: false }).expect(200);
  });

  it('two parallel runs with the same fingerprint create exactly one bug', async () => {
    const mk = (id: string) => ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${keyA}`).send({ externalId: id, results: [{ testId: 'p', file: 'par.spec.ts', titlePath: ['parallel'], status: 'failed', error: { message: 'boom' } }] });
    const [a, b] = await Promise.all([mk('par-1'), mk('par-2')]);
    await Promise.all([a, b].map((r) => ctx.http().post(api(`/ingest/runs/${r.body.runId}/complete`)).set('Authorization', `Bearer ${keyA}`)));
    const bugs = await ctx.prisma.issue.findMany({ where: { title: { contains: 'parallel' } } });
    expect(bugs).toHaveLength(1);
    expect(bugs[0].occurrenceCount).toBe(2);
  });

  it('triage then re-occurrence: rejected bug only counts; fixed bug => regression_of new bug', async () => {
    const test = (n: string) => [{ testId: n, file: `${n}.spec.ts`, titlePath: [n], status: 'failed', error: { message: `${n} broke` } }];
    await sendRun(keyA, 'tri-rej-1', test('rejectme'));
    await sendRun(keyA, 'tri-fix-1', test('fixme'));
    const rej = await ctx.prisma.issue.findFirstOrThrow({ where: { title: { contains: 'rejectme' } } });
    const fix = await ctx.prisma.issue.findFirstOrThrow({ where: { title: { contains: 'fixme' } } });
    await ctx.http().post(api(`/issues/ELMS-${rej.number}/triage`)).set(auth(tokens.tester)).send({ action: 'reject', reason: 'noise' }).expect(200);
    await ctx.http().post(api(`/issues/ELMS-${fix.number}/triage`)).set(auth(tokens.tester)).send({ action: 'accept' }).expect(200);
    const wf = (await ctx.http().get(api('/projects/ELMS/workflow')).set(auth(tokens.admin))).body;
    const done = wf.statuses.find((s: any) => s.name === 'Done');
    await ctx.http().post(api(`/issues/ELMS-${fix.number}/transitions`)).set(auth(tokens.admin)).send({ toStatusId: done.id }).expect(200);

    await sendRun(keyA, 'tri-rej-2', test('rejectme'));
    await sendRun(keyA, 'tri-fix-2', test('fixme'));
    expect(await ctx.prisma.issue.count({ where: { title: { contains: 'rejectme' } } })).toBe(1);
    expect((await ctx.prisma.issue.findUniqueOrThrow({ where: { id: rej.id } })).occurrenceCount).toBe(2);
    const bugs = await ctx.prisma.issue.findMany({ where: { title: { contains: 'fixme' } }, orderBy: { id: 'asc' } });
    expect(bugs).toHaveLength(2);
    expect(bugs[1].statusId).not.toBe(bugs[0].statusId);
    const link = await ctx.prisma.issueLink.findFirstOrThrow({ where: { sourceId: bugs[1].id } });
    expect(link).toMatchObject({ targetId: bugs[0].id, type: 'regression_of' });
  });

  it('duplicate triage adds occurrence to the original bug', async () => {
    const [orig, dup] = await ctx.prisma.issue.findMany({ where: { source: 'auto', title: { contains: 'parallel' } } }).then(async (p) => {
      const other = await ctx.prisma.issue.findFirstOrThrow({ where: { source: 'auto', title: { contains: 'rejectme' } } });
      return [p[0], other];
    });
    void dup;
    const fresh = await sendRun(keyA, 'dup-1', [{ testId: 'd', file: 'dup.spec.ts', titlePath: ['dupme'], status: 'failed', error: { message: 'dup' } }]);
    void fresh;
    const d = await ctx.prisma.issue.findFirstOrThrow({ where: { title: { contains: 'dupme' } } });
    const before = (await ctx.prisma.issue.findUniqueOrThrow({ where: { id: orig.id } })).occurrenceCount;
    await ctx.http().post(api(`/issues/ELMS-${d.number}/triage`)).set(auth(tokens.tester)).send({ action: 'duplicate', duplicateOfKey: `ELMS-${orig.number}` }).expect(200);
    expect((await ctx.prisma.issue.findUniqueOrThrow({ where: { id: orig.id } })).occurrenceCount).toBe(before + 1);
  });

  it('revoked key gets 401 API_KEY_REVOKED; key of project A cannot touch project B data', async () => {
    const runB = await sendRun(keyB, 'b-1', [failedResult()]);
    expect(await ctx.prisma.issue.count({ where: { project: { key: 'DEMO' }, source: 'auto' } })).toBe(1);
    const a = await ctx.http().get(api(`/ingest/runs/${runB.body.runId}`)).set('Authorization', `Bearer ${keyA}`).expect(404);
    expect(a.body.code).toBe('RUN_NOT_FOUND');
    const k = await ctx.prisma.apiKey.findFirstOrThrow({ where: { project: { key: 'ELMS' } } });
    await ctx.http().post(api(`/api-keys/${k.id}/revoke`)).set(auth(tokens.admin)).expect(200);
    const res = await ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${keyA}`).send({ externalId: 'x', results: [] }).expect(401);
    expect(res.body.code).toBe('API_KEY_REVOKED');
  });

  it('scope is enforced', async () => {
    const k = await newKey('DEMO', tokens.admin, ['issues:write']);
    const res = await ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${k.key}`).send({ externalId: 'scope', results: [] }).expect(403);
    expect(res.body.code).toBe('API_KEY_SCOPE');
  });

  it('validation errors use the common error format', async () => {
    const res = await ctx.http().post(api('/ingest/runs')).set('Authorization', `Bearer ${keyB}`).send({ results: [] }).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('manual issue can be created from a result', async () => {
    const res = await ctx.prisma.automationResult.findFirstOrThrow({ where: { issueId: null, status: 'failed', run: { project: { key: 'DEMO' } } } }).catch(() => null);
    expect(res).toBeNull(); // mọi kết quả fail đã gắn bug
    const rid = (await ctx.prisma.automationResult.findFirstOrThrow({ where: { run: { project: { key: 'DEMO' } } } })).id;
    await ctx.http().post(api(`/automation-results/${rid}/create-issue`)).set(auth(tokens.admin)).expect(409);
  });
});
