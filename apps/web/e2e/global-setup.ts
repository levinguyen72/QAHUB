import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Tạo lại schema sạch rồi migrate + seed dữ liệu mẫu cho E2E. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgresql://ospm@localhost:54329/ospm_e2e';
  const api = path.resolve(__dirname, '../../api');
  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_PASSWORD: 'Admin@12345' };
  const run = (cmd: string) => execSync(cmd, { cwd: api, env, stdio: 'inherit' });
  try { run(`psql "${url}" -qc "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`); }
  catch { /* DB chưa tồn tại hoặc không có psql: migrate sẽ báo lỗi rõ ràng */ }
  run('npx prisma migrate deploy');
  run('npx tsx prisma/seed.ts');
}
