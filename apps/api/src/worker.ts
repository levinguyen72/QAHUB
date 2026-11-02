import 'reflect-metadata';
import './common/bigint';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { JobsService } from './jobs/jobs.service';

/** Entry point của tiến trình Worker: đăng ký consumer pg-boss, không mở cổng HTTP. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.get(JobsService).startWorker();
}
bootstrap();
