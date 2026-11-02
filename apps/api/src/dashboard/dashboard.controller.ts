import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get() getDashboard(@CurrentUser() u: AuthUser) {
    return this.dashboard.get(u);
  }
}
