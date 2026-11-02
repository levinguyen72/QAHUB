import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from './app.module';
import { setupApp, buildOpenApi } from './setup';

/** Xuất hợp đồng API ra openapi.json (không cần DB). Frontend sinh client bằng Orval từ file này. */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app, { swagger: false });
  const doc = buildOpenApi(app);
  const targets = [resolve(__dirname, '../openapi.json'), resolve(__dirname, '../../../docs/integration/openapi.json')];
  for (const t of targets) {
    mkdirSync(dirname(t), { recursive: true });
    writeFileSync(t, JSON.stringify(doc, null, 2));
  }
  console.log(`openapi.json: ${Object.keys(doc.paths).length} paths -> ${targets.join(', ')}`);
  await app.close();
}
main();
