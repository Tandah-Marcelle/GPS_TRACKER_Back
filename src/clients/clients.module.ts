import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  providers: [ClientsService, RolesGuard],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
