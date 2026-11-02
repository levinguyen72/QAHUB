import { Module } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { LabelsService } from './labels.service';

@Module({ controllers: [IssuesController], providers: [IssuesService, LabelsService], exports: [IssuesService] })
export class IssuesModule {}
