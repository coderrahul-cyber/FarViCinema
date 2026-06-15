// /**
//  * handlers/consume.ts
//  *
//  * Two events handled here:
//  *
//  * 1. transport-recv-connect
//  *    Client sends:  { type: 'transport-recv-connect', payload: { dtlsParameters, serverConsumerTransportId } }
//  *    Server replies: { type: 'transport-recv-connect-response', payload: { connected: true } }
//  *
//  * 2. consume
//  *    Client sends:  { type: 'consume', payload: { rtpCapabilities, remoteProducerId, serverConsumerTransportId } }
//  *    Server replies: { type: 'consume-response', payload: { params } }
//  */

// import type { ServerWebSocket } from 'bun'
// import type { WSData }          from '../index.js'
// import * as mediasoup           from '../mediasoupClient.js'

// // ── transport-recv-connect ────────────────────────────────────────────────────

// export const handleRecvConnect = async (
//   ws: ServerWebSocket<WSData>,
//   payload: { dtlsParameters: object; serverConsumerTransportId: string }
// ) => {
//   const { dtlsParameters, serverConsumerTransportId } = payload

//   await mediasoup.connectConsumerTransport(dtlsParameters, serverConsumerTransportId)

//   ws.send(JSON.stringify({
//     type:    'transport-recv-connect-response',
//     payload: { connected: true }
//   }))

//   console.log(`[recvConnect] consumerTransport=${serverConsumerTransportId} connected`)
// }

// // ── consume ───────────────────────────────────────────────────────────────────

// export const handleConsume = async (
//   ws: ServerWebSocket<WSData>,
//   payload: {
//     rtpCapabilities:           object
//     remoteProducerId:          string
//     serverConsumerTransportId: string
//   }
// ) => {
//   const { rtpCapabilities, remoteProducerId, serverConsumerTransportId } = payload
//   const { socketId } = ws.data

//   const { params } = await mediasoup.createConsumer(
//     socketId,
//     rtpCapabilities,
//     remoteProducerId,
//     serverConsumerTransportId
//   )

//   ws.send(JSON.stringify({
//     type:    'consume-response',
//     payload: { params }
//   }))

//   console.log(`[consume] socketId=${socketId} consuming producerId=${remoteProducerId}`)
// }


//phase2:

import type { ServerWebSocket } from 'bun'
import type { WSData }          from '../index.js'
import * as mediasoup           from '../mediasoupClient.js'
import { getMediasoupUrl }      from '../getMedisoupUrl.js'

export const handleRecvConnect = async (
  ws: ServerWebSocket<WSData>,
  payload: { dtlsParameters: object; serverConsumerTransportId: string }
) => {
  const { dtlsParameters, serverConsumerTransportId } = payload
  const { socketId } = ws.data

  const url = await getMediasoupUrl(socketId)

  await mediasoup.connectConsumerTransport(dtlsParameters, serverConsumerTransportId, url)

  ws.send(JSON.stringify({
    type:    'transport-recv-connect-response',
    payload: { connected: true }
  }))

  console.log(`[recvConnect] consumerTransport=${serverConsumerTransportId} server=${url}`)
}

export const handleConsume = async (
  ws: ServerWebSocket<WSData>,
  payload: {
    rtpCapabilities:           object
    remoteProducerId:          string
    serverConsumerTransportId: string
  }
) => {
  const { rtpCapabilities, remoteProducerId, serverConsumerTransportId } = payload
  const { socketId } = ws.data

  const url = await getMediasoupUrl(socketId)

  const { params } = await mediasoup.createConsumer(
    socketId, rtpCapabilities, remoteProducerId, serverConsumerTransportId, url
  )

  ws.send(JSON.stringify({
    type:    'consume-response',
    payload: { params }
  }))

  console.log(`[consume] socketId=${socketId} producerId=${remoteProducerId} server=${url}`)
}