import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Registers global guards: AuthGuard (authentication) runs first, then
 * RolesGuard (authorization). SupabaseModule is global so AuthGuard can
 * inject SupabaseService.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
