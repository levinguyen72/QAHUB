/**
 * Giả lập repo Playwright gửi MỘT lần chạy lên API ingest (3 bước), dùng cho test và demo.
 *
 *   APP_API_URL=http://localhost:3000 APP_API_KEY=pmk_live_... pnpm simulate-ingest [--pass 20] [--fail 3] [--flaky 1]
 *       [--external-id my-run-1] [--no-wait]
 *
 * Gọi lại với cùng --external-id để kiểm tra tính idempotent. Gọi nhiều đêm với cùng lỗi (mặc định) để thấy
 * occurrence_count tăng thay vì sinh bug mới.
 */
const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const API = (process.env.APP_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.APP_API_KEY;
if (!KEY) {
  console.error('Thiếu APP_API_KEY (tạo ở menu API Keys).');
  process.exit(2);
}
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// PNG 1x1 hợp lệ
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.code ?? ''} ${json?.message ?? text}`);
  return { status: res.status, json };
}

async function main() {
  const nPass = Number(opt('pass', '20'));
  const nFail = Number(opt('fail', '3'));
  const nFlaky = Number(opt('flaky', '1'));
  const externalId = opt('external-id', `sim-${Date.now()}`)!;
  const startedAt = new Date(Date.now() - 60_000).toISOString();

  const ping = await call('GET', '/ingest/ping');
  console.log(`API key hợp lệ: dự án ${ping.json.projectKey}, key "${ping.json.keyName}", scope ${ping.json.scopes.join(',')}`);

  const results: any[] = [];
  for (let i = 0; i < nPass; i++) results.push({ testId: `pass-${i}`, file: `tests/sim/ok-${i}.spec.ts`, line: 10, titlePath: ['Simulated', `OK ${i}`], browser: 'chromium', status: 'passed', retries: 0, durationMs: 800 });
  for (let i = 0; i < nFlaky; i++) results.push({ testId: `flaky-${i}`, file: `tests/sim/flaky-${i}.spec.ts`, line: 5, titlePath: ['Simulated', `Flaky ${i}`], browser: 'chromium', status: 'passed', retries: 1, durationMs: 2500, error: { message: 'Timeout 5000ms exceeded' } });
  for (let i = 0; i < nFail; i++) {
    for (const browser of ['chromium', 'firefox']) {
      results.push({
        testId: `fail-${i}-${browser}`, file: `tests/sim/exam-${i}.spec.ts`, line: 42 + i, titlePath: ['Học sinh', 'Bài kiểm tra', `Điểm số hiển thị ${i}`], browser,
        status: 'failed', retries: 2, durationMs: 15_000 + i,
        // số/thời gian khác nhau mỗi lần chạy nhưng fingerprint giữ nguyên
        error: { message: `expect(locator).toHaveText(expected) failed\nTimeout ${30000 + Math.floor(Math.random() * 100)}ms`, stack: 'Error: expect(locator).toHaveText(expected) failed\n    at exam.spec.ts:42:5', snippet: `> 42 | await expect(page.locator('#score')).toHaveText('10');` },
        tags: ['@regression', `@CL_NDS-U-00796-0${20 + i}`],
        attachments: [{ ref: `shot-${i}-${browser}`, kind: 'screenshot', fileName: 'test-failed-1.png', mimeType: 'image/png', size: PNG.length }],
      });
    }
  }

  // Bước 1: mở lần chạy, gửi kết quả
  const run = await call('POST', '/ingest/runs', { externalId, name: 'Simulated nightly', branch: 'develop', commitSha: '9f2c1ab', environment: 'staging', ciUrl: 'https://ci.example.local/pipelines/1', startedAt, finishedAt: new Date().toISOString(), results });
  console.log(`Bước 1: HTTP ${run.status}, run #${run.json.runId} (${run.json.status}), ${run.json.uploads.length} upload URL`);

  // Bước 2: upload file thẳng lên MinIO (lỗi upload chỉ bỏ qua file đó)
  for (const u of run.json.uploads) {
    try {
      const r = await fetch(u.uploadUrl, { method: 'PUT', body: PNG, headers: { 'Content-Type': 'image/png' } });
      if (!r.ok) console.warn(`  upload ${u.ref} lỗi ${r.status}`);
    } catch (e) { console.warn(`  upload ${u.ref} lỗi: ${(e as Error).message}`); }
  }
  if (run.json.uploads.length) console.log(`Bước 2: đã upload ${run.json.uploads.length} file`);

  // Bước 3: báo hoàn tất
  const done = await call('POST', `/ingest/runs/${run.json.runId}/complete`);
  console.log(`Bước 3: HTTP ${done.status}, trạng thái ${done.json.status}`);
  if (flag('no-wait')) return;

  for (let i = 0; i < 60; i++) {
    const s = (await call('GET', `/ingest/runs/${run.json.runId}`)).json;
    if (s.status === 'completed' || s.status === 'failed') {
      console.log(`Kết quả: ${s.status} — total ${s.total}, passed ${s.passed}, failed ${s.failed}, flaky ${s.flaky}, bug mới ${s.bugsCreated}, bug cập nhật ${s.bugsUpdated}`);
      console.log(`Báo cáo: ${s.reportUrl}`);
      if (s.processingError) console.error('Lỗi xử lý:', s.processingError);
      process.exit(s.status === 'completed' ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('Quá thời gian chờ xử lý');
  process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
