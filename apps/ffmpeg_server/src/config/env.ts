
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? "development",

  // S3 / MinIO
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "minioadmin",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "minioadmin",
  S3_RAW_BUCKET: process.env.S3_RAW_BUCKET ?? "raw-uploads",
  S3_HLS_BUCKET: process.env.S3_HLS_BUCKET ?? "hls-output",

  // Database — required, no silent fallback
  DATABASE_URL: required("DATABASE_URL"),

  // CORS — the Next.js frontend's origin
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3001",

  // The separate queuing-system project's producer HTTP endpoint
  QUEUE_PRODUCER_URL: process.env.QUEUE_PRODUCER_URL ?? "http://localhost:4000",

  // Dedicated Redis for the GET /api/videos list cache. Separate
  // instance/port from any other Redis in this stack — see
  // docker-compose.yml's cache-redis service.
  CACHE_REDIS_URL: process.env.CACHE_REDIS_URL ?? "redis://:cache_secret@localhost:6380",
} as const;