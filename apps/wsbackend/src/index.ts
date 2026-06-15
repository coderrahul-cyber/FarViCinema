// /**
//  * index.ts  —  ws-server
//  *
//  * Bun WebSocket + HTTP server.
//  *
//  * HTTP routes:
//  *   GET  /health                    → health check
//  *   POST /webhook/producer-closed   → called by mediasoup-server when a producer closes
//  *
//  * WebSocket:
//  *   wss://localhost:8080?token=<JWT>
//  *   All signaling messages are JSON: { type: string, payload: object }
//  *
//  * Message types handled:
//  *   joinRoom               → join/create mediasoup room
//  *   createWebRtcTransport  → create send or recv transport
//  *   transport-connect      → DTLS for send transport
//  *   transport-produce      → start producing media
//  *   getProducers           → list existing producers in room
//  *   transport-recv-connect → DTLS for recv transport
//  *   consume                → subscribe to a remote producer
//  *   consumer-resume        → unpause a consumer
//  */

// import { verifyToken }           from './auth.js'
// import { registerSocket,
//          unregisterSocket }      from './socketR.js'
// import { handleJoinRoom }        from './handler/joinRoom.js'
// import { handleCreateTransport } from './handler/createTransport.js'
// import { handleTransportConnect }from './handler/transportConnect.js'
// import { handleProduce }         from './handler/produce.js'
// import { handleGetProducers }    from './handler/getProducers.js'
// import { handleRecvConnect,
//          handleConsume }         from './handler/consume.js'
// import { handleConsumerResume }  from './handler/consumeResume.js'
// import { handleProducerClosed }  from './webhookHandler.js'
// import * as mediasoup            from './mediasoupClient.js'

// const PORT = Number(process.env.WS_PORT) || 8080

// // ─── WSData type — attached to every WebSocket connection ─────────────────────

// export interface WSData {
//   socketId: string
//   user: {
//     id:   string
//     name: string
//   }
// }

// // ─── Server ───────────────────────────────────────────────────────────────────

// Bun.serve<WSData>({
//   port: PORT,

//   // ── HTTP handler (upgrade + webhooks) ──────────────────────────────────────
//   async fetch(req, server) {
//     const url = new URL(req.url)

//     // Health check
//     if (req.method === 'GET' && url.pathname === '/health') {
//       return new Response(JSON.stringify({ status: 'ok', service: 'ws-server' }), {
//         headers: { 'Content-Type': 'application/json' }
//       })
//     }

//     // Webhook: mediasoup → WS server (producer closed)
//     if (req.method === 'POST' && url.pathname === '/webhook/producer-closed') {
//       const body = await req.json()
//       return handleProducerClosed(body)
//     }

//     // WebSocket upgrade
//     if (req.method === 'GET' && url.pathname === '/') {
//       const token = url.searchParams.get('token')

//       if (!token) {
//         return new Response('Missing token', { status: 401 })
//       }

//       const user = verifyToken(token)
//       if (!user) {
//         return new Response('Invalid or expired token', { status: 401 })
//       }

//       const socketId = crypto.randomUUID()

//       // Pass user + socketId into ws.data so every handler can access it
//       const upgraded = server.upgrade(req, {
//         data: { socketId, user } satisfies WSData
//       })

//       if (upgraded) return undefined  // Bun handles the response

//       return new Response('WebSocket upgrade failed', { status: 500 })
//     }

//     return new Response('Not found', { status: 404 })
//   },

//   // ── WebSocket handlers ────────────────────────────────────────────────────
//   websocket: {

//     open(ws) {
//       registerSocket(ws.data.socketId, ws)

//       // Tell the client their assigned socketId
//       ws.send(JSON.stringify({
//         type:    'connection-success',
//         payload: { socketId: ws.data.socketId }
//       }))

//       console.log(`[WS] Client connected: socketId=${ws.data.socketId} user=${ws.data.user.name}`)
//     },

//     async message(ws, raw) {
//       let parsed: { type: string; payload: any }

//       try {
//         parsed = JSON.parse(raw as string)
//       } catch {
//         ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }))
//         return
//       }

//       const { type, payload } = parsed

//       try {
//         switch (type) {
//           case 'joinRoom':
//             await handleJoinRoom(ws, payload)
//             break

//           case 'createWebRtcTransport':
//             await handleCreateTransport(ws, payload)
//             break

//           case 'transport-connect':
//             await handleTransportConnect(ws, payload)
//             break

//           case 'transport-produce':
//             await handleProduce(ws, payload)
//             break

//           case 'getProducers':
//             await handleGetProducers(ws, payload)
//             break

//           case 'transport-recv-connect':
//             await handleRecvConnect(ws, payload)
//             break

//           case 'consume':
//             await handleConsume(ws, payload)
//             break

//           case 'consumer-resume':
//             await handleConsumerResume(ws, payload)
//             break

//           default:
//             ws.send(JSON.stringify({
//               type:    'error',
//               payload: { message: `Unknown message type: ${type}` }
//             }))
//         }
//       } catch (err: any) {
//         console.error(`[WS] Error handling '${type}':`, err)
//         ws.send(JSON.stringify({
//           type:    'error',
//           payload: { message: err.message ?? 'Internal server error' }
//         }))
//       }
//     },

