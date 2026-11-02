import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Global()
@Module({ controllers: [ApiKeysController], providers: [ApiKeysService, ApiKeyGuard], exports: [ApiKeysService, ApiKeyGuard] })
export class ApiKeysModule {}
