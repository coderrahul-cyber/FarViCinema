// // /**
// //  * webhookHandler.ts
// //  *
// //  * The mediasoup server cannot emit socket events — it has no socket awareness.
// //  * When a producer closes (peer left, transport died), mediasoup-server calls
// //  * this HTTP endpoint so the Bun WS server can push 'producer-closed' to
// //  * all affected consumers.
// //  *
// //  * Webhook payload from mediasoup-server:
// //  *   POST /webhook/producer-closed
// //  *   Body: { producerId, roomName, secret }
// //  *
// //  * Security: shared WEBHOOK_SECRET checked on every call.
// //  */

// // import { sendTo, getRoomMembers } from './socketR.js'

// // const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

// // /**
// //  * Call this from the Bun HTTP router.
// //  * Returns an HTTP Response object.
// //  */
// // export const handleProducerClosed = (body: {
// //   producerId: string
// //   roomName:   string
// //   secret:     string
// // }): Response => {
// //   const { producerId, roomName, secret } = body

// //   // ── Security check ────────────────────────────────────────────────────────
// //   if (secret !== WEBHOOK_SECRET) {
// //     console.warn('[Webhook] Unauthorized call — wrong secret')
// //     return new Response(JSON.stringify({ error: 'Unauthorized' }), {
// //       status:  401,
// //       headers: { 'Content-Type': 'application/json' },
// //     })
// //   }

// //   if (!producerId || !roomName) {
// //     return new Response(JSON.stringify({ error: 'producerId and roomName are required' }), {
// //       status:  400,
// //       headers: { 'Content-Type': 'application/json' },
// //     })
// //   }

// //   // ── Notify all peers in the room ─────────────────────────────────────────
// //   // Every consumer of this producer needs to know so they can clean up
// //   // their local consumer + remove the video element.
// //   const members = getRoomMembers(roomName)

// //   members.forEach(socketId => {
// //     sendTo(socketId, 'producer-closed', { remoteProducerId: producerId })
// //   })

// //   console.log(`[Webhook] producer-closed: producerId=${producerId} room=${roomName} notified ${members.length} peers`)

// //   return new Response(JSON.stringify({ notified: members.length }), {
// //     status:  200,
// //     headers: { 'Content-Type': 'application/json' },
// //   })
// // }

// // After pub Sub

// /**
//  * webhookHandler.ts
//  *
//  * One change from original:
//  *   getRoomMembers is now async (reads Redis) — add await.
//  *   Everything else identical.
//  */

// import { sendTo, getRoomMembers } from './socketR.js'

// const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

// export const handleProducerClosed = async (body: {
//   producerId: string
//   roomName:   string
//   secret:     string
// }): Promise<Response> => {
//   const { producerId, roomName, secret } = body

//   if (secret !== WEBHOOK_SECRET) {
//     console.warn('[Webhook] Unauthorized — wrong secret')
//     return new Response(JSON.stringify({ error: 'Unauthorized' }), {
//       status: 401, headers: { 'Content-Type': 'application/json' }
//     })
//   }

//   if (!producerId || !roomName) {
//     return new Response(JSON.stringify({ error: 'producerId and roomName required' }), {
//       status: 400, headers: { 'Content-Type': 'application/json' }
//     })
//   }

//   // NOW ASYNC — reads room members from Redis
//   const members = await getRoomMembers(roomName)

//   members.forEach(socketId => {
//     sendTo(socketId, 'producer-closed', { remoteProducerId: producerId })
//   })

//   console.log(`[Webhook] producer-closed: ${producerId} room=${roomName} notified ${members.length} peers`)

//   return new Response(JSON.stringify({ notified: members.length }), {
//     status: 200, headers: { 'Content-Type': 'application/json' }
//   })
// }




/**
 * webhookHandler.ts  (phase 3)
 *
 * Phase 3 change:
 *   Instead of calling sendTo() for each room member directly,
 *   we now PUBLISH to the Redis room channel.
 *
 *   Why this matters for multi-node:
 *     OLD: sendTo() only reaches sockets on THIS node.
 *          If a consumer is on node-2 and this webhook hits node-1, they never hear it.
 *     NEW: PUBLISH goes to Redis. Every WS node subscribed to this room
 *          receives it and pushes to their local sockets. Node-agnostic.
 *
 *   On single-node this is functionally identical — the node publishes
 *   and immediately receives its own message, then pushes to local sockets.
 */

