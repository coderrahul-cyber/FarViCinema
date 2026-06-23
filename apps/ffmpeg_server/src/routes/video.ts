// src/routes/videos.ts
//
// Step 2 from the pipeline doc: before any bytes are uploaded, the
// browser asks us to create a DB row so it has a videoId to attach
// to the TUS upload (via the X-Video-Id header).
//
// No auth wired up yet — `userId` stays null until that's added.
// When auth lands, this is the only function that needs to change.

import { createVideo } from "../db/video-respository";
import { isAllowedMimeType, isAllowedSize } from "../lib/video-validation";

interface CreateVideoRequestBody {
  filename?: string;
  filesize?: number;
  mimetype?: string;
}

export async function createVideoRoute(req: Request): Promise<Response> {
  let body: CreateVideoRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, filesize, mimetype } = body;

  if (!filename || typeof filename !== "string") {
    return Response.json({ error: "filename is required" }, { status: 400 });
  }
  if (typeof filesize !== "number" || filesize <= 0) {
    return Response.json({ error: "filesize must be a positive number" }, { status: 400 });
  }
  if (!mimetype || typeof mimetype !== "string") {
    return Response.json({ error: "mimetype is required" }, { status: 400 });
  }

  // Never trust the browser-supplied MIME type alone — this check
  // is here as a fast pre-flight rejection. The doc's reminder still
  // applies once the file is actually uploaded: re-verify with magic
  // bytes server-side before queuing it for transcoding.
  if (!isAllowedMimeType(mimetype)) {
    return Response.json(
      { error: `Unsupported file type: ${mimetype}` },
      { status: 400 },
    );
  }

  if (!isAllowedSize(filesize)) {
    return Response.json(
      { error: "File size must be between 1 byte and 10 GB" },
      { status: 400 },
    );
  }

  try {
    const video = await createVideo({
      filename,
      filesize: BigInt(filesize),
      mimetype,
      // userId omitted — no auth system yet (see lib/video-validation.ts note)
    });

    // IMPORTANT: never spread/return the raw `video` object here.
    // `video.filesize` is a BigInt (Prisma's mapping for the
    // BigInt column) and JSON.stringify throws a TypeError on
    // BigInt values — Response.json() calls JSON.stringify
    // internally. That throw happens while Bun is serializing the
    // response body, which is too late for this function's own
    // try/catch to handle gracefully — it can manifest to the
    // browser as a dead connection (ERR_EMPTY_RESPONSE) rather than
    // a clean error response. Only return primitive/string fields.
    return Response.json({ videoId: video.id }, { status: 201 });
  } catch (err) {
    console.error("Failed to create video record:", err);
    return Response.json({ error: "Failed to create video record" }, { status: 500 });
  }
}