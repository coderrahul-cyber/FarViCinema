// src/lib/redis-connection.ts
//
// Two different connection "personalities", per BullMQ's own
// guidance: a producer fronting an HTTP request should fail fast if
// Redis is down (the caller is waiting synchronously); a worker
// should retry patiently forever in the background. Since producer
// and worker are separate processes here, each gets its own
// dedicated connection — no shared-connection footgun to worry
// about.
//
// Using Bun's native RedisClient + BullMQ's createBunRedisClient
// adapter rather than ioredis — fewer dependencies, native to the
// runtime. BullMQ's Bun adapter includes its own automatic reconnect
// with exponential backoff for unexpected disconnects, so we don't
// need to hand-roll retry logic here.

import { RedisClient } from "bun";
import { createBunRedisClient, type IRedisClient } from "bullmq";
import { env } from "../config/env";

// Bun's RedisClient types onconnect/onclose/onerror as `T | null`,
// while BullMQ's BunRedisRawClient interface (which createBunRedisClient
// expects) types them as `T | undefined`. Verified directly against
// both packages' source: the runtime shapes are otherwise identical
// (same method set: connect, close, send, get, smembers, incr, plus
// a `connected` boolean and optional `url`). This is a declared-type
// strictness mismatch between two independent packages, not a real
// incompatibility — a narrow cast at this one boundary is the
// correct fix rather than loosening our own tsconfig strictness
// project-wide.
function toBullMqRedisClient(client: RedisClient): Parameters<typeof createBunRedisClient>[0] {
  return client as unknown as Parameters<typeof createBunRedisClient>[0];
}

/**
 * For the producer (HTTP endpoint adding jobs). lazyConnect: false
 * (the default) so we connect immediately at startup and fail loudly
 * if Redis isn't reachable, rather than discovering that on the
 * first real request.
 */
export function createProducerConnection(): IRedisClient {
  const rawClient = new RedisClient(env.REDIS_URL);
  return createBunRedisClient(toBullMqRedisClient(rawClient));
}

/**
 * For the worker (background job consumer). Same adapter — the
 * "retry forever" behavior for workers is handled by BullMQ's Bun
 * adapter's built-in exponential-backoff reconnect, not by a
 * maxRetriesPerRequest-style setting (that ioredis-specific option
 * doesn't apply to Bun's client).
 */
export function createWorkerConnection(): IRedisClient {
  const rawClient = new RedisClient(env.REDIS_URL);
  return createBunRedisClient(toBullMqRedisClient(rawClient));
}