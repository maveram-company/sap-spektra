import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, headers } = req;
    const correlationId = headers['x-correlation-id'] || randomUUID();
    const now = Date.now();

    // Attach correlation ID to request for downstream use
    req.correlationId = correlationId;

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(
            JSON.stringify({
              correlationId,
              method,
              url,
              statusCode: res.statusCode,
              duration: `${Date.now() - now}ms`,
              userAgent: headers['user-agent']?.substring(0, 80),
            }),
          );
        },
        error: (err) => {
          this.logger.error(
            JSON.stringify({
              correlationId,
              method,
              url,
              statusCode: err.status || 500,
              duration: `${Date.now() - now}ms`,
              error: err.message,
            }),
          );
        },
      }),
    );
  }
}
