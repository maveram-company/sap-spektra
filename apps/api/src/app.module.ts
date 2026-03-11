import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { SystemsModule } from './modules/systems/systems.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { EventsModule } from './modules/events/events.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    UsersModule,
    SystemsModule,
    TenantsModule,
    AlertsModule,
    EventsModule,
  ],
})
export class AppModule {}
