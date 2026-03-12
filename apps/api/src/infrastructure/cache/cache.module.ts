import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('CacheModule');
        const redisUrl = config.get<string>(
          'redis.url',
          'redis://localhost:6379',
        );

        // Parse redis:// URL into host and port
        let host = 'localhost';
        let port = 6379;
        try {
          const parsed = new URL(redisUrl);
          host = parsed.hostname || 'localhost';
          port = parseInt(parsed.port, 10) || 6379;
        } catch {
          logger.warn(
            `Could not parse REDIS_URL "${redisUrl}", falling back to localhost:6379`,
          );
        }

        logger.log(`Initializing Redis cache at ${host}:${port}`);

        const ttl = config.get<number>('cacheTtl', 30000);
        logger.log(`Cache TTL set to ${ttl}ms`);

        return {
          store: await redisStore({
            host,
            port,
            ttl,
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
