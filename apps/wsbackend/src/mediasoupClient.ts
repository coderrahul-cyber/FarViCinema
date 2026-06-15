// Phase-2

/**
 * src/mediasoupClient.ts
 *
 * Phase 2 change: one new function added — resolveMediasoupUrl()
 * Everything else is identical to phase 1.
 *
 * resolveMediasoupUrl() asks the Room Router which mediasoup server
 * should handle a given room. The result is used in joinRoom.ts
 * instead of the hardcoded MEDIASOUP_SERVER_URL.
 *
 * If ROOM_ROUTER_URL is not set, falls back to MEDIASOUP_SERVER_URL
 * so single-server deployments (Phase 1) keep working without any change.
 */

const DEFAULT_URL  = process.env.MEDIASOUP_SERVER_URL!
const ROUTER_URL   = process.env.ROOM_ROUTER_URL        // e.g. http://localhost:9000
const ROUTER_SECRET = process.env.ROUTER_SECRET || 'room_router_secret_here'

// ── Internal fetch helper ─────────────────────────────────────────────────────

const call = async <T>(
  method: 'GET' | 'POST' | 'DELETE',
  baseUrl: string,
  path: string,
  body?: object
): Promise<T> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    // @ts-ignore — Bun-specific option for self-signed certs
    tls: { rejectUnauthorized: false },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`[mediasoupClient] ${method} ${baseUrl}${path} → ${res.status}: ${err.error ?? err}`)
  }

  return res.json() as Promise<T>
}

// ── Phase 2: Room Router integration ─────────────────────────────────────────

/**
 * Ask the Room Router which mediasoup server should handle roomName.
 *
 * Returns the mediasoup server URL — either an existing assignment
 * (room affinity: all users in a room always hit the same server)
 * or a newly assigned server for a fresh room.
 *
 * Falls back to MEDIASOUP_SERVER_URL if Room Router is not configured.
 * This means phase 1 deployments need zero changes.
 */
export const resolveMediasoupUrl = async (roomName: string): Promise<string> => {
  // No Room Router configured — use hardcoded URL (phase 1 behaviour)
  if (!ROUTER_URL) {
    return DEFAULT_URL
  }

  try {
    const res = await fetch(`${ROUTER_URL}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Router-Secret': ROUTER_SECRET,
      },
      body: JSON.stringify({ roomName }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Room Router returned ${res.status}: ${err.error ?? 'unknown'}`)
    }

    const { mediasoupUrl, isNew } = await res.json()
    console.log(`[mediasoupClient] Room "${roomName}" → ${mediasoupUrl} (${isNew ? 'new assignment' : 'existing'})`)
    return mediasoupUrl

  } catch (err: any) {
    // If Room Router is down, fall back to default — keeps app running
    console.error(`[mediasoupClient] Room Router unreachable — falling back to default: ${err.message}`)
    return DEFAULT_URL
  }
}

// ── Mediasoup REST calls ──────────────────────────────────────────────────────
// These now accept an optional baseUrl parameter so joinRoom can pass the
// resolved URL. All other callers pass nothing and get DEFAULT_URL.

const ms = (baseUrl?: string) => baseUrl ?? DEFAULT_URL

export const createRoom = (roomName: string, socketId: string, baseUrl?: string) =>
  call<{ rtpCapabilities: object }>('POST', ms(baseUrl), '/room/create', { roomName, socketId })

export const createTransport = (socketId: string, consumer: boolean, baseUrl?: string) =>
  call<{ params: object }>('POST', ms(baseUrl), '/transport/create', { socketId, consumer })

export const connectTransport = (socketId: string, dtlsParameters: object, baseUrl?: string) =>
  call<{ connected: boolean }>('POST', ms(baseUrl), '/transport/connect', { socketId, dtlsParameters })

export const connectConsumerTransport = (
  dtlsParameters: object,
  serverConsumerTransportId: string,
  baseUrl?: string
) =>
  call<{ connected: boolean }>('POST', ms(baseUrl), '/consumer/connect', {
    dtlsParameters,
    serverConsumerTransportId,
  })

export const createProducer = (
  socketId: string,
  kind: string,
  rtpParameters: object,
  baseUrl?: string
) =>
  call<{
    producerId:     string
    producersExist: boolean
    otherSocketIds: string[]
  }>('POST', ms(baseUrl), '/producer/create', { socketId, kind, rtpParameters })

export const getProducers = (roomName: string, socketId: string, baseUrl?: string) =>
  call<{ producers: string[] }>('GET', ms(baseUrl), `/producers/${roomName}/${socketId}`)

export const createConsumer = (
  socketId: string,
  rtpCapabilities: object,
  remoteProducerId: string,
  serverConsumerTransportId: string,
  baseUrl?: string
) =>
  call<{ params: object }>('POST', ms(baseUrl), '/consumer/create', {
    socketId,
    rtpCapabilities,
    remoteProducerId,
    serverConsumerTransportId,
  })

export const resumeConsumer = (serverConsumerId: string, baseUrl?: string) =>
  call<{ resumed: boolean }>('POST', ms(baseUrl), '/consumer/resume', { serverConsumerId })

export const removePeer = (socketId: string, baseUrl?: string) =>
  call<{ removed: boolean }>('DELETE', ms(baseUrl), `/peer/${socketId}`)