import { DEFAULT_TEST_CATEGORIES, PROJECT_KEY_REGEX, PROJECT_ROLES, ProjectRole } from '@ospm/shared';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString() @Matches(PROJECT_KEY_REGEX, { message: 'key phải gồm 2–10 ký tự A–Z, 0–9 và bắt đầu bằng chữ' }) key: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() leadId?: number;
  @IsInt() workflowTemplateId: number;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() leadId?: number | null;
}

export class AddMemberDto {
  @IsInt() userId: number;
  @IsIn(PROJECT_ROLES as unknown as string[]) role: ProjectRole;
}

export class UpdateMemberDto {
  @IsIn(PROJECT_ROLES as unknown as string[]) role: ProjectRole;
}

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() createBugForFlaky?: boolean;
}

export const TEST_CATEGORY_DEFAULTS = DEFAULT_TEST_CATEGORIES;
