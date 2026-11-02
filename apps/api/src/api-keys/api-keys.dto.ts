import { API_KEY_SCOPES } from '@ospm/shared';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsArray() @IsIn(API_KEY_SCOPES as unknown as string[], { each: true }) scopes?: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}
