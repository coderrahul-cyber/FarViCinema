/**
 * src/getMediasoupUrl.ts
 *
 * Shared helper used by ALL handlers that call mediasoup.
 *
 * Returns the mediasoup server URL for a given socketId by reading
 * the key stored in Redis during joinRoom (socket:mediasoup:{socketId}).
 *
 * Falls back to MEDIASOUP_SERVER_URL if:
 *   - The key doesn't exist (socket never joined a room)
 *   - Redis read fails
 *   - Room Router was not configured (phase 1 deployment)
 *
 * This is the only change needed in handlers — replace:
 *   await mediasoup.createTransport(socketId, consumer)
 * with:
 *   const url = await getMediasoupUrl(socketId)
 *   await mediasoup.createTransport(socketId, consumer, url)
 */

import { pub } from './redis.js'

const DEFAULT = process.env.MEDIASOUP_SERVER_URL!

export const getMediasoupUrl = async (socketId: string): Promise<string> => {
  try {
    const url = await pub.get(`socket:mediasoup:${socketId}`)
    return url ?? DEFAULT
  } catch {
    return DEFAULT
  }
}