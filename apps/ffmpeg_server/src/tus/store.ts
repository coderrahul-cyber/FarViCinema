// src/tus/store.ts
//
// @tus/s3-store is built on @aws-sdk/client-s3, not Bun's native
// S3Client — TUS needs S3's multipart-upload APIs to implement
// resumability, which Bun's lightweight client doesn't expose.
// This is the one place in the project we use the AWS SDK; every
// other file keeps using Bun's native client (see src/s3.ts).
//
// Note: S3Store's `s3ClientConfig` takes the raw AWS SDK
// S3ClientConfig shape (endpoint, region, credentials, ...) plus a
// `bucket` field — it builds its own internal S3Client from this,
// rather than accepting a pre-constructed client instance.
//
// IMPORTANT — requestChecksumCalculation: "WHEN_REQUIRED".
//
// Since @aws-sdk/client-s3 v3.729.0, the SDK calculates a streaming
// checksum (aws-chunked trailer) on every request body by default,
// which re-splits the body into its own internal sub-chunks that
// must each be >= 8192 bytes (except the last). Our actual request
// body arrives via Readable.fromWeb() from Bun's PATCH request
// stream, whose chunk boundaries don't line up with that
// requirement — some sub-chunks end up smaller than 8192 bytes
// mid-stream. The SDK rejects this as non-retryable and fails the
// whole part upload with "An error was encountered in a
// non-retryable streaming request" (root cause logged by the SDK as
// InvalidChunkSizeError, which is otherwise swallowed by its retry
// middleware before reaching our own error handlers).
//
// MinIO doesn't require this newer checksum trailer at all — setting
// this back to the pre-3.729.0 "only checksum when the operation
// actually requires it" behavior avoids the broken chunking path
// entirely. See: https://github.com/aws/aws-sdk-js-v3/issues/6949

import { S3Store } from "@tus/s3-store";
import { env } from "../config/env";

export const tusDataStore = new S3Store({
  s3ClientConfig: {
    bucket: env.S3_RAW_BUCKET,
    endpoint: env.S3_ENDPOINT,
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // required for MinIO — see chunk 1 notes on this
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  },
});