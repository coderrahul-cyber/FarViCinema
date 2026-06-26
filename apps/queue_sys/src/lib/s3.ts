// MinIO-compatible S3 client using AWS SDK v3.
//
// Bun's native Bun.S3Client has a known native-level panic when used
// against MinIO (path-style endpoints). AWS SDK v3 is the correct
// tool here — it's battle-tested against MinIO, supports streaming,
// and gives real JS errors instead of crashing the process.

import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../config/env";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // REQUIRED for MinIO — virtual-hosted style won't work
});

export const BUCKETS = {
  raw: env.S3_RAW_BUCKET,
  hls: env.S3_HLS_BUCKET,
} as const;

// ---------------------------------------------------------------------------
// Helpers used by the worker (download + upload). Keeping them here means
// downloads.ts and the upload step import from one place and never touch the
// S3 client directly.
// ---------------------------------------------------------------------------

/**
 * Check whether a key exists in a bucket.
 * Uses HeadObject — no data transfer, just metadata.
 */
export async function s3Exists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: any) {
    // AWS SDK throws with $metadata.httpStatusCode for HTTP errors
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      return false;
    }
    throw err; // re-throw unexpected errors (auth, network, etc.)
  }
}

/**
 * Stream an S3 object straight to a local file path.
 * Uses node:stream pipeline so backpressure is handled correctly and
 * the destination file is always closed cleanly on error.
 */
export async function s3Download(
  bucket: string,
  key: string,
  destPath: string
): Promise<number> {
  const { Body, ContentLength } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!Body) {
    throw new Error(`S3 GetObject returned empty body for ${bucket}/${key}`);
  }

  await pipeline(Body as Readable, createWriteStream(destPath));

  // ContentLength may be undefined for chunked transfers; treat that as
  // "unknown size but non-zero" — the pipeline above would have thrown if
  // the stream errored.
  return ContentLength ?? -1;
}

/**
 * Upload a local file (or any Readable) to S3 using multipart upload.
 * @aws-sdk/lib-storage's Upload handles chunking, retries, and progress
 * automatically — much safer than a single PutObject for large HLS segments.
 */
export async function s3Upload(
  bucket: string,
  key: string,
  body: Readable | Buffer,
  contentType?: string
): Promise<void> {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    },
    // 10 MB parts — good default for HLS segments (typically 2–8 MB each)
    partSize: 10 * 1024 * 1024,
    // Up to 4 parts in flight at once per upload call
    queueSize: 4,
  });

  await upload.done();
}