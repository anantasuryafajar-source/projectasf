import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AccountingModule } from './accounting/accounting.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { TaxModule } from './tax/tax.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { CustomersModule } from './customers/customers.module';
import { ForexModule } from './forex/forex.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SupabaseModule,
    AuthModule,
    AdminModule,
    AccountingModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
    ReportsModule,
    TaxModule,
    CustomersModule,
    ForexModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
