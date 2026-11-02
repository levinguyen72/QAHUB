import { IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateSprintDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() goal?: string | null;
  @IsOptional() @Matches(DATE) startDate?: string | null;
  @IsOptional() @Matches(DATE) endDate?: string | null;
}

export class CreateSprintDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() goal?: string;
}

export class StartSprintDto {
  @Matches(DATE) startDate: string;
  @Matches(DATE) endDate: string;
  @IsOptional() @IsString() goal?: string;
}

export class CompleteSprintDto {
  /** 'backlog' hoặc id sprint kế tiếp (chuỗi số) */
  @IsString() moveOpenIssuesTo: string;
}

export class SprintIdParam {
  @IsInt() id: number;
}
