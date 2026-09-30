import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  providers: [VehiclesService, RolesGuard],
  controllers: [VehiclesController],
  exports: [VehiclesService],
})
export class VehiclesModule {}
