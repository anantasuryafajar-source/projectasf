import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../database.types';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given RBAC roles (§6.2). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
