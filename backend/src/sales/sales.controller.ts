import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('sales-invoice')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // POST /api/v1/sales-invoice (§7.1 -> §7.2)
  @Roles('owner', 'sales_kasir')
  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSalesInvoiceDto,
    @Headers('idempotency-key') idemHeader?: string,
  ) {
    if (idemHeader && !dto.idempotency_key) {
      dto.idempotency_key = idemHeader;
    }
    return this.sales.create(dto, { id: user.id, ip: user.ip });
  }
}
