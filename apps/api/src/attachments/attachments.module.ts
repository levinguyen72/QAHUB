import { Global, Module } from '@nestjs/common';
import { env } from '../common/config';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { BlobController } from './blob.controller';
import { LocalStorageService, S3StorageService, StorageService } from './storage.service';

@Global()
@Module({
  controllers: [AttachmentsController, BlobController],
  providers: [
    AttachmentsService,
    { provide: StorageService, useClass: env.storageDriver === 's3' ? S3StorageService : LocalStorageService },
  ],
  exports: [AttachmentsService, StorageService],
})
export class AttachmentsModule {}
