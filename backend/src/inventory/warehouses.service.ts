import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

/** Multi-warehouse master data (FR-3.3). */
@Injectable()
export class WarehousesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreateWarehouseDto) {
    const { data, error } = await this.supabase.client
      .from('warehouses')
      .insert({
        code: dto.code,
        name: dto.name,
        is_virtual: dto.is_virtual ?? false,
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async list() {
    const { data, error } = await this.supabase.client
      .from('warehouses')
      .select('*')
      .order('code');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
