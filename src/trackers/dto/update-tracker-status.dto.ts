import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class UpdateTrackerStatusDto {
  @ApiProperty({
    enum: TrackerStatus,
    example: TrackerStatus.FAULTY,
    description:
      'Target status. INSTALLED cannot be set here: trackers are only installed through intervention completion.',
  })
  @IsEnum(TrackerStatus, {
    message: `status must be one of: ${Object.values(TrackerStatus).join(', ')}`,
  })
  status: TrackerStatus;

  @ApiPropertyOptional({ example: 'Unit not powering on' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  comment?: string;
}
