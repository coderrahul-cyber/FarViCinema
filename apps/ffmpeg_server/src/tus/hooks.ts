// Lifecycle hooks passed into the TUS Server (see server.ts).
// Three hooks matter for this chunk:
//
//   onIncomingRequest — fires before every POST/PATCH/HEAD/DELETE.
//     No auth system exists yet, so this currently only validates
//     that the videoId exists and is in a state that allows
//     uploading. Swap in real auth here later — this is the only
//     function that needs to change.
//
//   onUploadCreate — fires once, right when the upload resource is
//     first created (the initial POST). This is where we learn the
//     upload ID TUS generated — which is also the literal S3 object
//     key (see server.ts's comment on why we don't control this
//     ourselves via namingFunction). We record it on the video so
//     the future worker knows which S3 object to read.
//
//   onUploadFinish — fires once the last byte is received. Marks the
//     video "processing" and calls the separate queuing-system's
//     producer to enqueue a transcoding job.

import {
  findVideoById,
  updateVideoStatus,
  setVideoS3Key,
} from "../db/video-respository";
import { enqueueTranscodeJob } from "../lib/queue-client";

function getVideoId(req: Request): string {
  const videoId = req.headers.get("x-video-id");
  if (!videoId) {
    throw { status_code: 400, body: "Missing X-Video-Id header" };
  }
  return videoId;
}

export async function onIncomingRequest(req: Request): Promise<void> {
  const videoId = getVideoId(req);

  const video = await findVideoById(videoId);
  if (!video) {
    throw { status_code: 404, body: "No video record found for this X-Video-Id" };
  }

  // Once a video is "ready" or actively "processing", it shouldn't
  // accept new upload bytes — this would only happen from a stale
  // client retrying after the fact.
  if (video.status === "ready" || video.status === "processing") {
    throw {
      status_code: 409,
      body: `Video is already ${video.status} and cannot accept new uploads`,
    };
  }

  // First chunk for this upload — flip the DB status so the rest of
  // the app knows bytes are in flight.
  if (video.status === "awaiting_upload") {
    await updateVideoStatus(videoId, "uploading");
  }

  // TODO(auth): once auth exists, verify the bearer token here and
  // confirm video.userId === authenticatedUser.id before continuing.
}

export async function onUploadCreate(
  req: Request,
  upload: { id: string },
): Promise<{ metadata?: Record<string, string | null> }> {
  const videoId = getVideoId(req);

  // upload.id is TUS's own generated ID (slug-safe, no slashes) and
  // also the exact S3 object key in the raw-uploads bucket.
  await setVideoS3Key(videoId, upload.id);

  console.log(`Upload created for video ${videoId} -> S3 key "${upload.id}"`);

  return {};
}

export async function onUploadFinish(
  req: Request,
  upload: { id: string },
): Promise<{ status_code?: number; headers?: Record<string, string | number>; body?: string }> {
  const videoId = getVideoId(req);

  await updateVideoStatus(videoId, "processing");

  // The upload itself has genuinely succeeded at this point — the
  // raw file is safely in MinIO. A failure to enqueue the
  // transcoding job is an infrastructure hiccup, not an upload
  // failure, so we log it loudly rather than failing this response.
  // The video stays in "processing" and can be re-enqueued manually
  // later if needed (no auto-retry-on-enqueue-failure yet — that's
  // a reasonable next hardening step, not in scope for this chunk).
  try {
    await enqueueTranscodeJob({ videoId, s3Key: upload.id });
    console.log(`Upload finished for video ${videoId} (upload id: ${upload.id}) — enqueued for transcoding`);
  } catch (err) {
    console.error(`Failed to enqueue transcoding job for video ${videoId}:`, err);
  }

  // Empty object = accept the default 204 response, no override.
  return {};
}