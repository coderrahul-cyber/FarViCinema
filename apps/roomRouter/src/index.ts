/**
 *
 * Lightweight Express service (~100 lines).
 * Answers ONE question: which mediasoup server owns this room?
 *
 * Endpoints:
 *   GET  /health                  → health check
 *   POST /assign                  → get or create room assignment
 *   POST /release                 → mark room as empty (frees capacity)
 *   GET  /status                  → show all servers + their room counts
 *
 * Called by:
 *   ws-server → on every joinRoom event
 *
 * Security:
 *   All routes (except /health) require X-Router-Secret header
 *   matching ROUTER_SECRET in .env
 */

import express, { type NextFunction , type Response , type Request }    from 'express'
import 'dotenv/config'

import { connectRedis, redis, K } from './redis.js'
import {
  servers,
  startHealthChecks,
  pickServer,
  assignRoom,
  releaseRoom,
  getServerForRoom,
} from './serverPool.js'

const app    = express()
const PORT   = Number(process.env.PORT) || 9000
const SECRET = process.env.ROUTER_SECRET || 'room_router_secret_here'

app.use(express.json())

// ── Auth middleware ────────────────────────────────────────────────────────────

const requireSecret = (req : Request, res : Response, next : NextFunction) => {
  const header = req.headers['x-router-secret']
  if (header !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized — wrong X-Router-Secret' })
  }
  next()
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Public — no auth needed.
 * Returns service status + number of registered servers.
 */
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'room-router',
    servers: servers.length,
  })
})

/**
 * POST /assign
 * Protected.
 * Body: { roomName: string }
 *
 * Returns: { mediasoupUrl: string, isNew: boolean }
 *
 * Logic:
 *   1. If room already has a server assigned → return it (room affinity)
 *   2. If room is new → pick least-loaded healthy server, assign it
 */
app.post('/assign', requireSecret, async (req, res) => {
  const { roomName } = req.body

  if (!roomName || typeof roomName !== 'string') {
    return res.status(400).json({ error: 'roomName is required' })
  }

  try {
    // Check if already assigned (room affinity — existing users must hit same server)
    const existing = await getServerForRoom(roomName)

    if (existing) {
      console.log(`[Router] Room "${roomName}" already on ${existing}`)
      return res.json({ mediasoupUrl: existing, isNew: false })
    }

    // New room — pick the best available server
    const serverUrl = await pickServer()

    if (!serverUrl) {
      console.error('[Router] No healthy mediasoup servers available')
      return res.status(503).json({ error: 'No mediasoup servers available — try again shortly' })
    }

    // Assign and persist to Redis
    await assignRoom(roomName, serverUrl)

    return res.json({ mediasoupUrl: serverUrl, isNew: true })

  } catch (err) {
    console.error('[Router] /assign error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
})

/**
 * POST /release
 * Protected.
 * Body: { roomName: string }
 *
 * Call this when a room becomes empty (last peer left).
 * Frees the capacity slot on the assigned mediasoup server.
 */
app.post('/release', requireSecret, async (req, res) => {
  const { roomName } = req.body

  if (!roomName) {
    return res.status(400).json({ error: 'roomName is required' })
  }

  try {
    await releaseRoom(roomName)
    return res.json({ released: true })
  } catch (err) {
    console.error('[Router] /release error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
})

/**
 * GET /status
 * Protected.
 * Shows each server's current room count and health.
 * Useful for monitoring.
 */
app.get('/status', requireSecret, async (req, res) => {
  try {
    const status = await Promise.all(
      servers.map(async (server) => {
        const health    = await redis.get(K.serverHealth(server.url))   || 'unknown'
        const roomCount = await redis.scard(K.serverRooms(server.url))
        const rooms     = await redis.smembers(K.serverRooms(server.url))

        return {
          url:      server.url,
          maxRooms: server.maxRooms,
          health,
          roomCount,
          rooms,
          capacity: `${roomCount}/${server.maxRooms}`,
        }
      })
    )

    return res.json({ servers: status })

  } catch (err) {
    console.error('[Router] /status error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────

const start = async () => {
  await connectRedis()
  startHealthChecks()

  app.listen(PORT, () => {
    console.log(`[Room Router] Listening on port ${PORT}`)
    console.log(`[Room Router] Managing ${servers.length} mediasoup server(s)`)
  })
}

start()