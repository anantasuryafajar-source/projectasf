import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

/** Customer master data (FR-2.4 credit terms, FR-4.2 NPWP). */
@Injectable()
export class CustomersService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreateCustomerDto) {
    const { data, error } = await this.supabase.client
      .from('customers')
      .insert({
        code: dto.code,
        name: dto.name,
        npwp: dto.npwp ?? null,
        address: dto.address ?? null,
        credit_limit: dto.credit_limit ?? 0,
        term_of_payment_days: dto.term_of_payment_days ?? 0,
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async list() {
    const { data, error } = await this.supabase.client
      .from('customers')
      .select('*')
      .order('code');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
