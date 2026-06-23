// src/lib/video-validation.ts
//
// Single source of truth for "what counts as a valid video upload".
// Imported by both the pre-flight route (POST /api/videos) and the
// TUS server hooks — duplicating these constants in two places is
// exactly how they drift out of sync over time.

export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
] as const;

export const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export function isAllowedMimeType(mimetype: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimetype);
}

export function isAllowedSize(filesize: number | bigint): boolean {
  return BigInt(filesize) > 0n && BigInt(filesize) <= BigInt(MAX_SIZE_BYTES);
}