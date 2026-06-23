import express    from 'express'
import https      from 'httpolyglot'
import fs         from 'fs'
import path       from 'path'
import 'dotenv/config'

import { createWorker, getWorker, createWebRtcTransport, mediaCodecs } from '../endpoints/worker.js'
import { emitProducerClosed } from './webhookEmitter.js'
import {
  getOrCreateRoom,
  getRouter,
  getRoomNameForPeer,
  addPeer,
  removePeer,
  addTransport,
  getProducerTransport,
  getTransportById,
  removeConsumerTransport,
  addProducer,
  getProducersInRoom,
  getOtherPeerSocketIds,
  addConsumer,
  getConsumerById,
  removeConsumer,
  getProducersForPeer,    // ← BUG FIX: was used in DELETE /peer but not imported
} from '../createWebRtcTransport/roomManger.js'

const __dirname = path.resolve()
const app       = express()
app.use(express.json())

// ─── HTTPS Setup ──────────────────────────────────────────────────────────────

const options = {
  key:  fs.readFileSync('./server/ssl/key.pem',  'utf-8'),
  cert: fs.readFileSync('./server/ssl/cert.pem', 'utf-8'),
}

const PORT = process.env.MEDIASOUP_PORT || 3000

const httpsServer = https.createServer(options, app)
httpsServer.listen(PORT, async () => {
  console.log(`[Server] mediasoup REST server listening on port ${PORT}`)
  await createWorker()
  console.log('[Server] mediasoup worker ready.')
})

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mediasoup-server' })
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/room/create', async (req, res) => {
  try {
    const { roomName, socketId } = req.body

    if (!roomName || !socketId) {
      return res.status(400).json({ error: 'roomName and socketId are required' })
    }

    const router = await getOrCreateRoom(roomName, socketId, getWorker(), mediaCodecs)
    addPeer(socketId, roomName)

    console.log(`[Server] Peer ${socketId} joined room ${roomName}`)
    return res.json({ rtpCapabilities: router.rtpCapabilities })

  } catch (err) {
    console.error('[/room/create]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/transport/create', async (req, res) => {
  try {
    const { socketId, consumer } = req.body

    if (!socketId) {
      return res.status(400).json({ error: 'socketId is required' })
    }

    const roomName = getRoomNameForPeer(socketId)
    if (!roomName) {
      return res.status(404).json({ error: `No peer found for socketId: ${socketId}` })
    }

    const router = getRouter(roomName)

    // ── PHASE 5 CHANGE: pass socketId → TURN credentials per session ─────
    const transport = await createWebRtcTransport(router, socketId)

    addTransport(socketId, roomName, transport, consumer)

    return res.json({
      params: {
        id:             transport.id,
        iceParameters:  transport.iceParameters,
        iceCandidates:  transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        iceServers:     transport.iceServers,   // ← TURN servers (may be [])
      }
    })

  } catch (err) {
    console.error('[/transport/create]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/transport/connect', async (req, res) => {
  try {
    const { socketId, dtlsParameters } = req.body

    if (!socketId || !dtlsParameters) {
      return res.status(400).json({ error: 'socketId and dtlsParameters are required' })
    }

    const transport = getProducerTransport(socketId)
    if (!transport) {
      return res.status(404).json({ error: `No producer transport for ${socketId}` })
    }

    await transport.connect({ dtlsParameters })
    console.log(`[Server] Producer transport connected for ${socketId}`)
    return res.json({ connected: true })

  } catch (err) {
    console.error('[/transport/connect]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/producer/create', async (req, res) => {
  try {
    const { socketId, kind, rtpParameters } = req.body

    if (!socketId || !kind || !rtpParameters) {
      return res.status(400).json({ error: 'socketId, kind, rtpParameters are required' })
    }

    const transport = getProducerTransport(socketId)
    if (!transport) {
      return res.status(404).json({ error: `No producer transport for ${socketId}` })
    }

    const producer  = await transport.produce({ kind, rtpParameters })
    const roomName  = getRoomNameForPeer(socketId)
    addProducer(socketId, roomName, producer)

    producer.on('transportclose', () => {
      const pRoomName = getRoomNameForPeer(socketId)
      if (pRoomName) emitProducerClosed(producer.id, pRoomName)
      producer.close()
    })

    const otherSocketIds = getOtherPeerSocketIds(roomName, socketId)
    console.log(`[Server] Producer created. ID: ${producer.id} Kind: ${producer.kind}`)

    return res.json({
      producerId:     producer.id,
      producersExist: otherSocketIds.length > 0,
      otherSocketIds,
    })

  } catch (err) {
    console.error('[/producer/create]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.get('/producers/:roomName/:socketId', (req, res) => {
  try {
    const { roomName, socketId } = req.params
    const producerList = getProducersInRoom(roomName, socketId)
    return res.json({ producers: producerList })
  } catch (err) {
    console.error('[/producers]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/consumer/connect', async (req, res) => {
  try {
    const { dtlsParameters, serverConsumerTransportId } = req.body

    if (!dtlsParameters || !serverConsumerTransportId) {
      return res.status(400).json({ error: 'dtlsParameters and serverConsumerTransportId are required' })
    }

    const consumerTransport = getTransportById(serverConsumerTransportId)
    if (!consumerTransport) {
      return res.status(404).json({ error: `No consumer transport: ${serverConsumerTransportId}` })
    }

    await consumerTransport.connect({ dtlsParameters })
    console.log(`[Server] Consumer transport ${serverConsumerTransportId} connected.`)
    return res.json({ connected: true })

  } catch (err) {
    console.error('[/consumer/connect]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/consumer/create', async (req, res) => {
  try {
    const { socketId, rtpCapabilities, remoteProducerId, serverConsumerTransportId } = req.body

    if (!socketId || !rtpCapabilities || !remoteProducerId || !serverConsumerTransportId) {
      return res.status(400).json({ error: 'socketId, rtpCapabilities, remoteProducerId, serverConsumerTransportId are required' })
    }

    const roomName          = getRoomNameForPeer(socketId)
    const router            = getRouter(roomName)
    const consumerTransport = getTransportById(serverConsumerTransportId)

    if (!consumerTransport) {
      return res.status(404).json({ error: `No consumer transport: ${serverConsumerTransportId}` })
    }

    if (!router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
      return res.status(400).json({ error: 'Router cannot consume this producer' })
    }

    const consumer = await consumerTransport.consume({
      producerId:     remoteProducerId,
      rtpCapabilities,
      paused:         true,
    })

    consumer.on('transportclose', () => {
      console.log(`[Server] Consumer ${consumer.id} — transport closed.`)
    })

    consumer.on('producerclose', () => {
      console.log(`[Server] Consumer ${consumer.id} — producer closed.`)
      emitProducerClosed(remoteProducerId, roomName)
      consumerTransport.close()
      removeConsumerTransport(serverConsumerTransportId)
      consumer.close()
      removeConsumer(consumer.id)
    })

    addConsumer(socketId, roomName, consumer)
    console.log(`[Server] Consumer created. ID: ${consumer.id}`)

    return res.json({
      params: {
        id:               consumer.id,
        producerId:       remoteProducerId,
        kind:             consumer.kind,
        rtpParameters:    consumer.rtpParameters,
        serverConsumerId: consumer.id,
      }
    })

  } catch (err) {
    console.error('[/consumer/create]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.post('/consumer/resume', async (req, res) => {
  try {
    const { serverConsumerId } = req.body

    if (!serverConsumerId) {
      return res.status(400).json({ error: 'serverConsumerId is required' })
    }

    const consumer = getConsumerById(serverConsumerId)
    if (!consumer) {
      return res.status(404).json({ error: `No consumer: ${serverConsumerId}` })
    }

    await consumer.resume()
    console.log(`[Server] Consumer ${serverConsumerId} resumed.`)
    return res.json({ resumed: true })

  } catch (err) {
    console.error('[/consumer/resume]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.delete('/peer/:socketId', (req, res) => {
  try {
    const { socketId } = req.params

    if (!socketId) {
      return res.status(400).json({ error: 'socketId is required' })
    }

    const peerProducers = getProducersForPeer(socketId)   // ← now properly imported
    const roomName      = getRoomNameForPeer(socketId)

    removePeer(socketId)
    console.log(`[Server] Peer ${socketId} cleaned up. Had ${peerProducers.length} producers.`)

    if (roomName) {
      peerProducers.forEach(producerId => {
        emitProducerClosed(producerId, roomName)
      })
    }

    return res.json({ removed: true, producersClosed: peerProducers.length })

  } catch (err) {
    console.error('[/peer/:socketId]', err)
    return res.status(500).json({ error: err.message })
  }
})