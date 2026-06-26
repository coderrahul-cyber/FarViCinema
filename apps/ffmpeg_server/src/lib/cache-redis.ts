// src/lib/cache-redis.ts
//
// Dedicated Redis client for the GET /api/videos list cache. Not
// the same Redis/connection as anything queue-related — this is a
// small, read-heavy JSON blob cache with its own instance (see
// docker-compose.yml's cache-redis service).

import Redis from "ioredis";
import { env } from "../config/env";

export const cacheRedis = new Redis(env.CACHE_REDIS_URL);

cacheRedis.on("error", (err) => {
  console.error("[cache-redis] connection error:", err.message);
});