// // /**
// //  * handlers/produce.ts
// //  *
// //  * Client sends:  { type: 'transport-produce', payload: { kind, rtpParameters, appData } }
// //  * Server replies: { type: 'transport-produce-response', payload: { id, producersExist } }
// //  *
// //  * After creating the producer, notifies all OTHER peers in the room
// //  * by emitting 'new-producer' to each of their sockets.
// //  */

// // import type { ServerWebSocket } from 'bun'
// // import type { WSData }          from '../index.js'
// // import * as mediasoup           from '../mediasoupClient.js'
// // import { sendTo }               from '../socketR.js'

// // export const handleProduce = async (
// //   ws: ServerWebSocket<WSData>,
// //   payload: { kind: string; rtpParameters: object; appData?: object }
// // ) => {
// //   const { kind, rtpParameters } = payload
// //   const { socketId }             = ws.data

// //   const { producerId, producersExist, otherSocketIds } =
// //     await mediasoup.createProducer(socketId, kind, rtpParameters)

// //   // ── Notify every other peer in the room ───────────────────────────────────
// //   // mediasoup-server returned otherSocketIds — the WS server is responsible
// //   // for the actual socket push since mediasoup has no socket awareness.
// //   otherSocketIds.forEach(otherId => {
// //     sendTo(otherId, 'new-producer', { producerId })
// //   })

// //   // ── Reply to the producer ─────────────────────────────────────────────────
// //   ws.send(JSON.stringify({
// //     type:    'transport-produce-response',
// //     payload: { id: producerId, producersExist }
// //   }))

// //   console.log(`[produce] producerId=${producerId} kind=${kind} notified ${otherSocketIds.length} peers`)
// // }

// // Pub Sub

// /**
//  * handlers/produce.ts
//  *
//  * Changes from original:
//  *   1. getRoomForSocket is now async — await it
//  *   2. Use broadcastToRoom (Redis pub/sub) instead of sendTo loop
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from '../index.js'
// import * as mediasoup           from '../mediasoupClient.js'
// import { getRoomForSocket,
//          broadcastToRoom }      from '../socketR.js'

// export const handleProduce = async (
//   ws: ServerWebSocket<WSData>,
//   payload: { kind: string; rtpParameters: object; appData?: object }
// ) => {
//   const { kind, rtpParameters } = payload
//   const { socketId }            = ws.data

//   const { producerId, producersExist, otherSocketIds } =
//     await mediasoup.createProducer(socketId, kind, rtpParameters)

//   // Get roomName from Redis
//   const roomName = await getRoomForSocket(socketId)

//   if (roomName) {
//     // Publish to Redis channel → all WS nodes forward to their local sockets
//     await broadcastToRoom(roomName, socketId, 'new-producer', { producerId })
//   } else {
//     console.warn(`[produce] no room found for ${socketId}`)
//   }

//   ws.send(JSON.stringify({
//     type:    'transport-produce-response',
//     payload: { id: producerId, producersExist }
//   }))

//   console.log(`[produce] producerId=${producerId} kind=${kind} notified ${otherSocketIds.length} peers`)
// }


//phase 2

import type { ServerWebSocket } from 'bun'
import type { WSData }          from '../index.js'
import * as mediasoup           from '../mediasoupClient.js'
import { getRoomForSocket,
         broadcastToRoom }      from '../socketR.js'
import { getMediasoupUrl }      from '../getMedisoupUrl.js'

export const handleProduce = async (
  ws: ServerWebSocket<WSData>,
  payload: { kind: string; rtpParameters: object; appData?: object }
) => {
  const { kind, rtpParameters } = payload
  const { socketId }            = ws.data

  const url = await getMediasoupUrl(socketId)

  const { producerId, producersExist, otherSocketIds } =
    await mediasoup.createProducer(socketId, kind, rtpParameters, url)

  const roomName = await getRoomForSocket(socketId)
  if (roomName) {
    await broadcastToRoom(roomName, socketId, 'new-producer', { producerId })
  }

  ws.send(JSON.stringify({
    type:    'transport-produce-response',
    payload: { id: producerId, producersExist }
  }))

  console.log(`[produce] producerId=${producerId} kind=${kind} notified ${otherSocketIds.length} peers server=${url}`)
}