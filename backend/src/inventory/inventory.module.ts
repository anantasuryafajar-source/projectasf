import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ProductsService } from './products.service';
import { WarehousesService } from './warehouses.service';
import { UomService } from './uom.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  // AccountingModule provides JournalService/AccountsService for COGS (FR-3.2).
  imports: [AccountingModule],
  controllers: [InventoryController],
  providers: [ProductsService, WarehousesService, UomService, InventoryService],
  exports: [ProductsService, InventoryService],
})
export class InventoryModule {}
