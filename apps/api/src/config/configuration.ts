export type RuntimeMode = 'LOCAL_SIMULATED' | 'AWS_REAL';

export interface AppConfig {
  runtime: RuntimeMode;
  port: number;
  nodeEnv: string;
  database: { url: string };
  redis: { url: string };
  cacheTtl: number;
  jwt: {
    secret: string;
    expiration: string;
    refreshExpiration: string;
  };
  cognito: {
    region: string;
    userPoolId: string;
    clientId: string;
  };
  aws: {
    region: string;
    s3Bucket: string;
    sqsQueueUrl: string;
    eventBridgeBus: string;
  };
  log: { level: string };
  cors: { origin: string[] };
  seed: { scenario: string };
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV || 'development';

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && nodeEnv === 'production') {
    throw new Error(
      'JWT_SECRET environment variable is required in production. ' +
        'Set a strong, unique secret before starting the server.',
    );
  }

  return {
    runtime: (process.env.RUNTIME_MODE as RuntimeMode) || 'LOCAL_SIMULATED',
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv,
    database: {
      url: process.env.DATABASE_URL || '',
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    cacheTtl: parseInt(process.env.CACHE_TTL || '30000', 10),
    jwt: {
      secret: jwtSecret || 'spektra-dev-secret',
      expiration: process.env.JWT_EXPIRATION || '24h',
      refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
    },
    cognito: {
      region: process.env.COGNITO_REGION || '',
      userPoolId: process.env.COGNITO_USER_POOL_ID || '',
      clientId: process.env.COGNITO_CLIENT_ID || '',
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      s3Bucket: process.env.S3_BUCKET || '',
      sqsQueueUrl: process.env.SQS_QUEUE_URL || '',
      eventBridgeBus: process.env.EVENTBRIDGE_BUS || '',
    },
    log: {
      level: process.env.LOG_LEVEL || 'debug',
    },
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim()),
    },
    seed: {
      scenario: process.env.SEED_SCENARIO || 'mixed-landscape-demo',
    },
  };
};
