/**
 * src/serverPool.js  —  room-router
 *
 * Health check fix: replaced undici Agent (not in package.json, causes
 * MODULE_NOT_FOUND) with Node's built-in https.request wrapped in a Promise.
 * Zero extra dependencies. Works on Node 16+.
 */
import { redis, K, ROOM_TTL } from './redis.js'
import https from 'https'

// Reusable agent — rejectUnauthorized:false accepts self-signed certs (mediasoup dev)
const insecureAgent = new https.Agent({ rejectUnauthorized: false })

// ── Server list ───────────────────────────────────────────────────────────────

const parseServers = () => {
  const raw = process.env.MEDIASOUP_SERVERS || 'https://localhost:3000:50'
  return raw.split(',').map(entry => {
    const parts    = entry.trim().split(':')
    const maxRooms = Number(parts[parts.length - 1])
    const url      = parts.slice(0, -1).join(':')
    return { url, maxRooms: isNaN(maxRooms) ? 50 : maxRooms }
  })
}

export const servers = parseServers()
console.log(`[ServerPool] Managing ${servers.length} mediasoup server(s)`)
servers.forEach(s => console.log(`  → ${s.url} (max ${s.maxRooms} rooms)`))

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * Hits /health on the mediasoup server using Node's https module directly.
 * This bypasses the self-signed cert error that fetch() throws without a
 * custom agent — and avoids the undici dependency entirely.
 */
const httpGet = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { agent: insecureAgent, timeout: 3000 }, (res) => {
    res.resume()   // drain the response body so the socket closes cleanly
    resolve(res.statusCode)
  })
  req.on('error',   reject)
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
})

const checkHealth = async (serverUrl) => {
  try {
    const status = await httpGet(`${serverUrl}/health`)
    if (status >= 200 && status < 300) {
      await redis.set(K.serverHealth(serverUrl), 'ok', 'EX', 30)
      return true
    }
    console.warn(`[ServerPool] Health check got HTTP ${status} from ${serverUrl}`)
  } catch (err) {
    console.warn(`[ServerPool] Health check failed for ${serverUrl}: ${err.message}`)
  }

  await redis.set(K.serverHealth(serverUrl), 'down', 'EX', 30)
  console.warn(`[ServerPool] Server marked unhealthy: ${serverUrl}`)
  return false
}

export const startHealthChecks = () => {
  const run = async () => {
    for (const server of servers) {
      await checkHealth(server.url)
    }
  }
  run()
  setInterval(run, 15_000)
  console.log('[ServerPool] Health checks started (every 15s)')
}

// ── Server selection ──────────────────────────────────────────────────────────

export const pickServer = async () => {
  let bestUrl   = null
  let bestCount = Infinity

  for (const server of servers) {
    const health = await redis.get(K.serverHealth(server.url))
    if (health === 'down') continue

    const roomCount = await redis.scard(K.serverRooms(server.url))
    if (roomCount >= server.maxRooms) continue

    if (roomCount < bestCount) {
      bestCount = roomCount
      bestUrl   = server.url
    }
  }

  return bestUrl
}

// ── Assignment ────────────────────────────────────────────────────────────────

export const assignRoom = async (roomName, serverUrl) => {
  await redis.set(K.roomServer(roomName), serverUrl, 'EX', ROOM_TTL)
  await redis.sadd(K.serverRooms(serverUrl), roomName)
  console.log(`[ServerPool] Assigned room "${roomName}" → ${serverUrl}`)
}

export const releaseRoom = async (roomName) => {
  const serverUrl = await redis.get(K.roomServer(roomName))
  if (serverUrl) await redis.srem(K.serverRooms(serverUrl), roomName)
  await redis.del(K.roomServer(roomName))
  console.log(`[ServerPool] Released room "${roomName}" from ${serverUrl}`)
}

export const getServerForRoom = async (roomName) => {
  return await redis.get(K.roomServer(roomName))
}