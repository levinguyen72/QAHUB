import { SYSTEM_ROLES, SystemRole } from '@ospm/shared';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) displayName: string;
  @IsIn(SYSTEM_ROLES as unknown as string[]) systemRole: SystemRole;
  @IsString() @MinLength(8) password: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) displayName?: string;
  @IsOptional() @IsIn(SYSTEM_ROLES as unknown as string[]) systemRole?: SystemRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListUsersQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
