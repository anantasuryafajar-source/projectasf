import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types';

/**
 * Server-side Supabase access.
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security. This client
 * must NEVER be exposed to the browser — it lives only in the NestJS backend.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase!: SupabaseClient<Database>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
          'Copy .env.example to .env and fill in your credentials.',
      );
      return;
    }

    this.supabase = createClient<Database>(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.logger.log('Supabase client initialized (service role).');
  }

  /** Returns the configured admin Supabase client. */
  get client(): SupabaseClient<Database> {
    if (!this.supabase) {
      throw new Error(
        'Supabase client is not initialized. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return this.supabase;
  }
}
