// In-memory replacement for Postgres/Prisma, for local testing only.
//
// IMPORTANT — this is NOT persistent: every video record lives in a
// plain JS Map that's wiped whenever the process restarts (including
// `bun run --watch` reloading on file save). Mid-upload, a server
// restart means the video record is gone and the TUS hooks will 404
// on the next chunk. Fine for quick testing; switch back to a real
// DB (see git history / the Prisma version of video-repository.ts)
// before relying on this for anything that needs to survive restarts.

import { randomUUIDv7 } from "bun";
import type { VideoRecord, VideoStatus } from "./types";

const videos = new Map<string, VideoRecord>();

export function createVideoRecord(input: {
  filename: string;
  filesize: bigint;
  mimetype: string;
  userId?: string;
}): VideoRecord {
  const now = new Date();
  const record: VideoRecord = {
    id: randomUUIDv7(),
    userId: input.userId ?? null,
    filename: input.filename,
    filesize: input.filesize,
    mimetype: input.mimetype,
    duration: null,
    status: "awaiting_upload",
    jobId: null,
    playbackUrl: null,
    s3Key: null,
    createdAt: now,
    updatedAt: now,
  };

  videos.set(record.id, record);
  return record;
}

export function findVideoRecordById(id: string): VideoRecord | null {
  return videos.get(id) ?? null;
}

export function updateVideoRecordStatus(id: string, status: VideoStatus): VideoRecord | null {
  const record = videos.get(id);
  if (!record) return null;

  record.status = status;
  record.updatedAt = new Date();
  return record;
}

export function setVideoRecordS3Key(id: string, s3Key: string): VideoRecord | null {
  const record = videos.get(id);
  if (!record) return null;

  record.s3Key = s3Key;
  record.updatedAt = new Date();
  return record;
}

export function setVideoRecordJobId(id: string, jobId: string): VideoRecord | null {
  const record = videos.get(id);
  if (!record) return null;

  record.jobId = jobId;
  record.status = "processing";
  record.updatedAt = new Date();
  return record;
}

/** Testing/debugging helper — not used by any route, just handy in a REPL. */
export function listAllVideoRecords(): VideoRecord[] {
  return Array.from(videos.values());
}