import { STATUS_CATEGORIES, StatusCategory } from '@ospm/shared';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class WorkflowStatusInput {
  /** Id trạng thái đã có; bỏ trống nếu là trạng thái mới */
  @IsOptional() @IsInt() id?: number;
  /** Khóa tạm cho trạng thái mới để tham chiếu trong transitions/settings */
  @IsOptional() @IsString() tempKey?: string;
  @IsString() @MinLength(1) name: string;
  @IsIn(STATUS_CATEGORIES as unknown as string[]) category: StatusCategory;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() showOnBoard?: boolean;
}

export class WorkflowTransitionInput {
  /** `ref` = id (dạng chuỗi) hoặc tempKey; null = từ mọi trạng thái */
  @IsOptional() @IsString() from?: string | null;
  @IsString() to: string;
  @IsOptional() @IsString() name?: string;
}

export class WorkflowSettingsInput {
  @IsString() initialManual: string;
  @IsString() initialAuto: string;
  @IsOptional() @IsString() accept?: string | null;
  @IsOptional() @IsString() reject?: string | null;
  @IsOptional() @IsBoolean() allowAnyTransition?: boolean;
}

export class SaveWorkflowDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStatusInput) statuses: WorkflowStatusInput[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowTransitionInput) transitions: WorkflowTransitionInput[];
  @ValidateNested() @Type(() => WorkflowSettingsInput) settings: WorkflowSettingsInput;
  /** { [statusId bị bỏ]: ref trạng thái thay thế } */
  @IsOptional() @IsObject() statusReplacements?: Record<string, string>;
}

export class ApplyTemplateDto {
  @IsInt() templateId: number;
  @IsOptional() @IsObject() statusReplacements?: Record<string, string>;
}
