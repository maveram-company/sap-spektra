import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('port', 3001);
  const corsOrigin = config.get<string[]>('cors.origin', [
    'http://localhost:5173',
  ]);
  const runtime = config.get<string>('runtime', 'LOCAL_SIMULATED');

  // Global prefix
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SAP Spektra API')
    .setDescription('Mission Control for SAP Operations')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Health', 'Service health checks')
    .addTag('Auth', 'Authentication & authorization')
    .addTag('Dashboard', 'Aggregated dashboard data')
    .addTag('Tenant', 'Organization/tenant management')
    .addTag('Users', 'User management')
    .addTag('Systems', 'SAP system management')
    .addTag('Alerts', 'Alert management')
    .addTag('Events', 'Event log')
    .addTag('Approvals', 'Approval workflows')
    .addTag('Runbooks', 'Runbook management & execution')
    .addTag('Operations', 'Operations, jobs, transports, certificates')
    .addTag('Metrics', 'Host metrics, health snapshots, breaches, dependencies')
    .addTag('HA/DR', 'High availability & disaster recovery')
    .addTag('Connectors', 'System connectors')
    .addTag('Audit', 'Audit log')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);

  logger.log(`══════════════════════════════════════════════`);
  logger.log(`  SAP Spektra API running on port ${port}`);
  logger.log(`  Runtime: ${runtime}`);
  logger.log(`  Swagger: http://localhost:${port}/api/docs`);
  logger.log(`══════════════════════════════════════════════`);
}

bootstrap();
