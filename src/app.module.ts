import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TrackersModule } from './trackers/trackers.module';
import { ClientsModule } from './clients/clients.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { InterventionsModule } from './interventions/interventions.module';
import { EmailModule } from './common/email/email.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    TrackersModule,
    ClientsModule,
    VehiclesModule,
    InterventionsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
