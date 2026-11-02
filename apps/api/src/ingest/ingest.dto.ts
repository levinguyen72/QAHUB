import { ATTACHMENT_KINDS, AttachmentKind, RESULT_STATUSES, ResultStatus } from '@ospm/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength, ValidateNested,
} from 'class-validator';

export class IngestAttachmentDto {
  @IsString() @MinLength(1) ref: string;
  @IsIn(ATTACHMENT_KINDS as unknown as string[]) kind: AttachmentKind;
  @IsString() fileName: string;
  @IsString() mimeType: string;
  @IsInt() @Min(0) size: number;
}

export class IngestErrorDto {
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() stack?: string;
  @IsOptional() @IsString() snippet?: string;
}

export class IngestResultDto {
  @IsString() testId: string;
  @IsString() file: string;
  @IsOptional() @IsInt() line?: number;
  @IsArray() @IsString({ each: true }) titlePath: string[];
  @IsOptional() @IsString() browser?: string;
  @IsIn(RESULT_STATUSES as unknown as string[]) status: ResultStatus;
  @IsOptional() @IsInt() @Min(0) retries?: number;
  @IsOptional() @IsInt() @Min(0) durationMs?: number;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => IngestErrorDto) error?: IngestErrorDto;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IngestAttachmentDto) attachments?: IngestAttachmentDto[];
}

export class IngestRunDto {
  @IsString() @MinLength(1) externalId: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() commitSha?: string;
  @IsOptional() @IsString() environment?: string;
  @IsOptional() @IsString() ciUrl?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() finishedAt?: string;
  @IsArray() @ArrayMaxSize(100000) @ValidateNested({ each: true }) @Type(() => IngestResultDto) results: IngestResultDto[];
}

