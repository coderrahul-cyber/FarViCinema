// GET /api/videos — powers the homepage grid. Cache-aside: check
// Redis first; on a miss, query Postgres and repopulate Redis before
// responding. Self-heals if the cache is ever empty, flushed, or out
// of sync — never depends solely on the write-path having fired
// correctly.

import { findReadyVideos } from "../db/video-respository";
import {
  getCachedVideoList,
  setCachedVideoList,
  toCacheEntry,
  type CachedVideoEntry,
} from "../lib/video-cache";

export async function listVideosRoute(): Promise<Response> {
  const cached = await getCachedVideoList();
  if (cached) {
    return Response.json({ videos: cached, source: "cache" });
  }

  const rows = await findReadyVideos();

  const entries: CachedVideoEntry[] = [];
  for (const row of rows) {
    const entry = toCacheEntry(row);
    if (entry) entries.push(entry);
  }

  // Repopulate before responding — the request that hit the miss
  // pays the Postgres cost once; every request after it (until TTL
  // or the next invalidation) reads from Redis.
  await setCachedVideoList(entries);

  return Response.json({ videos: entries, source: "db" });
}