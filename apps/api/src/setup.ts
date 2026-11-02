import './common/bigint';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { env } from './common/config';

export function buildOpenApi(app: INestApplication) {
  const cfg = new DocumentBuilder()
    .setTitle('OSPM API')
    .setDescription('Hệ thống quản lý dự án & bug tự động. Hợp đồng ổn định theo /api/v1. Endpoint /ingest/* dùng API key (Bearer).')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, cfg, { operationIdFactory: (_controller, method) => method });
  // Tham số path được lấy qua decorator riêng (CurrentProject...) nên Swagger không thấy: bổ sung cho đủ hợp đồng.
  for (const [path, item] of Object.entries(doc.paths)) {
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const op of Object.values(item) as any[]) {
      if (!op || typeof op !== 'object') continue;
      op.parameters = op.parameters ?? [];
      for (const n of names) {
        if (!op.parameters.some((p: any) => p.in === 'path' && p.name === n)) op.parameters.push({ name: n, in: 'path', required: true, schema: { type: 'string' } });
      }
    }
  }
  return doc;
}

/** Cấu hình chung cho HTTP app (dùng ở main.ts và test). */
export function setupApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.enableCors({ origin: env.webOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  if (opts.swagger !== false) {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/docs-json' });
  }
}
