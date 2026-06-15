// /**
//  * handlers/createTransport.ts
//  *
//  * Client sends:  { type: 'createWebRtcTransport', payload: { consumer: boolean } }
//  * Server replies: { type: 'createWebRtcTransport-response', payload: { params } }
//  *
//  * 'consumer: false' → send transport (for producing)
//  * 'consumer: true'  → recv transport (for consuming)
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from '../index.js'
// import * as mediasoup           from '../mediasoupClient.js'

// export const handleCreateTransport = async (
//   ws: ServerWebSocket<WSData>,
//   payload: { consumer: boolean }
// ) => {
//   const { consumer } = payload
//   const { socketId }  = ws.data

//   const { params } = await mediasoup.createTransport(socketId, consumer)

//   ws.send(JSON.stringify({
//     type:    'createWebRtcTransport-response',
//     payload: { params, consumer },   // ← send consumer flag back so client knows which transport this is
//   }))

//   console.log(`[createTransport] socketId=${socketId} consumer=${consumer}`)
// }


//pahse2:


import type { ServerWebSocket } from 'bun'
import type { WSData }          from '../index.js'
import * as mediasoup           from '../mediasoupClient.js'
import { getMediasoupUrl }      from '../getMedisoupUrl.js'

export const handleCreateTransport = async (
  ws: ServerWebSocket<WSData>,
  payload: { consumer: boolean }
) => {
  const { consumer } = payload
  const { socketId }  = ws.data

  // Phase 2: resolve correct mediasoup server for this socket's session
  const url = await getMediasoupUrl(socketId)

  const { params } = await mediasoup.createTransport(socketId, consumer, url)

  ws.send(JSON.stringify({
    type:    'createWebRtcTransport-response',
    payload: { params, consumer },
  }))

  console.log(`[createTransport] socketId=${socketId} consumer=${consumer} server=${url}`)
}