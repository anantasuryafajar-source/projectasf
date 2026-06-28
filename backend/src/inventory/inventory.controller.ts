import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { WarehousesService } from './warehouses.service';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { FulfillStockDto } from './dto/fulfill-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly products: ProductsService,
    private readonly warehouses: WarehousesService,
    private readonly inventory: InventoryService,
  ) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get('products')
  listProducts() {
    return this.products.list();
  }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Get('warehouses')
  listWarehouses() {
    return this.warehouses.list();
  }

  @Post('receipts')
  receive(@Body() dto: ReceiveStockDto) {
    return this.inventory.receive(dto);
  }

  @Post('fulfillments')
  fulfill(@Body() dto: FulfillStockDto) {
    return this.inventory.fulfill(dto);
  }

  @Get('stock')
  stock(
    @Query('product_id') productId: string,
    @Query('warehouse_id') warehouseId?: string,
  ) {
    return this.inventory.getStock(productId, warehouseId);
  }
}
