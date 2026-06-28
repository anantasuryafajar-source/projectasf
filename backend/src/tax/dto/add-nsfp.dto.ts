import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AddNsfpDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serial_numbers!: string[];
}
