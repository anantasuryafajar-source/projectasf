import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { ProductsService } from './products.service';
import { WarehousesService } from './warehouses.service';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { FulfillStockDto } from './dto/fulfill-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly products: ProductsService,
    private readonly warehouses: WarehousesService,
    private readonly inventory: InventoryService,
  ) {}

  @Roles('owner', 'admin_gudang')
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get('products')
  listProducts() {
    return this.products.list();
  }

  @Roles('owner', 'admin_gudang')
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Get('warehouses')
  listWarehouses() {
    return this.warehouses.list();
  }

  @Roles('owner', 'admin_gudang')
  @Post('receipts')
  receive(@CurrentUser() user: AuthUser, @Body() dto: ReceiveStockDto) {
    return this.inventory.receive(dto, { id: user.id, ip: user.ip });
  }

  @Roles('owner', 'admin_gudang')
  @Post('fulfillments')
  fulfill(@CurrentUser() user: AuthUser, @Body() dto: FulfillStockDto) {
    return this.inventory.fulfill(dto, { id: user.id, ip: user.ip });
  }

  @Roles('owner', 'admin_gudang')
  @Post('transfers')
  transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferStockDto) {
    return this.inventory.transfer(dto, { id: user.id, ip: user.ip });
  }

  @Get('stock')
  stock(
    @Query('product_id') productId: string,
    @Query('warehouse_id') warehouseId?: string,
  ) {
    return this.inventory.getStock(productId, warehouseId);
  }
}
