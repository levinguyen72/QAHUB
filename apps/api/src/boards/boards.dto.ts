import { IsIn, IsOptional } from 'class-validator';
import { ListIssuesQuery } from '../issues/issues.dto';

export class BoardQuery extends ListIssuesQuery {
  @IsOptional() @IsIn(['none', 'assignee', 'parent']) groupBy?: 'none' | 'assignee' | 'parent';
}
