import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { UserRole } from '../../database.types';

const ROLES: UserRole[] = ['owner', 'admin_gudang', 'sales_kasir'];

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  full_name!: string;

  @IsIn(ROLES)
  role!: UserRole;
}
