import { UserRole } from '../database.types';

/** Authenticated principal attached to each request by AuthGuard. */
export interface AuthUser {
  id: string;
  email: string | null;
  role: UserRole;
  ip: string;
}

/** Subset passed to services for audit attribution (§6.2). */
export interface AuditActor {
  id: string;
  ip: string;
}

/** Minimal request shape the guards rely on (Express-compatible). */
export interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: AuthUser;
}
