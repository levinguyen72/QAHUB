import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E chạy trên DB riêng (E2E_DATABASE_URL, mặc định ospm_e2e) được tạo lại và seed ở global-setup.
 * Cần `pnpm --filter @ospm/api build` trước (API chạy từ dist). Queue chạy inline nên không cần Worker/MinIO.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://ospm@localhost:54329/ospm_e2e';
const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'vi-VN' },
  // E2E_BROWSER_CHANNEL=chrome dùng Google Chrome cài sẵn thay vì Chromium của Playwright (khi không tải được browser)
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 }, ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}) } }],
  webServer: [
    {
      command: 'node dist/main.js', cwd: path.resolve(__dirname, '../api'), url: `http://localhost:${API_PORT}/api/docs-json`, reuseExistingServer: !process.env.CI, timeout: 60_000,
      env: { DATABASE_URL: E2E_DB, PORT: String(API_PORT), QUEUE_MODE: 'inline', WEB_ORIGIN: `http://localhost:${WEB_PORT}`, JWT_SECRET: 'e2e-secret', JWT_REFRESH_SECRET: 'e2e-refresh', NODE_ENV: 'test' },
    },
    { command: `npx vite --port ${WEB_PORT} --strictPort`, url: `http://localhost:${WEB_PORT}`, reuseExistingServer: !process.env.CI, timeout: 60_000, env: { VITE_API_TARGET: `http://localhost:${API_PORT}` } },
  ],
});
