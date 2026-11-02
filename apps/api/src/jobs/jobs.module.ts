import { Global, Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Global()
@Module({ imports: [AutomationModule], controllers: [JobsController], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
