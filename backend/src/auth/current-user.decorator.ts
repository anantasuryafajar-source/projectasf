import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser, RequestWithUser } from './auth-user.interface';

/** Injects the authenticated AuthUser into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    return req.user;
  },
);
