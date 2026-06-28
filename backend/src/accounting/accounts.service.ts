import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Read access to the Chart of Accounts (FR-1.1).
 * Writes go through migrations / owner tooling, not this service.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list() {
    const { data, error } = await this.supabase.client
      .from('accounts')
      .select('*')
      .order('account_code');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async getByCode(code: string) {
    const { data, error } = await this.supabase.client
      .from('accounts')
      .select('*')
      .eq('account_code', code)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data)
      throw new NotFoundException(`Account with code ${code} not found`);
    return data;
  }
}
