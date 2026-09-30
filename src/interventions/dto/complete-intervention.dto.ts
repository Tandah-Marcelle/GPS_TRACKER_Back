import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CompleteInterventionDto {
  @ApiProperty({ example: 'cmuo5gzq60002z2dwhuf8dyw3', description: 'IN_STOCK tracker to install' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  trackerId: string;
}
