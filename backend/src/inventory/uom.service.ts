import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/** Unit-of-measure conversion to the product base unit (FR-3.4). */
@Injectable()
export class UomService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Convert `quantity` expressed in `uom` to the product base unit.
   * If `uom` is omitted, the quantity is assumed already in base units.
   */
  async toBase(
    productId: string,
    quantity: number,
    uom?: string,
  ): Promise<number> {
    if (!uom) return quantity;

    const { data: product, error: pErr } = await this.supabase.client
      .from('products')
      .select('base_uom')
      .eq('id', productId)
      .maybeSingle();
    if (pErr) throw new InternalServerErrorException(pErr.message);
    if (!product)
      throw new BadRequestException(`Product ${productId} not found`);

    // The base unit maps to itself with factor 1.
    if (product.base_uom === uom) return quantity;

    const { data: conv, error: cErr } = await this.supabase.client
      .from('product_uom_conversions')
      .select('quantity_in_base')
      .eq('product_id', productId)
      .eq('uom_name', uom)
      .maybeSingle();
    if (cErr) throw new InternalServerErrorException(cErr.message);
    if (!conv) {
      throw new BadRequestException(
        `No UOM conversion for product ${productId} and unit "${uom}" (FR-3.4).`,
      );
    }
    return quantity * Number(conv.quantity_in_base);
  }
}
