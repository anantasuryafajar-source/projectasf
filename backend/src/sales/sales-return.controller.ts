import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { SalesReturnService } from './sales-return.service';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('sales-return')
export class SalesReturnController {
  constructor(private readonly returns: SalesReturnService) {}

  // POST /api/v1/sales-return (§3.2 sales_return.approved)
  @Roles('owner', 'sales_kasir')
  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSalesReturnDto,
    @Headers('idempotency-key') idemHeader?: string,
  ) {
    if (idemHeader && !dto.idempotency_key) {
      dto.idempotency_key = idemHeader;
    }
    return this.returns.create(dto, { id: user.id, ip: user.ip });
  }
}
