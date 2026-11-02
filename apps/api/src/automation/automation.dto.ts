import { RESULT_STATUSES } from '@ospm/shared';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQuery } from '../common/pagination';

export class ListRunsQuery extends PaginationQuery {
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() environment?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ListResultsQuery extends PaginationQuery {
  @IsOptional() @IsIn(RESULT_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() q?: string;
}