//     async close(ws) {
//       const { socketId, user } = ws.data
//       console.log(`[WS] Client disconnected: socketId=${socketId} user=${user.name}`)

//       // Clean up mediasoup state
//       try {
//         await mediasoup.removePeer(socketId)
//       } catch (err) {
//         console.error(`[WS] Failed to remove peer ${socketId} from mediasoup:`, err)
//       }

//       // Clean up local registry
//       unregisterSocket(socketId)
//     },
//   },
// })

// console.log(`[WS Server] Listening on port ${PORT}`)



// Pub And Sub

/**
 * index.ts  —  ws-server
 *
 * Changes from original (3 things only):
 *   1. Import connectRedis and call it before server starts
 *   2. registerSocket is now async — await it in open()
 *   3. unregisterSocket is now async — await it in close()
 *
 * Everything else is identical to the original.
 */

// import { verifyToken }            from './auth.js'
// import { connectRedis }           from './redis.js'
// import { registerSocket,
//          unregisterSocket }       from './socketR.js'
// import { handleJoinRoom }         from './handler/joinRoom.js'
// import { handleCreateTransport }  from './handler/createTransport.js'
// import { handleTransportConnect } from './handler/transportConnect.js'
// import { handleProduce }          from './handler/produce.js'
// import { handleGetProducers }     from './handler/getProducers.js'
// import { handleRecvConnect,
//          handleConsume }          from './handler/consume.js'
// import { handleConsumerResume }   from './handler/consumeResume.js'
// import { handleProducerClosed }   from './webhookHandler.js'
// import * as mediasoup             from './mediasoupClient.js'

// const PORT = Number(process.env.WS_PORT) || 8080

// export interface WSData {
//   socketId: string
//   user: { id: string; name: string }
// }

// // ── CHANGE 1: Connect to Redis before accepting any connections ───────────────
// await connectRedis()

// // ─── Server ───────────────────────────────────────────────────────────────────

// Bun.serve<WSData>({
//   port: PORT,

//   async fetch(req, server) {
//     const url = new URL(req.url)

//     if (req.method === 'GET' && url.pathname === '/health') {
//       return new Response(JSON.stringify({ status: 'ok', service: 'ws-server' }), {
//         headers: { 'Content-Type': 'application/json' }
//       })
//     }

//     if (req.method === 'POST' && url.pathname === '/webhook/producer-closed') {
//       const body = await req.json()
//       return handleProducerClosed(body)
//     }

//     if (req.method === 'GET' && url.pathname === '/') {
//       const token = url.searchParams.get('token')
//       if (!token) return new Response('Missing token', { status: 401 })

//       const user = verifyToken(token)
//       if (!user)  return new Response('Invalid or expired token', { status: 401 })

//       const socketId = crypto.randomUUID()
//       const upgraded = server.upgrade(req, { data: { socketId, user } satisfies WSData })
//       if (upgraded) return undefined
//       return new Response('WebSocket upgrade failed', { status: 500 })
//     }

//     return new Response('Not found', { status: 404 })
//   },

//   websocket: {

//     async open(ws) {
//       // CHANGE 2: registerSocket is now async
//       await registerSocket(ws.data.socketId, ws)

//       ws.send(JSON.stringify({
//         type:    'connection-success',
//         payload: { socketId: ws.data.socketId }
//       }))

//       console.log(`[WS] Connected: socketId=${ws.data.socketId} user=${ws.data.user.name}`)
//     },

//     async message(ws, raw) {
//       let parsed: { type: string; payload: any }
//       try {
//         parsed = JSON.parse(raw as string)
//       } catch {
//         ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }))
//         return
//       }

//       const { type, payload } = parsed

//       try {
//         switch (type) {
//           case 'joinRoom':              await handleJoinRoom(ws, payload);          break
//           case 'createWebRtcTransport': await handleCreateTransport(ws, payload);   break
//           case 'transport-connect':     await handleTransportConnect(ws, payload);  break
//           case 'transport-produce':     await handleProduce(ws, payload);           break
//           case 'getProducers':          await handleGetProducers(ws, payload);      break
//           case 'transport-recv-connect':await handleRecvConnect(ws, payload);       break
//           case 'consume':               await handleConsume(ws, payload);           break
//           case 'consumer-resume':       await handleConsumerResume(ws, payload);    break
//           default:
//             ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown type: ${type}` } }))
//         }
//       } catch (err: any) {
//         console.error(`[WS] Error handling '${type}':`, err)
//         ws.send(JSON.stringify({ type: 'error', payload: { message: err.message ?? 'Internal error' } }))
//       }
//     },

//     async close(ws) {
//       const { socketId, user } = ws.data
//       console.log(`[WS] Disconnected: socketId=${socketId} user=${user.name}`)

//       try {
//         await mediasoup.removePeer(socketId)
//       } catch (err) {
//         console.error(`[WS] Failed to remove peer ${socketId}:`, err)
//       }

