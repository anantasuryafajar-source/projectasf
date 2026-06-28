import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ForexService } from './forex.service';
import { SetRateDto } from './dto/set-rate.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Controller('forex')
export class ForexController {
  constructor(private readonly forex: ForexService) {}

  @Roles('owner')
  @Post('rates')
  setRate(@Body() dto: SetRateDto) {
    return this.forex.setRate(dto);
  }

  @Get('rates')
  listRates() {
    return this.forex.listRates();
  }

  // POST /api/v1/forex/revalue?as_of=YYYY-MM-DD (month-end unrealized FX)
  @Roles('owner')
  @Post('revalue')
  revalue(@CurrentUser() user: AuthUser, @Query('as_of') asOf?: string) {
    return this.forex.revalue(asOf ?? today(), { id: user.id, ip: user.ip });
  }
}
