import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreateProductDto) {
    const { data: product, error } = await this.supabase.client
      .from('products')
      .insert({
        sku: dto.sku,
        name: dto.name,
        category: dto.category ?? null,
        base_uom: dto.base_uom,
        valuation_method: dto.valuation_method,
        taxable: dto.taxable ?? true,
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    if (dto.uom_conversions?.length) {
      const rows = dto.uom_conversions.map((c) => ({
        product_id: product.id,
        uom_name: c.uom_name,
        quantity_in_base: c.quantity_in_base,
      }));
      const { error: cErr } = await this.supabase.client
        .from('product_uom_conversions')
        .insert(rows);
      if (cErr) throw new InternalServerErrorException(cErr.message);
    }

    return this.findById(product.id);
  }

  async list() {
    const { data: products, error } = await this.supabase.client
      .from('products')
      .select('*')
      .order('sku');
    if (error) throw new InternalServerErrorException(error.message);

    const { data: conversions, error: cErr } = await this.supabase.client
      .from('product_uom_conversions')
      .select('*');
    if (cErr) throw new InternalServerErrorException(cErr.message);

    return (products ?? []).map((p) => ({
      ...p,
      product_uom_conversions: (conversions ?? []).filter(
        (c) => c.product_id === p.id,
      ),
    }));
  }

  async findById(id: string) {
    const { data: product, error } = await this.supabase.client
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const { data: conversions, error: cErr } = await this.supabase.client
      .from('product_uom_conversions')
      .select('*')
      .eq('product_id', id);
    if (cErr) throw new InternalServerErrorException(cErr.message);

    return { ...product, product_uom_conversions: conversions ?? [] };
  }
}
