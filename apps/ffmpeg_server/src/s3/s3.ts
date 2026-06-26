
// One shared Bun.S3Client instance, pointed at MinIO for local dev.
// Every other file (routes, TUS store, future worker) imports `s3`
// and `BUCKETS` from here instead of constructing its own client.

import { env } from "../config/env";

export const s3 = new Bun.S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  // MinIO (and most S3-compatible stores) need path-style URLs:
  // http://localhost:9000/bucket-name/key
  // instead of AWS's virtual-hosted style:
  // http://bucket-name.s3.amazonaws.com/key
  virtualHostedStyle: false,
});

export const BUCKETS = {
  raw: env.S3_RAW_BUCKET,
  hls: env.S3_HLS_BUCKET,
} as const;