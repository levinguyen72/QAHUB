import { Global, Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Global()
@Module({ controllers: [WorkflowsController], providers: [WorkflowsService], exports: [WorkflowsService] })
export class WorkflowsModule {}
