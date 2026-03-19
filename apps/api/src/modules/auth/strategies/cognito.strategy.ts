import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class CognitoStrategy extends PassportStrategy(Strategy, 'cognito') {
  constructor(private configService: ConfigService) {
    const cognitoRegion = configService.get<string>('cognito.region');
    const cognitoUserPoolId = configService.get<string>('cognito.userPoolId');
    const issuer = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: Record<string, unknown>) {
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      organizationId: payload['custom:organizationId'] as string,
      role: payload['custom:role'] as string,
    };
  }
}
