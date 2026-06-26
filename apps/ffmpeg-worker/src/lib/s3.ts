// // src/lib/s3.ts
// //
// // Bun's native S3 client, same pattern as the main backend's
// // src/s3.ts. Used here for plain object get/put — downloading the
// // raw upload and uploading the finished HLS segments. Not used for
// // anything multipart/resumable (that's TUS's job, in the main
// // backend, not here).

// import { env } from "../config/env";

// export const s3 = new Bun.S3Client({
//   endpoint: env.S3_ENDPOINT,
//   region: env.AWS_REGION,
//   accessKeyId: env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
//   virtualHostedStyle: false, // path-style URLs, required for MinIO
// });

// export const BUCKETS = {
//   raw: env.S3_RAW_BUCKET,
//   hls: env.S3_HLS_BUCKET,
// } as const;


//new 
// src/lib/s3.ts
//
// MinIO-compatible S3 client using AWS SDK v3.
//
// Bun's native Bun.S3Client has a known native-level panic when used
// against MinIO (path-style endpoints). AWS SDK v3 is the correct
// tool here — it's battle-tested against MinIO, supports streaming,
// and gives real JS errors instead of crashing the process.

import { S3Client, GetObjectCommand, HeadObjectCommand , DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../config/env";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";


export async function s3Delete(bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: any) {
    // Deleting a key that's already gone shouldn't be treated as a
    // failure — same "404 is fine" reasoning as s3Exists above.
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      return;
    }
    throw err;
  }
}

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