import { Module } from '@nestjs/common';
import { TrackersService } from './trackers.service';
import { TrackersController } from './trackers.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  providers: [TrackersService, RolesGuard],
  controllers: [TrackersController],
  exports: [TrackersService],
})
export class TrackersModule {}
