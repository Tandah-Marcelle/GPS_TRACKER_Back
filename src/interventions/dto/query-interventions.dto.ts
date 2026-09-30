import { ApiPropertyOptional } from '@nestjs/swagger';
import { InterventionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryInterventionsDto {
  @ApiPropertyOptional({ enum: InterventionStatus })
  @IsOptional()
  @IsEnum(InterventionStatus, {
    message: `status must be one of: ${Object.values(InterventionStatus).join(', ')}`,
  })
  status?: InterventionStatus;

  @ApiPropertyOptional({ description: 'Manager only: filter by technician' })
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional({ example: '2026-10-02', description: 'Scheduled on that calendar day' })
  @IsOptional()
  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date' })
  date?: string;

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

  /** Set to false to return every match without pagination (used by the dashboard). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '')
  all?: boolean;
}