/**
 * webhookHandler.ts
 *
 * FIX: Made handleProducerClosed async so it can await getRoomMembers().
 *
 * Root cause of "tile freezes on leave":
 *   getRoomMembers() in phase3 socketRegistry is ASYNC (reads from Redis).
 *   The old sync version called .forEach() on a Promise object — which is a
 *   no-op. Zero sockets were notified, so the frontend never got producer-closed.
 *
 * This version works with BOTH the base (sync, in-memory) socketRegistry
 * AND the phase3 (async, Redis-backed) socketRegistry because:
 *   - await on a non-Promise just returns the value immediately
 *   - await on a Promise resolves it
 * So this single file handles both cases correctly.
 */

/**
 * webhookHandler.ts
 *
 * DEFINITIVE FIX for "tile freezes when peer leaves".
 *
 * Previous approach:
 *   getRoomMembers(roomName) → sendTo(socketId) for each member
 *
 * Problem: getRoomMembers relies on either:
 *   a) In-memory Map — stale after ws-server restart, wrong after reconnect
 *   b) Redis SMEMBERS — correct, but still requires the socketId→WS lookup
 *      to find the live connection, which can miss sockets
 *
 * Definitive approach: PUBLISH to the Redis room channel.
 *   Every peer that joined a room subscribed to that channel via subscribeToRoomChannel().
 *   Redis pub/sub delivery is push-based and immediate — no membership lookup needed.
 *   The subscriber callback in socketRegistry calls sendTo() with the live socket.
 *   This is the same path used by 'new-producer' events, which already work correctly.
 *
 * Fallback: also call sendTo() on locally-known sockets in case Redis is unavailable.
 */

import { pub, K }                     from './redis.js'
import { getRoomMembers, sendTo }      from './socketR.js'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

export const handleProducerClosed = async (body: {
  producerId: string
  roomName:   string
  secret:     string
}): Promise<Response> => {
  const { producerId, roomName, secret } = body

  // DEBUG — log every webhook that arrives
  console.log(`[DEBUG-Webhook] ▶ received: producerId=${producerId} room=${roomName}`)
  console.log(`[DEBUG-Webhook]   secret match: ${secret === WEBHOOK_SECRET} (env secret ${WEBHOOK_SECRET ? '✓set' : '✗EMPTY'})`)

  if (secret !== WEBHOOK_SECRET) {
    console.warn('[DEBUG-Webhook] ✗ UNAUTHORIZED — secrets do not match!')
    console.warn(`[DEBUG-Webhook]   received="${secret}" expected="${WEBHOOK_SECRET}"`)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!producerId || !roomName) {
    return new Response(JSON.stringify({ error: 'producerId and roomName required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const payload = JSON.stringify({
    type:            'producer-closed',
    payload:         { remoteProducerId: producerId },
    excludeSocketId: '',   // empty = send to ALL members
  })

  let published = false

  // ── Primary: Redis pub/sub (same path as 'new-producer' — known working) ──
  try {
    const channel = K.roomChannel(roomName)
    console.log(`[DEBUG-Webhook] ▶ PUBLISH to channel: ${channel}`)
    const subCount = await pub.send('PUBLISH', [channel, payload])
    published = true
    console.log(`[DEBUG-Webhook] ✓ PUBLISHED — ${subCount} subscriber(s) received it`)
    if (Number(subCount) === 0) {
      console.warn('[DEBUG-Webhook] ⚠ 0 subscribers! The room channel has no listeners.')
      console.warn('[DEBUG-Webhook]   This means joinRoom never called subscribeToRoomChannel,')
      console.warn('[DEBUG-Webhook]   or the ws-server restarted after the peer joined.')
    }
  } catch (redisErr: any) {
    console.warn('[DEBUG-Webhook] ✗ Redis PUBLISH failed:', (redisErr as any).message)
  }

  // ── Fallback: direct sendTo for each known local socket ───────────────────
  // Runs even if PUBLISH succeeded — belt-and-suspenders for edge cases
  // where a socket joined before the room channel subscription was set up.
  if (!published) {
    const members = await getRoomMembers(roomName)
    console.log(`[DEBUG-Webhook] fallback: getRoomMembers returned ${members.length} socketIds:`, members)
    members.forEach(socketId => {
      sendTo(socketId, 'producer-closed', { remoteProducerId: producerId })
    })
    console.log(`[DEBUG-Webhook] fallback sendTo: notified ${members.length} peers`)
  }

  return new Response(JSON.stringify({ ok: true, published }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}