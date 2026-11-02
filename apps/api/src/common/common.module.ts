import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, RolesGuard } from './guards';
import { ProjectContextService } from './project-context.service';

@Global()
@Module({
  providers: [
    ProjectContextService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [ProjectContextService],
})
export class CommonModule {}
