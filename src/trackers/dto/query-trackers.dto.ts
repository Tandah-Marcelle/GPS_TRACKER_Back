import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrackerStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryTrackersDto {
  @ApiPropertyOptional({ enum: TrackerStatus })
  @IsOptional()
  @IsEnum(TrackerStatus, {
    message: `status must be one of: ${Object.values(TrackerStatus).join(', ')}`,
  })
  status?: TrackerStatus;

  @ApiPropertyOptional({ example: '352099', description: 'Partial or full IMEI search' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
