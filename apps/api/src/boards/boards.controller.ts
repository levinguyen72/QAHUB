import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentProject, ProjectContext, ProjectRole } from '../common/decorators';
import { ListIssuesQuery } from '../issues/issues.dto';
import { BoardQuery } from './boards.dto';
import { BoardsService } from './boards.service';

@ApiTags('boards')
@Controller('projects/:projectKey')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @ProjectRole('viewer') @Get('backlog')
  getBacklog(@CurrentProject() p: ProjectContext, @Query() q: ListIssuesQuery) {
    return this.boards.backlog(p, q);
  }

  @ProjectRole('viewer') @Get('board')
  getBoard(@CurrentProject() p: ProjectContext, @Query() q: BoardQuery) {
    return this.boards.board(p, q);
  }
}
