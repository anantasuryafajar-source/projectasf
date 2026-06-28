import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ParseBoolPipe } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { AccountsService } from './accounts.service';
import { JournalService } from './journal.service';
import { CreateJournalDto } from './dto/create-journal.dto';

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly journals: JournalService,
  ) {}

  @Get('accounts')
  listAccounts() {
    return this.accounts.list();
  }

  @Get('accounts/:code')
  getAccount(@Param('code') code: string) {
    return this.accounts.getByCode(code);
  }

  @Roles('owner')
  @Post('journal-entries')
  postJournal(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJournalDto,
    @Headers('idempotency-key') idemHeader?: string,
  ) {
    // Allow the idempotency key via header (§6.2) without overriding the body.
    if (idemHeader && !dto.idempotency_key) {
      dto.idempotency_key = idemHeader;
    }
    return this.journals.post(dto, { id: user.id, ip: user.ip });
  }

  @Get('journal-entries')
  listJournals(@Query('limit') limit?: string) {
    return this.journals.list(limit ? Number(limit) : undefined);
  }

  @Get('journal-entries/:id')
  getJournal(@Param('id') id: string) {
    return this.journals.findById(id);
  }

  // POST /api/v1/accounting/journal-entries/:id/reverse?void=true (§6.2)
  @Roles('owner')
  @Post('journal-entries/:id/reverse')
  reverseJournal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('void', new ParseBoolPipe({ optional: true }))
    voidOriginal?: boolean,
  ) {
    return this.journals.reverse(id, voidOriginal ?? false, {
      id: user.id,
      ip: user.ip,
    });
  }
}
