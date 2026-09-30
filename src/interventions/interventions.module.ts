import { Module } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsController } from './interventions.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  providers: [InterventionsService, RolesGuard],
  controllers: [InterventionsController],
  exports: [InterventionsService],
})
export class InterventionsModule {}
