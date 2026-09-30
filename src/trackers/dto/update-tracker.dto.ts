import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateTrackerDto {
  @ApiPropertyOptional({ example: 'Teltonika FMB640' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  model?: string;

  @ApiPropertyOptional({ example: '89310412106063919234' })
  @IsOptional()
  @IsString()
  @Length(5, 40)
  simNumber?: string;
}
