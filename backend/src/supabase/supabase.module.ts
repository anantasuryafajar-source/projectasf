import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

/**
 * Global so any feature module (GL, Sales/AR, Inventory, Tax) can inject
 * SupabaseService without re-importing this module.
 */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
