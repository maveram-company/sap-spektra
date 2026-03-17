import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private pool: pg.Pool;

  constructor() {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const adapter = new PrismaPg(
      pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
    );
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established (pg driver adapter)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
