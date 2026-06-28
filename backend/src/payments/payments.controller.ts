import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // POST /api/v1/payments (§3.2 payment.received)
  @Roles('owner', 'sales_kasir')
  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idemHeader?: string,
  ) {
    if (idemHeader && !dto.idempotency_key) {
      dto.idempotency_key = idemHeader;
    }
    return this.payments.create(dto, { id: user.id, ip: user.ip });
  }
}
