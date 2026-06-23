// src/routes/test-upload.ts
//
// Carried over from chunk 1 — uploads public/test.mp4 straight into
// MinIO. Kept as an independent sanity check that doesn't depend on
// TUS, the DB, or anything else: if this route ever stops working,
// the problem is in MinIO connectivity itself, not the upload flow.

import path from "path";
import { randomUUIDv7 } from "bun";
import { s3, BUCKETS } from "../s3/s3";

const TEST_VIDEO_PATH = path.join(import.meta.dir, "..", "..", "public", "test.mp4");

export async function testUploadRoute(): Promise<Response> {
  const file = Bun.file(TEST_VIDEO_PATH);
  const exists = await file.exists();

  if (!exists) {
    return Response.json(
      {
        error: "Test video not found",
        expectedPath: TEST_VIDEO_PATH,
        hint: "Place a video at public/test.mp4 in the project root.",
      },
      { status: 404 },
    );
  }

  const videoId = randomUUIDv7();
  const s3Key = `raw/${videoId}`;

  try {
    await s3.write(s3Key, file, {
      bucket: BUCKETS.raw,
      type: file.type || "video/mp4",
    });

    return Response.json({
      videoId,
      bucket: BUCKETS.raw,
      key: s3Key,
      size: file.size,
      message: "Uploaded to MinIO raw-uploads bucket",
    });
  } catch (err: any) {
    console.error("Upload to MinIO failed:", err);
    return Response.json(
      { error: "Upload failed", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

export async function checkTestUploadRoute(videoId: string): Promise<Response> {
  const s3Key = `raw/${videoId}`;

  try {
    const stat = await s3.stat(s3Key, { bucket: BUCKETS.raw });
    return Response.json({
      exists: true,
      key: s3Key,
      size: stat.size,
      etag: stat.etag,
    });
  } catch (err: any) {
    return Response.json(
      { exists: false, key: s3Key, detail: err?.message ?? String(err) },
      { status: 404 },
    );
  }
}