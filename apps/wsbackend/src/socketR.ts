// // /**
// //  * socketRegistry.ts
// //  *
// //  * Global in-memory map: socketId → ServerWebSocket
// //  *
// //  * This is how the Bun WS server pushes events (like 'new-producer' or
// //  * 'producer-closed') to specific clients — by looking up their socket here.
// //  *
// //  * Also maps socketId → roomName so the webhook handler can find all
// //  * peers in a room without calling mediasoup again.
// //  */

// // import type { ServerWebSocket } from 'bun'
// // import type { WSData }          from './index.js'

// // // socketId → WebSocket instance
// // const sockets = new Map<string, ServerWebSocket<WSData>>()

// // // socketId → roomName  (set when peer joins a room)
// // const socketRooms = new Map<string, string>()

// // // roomName → Set<socketId>  (fast room-level lookups)
// // const roomMembers = new Map<string, Set<string>>()

// // // ─── Socket Management ────────────────────────────────────────────────────────

// // export const registerSocket = (socketId: string, ws: ServerWebSocket<WSData>) => {
// //   sockets.set(socketId, ws)
// // }

// // export const unregisterSocket = (socketId: string) => {
// //   const roomName = socketRooms.get(socketId)
// //   if (roomName) {
// //     roomMembers.get(roomName)?.delete(socketId)
// //   }
// //   socketRooms.delete(socketId)
// //   sockets.delete(socketId)
// // }

// // export const getSocket = (socketId: string): ServerWebSocket<WSData> | undefined => {
// //   return sockets.get(socketId)
// // }

// // // ─── Room Management ──────────────────────────────────────────────────────────

// // export const joinRoom = (socketId: string, roomName: string) => {
// //   socketRooms.set(socketId, roomName)

// //   if (!roomMembers.has(roomName)) {
// //     roomMembers.set(roomName, new Set())
// //   }
// //   roomMembers.get(roomName)!.add(socketId)
// // }

// // export const getRoomForSocket = (socketId: string): string | undefined => {
// //   return socketRooms.get(socketId)
// // }

// // export const getRoomMembers = (roomName: string): string[] => {
// //   return Array.from(roomMembers.get(roomName) ?? [])
// // }

// // // ─── Push Helpers ─────────────────────────────────────────────────────────────

// // /**
// //  * Send a typed JSON message to a specific socket.
// //  */
// // export const sendTo = (socketId: string, type: string, payload: object) => {
// //   const ws = sockets.get(socketId)
// //   if (ws) {
// //     ws.send(JSON.stringify({ type, payload }))
// //   } else {
// //     console.warn(`[Registry] sendTo: socket ${socketId} not found`)
// //   }
// // }

// // /**
// //  * Send a typed JSON message to everyone in a room except the sender.
// //  */
// // export const broadcastToRoom = (
// //   roomName: string,
// //   excludeSocketId: string,
// //   type: string,
// //   payload: object
// // ) => {
// //   const members = roomMembers.get(roomName) ?? new Set()
// //   members.forEach(socketId => {
// //     if (socketId !== excludeSocketId) {
// //       sendTo(socketId, type, payload)
// //     }
// //   })
// // }


// // After the PUB/SUB


// /**
//  * src/socketRegistry.ts  (Redis-backed)
//  *
//  * EXPORTS EXACTLY THE SAME FUNCTIONS as the old in-memory version:
//  *   registerSocket, unregisterSocket, getSocket,
//  *   joinRoom, getRoomForSocket, getRoomMembers,
//  *   sendTo, broadcastToRoom
//  *
//  * Nothing else in the codebase needs to change.
//  *
//  * How it works:
//  *
//  *   WebSocket objects physically live in process memory — they are OS TCP
//  *   sockets and cannot be serialised. So localSockets Map stays in-process.
//  *
//  *   Everything else (room membership, socket→room mapping) moves to Redis
//  *   so it survives restarts and is visible to future WS nodes.
//  *
//  *   broadcastToRoom now uses Redis PUBLISH so future WS nodes
//  *   automatically receive and forward messages to their local sockets.
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from './index.js'
// import { pub, sub, K, TTL }     from './redis.js'

