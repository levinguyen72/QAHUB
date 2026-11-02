import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { login } from './helpers';

const ROOT = path.resolve(__dirname, '../../..');
const API_URL = 'http://localhost:3100';

test.describe.serial('OSPM E2E', () => {
  test('đăng nhập và tạo item tay: có label manual và trạng thái khởi tạo đúng', async ({ page }) => {
    await login(page, 'lead@local.test');
    await page.getByRole('button', { name: /Tạo/ }).first().click();
    const modal = page.getByRole('dialog', { name: 'Tạo item' });
    // chọn dự án ELMS (template "Có QA": khởi tạo manual = To Do)
    await modal.locator('.ant-form-item', { hasText: 'Dự án' }).locator('.ant-select').click();
    await page.locator('.ant-select-item-option', { hasText: 'ELMS —' }).click();
    await modal.getByLabel('Tiêu đề').fill('E2E: item tạo tay');
    await modal.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(page).toHaveURL(/\/browse\/ELMS-\d+/);
    await expect(page.getByText('E2E: item tạo tay').first()).toBeVisible();
    // trạng thái khởi tạo manual của template "Có QA" là To Do
    await expect(page.getByText('To Do', { exact: true }).first()).toBeVisible();
    // label hệ thống manual (khóa, không xóa được)
    await expect(page.locator('.ant-select .ant-tag', { hasText: /^manual$/ }).first()).toBeVisible();
  });

  test('board: cột theo workflow, không có Pending Review, kéo thẻ đổi trạng thái', async ({ page }) => {
    await login(page, 'lead@local.test');
    await page.goto('/projects/ELMS/board');
    await expect(page.getByTestId('col-To Do')).toBeVisible();
    await expect(page.getByTestId('col-In Progress')).toBeVisible();
    await expect(page.getByText('PENDING REVIEW')).toHaveCount(0);
    await expect(page.getByTestId('col-Pending Review')).toHaveCount(0);

    const card = page.getByTestId('col-To Do').locator('[data-testid^="card-"]').first();
    await expect(card).toBeVisible();
    const key = (await card.getAttribute('data-testid'))!.replace('card-', '');
    const from = (await card.boundingBox())!;
    const to = (await page.getByTestId('col-In Progress').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByTestId('col-In Progress').getByTestId(`card-${key}`)).toBeVisible();
    // đã lưu thật: tải lại vẫn ở cột mới
    await page.reload();
    await expect(page.getByTestId('col-In Progress').getByTestId(`card-${key}`)).toBeVisible();
  });

  test('tester duyệt (Accept) bug auto chờ duyệt ở Dashboard', async ({ page }) => {
    await login(page, 'tester1@local.test');
    await expect(page.getByText('Bug auto chờ duyệt')).toBeVisible();
    // chỉ lấy bug của ELMS (template "Có QA": Accept → To Do); DEMO dùng template khác
    const rows = page.locator('.ant-table-row').filter({ has: page.locator('td:first-child', { hasText: /^ELMS-/ }) });
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);
    const key = (await rows.first().locator('td').first().innerText()).trim();
    await rows.first().getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.locator('.ant-table-row', { hasText: key })).toHaveCount(0);
    // bug sau Accept ở trạng thái làm việc
    await page.goto(`/browse/${key}`);
    await expect(page.getByText('To Do', { exact: true }).first()).toBeVisible();
  });

  test('tạo API key rồi chạy simulate-ingest: bug xuất hiện ở Pending Review và không có trên board', async ({ page }) => {
    await login(page, 'lead@local.test');
    await page.goto('/api-keys?project=ELMS');
    await page.getByRole('button', { name: /Tạo API key/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Tạo API key' });
    await dlg.getByLabel('Tên').fill('E2E key');
    await dlg.getByRole('button', { name: 'Tạo', exact: true }).click();
    const keyBox = page.getByRole('dialog', { name: 'API key đã tạo' }).locator('input[readonly]');
    await expect(keyBox).toBeVisible();
    await expect(page.getByText('Key chỉ hiển thị một lần')).toBeVisible();
    const key = await keyBox.inputValue();
    expect(key).toMatch(/^pmk_live_/);
    await page.getByRole('button', { name: 'Tôi đã lưu key' }).click();

    const out = execSync('pnpm exec tsx scripts/simulate-ingest.ts --fail 1 --pass 5 --flaky 0', { cwd: ROOT, env: { ...process.env, APP_API_URL: API_URL, APP_API_KEY: key }, encoding: 'utf8' });
    expect(out).toContain('bug mới 1');

    await page.goto('/projects/ELMS/backlog?q=%C4%90i%E1%BB%83m%20s%E1%BB%91%20hi%E1%BB%83n%20th%E1%BB%8B%200');
    const row = page.locator('.issue-row', { hasText: '[Auto]' }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('Pending Review')).toBeVisible();
    await expect(row.getByText('auto', { exact: true })).toBeVisible();

    await page.goto('/projects/ELMS/board');
    await expect(page.getByTestId('col-To Do')).toBeVisible();
    await expect(page.getByText('Điểm số hiển thị 0')).toHaveCount(0);
    // lần chạy xuất hiện trong Report
    await page.goto('/reports?project=ELMS');
    await expect(page.getByText('Simulated nightly').first()).toBeVisible();
  });

  test('test case: sửa một ô trong bảng và kiểm tra đã lưu', async ({ page }) => {
    await login(page, 'lead@local.test');
    await page.goto('/projects/ELMS/test-cases');
    await page.getByText(/NDS-U-00796 ·/).first().click();
    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    await expect(firstRow).toBeVisible();
    // cột Notes nằm ngoài vùng nhìn (ảo hóa cột) nên sửa ô "Checklist Item"
    const cell = firstRow.locator('[col-id="title"]');
    await cell.dblclick();
    const note = `Tiêu đề sửa bởi e2e ${Date.now()}`;
    await page.keyboard.press('Control+A');
    await page.keyboard.type(note);
    await page.keyboard.press('Enter');
    await expect(cell).toContainText(note);
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('.ag-center-cols-container .ag-row').first().locator('[col-id="title"]')).toContainText(note);
  });
});
