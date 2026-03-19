import { Module, type Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CognitoStrategy } from './strategies/cognito.strategy';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import type { RuntimeMode } from '../../config/configuration';

/**
 * Conditionally provides the CognitoStrategy.
 * Only instantiated when RUNTIME_MODE=AWS_REAL and Cognito config is present.
 * In LOCAL_SIMULATED mode, the provider resolves to undefined (no-op).
 */
const cognitoStrategyProvider: Provider = {
  provide: CognitoStrategy,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const runtime = config.get<RuntimeMode>('runtime');
    const cognitoPoolId = config.get<string>('cognito.userPoolId');
    const cognitoRegion = config.get<string>('cognito.region');

    if (runtime === 'AWS_REAL' && cognitoPoolId && cognitoRegion) {
      return new CognitoStrategy(config);
    }
    return undefined;
  },
};

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret')!,
        signOptions: {
          expiresIn: config.get<string>(
            'jwt.expiration',
            '24h',
          ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
    AuditModule,
    BillingModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, cognitoStrategyProvider],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
