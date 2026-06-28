import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesReturnController } from './sales-return.controller';
import { SalesReturnService } from './sales-return.service';

@Module({
  controllers: [SalesController, SalesReturnController],
  providers: [SalesService, SalesReturnService],
  exports: [SalesService, SalesReturnService],
})
export class SalesModule {}
