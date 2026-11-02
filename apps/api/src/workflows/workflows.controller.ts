import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentProject, CurrentUser, AuthUser, ProjectContext, ProjectRole } from '../common/decorators';
import { ApplyTemplateDto, SaveWorkflowDto } from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflow')
@Controller()
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('workflow-templates') listWorkflowTemplates() {
    return this.workflows.listTemplates();
  }

  @ProjectRole('viewer') @Get('projects/:projectKey/workflow')
  getWorkflow(@CurrentProject() p: ProjectContext) {
    return this.workflows.get(p.id);
  }

  @ProjectRole('admin') @Put('projects/:projectKey/workflow')
  saveWorkflow(@CurrentProject() p: ProjectContext, @CurrentUser() u: AuthUser, @Body() dto: SaveWorkflowDto) {
    return this.workflows.save(p.id, p.key, dto, u.id);
  }

  @ProjectRole('admin') @Post('projects/:projectKey/workflow/apply-template')
  applyWorkflowTemplate(@CurrentProject() p: ProjectContext, @CurrentUser() u: AuthUser, @Body() dto: ApplyTemplateDto, @Param('projectKey') _k: string) {
    return this.workflows.applyTemplate(p.id, p.key, BigInt(dto.templateId), dto.statusReplacements, u.id);
  }
}
