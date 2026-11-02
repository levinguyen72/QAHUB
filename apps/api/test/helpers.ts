import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/attachments/storage.service';
import { setupApp } from '../src/setup';
import { seedBase } from '../prisma/seed-base';

export const ADMIN = { email: 'admin@local.test', password: 'Admin@12345' };

/** Kho lưu trữ giả trong bộ nhớ thay cho MinIO. `put` mô phỏng bước reporter upload file. */
export class FakeStorage extends StorageService {
  objects = new Map<string, number>();
  blobs = new Map<string, Buffer>();
  put(key: string, size = 100) { this.objects.set(key, size); }
  async presignPut(key: string) { return `http://fake-s3/put/${key}`; }
  async presignGet(key: string) { return `http://fake-s3/get/${key}`; }
  async head(key: string) { return this.objects.has(key) ? { size: this.objects.get(key)! } : null; }
  async delete(key: string) { this.objects.delete(key); this.blobs.delete(key); }
  async putObject(key: string, body: Buffer) { this.objects.set(key, body.length); this.blobs.set(key, body); }
  async getObject(key: string) { return this.blobs.get(key)!; }
}

export interface TestCtx {
  storage: FakeStorage;
  app: INestApplication;
  prisma: PrismaClient;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await seedBase(prisma);
}

export async function createTestApp(opts: { reset?: boolean } = {}): Promise<TestCtx> {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.NODE_ENV = 'test';
  process.env.QUEUE_MODE = 'inline';
  process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  if (opts.reset !== false) await resetDb(prisma);
  const storage = new FakeStorage();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(StorageService).useValue(storage).compile();
  const app = mod.createNestApplication({ logger: false });
  setupApp(app, { swagger: false });
  await app.init();
  return {
    storage, app, prisma,
    http: () => request(app.getHttpServer()),
    close: async () => { await app.close(); await prisma.$disconnect(); },
  };
}

export async function login(ctx: TestCtx, email: string, password: string): Promise<string> {
  const res = await ctx.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.accessToken;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createUser(ctx: TestCtx, email: string, displayName: string, systemRole = 'member', password = 'Password1!') {
  return ctx.prisma.user.create({ data: { email, displayName, systemRole, passwordHash: await argon2.hash(password) } });
}

export async function templateId(ctx: TestCtx, name: string): Promise<number> {
  return Number((await ctx.prisma.workflowTemplate.findUniqueOrThrow({ where: { name } })).id);
}

/** Tạo dự án qua API bằng admin, thêm các thành viên theo role. */
export async function setupProject(ctx: TestCtx, key: string, template: string, members: Record<string, string> = {}) {
  const adminToken = await login(ctx, ADMIN.email, ADMIN.password);
  const res = await ctx.http().post('/api/v1/projects').set(auth(adminToken)).send({ key, name: `Project ${key}`, workflowTemplateId: await templateId(ctx, template) }).expect(201);
  const tokens: Record<string, string> = { admin: adminToken };
  for (const [role, email] of Object.entries(members)) {
    const u = await createUser(ctx, email, role.toUpperCase());
    await ctx.http().post(`/api/v1/projects/${key}/members`).set(auth(adminToken)).send({ userId: Number(u.id), role }).expect(201);
    tokens[role] = await login(ctx, email, 'Password1!');
  }
  return { project: res.body, tokens };
}
