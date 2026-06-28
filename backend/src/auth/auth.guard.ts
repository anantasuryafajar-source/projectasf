import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithUser } from './auth-user.interface';

function clientIp(req: RequestWithUser): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? '';
}

/**
 * Verifies the Supabase JWT (Authorization: Bearer) and loads the user's
 * RBAC profile. Attaches { id, email, role, ip } to the request. Routes
 * marked @Public() bypass this guard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    const token =
      raw && raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const { data, error } = await this.supabase.client.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: profile, error: pErr } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    if (pErr) throw new UnauthorizedException(pErr.message);
    if (!profile) throw new ForbiddenException('No profile/role assigned');
    if (!profile.is_active) throw new ForbiddenException('User is inactive');

    req.user = {
      id: profile.id,
      email: data.user.email ?? null,
      role: profile.role,
      ip: clientIp(req),
    };
    return true;
  }
}
