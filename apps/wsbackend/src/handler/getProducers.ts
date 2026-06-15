// /**
//  * handlers/getProducers.ts
//  *
//  * Client sends:  { type: 'getProducers', payload: {} }
//  * Server replies: { type: 'getProducers-response', payload: { producers: [id, ...] } }
//  *
//  * Called when a new peer joins and needs to consume existing streams.
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from '../index.js'
// import * as mediasoup           from '../mediasoupClient.js'
// import { getRoomForSocket }     from '../socketR.js'

// export const handleGetProducers = async (
//   ws: ServerWebSocket<WSData>,
//   _payload: {}
// ) => {
//   const { socketId } = ws.data

//   const roomName = getRoomForSocket(socketId)
//   if (!roomName) {
//     return ws.send(JSON.stringify({
//       type:    'error',
//       payload: { message: 'You have not joined a room yet' }
//     }))
//   }

//   const { producers } = await mediasoup.getProducers(roomName, socketId)

//   ws.send(JSON.stringify({
//     type:    'getProducers-response',
//     payload: { producers }
//   }))

//   console.log(`[getProducers] room=${roomName} found ${producers.length} producers for ${socketId}`)
// }


//phase2:

import type { ServerWebSocket } from 'bun'
import type { WSData }          from '../index.js'
import * as mediasoup           from '../mediasoupClient.js'
import { getRoomForSocket }     from '../socketR.js'
import { getMediasoupUrl }      from '../getMedisoupUrl.js'

export const handleGetProducers = async (
  ws: ServerWebSocket<WSData>,
  _payload: {}
) => {
  const { socketId } = ws.data

  const roomName = await getRoomForSocket(socketId)
  if (!roomName) {
    return ws.send(JSON.stringify({
      type:    'error',
      payload: { message: 'You have not joined a room yet' }
    }))
  }

  const url = await getMediasoupUrl(socketId)

  const { producers } = await mediasoup.getProducers(roomName, socketId, url)

  ws.send(JSON.stringify({
    type:    'getProducers-response',
    payload: { producers }
  }))

  console.log(`[getProducers] room=${roomName} found ${producers.length} producers server=${url}`)
}