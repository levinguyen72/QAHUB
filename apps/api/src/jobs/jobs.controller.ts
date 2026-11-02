import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ERROR_CODES } from '@ospm/shared';
import { StorageService } from '../attachments/storage.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { forbidden, notFound } from '../common/errors';
import { QueueService } from '../queue/queue.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly queue: QueueService, private readonly storage: StorageService) {}

  /** Trạng thái job nền (import/export/bulk). Export xong thì có `downloadUrl`. */
  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string, @CurrentUser() u: AuthUser) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw notFound(ERROR_CODES.JOB_NOT_FOUND, 'Không tìm thấy job');
    if (u.systemRole !== 'admin' && job.data?.userId !== u.id.toString()) throw forbidden();
    const output = job.output ?? null;
    return {
      id: job.id, name: job.name, state: job.state, error: job.error ?? null, result: output,
      downloadUrl: job.state === 'completed' && output?.objectKey && job.name.endsWith('export') ? await this.storage.presignGet(output.objectKey, output.fileName, 3600) : null,
    };
  }
}
