import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  BalanceSheetResult,
  ProfitLossResult,
  TrialBalanceResult,
} from '../database.types';

/** Financial statements from the General Ledger (PRD Obj 1.2). */
@Injectable()
export class ReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  async trialBalance(asOf: string): Promise<TrialBalanceResult> {
    const { data, error } = await this.supabase.client.rpc(
      'report_trial_balance',
      { p_as_of: asOf },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async profitLoss(from: string, to: string): Promise<ProfitLossResult> {
    const { data, error } = await this.supabase.client.rpc(
      'report_profit_loss',
      { p_from: from, p_to: to },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async balanceSheet(asOf: string): Promise<BalanceSheetResult> {
    const { data, error } = await this.supabase.client.rpc(
      'report_balance_sheet',
      { p_as_of: asOf },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
