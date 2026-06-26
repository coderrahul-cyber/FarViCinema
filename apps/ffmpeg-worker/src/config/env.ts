// src/config/env.ts
//
// Single source of truth for environment variables, same pattern
// used in the main backend project.

export const env = {
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  PRODUCER_PORT: Number(process.env.PRODUCER_PORT ?? 4000),
  QUEUE_NAME: process.env.QUEUE_NAME ?? "video-transcoding",
  WORKER_CONCURRENCY: Number(process.env.WORKER_CONCURRENCY ?? 1),

  // MinIO / S3 — same bucket setup as the main backend. This worker
  // reads raw uploads from S3_RAW_BUCKET and writes HLS output to
  // S3_HLS_BUCKET.
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "minioadmin",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "minioadmin",
  S3_RAW_BUCKET: process.env.S3_RAW_BUCKET ?? "raw-uploads",
  S3_HLS_BUCKET: process.env.S3_HLS_BUCKET ?? "hls-output",

  // Path to the ffmpeg binary. Defaults to relying on PATH (system
  // install), can be overridden to point at a specific binary.
  FFMPEG_PATH: process.env.FFMPEG_PATH ?? "ffmpeg",

  // The main video-streaming-backend's URL, for reporting job
  // completion/failure back (queuing-system has no DB access itself)
  BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:3000",

  // What playback URL prefix to build from a video's master
  // playlist key. In production this would be a CDN domain in front
  // of the hls-output bucket; for local dev it's MinIO's own
  // endpoint, bucket included.
  HLS_PUBLIC_BASE_URL:
    process.env.HLS_PUBLIC_BASE_URL ??
    `${process.env.S3_ENDPOINT ?? "http://localhost:9000"}/${process.env.S3_HLS_BUCKET ?? "hls-output"}`,

  // How many videos this worker process encodes at once. CPU-bound
  // work — keep this at or below (CPU cores - 1). Renditions for a
  // single video are encoded sequentially regardless of this
  // setting (see transcode/run-ffmpeg.ts for why).
} as const;