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