import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { parseId } from '../common/bigint';
import { AuthUser, CurrentProject, CurrentUser, ProjectContext, ProjectRole } from '../common/decorators';
import { ERROR_CODES } from '@ospm/shared';
import { ListResultsQuery, ListRunsQuery } from './automation.dto';
import { AutomationService } from './automation.service';

@ApiTags('automation')
@Controller()
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @ProjectRole('viewer') @Get('projects/:projectKey/automation-runs')
  listAutomationRuns(@CurrentProject() p: ProjectContext, @Query() q: ListRunsQuery) {
    return this.automation.listRuns(p.id, q);
  }

  @ProjectRole('viewer', 'run') @Get('automation-runs/:id')
  getAutomationRun(@Param('id') id: string) {
    return this.automation.getRun(parseId(id, ERROR_CODES.RUN_NOT_FOUND));
  }

  @ProjectRole('viewer', 'run') @Get('automation-runs/:id/results')
  listAutomationResults(@Param('id') id: string, @Query() q: ListResultsQuery) {
    return this.automation.listResults(parseId(id, ERROR_CODES.RUN_NOT_FOUND), q);
  }

  @ProjectRole('viewer', 'result') @Get('automation-results/:id')
  getAutomationResult(@Param('id') id: string) {
    return this.automation.getResult(parseId(id, ERROR_CODES.RESULT_NOT_FOUND));
  }

  @ProjectRole('developer', 'result') @Post('automation-results/:id/create-issue')
  createIssueFromResult(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.automation.createIssueFromResult(parseId(id, ERROR_CODES.RESULT_NOT_FOUND), u);
  }
}
