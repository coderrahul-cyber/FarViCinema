// /**
//  * handlers/joinRoom.ts
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from '../index.js'
// import { prisma }               from '@repo/db/prisma'
// import * as mediasoup           from '../mediasoupClient.js'
// import { joinRoom as regJoin }  from '../socketR.js'

// export const handleJoinRoom = async (
//   ws: ServerWebSocket<WSData>,
//   payload: { roomName: string }
// ) => {
//   const { roomName } = payload
//   const { socketId, user } = ws.data

//   if (!roomName) {
//     return ws.send(JSON.stringify({ type: 'error', payload: { message: 'roomName is required' } }))
//   }

//   // DB validation — skip with SKIP_DB_VALIDATION=true in .env for testing
//   if (process.env.SKIP_DB_VALIDATION !== 'true') {
//     try {
//       const room = await prisma.room.findUnique({
//         where: { slug: roomName },
//         include: { users: true },
//       })

//       if (!room) {
//         return ws.send(JSON.stringify({ type: 'error', payload: { message: `Room '${roomName}' not found` } }))
//       }

//       const isAdmin  = room.adminId === user.id
//       const isMember = room.users.some((u: { id: string }) => u.id === user.id)

//       if (!isAdmin && !isMember) {
//         return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Not a member of this room' } }))
//       }
//     } catch (dbErr: any) {
//       console.error('[joinRoom] DB error:', dbErr.message)
//       return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Database error — check DATABASE_URL' } }))
//     }
//   } else {
//     console.warn('[joinRoom] ⚠️  DB validation skipped (SKIP_DB_VALIDATION=true)')
//   }

//   // Call mediasoup-server
//   try {
//     const { rtpCapabilities } = await mediasoup.createRoom(roomName, socketId)
//    await regJoin(socketId, roomName)
//     ws.send(JSON.stringify({ type: 'joinRoom-response', payload: { rtpCapabilities } }))
//     console.log(`[joinRoom] ✅ ${user.name} (${socketId}) joined: ${roomName}`)
//   } catch (err: any) {
//     console.error('[joinRoom] mediasoup error:', err.message)
//     ws.send(JSON.stringify({ type: 'error', payload: { message: `Failed to create room: ${err.message}` } }))
//   }
// }


//Phase2:


/**
 * handlers/joinRoom.ts
 *
 * Phase 2 changes (2 things only):
 *
 *   1. Call resolveMediasoupUrl(roomName) to get the correct mediasoup server
 *      instead of using the hardcoded MEDIASOUP_SERVER_URL.
 *
 *   2. Store the resolved mediasoupUrl in Redis under socket:mediasoup:{socketId}
 *      so other handlers (createTransport, produce, consume etc.) can call
 *      the right server for every subsequent request in this session.
 *
 * Everything else — DB validation, Prisma, joinRoom registry — unchanged.
 */

import type { ServerWebSocket } from 'bun'
import type { WSData }          from '../index.js'
import { prisma }               from '@repo/db/prisma'
import * as mediasoup           from '../mediasoupClient.js'
import { joinRoom as regJoin }  from '../socketR.js'
import { pub }                  from '../redis.js'

// Key for storing which mediasoup server a socket's session is tied to
// TTL matches socket TTL (1 hour)
export const socketMediasoupKey = (socketId: string) => `socket:mediasoup:${socketId}`
export const SOCKET_TTL = 3600

export const handleJoinRoom = async (
  ws: ServerWebSocket<WSData>,
  payload: { roomName: string }
) => {
  const { roomName } = payload
  const { socketId, user } = ws.data

  if (!roomName) {
    return ws.send(JSON.stringify({ type: 'error', payload: { message: 'roomName is required' } }))
  }

  // ── DB validation (unchanged from phase 1) ───────────────────────────────
  if (process.env.SKIP_DB_VALIDATION !== 'true') {
    try {
      const room = await prisma.room.findUnique({
        where:   { slug: roomName },
        include: { users: true },
      })
      if (!room) {
        return ws.send(JSON.stringify({ type: 'error', payload: { message: `Room '${roomName}' not found` } }))
      }
      const isAdmin  = room.adminId === user.id
      const isMember = room.users.some((u: { id: string }) => u.id === user.id)
      if (!isAdmin && !isMember) {
        return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Not a member of this room' } }))
      }
    } catch (dbErr: any) {
      console.error('[joinRoom] DB error:', dbErr.message)
      return ws.send(JSON.stringify({ type: 'error', payload: { message: 'Database error' } }))
    }
  } else {
    console.warn('[joinRoom] ⚠️  DB validation skipped')
  }

  try {
    // ── PHASE 2 CHANGE 1: resolve which mediasoup server owns this room ───
    // If ROOM_ROUTER_URL is not set, this falls back to MEDIASOUP_SERVER_URL
    // automatically — so phase 1 single-server setups need zero changes.
    const mediasoupUrl = await mediasoup.resolveMediasoupUrl(roomName)

    // ── PHASE 2 CHANGE 2: store the resolved URL for this socket session ─
    // Other handlers (createTransport, produce, consume) read this key
    // so they always call the correct mediasoup server, not the default one.
    await pub.set(socketMediasoupKey(socketId), mediasoupUrl)
    await pub.send('EXPIRE', [socketMediasoupKey(socketId), String(SOCKET_TTL)])

    // Call the correct mediasoup server (was: hardcoded BASE_URL)
    const { rtpCapabilities } = await mediasoup.createRoom(roomName, socketId, mediasoupUrl)

    // Register in Redis room membership (unchanged from phase 1)
    await regJoin(socketId, roomName)

    ws.send(JSON.stringify({ type: 'joinRoom-response', payload: { rtpCapabilities } }))
    console.log(`[joinRoom] ✅ ${user.name} (${socketId}) → room "${roomName}" on ${mediasoupUrl}`)

  } catch (err: any) {
    console.error('[joinRoom] error:', err.message)
    ws.send(JSON.stringify({ type: 'error', payload: { message: `Failed: ${err.message}` } }))
  }
}