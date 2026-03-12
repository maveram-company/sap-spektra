import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UsersModule } from './modules/users/users.module';
import { SystemsModule } from './modules/systems/systems.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { EventsModule } from './modules/events/events.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { RunbooksModule } from './modules/runbooks/runbooks.module';
import { OperationsModule } from './modules/operations/operations.module';
import { AuditModule } from './modules/audit/audit.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { HAModule } from './modules/ha/ha.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ChatModule } from './modules/chat/chat.module';
import { PlansModule } from './modules/plans/plans.module';
import { SettingsModule } from './modules/settings/settings.module';
import { LandscapeModule } from './modules/landscape/landscape.module';
import { AiModule } from './modules/ai/ai.module';
import { LicensesModule } from './modules/licenses/licenses.module';

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
    ApprovalsModule,
    RunbooksModule,
    OperationsModule,
    AuditModule,
    ConnectorsModule,
    HAModule,
    MetricsModule,
    AnalyticsModule,
    ChatModule,
    PlansModule,
    SettingsModule,
    LandscapeModule,
    AiModule,
    LicensesModule,
  ],
})
export class AppModule {}
