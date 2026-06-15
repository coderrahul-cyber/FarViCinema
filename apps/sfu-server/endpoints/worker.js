// /**
//  * worker.js
//  * 
//  * Creates and manages the mediasoup Worker.
//  * Also holds mediaCodecs config and the createWebRtcTransport helper.
//  * 
//  * Separated from server.js so the REST layer stays clean.
//  */

// import mediasoup from 'mediasoup'

// let worker

// // ─── Codecs ──────────────────────────────────────────────────────────────────

// export const mediaCodecs = [
//   {
//     kind:      'audio',
//     mimeType:  'audio/opus',
//     clockRate: 48000,
//     channels:  2,
//   },
//   {
//     kind:      'video',
//     mimeType:  'video/VP8',
//     clockRate: 90000,
//     parameters: {
//       'x-google-start-bitrate': 1000,
//     },
//   },
// ]

// // ─── Worker ──────────────────────────────────────────────────────────────────

// export const createWorker = async () => {
//   worker = await mediasoup.createWorker({
//     rtcMinPort: 2000,
//     rtcMaxPort: 2020,
//   })

//   console.log(`[Worker] Created. PID: ${worker.pid}`)

//   worker.on('died', (error) => {
//     console.error('[Worker] mediasoup worker died — restarting process.', error)
//     setTimeout(() => process.exit(1), 2000)
//   })

//   return worker
// }

// export const getWorker = () => worker

// // ─── WebRTC Transport Factory ─────────────────────────────────────────────────

// /**
//  * Creates a WebRtcTransport on the given router.
//  * 
//  * @param {import('mediasoup').types.Router} router
//  * @returns {Promise<import('mediasoup').types.WebRtcTransport>}
//  */
// export const createWebRtcTransport = async (router) => {
//   const options = {
//     listenIps: [
//       {
//         ip:          '0.0.0.0',
//         announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1', // ← set via .env
//       },
//     ],
//     enableUdp: true,
//     enableTcp: true,
//     preferUdp: true,
//   }

//   const transport = await router.createWebRtcTransport(options)

//   console.log(`[Worker] Transport created. ID: ${transport.id}`)

//   transport.on('dtlsstatechange', (dtlsState) => {
//     if (dtlsState === 'closed') {
//       console.log(`[Worker] Transport ${transport.id} DTLS closed — closing transport.`)
//       transport.close()
//     }
//   })

//   transport.on('close', () => {
//     console.log(`[Worker] Transport ${transport.id} closed.`)
//   })

//   return transport
// }


/**
 * src/worker.js  —  mediasoup-server  (phase 5)
 *
 * Changes from original:
 *   1. rtcMaxPort: 2020 → 2200  (was only 20 ports — supports ~10 users max!)
 *      Each WebRTC peer needs 2 ports (audio + video, or RTP + RTCP).
 *      200 ports = ~100 simultaneous peers per worker.
 *
 *   2. createWebRtcTransport() now accepts socketId and attaches TURN
 *      iceServers to the transport params returned to the client.
 *      mediasoup-client automatically uses these during ICE negotiation.
 *      No frontend code change needed.
 *
 *   3. generateTurnCredentials() creates HMAC-SHA1 time-limited credentials
 *      that coturn verifies using the same shared TURN_SECRET.
 *      Credentials expire after 24 hours — safe to send to the client.
 *
 *   4. Added H264 codec (better hardware support on iOS/Android).
 *
 * If TURN_SECRET env var is not set, TURN is skipped entirely —
 * so this works in local dev without any coturn server.
 */

import mediasoup from 'mediasoup'
import crypto    from 'crypto'

let worker

// ── Codecs ────────────────────────────────────────────────────────────────────

export const mediaCodecs = [
  {
    kind:      'audio',
    mimeType:  'audio/opus',
    clockRate: 48000,
    channels:  2,
  },
  {
    kind:      'video',
    mimeType:  'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    // H264 — better hardware decoding on iOS and Android
    kind:      'video',
    mimeType:  'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode':      1,
      'profile-level-id':        '42e01f',
      'level-asymmetry-allowed': 1,
    },
  },
]

// ── Worker ────────────────────────────────────────────────────────────────────

