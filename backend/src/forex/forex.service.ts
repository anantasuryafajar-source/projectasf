import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { RevalueResult } from '../database.types';
import { AuditActor } from '../auth/auth-user.interface';
import { SetRateDto } from './dto/set-rate.dto';

/** Daily FX rates + month-end unrealized revaluation (FR-1.3). */
@Injectable()
export class ForexService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async setRate(dto: SetRateDto) {
    const { data, error } = await this.supabase.client
      .from('exchange_rates')
      .upsert(
        {
          currency: dto.currency.toUpperCase(),
          rate_date: dto.rate_date,
          rate: dto.rate,
        },
        { onConflict: 'currency,rate_date' },
      )
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async listRates() {
    const { data, error } = await this.supabase.client
      .from('exchange_rates')
      .select('*')
      .order('rate_date', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /** Post the month-end unrealized FX revaluation journal (FR-1.3). */
  async revalue(asOf: string, actor?: AuditActor): Promise<RevalueResult> {
    const { data, error } = await this.supabase.client.rpc(
      'audited_revalue_open_ar',
      {
        p: {
          as_of: asOf,
          ar_account_code: this.config.get<string>('AR_ACCOUNT_CODE') ?? '1100',
          gain_account_code:
            this.config.get<string>('FOREX_GAIN_ACCOUNT_CODE') ?? '4800',
          loss_account_code:
            this.config.get<string>('FOREX_LOSS_ACCOUNT_CODE') ?? '6800',
        },
        _actor: actor?.id,
        _ip: actor?.ip,
      },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
