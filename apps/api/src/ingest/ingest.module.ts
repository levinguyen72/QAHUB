import { Module } from '@nestjs/common';
import { ApiKeyThrottlerGuard, IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({ controllers: [IngestController], providers: [IngestService, ApiKeyThrottlerGuard] })
export class IngestModule {}