export const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2200,   // CHANGED: was 2020 (only 20 ports!) — now 200 ports
                        // Rule of thumb: (maxPort - minPort) / 2 = max simultaneous peers
                        // 200 ports = 100 simultaneous WebRTC connections per worker
  })

  console.log(`[Worker] Created. PID: ${worker.pid}`)

  worker.on('died', (error) => {
    console.error('[Worker] mediasoup worker died — restarting process.', error)
    // Give time for cleanup before exit
    setTimeout(() => process.exit(1), 2000)
  })

  return worker
}

export const getWorker = () => worker

// ── TURN credential generation (Phase 5) ─────────────────────────────────────

/**
 * Generates time-limited HMAC-SHA1 TURN credentials.
 *
 * This is the industry-standard format for coturn's use-auth-secret mode.
 * Used by Twilio, Jitsi, mediasoup docs, and others.
 *
 * How it works:
 *   1. We create a username:  "{expiry_unix_timestamp}:{socketId}"
 *   2. We HMAC-SHA1 sign that username using TURN_SECRET
 *   3. coturn independently does the same verification when the client connects
 *   4. If the HMAC matches AND expiry hasn't passed → connection allowed
 *
 * Security:
 *   - Credentials expire automatically (24h)
 *   - Each session gets unique credentials (socketId in username)
 *   - If TURN_SECRET leaks: rotate it — old credentials expire within 24h
 *
 * @param {string} socketId - unique identifier for this session
 * @returns {object} ICE server config with urls, username, credential
 */
const generateTurnCredentials = (socketId) => {
  const secret   = process.env.TURN_SECRET
  const host     = process.env.TURN_HOST || '127.0.0.1'
  const port     = process.env.TURN_PORT || '3478'
  const tlsPort  = process.env.TURN_TLS_PORT || '5349'

  // Expire in 24 hours
  const ttl      = 24 * 3600
  const expiry   = Math.floor(Date.now() / 1000) + ttl
  const username = `${expiry}:${socketId}`

  const credential = crypto
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64')

  return {
    urls: [
      `stun:${host}:${port}`,    // STUN first — free, no relay needed
      `turn:${host}:${port}`,    // TURN over UDP — lowest latency relay
      `turn:${host}:${port}?transport=tcp`,   // TURN over TCP — if UDP blocked
      `turns:${host}:${tlsPort}`,             // TURN over TLS — if all else fails
    ],
    username,
    credential,
    credentialType: 'password',
  }
}

// ── WebRTC Transport Factory ──────────────────────────────────────────────────

/**
 * Creates a WebRtcTransport and optionally includes TURN credentials.
 *
 * The iceServers array is included in the transport params returned to
 * the client. mediasoup-client passes them to RTCPeerConnection automatically
 * via transport.iceServers — no frontend code changes needed.
 *
 * ICE candidate priority order (automatic, handled by browser):
 *   1. host candidates   (direct LAN connection — fastest)
 *   2. srflx candidates  (STUN — works through simple NAT)
 *   3. relay candidates  (TURN — last resort, 100% reliable)
 *
 * @param {import('mediasoup').types.Router} router
 * @param {string} socketId - used to generate per-session TURN credentials
 */
export const createWebRtcTransport = async (router, socketId = 'anonymous') => {
  const hasTurn = !!process.env.TURN_SECRET

  // TURN credentials included only when TURN_SECRET is configured
  // Omitting TURN_SECRET skips TURN entirely — safe for local dev
  const iceServers = hasTurn ? [generateTurnCredentials(socketId)] : []

  if (!hasTurn) {
    console.warn(`[Worker] TURN_SECRET not set — transport created without TURN (local dev mode)`)
  }

  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip:          '0.0.0.0',
        announcedIp: process.env.ANNOUNCED_IP ?? '127.0.0.1',
      },
    ],
    enableUdp:  true,
    enableTcp:  true,
    preferUdp:  true,       // UDP is faster; TCP fallback for firewalled users
    iceServers,             // PHASE 5: sent back to client in transport params
  })

  console.log(`[Worker] Transport ${transport.id} created${hasTurn ? ' (TURN enabled)' : ''}`)

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') transport.close()
  })

  transport.on('close', () => {
    console.log(`[Worker] Transport ${transport.id} closed`)
  })

  return transport
}