// // WebSocket handles — must stay in memory (cannot go to Redis)
// const localSockets = new Map<string, ServerWebSocket<WSData>>()

// // Rooms this node has subscribed to on the pub/sub channel
// const subscribedChannels = new Set<string>()

// // ── Socket lifecycle ───────────────────────────────────────────────────────────

// export const registerSocket = async (
//   socketId: string,
//   ws: ServerWebSocket<WSData>
// ) => {
//   // Store handle locally
//   localSockets.set(socketId, ws)

//   // Store in Redis which node owns this socket
//   const nodeId = process.env.WS_NODE_ID || 'ws-node-1'
//   await pub.set(K.socket(socketId), nodeId)
//   await pub.send('EXPIRE', [K.socket(socketId), String(TTL.socket)])
// }

// export const unregisterSocket = async (socketId: string) => {
//   // Get room before deleting — needed for SREM
//   const roomName = await getRoomForSocket(socketId)

//   localSockets.delete(socketId)

//   // Clean up Redis keys
//   await pub.send('DEL', [K.socket(socketId), K.socketRoom(socketId)])

//   if (roomName) {
//     await pub.send('SREM', [K.roomMembers(roomName), socketId])
//   }
// }

// export const getSocket = (socketId: string) => localSockets.get(socketId)

// // ── Room membership ────────────────────────────────────────────────────────────

// export const joinRoom = async (socketId: string, roomName: string) => {
//   // Add to room SET in Redis
//   await pub.send('SADD',   [K.roomMembers(roomName), socketId])
//   await pub.send('EXPIRE', [K.roomMembers(roomName), String(TTL.room)])

//   // Track socket→room mapping
//   await pub.set(K.socketRoom(socketId), roomName)
//   await pub.send('EXPIRE', [K.socketRoom(socketId), String(TTL.socket)])

//   // Subscribe this node to the room's pub/sub channel (once per room per node)
//   await subscribeToRoomChannel(roomName)
// }

// export const getRoomForSocket = async (socketId: string): Promise<string | null> => {
//   return await pub.get(K.socketRoom(socketId))
// }

// export const getRoomMembers = async (roomName: string): Promise<string[]> => {
//   const members = await pub.send('SMEMBERS', [K.roomMembers(roomName)])
//   return (members as string[]) ?? []
// }

// // ── Push helpers ───────────────────────────────────────────────────────────────

// /**
//  * Send directly to a socket on THIS node.
//  * Used for responses (e.g. joinRoom-response) where we know the socket is local.
//  */
// export const sendTo = (socketId: string, type: string, payload: object) => {
//   const ws = localSockets.get(socketId)
//   if (ws) {
//     ws.send(JSON.stringify({ type, payload }))
//   } else {
//     console.warn(`[Registry] sendTo: ${socketId} not on this node`)
//   }
// }

// /**
//  * Broadcast to everyone in a room via Redis PUBLISH.
//  * Every WS node (including this one) subscribed to the channel
//  * will receive the message and forward it to their local sockets.
//  *
//  * Same signature as the old in-memory broadcastToRoom —
//  * all call sites stay unchanged.
//  */
// export const broadcastToRoom = async (
//   roomName: string,
//   excludeSocketId: string,
//   type: string,
//   payload: object
// ) => {
//   await pub.send('PUBLISH', [
//     K.roomChannel(roomName),
//     JSON.stringify({ type, payload, excludeSocketId }),
//   ])
// }

// // ── Internal: subscribe this node to a room's channel ─────────────────────────

// const subscribeToRoomChannel = async (roomName: string) => {
//   const channel = K.roomChannel(roomName)
//   if (subscribedChannels.has(channel)) return   // already subscribed

//   await sub.subscribe(channel, async (rawMessage: string) => {
//     let msg: { type: string; payload: object; excludeSocketId: string }
//     try {
//       msg = JSON.parse(rawMessage)
//     } catch {
//       console.error('[Registry] pub/sub parse error:', rawMessage)
//       return
//     }

//     const { type, payload, excludeSocketId } = msg

//     // Get current room members from Redis
//     const members = await getRoomMembers(roomName)

