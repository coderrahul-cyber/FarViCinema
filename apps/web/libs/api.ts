// lib/api.ts

import type { VideoListResponse } from "../types/index";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

export async function fetchVideoList(): Promise<VideoListResponse> {
  const res = await fetch(`${API_BASE}/api/videos`, {
    // Always hit the backend fresh — the backend's own Redis cache
    // (see video-cache.ts) is the caching layer; Next.js shouldn't
    // add a second, independent cache on top that could drift out
    // of sync with it.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load videos (${res.status})`);
  }

  return res.json() as Promise<VideoListResponse>;
}

export async function fetchVideoById(videoId: string) {
  const { videos } = await fetchVideoList();
  return videos.find((v) => v.id === videoId) ?? null;
}