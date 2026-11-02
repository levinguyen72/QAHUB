import { Module } from '@nestjs/common';
import { SummaryModule } from '../summary/summary.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [SummaryModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