//     // Push to each socket that lives on THIS node
//     members.forEach(socketId => {
//       if (socketId === excludeSocketId) return
//       sendTo(socketId, type, payload)
//     })
//   })

//   subscribedChannels.add(channel)
//   console.log(`[Registry] Subscribed to channel: ${channel}`)
// }



/**
 * src/socketRegistry.ts  (phase 3)
 *
 * Phase 3 additions to phase 1+2 code:
 *
 *   1. unregisterSocket() now checks if the room is empty after a peer leaves.
 *      If it is, it calls the Room Router /release endpoint so the capacity
 *      slot is freed and the server can accept new rooms.
 *
 *   2. broadcastToRoom() excludeSocketId='' (empty string) means send to ALL
 *      members — used by webhookHandler which wants to notify everyone.
 *
 * Everything else unchanged from phase 1+2.
 */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from './index.js'
// import { pub, sub, K, TTL }     from './redis.js'

// const localSockets       = new Map<string, ServerWebSocket<WSData>>()
// const subscribedChannels = new Set<string>()

// const ROUTER_URL    = process.env.ROOM_ROUTER_URL
// const ROUTER_SECRET = process.env.ROUTER_SECRET || 'room_router_secret_here'

// // ── Socket lifecycle ───────────────────────────────────────────────────────────

// export const registerSocket = async (
//   socketId: string,
//   ws: ServerWebSocket<WSData>
// ) => {
//   localSockets.set(socketId, ws)
//   const nodeId = process.env.WS_NODE_ID || 'ws-node-1'
//   await pub.set(K.socket(socketId), nodeId)
//   await pub.send('EXPIRE', [K.socket(socketId), String(TTL.socket)])
// }

// export const unregisterSocket = async (socketId: string) => {
//   const roomName = await getRoomForSocket(socketId)

//   localSockets.delete(socketId)

//   await pub.send('DEL', [K.socket(socketId), K.socketRoom(socketId)])

//   if (roomName) {
//     await pub.send('SREM', [K.roomMembers(roomName), socketId])

//     // ── PHASE 3: Check if room is now empty ──────────────────────────────
//     // If this was the last peer, release the room from the mediasoup server
//     // so its capacity slot is freed for future rooms.
//     const remaining = await pub.send('SCARD', [K.roomMembers(roomName)]) as number
//     if (remaining === 0) {
//       console.log(`[Registry] Room "${roomName}" is now empty — releasing from pool`)
//       await releaseRoomFromRouter(roomName)
//     }
//   }
// }

// export const getSocket = (socketId: string) => localSockets.get(socketId)

// // ── Room membership ────────────────────────────────────────────────────────────

// export const joinRoom = async (socketId: string, roomName: string) => {
//   await pub.send('SADD',   [K.roomMembers(roomName), socketId])
//   await pub.send('EXPIRE', [K.roomMembers(roomName), String(TTL.room)])
//   await pub.set(K.socketRoom(socketId), roomName)
//   await pub.send('EXPIRE', [K.socketRoom(socketId), String(TTL.socket)])
//   await subscribeToRoomChannel(roomName)
// }

// export const getRoomForSocket = async (socketId: string): Promise<string | null> => {
//   return await pub.get(K.socketRoom(socketId))
// }

// export const getRoomMembers = async (roomName: string): Promise<string[]> => {
//   const members = await pub.send('SMEMBERS', [K.roomMembers(roomName)])
//   return (members as string[]) ?? []
// }

// // ── Push helpers ───────────────────────────────────────────────────────────────

// export const sendTo = (socketId: string, type: string, payload: object) => {
//   const ws = localSockets.get(socketId)
//   if (ws) {
//     ws.send(JSON.stringify({ type, payload }))
//   } else {
//     console.warn(`[Registry] sendTo: ${socketId} not on this node`)
//   }
// }

