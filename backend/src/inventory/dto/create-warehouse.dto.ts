import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  code!: string; // e.g. WH-KEBAGUSAN-01 (§7)

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  is_virtual?: boolean; // FR-3.3 virtual spaces
}
