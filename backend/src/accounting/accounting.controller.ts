import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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

  @Post('journal-entries')
  postJournal(
    @Body() dto: CreateJournalDto,
    @Headers('idempotency-key') idemHeader?: string,
  ) {
    // Allow the idempotency key via header (§6.2) without overriding the body.
    if (idemHeader && !dto.idempotency_key) {
      dto.idempotency_key = idemHeader;
    }
    return this.journals.post(dto);
  }

  @Get('journal-entries')
  listJournals(@Query('limit') limit?: string) {
    return this.journals.list(limit ? Number(limit) : undefined);
  }

  @Get('journal-entries/:id')
  getJournal(@Param('id') id: string) {
    return this.journals.findById(id);
  }
}