// /**
//  * Publish event to all nodes via Redis channel.
//  * excludeSocketId = '' means send to EVERYONE (used by webhook for producer-closed)
//  * excludeSocketId = socketId means skip the sender (used by produce for new-producer)
//  */
// export const broadcastToRoom = async (
//   roomName: string,
//   excludeSocketId: string,
//   type: string,
//   payload: object
// ) => {
//   await pub.send('PUBLISH', [
//     K.roomChannel(roomName),
//     JSON.stringify({ type, payload, excludeSocketId }),
//   ])
// }

// // ── Internal: room channel subscription ───────────────────────────────────────

// const subscribeToRoomChannel = async (roomName: string) => {
//   const channel = K.roomChannel(roomName)
//   if (subscribedChannels.has(channel)) return

//   await sub.subscribe(channel, async (rawMessage: string) => {
//     let msg: { type: string; payload: object; excludeSocketId: string }
//     try {
//       msg = JSON.parse(rawMessage)
//     } catch {
//       console.error('[Registry] pub/sub parse error:', rawMessage)
//       return
//     }

//     const { type, payload, excludeSocketId } = msg
//     const members = await getRoomMembers(roomName)

//     members.forEach(socketId => {
//       // excludeSocketId = '' → send to everyone (no exclusions)
//       if (excludeSocketId && socketId === excludeSocketId) return
//       sendTo(socketId, type, payload)
//     })
//   })

//   subscribedChannels.add(channel)
//   console.log(`[Registry] Subscribed to pub/sub channel: ${channel}`)
// }

// // ── Internal: notify Room Router when room empties ────────────────────────────

// const releaseRoomFromRouter = async (roomName: string) => {
//   if (!ROUTER_URL) return  // Room Router not configured — skip

//   try {
//     const res = await fetch(`${ROUTER_URL}/release`, {
//       method: 'POST',
//       headers: {
//         'Content-Type':    'application/json',
//         'X-Router-Secret': ROUTER_SECRET,
//       },
//       body: JSON.stringify({ roomName }),
//     })
//     if (res.ok) {
//       console.log(`[Registry] Room "${roomName}" released from Room Router`)
//     } else {
//       console.warn(`[Registry] Room Router /release returned ${res.status}`)
//     }
//   } catch (err: any) {
//     // Non-critical — if this fails, the capacity slot just stays occupied until TTL expires
//     console.warn(`[Registry] Could not notify Room Router of empty room: ${err.message}`)
//   }
// }



/**
 * src/socketRegistry.ts  (phase 3)
 *
 * Phase 3 additions to phase 1+2 code:
 *
 *   1. unregisterSocket() now checks if the room is empty after a peer leaves.
 *      If it is, it calls the Room Router /release endpoint so the capacity
 *      slot is freed and the server can accept new rooms.
 *
 *   2. broadcastToRoom() excludeSocketId='' (empty string) means send to ALL
 *      members — used by webhookHandler which wants to notify everyone.
 *
 * Everything else unchanged from phase 1+2.
 */

import type { ServerWebSocket } from 'bun'
import type { WSData }          from './index.js'
import { pub, sub, K, TTL }     from './redis.js'

const localSockets       = new Map<string, ServerWebSocket<WSData>>()
const subscribedChannels = new Set<string>()

const ROUTER_URL    = process.env.ROOM_ROUTER_URL
const ROUTER_SECRET = process.env.ROUTER_SECRET || 'room_router_secret_here'

// ── Socket lifecycle ───────────────────────────────────────────────────────────

export const registerSocket = async (
  socketId: string,
  ws: ServerWebSocket<WSData>
) => {
  localSockets.set(socketId, ws)
  const nodeId = process.env.WS_NODE_ID || 'ws-node-1'
  await pub.set(K.socket(socketId), nodeId)
  await pub.send('EXPIRE', [K.socket(socketId), String(TTL.socket)])
}

export const unregisterSocket = async (socketId: string) => {
  const roomName = await getRoomForSocket(socketId)

  localSockets.delete(socketId)

  await pub.send('DEL', [K.socket(socketId), K.socketRoom(socketId)])

  if (roomName) {
    await pub.send('SREM', [K.roomMembers(roomName), socketId])

    // ── PHASE 3: Check if room is now empty ──────────────────────────────
    // If this was the last peer, release the room from the mediasoup server
    // so its capacity slot is freed for future rooms.
    const remaining = await pub.send('SCARD', [K.roomMembers(roomName)]) as number
    if (remaining === 0) {
      console.log(`[Registry] Room "${roomName}" is now empty — releasing from pool`)
      await releaseRoomFromRouter(roomName)
    }
  }
}

