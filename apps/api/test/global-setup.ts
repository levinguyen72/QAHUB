import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Nếu có TEST_DATABASE_URL thì dùng luôn; nếu không thì bật Postgres 16 bằng Testcontainers (cần Docker).
 */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16').start();
    process.env.TEST_DATABASE_URL = container.getConnectionUri();
    (globalThis as any).__PG_CONTAINER__ = container;
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
