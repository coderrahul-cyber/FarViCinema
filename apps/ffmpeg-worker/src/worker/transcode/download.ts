// // src/worker/transcode/download.ts
// //
// // Step 1 of transcoding: get the raw video from MinIO onto local
// // disk where ffmpeg can read it.
// //
// // Bun.write(localPath, s3File) streams lazily rather than buffering
// // the whole object into memory — S3File extends Blob, and Bun.write
// // is documented to stream Blob/Response inputs to disk rather than
// // materializing them fully first. This matters here because raw
// // uploads can be multiple GB.

// import path from "path";
// import { s3, BUCKETS } from "../../lib/s3";

// export async function downloadRawFile(s3Key: string, tmpDir: string): Promise<string> {
//   const destPath = path.join(tmpDir, "input");

//   const file = s3.file(s3Key, { bucket: BUCKETS.raw });

//   const exists = await file.exists();
//   if (!exists) {
//     throw new Error(`Raw file not found in S3: ${s3Key} (bucket: ${BUCKETS.raw})`);
//   }

//   const bytesWritten = await Bun.write(destPath, file);

//   if (bytesWritten === 0) {
//     throw new Error(`Downloaded 0 bytes for ${s3Key} — file may be empty or corrupted`);
//   }

//   return destPath;
// }



//new 

// src/transcode/downloads.ts

import path from "path";
import { s3Exists, s3Download, BUCKETS } from "../../lib/s3";

export async function downloadRawFile(s3Key: string, tmpDir: string): Promise<string> {
  const destPath = path.join(tmpDir, "input");

  const exists = await s3Exists(BUCKETS.raw, s3Key);
  if (!exists) {
    throw new Error(`Raw file not found in S3: ${s3Key} (bucket: ${BUCKETS.raw})`);
  }

  const bytes = await s3Download(BUCKETS.raw, s3Key, destPath);

  if (bytes === 0) {
    throw new Error(`Downloaded 0 bytes for ${s3Key} — file may be empty or corrupted`);
  }

  // bytes is -1 when Content-Length was missing (chunked transfer) — that's
  // fine, the pipeline would have thrown if the stream failed
  return destPath;
}