import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentProject, CurrentUser, ProjectContext, ProjectRole } from '../common/decorators';
import { CreateApiKeyDto } from './api-keys.dto';
import { ApiKeysService } from './api-keys.service';

@ApiTags('api-keys')
@Controller()
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @ProjectRole('admin') @Get('projects/:projectKey/api-keys')
  listApiKeys(@CurrentProject() p: ProjectContext) {
    return this.keys.list(p.id);
  }

  @ProjectRole('admin') @Post('projects/:projectKey/api-keys')
  createApiKey(@CurrentProject() p: ProjectContext, @Body() dto: CreateApiKeyDto, @CurrentUser() u: AuthUser) {
    return this.keys.create(p.id, dto, u.id);
  }

  @ProjectRole('admin', 'apiKey') @Post('api-keys/:id/revoke') @HttpCode(200)
  revokeApiKey(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.keys.revoke(id, u.id);
  }
}
