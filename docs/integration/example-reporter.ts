// docs/integration/example-reporter.ts — sao chép sang repo Playwright
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { readFile, stat } from 'node:fs/promises';

export default class BugTrackerReporter implements Reporter {
  private results = new Map<string, any>();
  private startedAt = new Date().toISOString();

  onTestEnd(test: TestCase, result: TestResult) {
    const outcome = test.outcome(); // 'expected' | 'unexpected' | 'flaky' | 'skipped'
    this.results.set(test.id, {
      testId: test.id,
      file: test.location.file,
      line: test.location.line,
      titlePath: test.titlePath().slice(3),          // bỏ root, project, file
      browser: test.parent.project()?.name,
      status: outcome === 'flaky' ? 'passed' : result.status,
      retries: result.retry,
      durationMs: result.duration,
      error: result.error && { message: result.error.message, stack: result.error.stack, snippet: result.error.snippet },
      tags: test.tags,
      attachments: result.attachments.filter(a => a.path).map((a, i) => ({
        ref: `${test.id}-${i}`, path: a.path!, fileName: a.name, mimeType: a.contentType,
        kind: a.name === 'screenshot' ? 'screenshot' : a.name === 'video' ? 'video' : a.name === 'trace' ? 'trace' : 'file',
      })),
    });
  }

  async onEnd(_: FullResult) {
    const api = process.env.APP_API_URL, key = process.env.APP_API_KEY;
    if (!api || !key) return;
    try {
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const results = [...this.results.values()];
      for (const r of results) for (const a of r.attachments) a.size = (await stat(a.path)).size;
      const body = { externalId: process.env.CI_PIPELINE_ID ?? `local-${Date.now()}`, branch: process.env.CI_COMMIT_REF_NAME,
        commitSha: process.env.CI_COMMIT_SHORT_SHA, environment: process.env.TEST_ENV ?? 'staging',
        startedAt: this.startedAt, finishedAt: new Date().toISOString(),
        results: results.map(({ attachments, ...r }) => ({ ...r, attachments: attachments.map(({ path, ...a }: any) => a) })) };
      const run = await (await fetch(`${api}/api/v1/ingest/runs`, { method: 'POST', headers, body: JSON.stringify(body) })).json();
      const byRef = new Map(results.flatMap(r => r.attachments).map((a: any) => [a.ref, a]));
      for (const u of run.uploads ?? []) {
        const a: any = byRef.get(u.ref);
        await fetch(u.uploadUrl, { method: 'PUT', body: await readFile(a.path), headers: { 'Content-Type': a.mimeType } }).catch(() => {});
      }
      await fetch(`${api}/api/v1/ingest/runs/${run.runId}/complete`, { method: 'POST', headers });
      console.log(`[bug-tracker] Đã gửi run #${run.runId}`);
    } catch (e) {
      console.warn('[bug-tracker] Không gửi được báo cáo:', e); // không làm fail pipeline
    }
  }
}