export const getSocket = (socketId: string) => localSockets.get(socketId)

// ── Room membership ────────────────────────────────────────────────────────────

export const joinRoom = async (socketId: string, roomName: string) => {
  await pub.send('SADD',   [K.roomMembers(roomName), socketId])
  await pub.send('EXPIRE', [K.roomMembers(roomName), String(TTL.room)])
  await pub.set(K.socketRoom(socketId), roomName)
  await pub.send('EXPIRE', [K.socketRoom(socketId), String(TTL.socket)])
  await subscribeToRoomChannel(roomName)
}

export const getRoomForSocket = async (socketId: string): Promise<string | null> => {
  return await pub.get(K.socketRoom(socketId))
}

export const getRoomMembers = async (roomName: string): Promise<string[]> => {
  const members = await pub.send('SMEMBERS', [K.roomMembers(roomName)])
  return (members as string[]) ?? []
}

// ── Push helpers ───────────────────────────────────────────────────────────────

export const sendTo = (socketId: string, type: string, payload: object) => {
  const ws = localSockets.get(socketId)
  if (ws) {
    ws.send(JSON.stringify({ type, payload }))
  } else {
    console.warn(`[Registry] sendTo: ${socketId} not on this node`)
  }
}

/**
 * Publish event to all nodes via Redis channel.
 * excludeSocketId = '' means send to EVERYONE (used by webhook for producer-closed)
 * excludeSocketId = socketId means skip the sender (used by produce for new-producer)
 */
export const broadcastToRoom = async (
  roomName: string,
  excludeSocketId: string,
  type: string,
  payload: object
) => {
  await pub.send('PUBLISH', [
    K.roomChannel(roomName),
    JSON.stringify({ type, payload, excludeSocketId }),
  ])
}

// ── Internal: room channel subscription ───────────────────────────────────────

const subscribeToRoomChannel = async (roomName: string) => {
  const channel = K.roomChannel(roomName)
  if (subscribedChannels.has(channel)) return

  await sub.subscribe(channel, async (rawMessage: string) => {
    let msg: { type: string; payload: object; excludeSocketId: string }
    try {
      msg = JSON.parse(rawMessage)
    } catch {
      console.error('[Registry] pub/sub parse error:', rawMessage)
      return
    }

    const { type, payload, excludeSocketId } = msg

    // DEBUG
    console.log(`[DEBUG-Registry] ▶ pub/sub received on channel ${channel}: type=${type}`)

    const members = await getRoomMembers(roomName)
    console.log(`[DEBUG-Registry]   room members from Redis: ${members.length} →`, members)

    members.forEach(socketId => {
      // excludeSocketId = '' → send to everyone (no exclusions)
      if (excludeSocketId && socketId === excludeSocketId) return
      const ws = localSockets.get(socketId)
      console.log(`[DEBUG-Registry]   sendTo ${socketId}: socket in localSockets=${!!ws}`)
      sendTo(socketId, type, payload)
    })
  })

  subscribedChannels.add(channel)
  console.log(`[Registry] Subscribed to pub/sub channel: ${channel}`)
}

// ── Internal: notify Room Router when room empties ────────────────────────────

const releaseRoomFromRouter = async (roomName: string) => {
  if (!ROUTER_URL) return  // Room Router not configured — skip

  try {
    const res = await fetch(`${ROUTER_URL}/release`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Router-Secret': ROUTER_SECRET,
      },
      body: JSON.stringify({ roomName }),
    })
    if (res.ok) {
      console.log(`[Registry] Room "${roomName}" released from Room Router`)
    } else {
      console.warn(`[Registry] Room Router /release returned ${res.status}`)
    }
  } catch (err: any) {
    // Non-critical — if this fails, the capacity slot just stays occupied until TTL expires
    console.warn(`[Registry] Could not notify Room Router of empty room: ${err.message}`)
  }
}