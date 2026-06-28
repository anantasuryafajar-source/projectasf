import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JournalService } from './journal.service';
import { AccountingController } from './accounting.controller';

@Module({
  controllers: [AccountingController],
  providers: [AccountsService, JournalService],
  // Exported so InventoryModule can post the automated COGS journal (FR-3.2).
  exports: [AccountsService, JournalService],
})
export class AccountingModule {}
