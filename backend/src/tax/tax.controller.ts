import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { TaxService } from './tax.service';
import { AddNsfpDto } from './dto/add-nsfp.dto';
import { Roles } from '../auth/roles.decorator';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Controller('tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  // FR-4.3 NSFP lifecycle
  @Roles('owner')
  @Post('nsfp')
  addNsfp(@Body() dto: AddNsfpDto) {
    return this.tax.addNsfp(dto.serial_numbers);
  }

  @Get('nsfp')
  listNsfp() {
    return this.tax.listNsfp();
  }

  @Roles('owner')
  @Post('nsfp/assign')
  assignNsfp() {
    return this.tax.assignPending();
  }

  // FR-4.2 e-Faktur CSV export
  @Get('efaktur.csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="efaktur.csv"')
  efaktur(@Query('from') from?: string, @Query('to') to?: string) {
    const to2 = to ?? today();
    const from2 = from ?? `${to2.slice(0, 4)}-01-01`;
    return this.tax.efakturCsv(from2, to2);
  }
}
