/**
 * src/redis.js  —  room-router
 *
 * Uses ioredis (Node.js) — not Bun's native client.
 * Room Router is a plain Node.js Express app.
 *
 * Key schema (extends phase 1 schema, never overwrites phase 1 keys):
 *
 *   room:server:{roomName}    STRING  → mediasoup server URL assigned to this room
 *   server:rooms:{url}        SET     → rooms currently assigned to this server
 *   server:health:{url}       STRING  → "ok" | "down" (updated by health checks)
 *
 * Phase 1 keys (read-only from room-router's perspective):
 *   room:members:{roomName}   SET     → socketIds (owned by ws-server)
 */

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://:videocall_secret@127.0.0.1:6379'

export const redis = new Redis(REDIS_URL, {
  // Retry connection with backoff
  retryStrategy: (times) => {
    if (times > 10) {
      console.error('[Redis] Too many retries — giving up')
      return null
    }
    return Math.min(times * 200, 2000)
  },
  lazyConnect: true,
})

// Key helpers — namespaced to avoid collisions with phase 1 keys
export const K = {
  roomServer:    (room: string)   => `room:server:${room}`,
  serverRooms:   (url: string)    => `server:rooms:${url}`,
  serverHealth:  (url: string)    => `server:health:${url}`,
  roomMembers:   (room: string)   => `room:members:${room}`,   // phase 1 key (read-only)
}

export const ROOM_TTL = Number(process.env.ROOM_TTL) || 86400

export const connectRedis = async () => {
  await redis.connect()
  await redis.ping()
  console.log('[Redis] Connected')
}