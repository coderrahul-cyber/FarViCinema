// src/lib/video-cache.ts
//
// Cache-aside for the "ready videos" list shown on the homepage.
// One Redis key holds the whole list as a JSON array — simplest
// structure, fine at this scale. On a cache miss, the caller (see
// routes/video-list.ts) queries Postgres and calls setCachedVideoList
// to repopulate it.
//
// IMPORTANT: filesize is a Prisma BigInt. JSON.stringify throws on
// BigInt with no special-casing (same landmine as the videoId route
// hit earlier in this project) — toCacheEntry() below converts it to
// a plain string before anything touches JSON.stringify.

import { cacheRedis } from "./cache-redis";

const CACHE_KEY = "videos:ready";
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes — safety net, not the primary invalidation path

export interface CachedVideoEntry {
  id: string;
  filename: string;
  filesize: string; // BigInt serialized as string — see header comment
  duration: number | null;
  playbackUrl: string;
  createdAt: string; // ISO string
}

export interface VideoForCache {
  id: string;
  filename: string;
  filesize: bigint;
  duration: number | null;
  playbackUrl: string | null;
  createdAt: Date;
}

export function toCacheEntry(video: VideoForCache): CachedVideoEntry | null {
  // playbackUrl should always be set for a "ready" video, but guard
  // anyway rather than caching a broken entry the frontend can't play.
  if (!video.playbackUrl) return null;

  return {
    id: video.id,
    filename: video.filename,
    filesize: video.filesize.toString(),
    duration: video.duration,
    playbackUrl: video.playbackUrl,
    createdAt: video.createdAt.toISOString(),
  };
}

export async function getCachedVideoList(): Promise<CachedVideoEntry[] | null> {
  const raw = await cacheRedis.get(CACHE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedVideoEntry[];
  } catch (err) {
    console.error("[video-cache] failed to parse cached list, treating as miss:", err);
    return null;
  }
}

export async function setCachedVideoList(entries: CachedVideoEntry[]): Promise<void> {
  await cacheRedis.set(CACHE_KEY, JSON.stringify(entries), "EX", CACHE_TTL_SECONDS);
}

/**
 * Called whenever a video's status changes in a way that could
 * affect the ready-list (a video becomes ready, or a previously
 * ready video is somehow marked failed again). Deletes the key
 * rather than trying to patch it in place — the next GET
 * /api/videos request will repopulate it from Postgres. Simpler and
 * safer than surgically editing a JSON blob, at this scale.
 */
export async function invalidateVideoListCache(): Promise<void> {
  await cacheRedis.del(CACHE_KEY);
}