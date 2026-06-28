import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // GET /api/v1/reports/trial-balance?as_of=YYYY-MM-DD
  @Get('trial-balance')
  trialBalance(@Query('as_of') asOf?: string) {
    return this.reports.trialBalance(asOf ?? today());
  }

  // GET /api/v1/reports/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD
  @Get('profit-loss')
  profitLoss(@Query('from') from?: string, @Query('to') to?: string) {
    const to2 = to ?? today();
    // Default window: start of the current year through `to`.
    const from2 = from ?? `${to2.slice(0, 4)}-01-01`;
    return this.reports.profitLoss(from2, to2);
  }

  // GET /api/v1/reports/balance-sheet?as_of=YYYY-MM-DD
  @Get('balance-sheet')
  balanceSheet(@Query('as_of') asOf?: string) {
    return this.reports.balanceSheet(asOf ?? today());
  }
}
