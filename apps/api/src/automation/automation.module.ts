import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { RunProcessor } from './run-processor';

@Module({ controllers: [AutomationController], providers: [AutomationService, RunProcessor], exports: [RunProcessor] })
export class AutomationModule {}
