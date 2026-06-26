// // src/worker/transcode/upload.ts
// //
// // Uploads the master playlist + every rendition's segments back to
// // MinIO's hls-output bucket, with a concurrency cap so we don't fire
// // off hundreds of simultaneous uploads for a long video (a 4-
// // rendition, 30-minute video at 6s segments is a few hundred .ts
// // files).
// //
// // Uses the AWS SDK here specifically, not Bun's native S3Client —
// // Bun.S3Client's S3Options has no Cache-Control field at all
// // (confirmed against its installed type definitions), and
// // Cache-Control genuinely matters for this step: segments are
// // immutable and should cache for a year, playlists should never
// // cache since a re-transcode could change them. The AWS SDK's
// // PutObjectCommand supports this directly.
// //
// // requestChecksumCalculation: "WHEN_REQUIRED" carried over from the
// // TUS S3Store fix earlier in this project — same SDK-default
// // streaming-checksum issue applies to any streamed body sent to
// // MinIO, not just TUS's multipart uploads.


import path from "path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Upload } from "@aws-sdk/lib-storage";
import { s3 } from "../../lib/s3"; // shared client — no duplicate instances
import { env } from "../../config/env";
import type { RenditionName } from "./renditions";

const MAX_CONCURRENT_UPLOADS = 10;

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

function cacheControlFor(filename: string): string {
  return filename.endsWith(".m3u8")
    ? "no-cache, no-store"
    : "public, max-age=31536000";
}

/**
 * Runs async tasks with at most `limit` running concurrently.
 */
async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      await task(item);
    }
  });
  await Promise.all(workers);
}

async function uploadFile(localPath: string, s3Key: string): Promise<void> {
  const filename = path.basename(localPath);

  // Stream directly from disk — never buffer the whole file in RAM.
  // Bun.file().arrayBuffer() would load every .ts segment into memory
  // simultaneously across MAX_CONCURRENT_UPLOADS workers, which OOMs
  // the process on any non-trivial video.
  const { size } = await stat(localPath);
  const stream = createReadStream(localPath);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: env.S3_HLS_BUCKET,
      Key: s3Key,
      Body: stream,
      ContentType: contentTypeFor(filename),
      CacheControl: cacheControlFor(filename),
      ContentLength: size, // avoids chunked transfer encoding, speeds up MinIO
      // ACL intentionally omitted — MinIO requires explicit ACL support
      // to be enabled server-side. Playback URLs are built from
      // HLS_PUBLIC_BASE_URL which handles access at the bucket level.
    },
    // 10 MB parts. HLS segments are typically 2–8 MB so most will be
    // single-part uploads; the multipart path is there for the master
    // playlist and any unusually large segments.
    partSize: 10 * 1024 * 1024,
    queueSize: 2, // per-file part concurrency — outer pool handles parallelism
  });

  await upload.done();
}

export interface UploadHlsOutputInput {
  videoId: string;
  tmpDir: string;
  renditions: RenditionName[];
}

/**
 * Uploads master.m3u8 plus every rendition's index.m3u8 and .ts
 * segments. Returns the S3 key of the master playlist.
 */
export async function uploadHlsOutput(input: UploadHlsOutputInput): Promise<{ masterPlaylistKey: string }> {
  const { videoId, tmpDir, renditions } = input;
  const prefix = videoId;

  const filesToUpload: Array<{ localPath: string; s3Key: string }> = [];

  // Master playlist first in the list so it's easy to identify in logs,
  // but upload order doesn't matter for correctness.
  filesToUpload.push({
    localPath: path.join(tmpDir, "master.m3u8"),
    s3Key: `${prefix}/master.m3u8`,
  });

  for (const rendition of renditions) {
    const renditionDir = path.join(tmpDir, rendition);
    const glob = new Bun.Glob("*");

    for await (const filename of glob.scan({ cwd: renditionDir })) {
      filesToUpload.push({
        localPath: path.join(renditionDir, filename),
        s3Key: `${prefix}/${rendition}/${filename}`,
      });
    }
  }

  console.log(`[uploads] uploading ${filesToUpload.length} files for video ${videoId}`);

  let uploadedCount = 0;
  await withConcurrencyLimit(filesToUpload, MAX_CONCURRENT_UPLOADS, async ({ localPath, s3Key }) => {
    await uploadFile(localPath, s3Key);
    uploadedCount++;
    if (uploadedCount % 10 === 0 || uploadedCount === filesToUpload.length) {
      console.log(`[uploads] ${uploadedCount}/${filesToUpload.length} files uploaded`);
    }
  });

  if (uploadedCount !== filesToUpload.length) {
    throw new Error(
      `Upload count mismatch: expected ${filesToUpload.length}, uploaded ${uploadedCount}`,
    );
  }

  return { masterPlaylistKey: `${prefix}/master.m3u8` };
}