//       // CHANGE 3: unregisterSocket is now async
//       await unregisterSocket(socketId)
//     },
//   },
// })

// console.log(`[WS Server] Listening on port ${PORT}`)



//Phase2:
/**
 * index.ts  —  ws-server (phase 2)
 *
 * One change from phase 1:
 *   close() reads the mediasoup URL before unregistering (to call correct server)
 *   then cleans up the socket:mediasoup:{socketId} key from Redis.
 *
 * Everything else identical to phase 1.
 */

import { verifyToken }            from './auth.js'
import { connectRedis, pub }      from './redis.js'
import { registerSocket,
         unregisterSocket }       from './socketR.js'
import { handleJoinRoom }         from './handler/joinRoom.js'
import { handleCreateTransport }  from './handler/createTransport.js'
import { handleTransportConnect } from './handler/transportConnect.js'
import { handleProduce }          from './handler/produce.js'
import { handleGetProducers }     from './handler/getProducers.js'
import { handleRecvConnect,
         handleConsume }          from './handler/consume.js'
import { handleConsumerResume }   from './handler/consumeResume.js'
import { handleProducerClosed }   from './webhookHandler.js'
import * as mediasoup             from './mediasoupClient.js'
import { getMediasoupUrl }        from './getMedisoupUrl.js'

const PORT = Number(process.env.WS_PORT) || 8080

export interface WSData {
  socketId: string
  user: { id: string; name: string }
}

await connectRedis()

Bun.serve<WSData>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'ws-server' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'POST' && url.pathname === '/webhook/producer-closed') {
      const body = await req.json()
      return handleProducerClosed(body)
    }

    if (req.method === 'GET' && url.pathname === '/' ) {
      const token = url.searchParams.get('token')
      if (!token) return new Response('Missing token', { status: 401 })

      const user = verifyToken(token)
      if (!user)  return new Response('Invalid or expired token', { status: 401 })

      const socketId = crypto.randomUUID()
      const upgraded = server.upgrade(req, { data: { socketId, user } satisfies WSData })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }

    if (req.method === 'GET' && url.pathname === '/ws' ) {
      const token = url.searchParams.get('token')
      if (!token) return new Response('Missing token', { status: 401 })

      const user = verifyToken(token)
      if (!user)  return new Response('Invalid or expired token', { status: 401 })

      const socketId = crypto.randomUUID()
      const upgraded = server.upgrade(req, { data: { socketId, user } satisfies WSData })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }

    return new Response('Not found', { status: 404 })
  },

  websocket: {
    async open(ws) {
      await registerSocket(ws.data.socketId, ws)
      ws.send(JSON.stringify({
        type:    'connection-success',
        payload: { socketId: ws.data.socketId }
      }))
      console.log(`[WS] Connected: ${ws.data.socketId} (${ws.data.user.name})`)
    },

    async message(ws, raw) {
      let parsed: { type: string; payload: any }
      try {
        parsed = JSON.parse(raw as string)
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }))
        return
      }
      const { type, payload } = parsed
      try {
        switch (type) {
          case 'joinRoom':               await handleJoinRoom(ws, payload);          break
          case 'createWebRtcTransport':  await handleCreateTransport(ws, payload);   break
          case 'transport-connect':      await handleTransportConnect(ws, payload);  break
          case 'transport-produce':      await handleProduce(ws, payload);           break
          case 'getProducers':           await handleGetProducers(ws, payload);      break
          case 'transport-recv-connect': await handleRecvConnect(ws, payload);       break
          case 'consume':                await handleConsume(ws, payload);           break
          case 'consumer-resume':        await handleConsumerResume(ws, payload);    break
          default:
            ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown: ${type}` } }))
        }
      } catch (err: any) {
        console.error(`[WS] Error in '${type}':`, err)
        ws.send(JSON.stringify({ type: 'error', payload: { message: err.message ?? 'Internal error' } }))
      }
    },

     async close(ws) {
      const { socketId, user } = ws.data
      console.log(`[DEBUG-Close] ▶ peer disconnected: ${socketId} (${user.name})`)

      try {
        const msUrl = await getMediasoupUrl(socketId)
        console.log(`[DEBUG-Close]   calling mediasoup.removePeer at ${msUrl}`)
        const result = await mediasoup.removePeer(socketId, msUrl)
        console.log(`[DEBUG-Close]   mediasoup.removePeer result:`, result)
        console.log(`[DEBUG-Close]   ✓ webhook should now fire from mediasoup`)
      } catch (err: any) {
        console.error(`[DEBUG-Close] ✗ removePeer FAILED for ${socketId}:`, err.message)
        console.error(`[DEBUG-Close]   This means mediasoup never received DELETE /peer`)
        console.error(`[DEBUG-Close]   → webhook will NOT fire → tile will NOT disappear`)
      }

      await pub.send('DEL', [`socket:mediasoup:${socketId}`])
      await unregisterSocket(socketId)
      console.log(`[DEBUG-Close]   ✓ unregisterSocket done for ${socketId}`)
    },
  },
})

console.log(`[WS Server] Listening on port ${PORT}`)