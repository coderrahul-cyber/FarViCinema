// // /**
// //  * hooks/useMediasoup.ts
// //  *
// //  * Core hook that manages:
// //  *  - WebSocket connection (via WSClient)
// //  *  - mediasoup-client Device
// //  *  - Send/Recv transports
// //  *  - Producing local audio+video
// //  *  - Consuming remote producers
// //  *  - Participant state (for UI)
// //  */

// /**
//  * hooks/useMediasoup.ts
//  *
//  * Fixed issues:
//  * 1. Remote participants keyed by producerId (not socketId) — each producer
//  *    track gets its own tile. Audio + video producers from same peer are
//  *    merged into one participant via a producerId→participantId map.
//  * 2. consumeProducer uses refs not stale closure state
//  * 3. recv transport connect uses send() not request() — server sends no response
//  * 4. Both audio+video tracks from same peer share one MediaStream
//  */

// 'use client'

// import { useCallback, useRef, useState } from 'react'
// import { Device }   from 'mediasoup-client'
// import { WSClient } from '../libs/wsClient'
// import type { Participant, ConnectionState } from '../types'

// const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'



// // export const useMediasoup = (roomName: string, token: string, displayName: string) => {
// //   const [participants,    setParticipants]    = useState<Map<string, Participant>>(new Map())
// //   const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
// //   const [localStream,     setLocalStream]     = useState<MediaStream | null>(null)
// //   const [audioMuted,      setAudioMuted]      = useState(false)
// //   const [videoOff,        setVideoOff]        = useState(false)
// //   const [error,           setError]           = useState<string | null>(null)

// //   const wsRef            = useRef<WSClient | null>(null)
// //   const deviceRef        = useRef<Device | null>(null)
// //   const sendTransportRef = useRef<any>(null)
// //   const recvTransportRef = useRef<any>(null)
// //   const localSocketId    = useRef<string>('')
// //   const producersRef     = useRef<Map<string, any>>(new Map()) // 'audio'|'video' → producer

// //   // Track which producerIds we are already consuming to prevent duplicates
// //   const consumingSet     = useRef<Set<string>>(new Set())

// //   // producerId → MediaStream (one stream per remote peer track)
// //   const producerStreams  = useRef<Map<string, MediaStream>>(new Map())

// //   // consumerId → producerId (for cleanup)
// //   const consumerMap      = useRef<Map<string, any>>(new Map()) // consumerId → consumer obj

// //   // ── Participant helpers ────────────────────────────────────────────────────

// //   const upsertParticipant = useCallback((id: string, update: Partial<Participant>) => {
// //     setParticipants(prev => {
// //       const next     = new Map(prev)
// //       const existing = next.get(id) ?? {
// //         socketId:   id,
// //         name:       'Remote User',
// //         audioMuted: false,
// //         videoOff:   false,
// //         isLocal:    false,
// //       }
// //       next.set(id, { ...existing, ...update } as Participant)
// //       return next
// //     })
// //   }, [])

// //   const removeParticipant = useCallback((id: string) => {
// //     setParticipants(prev => {
// //       const next = new Map(prev)
// //       next.delete(id)
// //       return next
// //     })
// //   }, [])

// //   // ── Consume a remote producer ──────────────────────────────────────────────

// //   const consumeProducer = useCallback(async (remoteProducerId: string) => {
// //     const ws     = wsRef.current
// //     const device = deviceRef.current
// //     const recv   = recvTransportRef.current

// //     if (!ws || !device || !recv) {
// //       console.warn('[consume] not ready — ws/device/recv missing')
// //       return
// //     }

// //     // ── DEDUP GUARD — prevent consuming same producer twice ──────────────────
// //     if (consumingSet.current.has(remoteProducerId)) {
// //       console.warn('[consume] already consuming:', remoteProducerId, '— skipping')
// //       return
// //     }
// //     consumingSet.current.add(remoteProducerId)

// //     console.log('[consume] starting for producerId:', remoteProducerId)

// //     try {
// //       const { params } = await ws.request('consume', {
// //         rtpCapabilities:           device.rtpCapabilities,
// //         remoteProducerId,
// //         serverConsumerTransportId: recv.id,
// //       })

// //       if (params?.error) {
// //         console.error('[consume] server returned error:', params.error)
// //         consumingSet.current.delete(remoteProducerId) // allow retry
// //         return
// //       }

// //       console.log('[consume] server params received — kind:', params.kind, 'consumerId:', params.id)

// //       const consumer = await recv.consume({
// //         id:            params.id,
// //         producerId:    params.producerId,
// //         kind:          params.kind,
// //         rtpParameters: params.rtpParameters,
// //       })

// //       consumerMap.current.set(params.id, consumer)

// //       // Resume the consumer so media flows
// //       await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })
// //       console.log('[consume] ✅ resumed — kind:', params.kind, 'track readyState:', consumer.track.readyState)

// //       // Each producer gets its own MediaStream with one track
// //       // VideoTile renders video + audio from same peer by checking stream tracks
// //       const stream = new MediaStream([consumer.track])
// //       producerStreams.current.set(remoteProducerId, stream)

// //       // Use producerId as the participant tile key
// //       // If it's audio-only, the tile shows avatar; video shows camera
// //       upsertParticipant(remoteProducerId, {
// //         socketId: remoteProducerId,
// //         name:     'Remote User',
// //         stream,
// //         isLocal:  false,
// //         videoOff: params.kind === 'audio', // audio-only producers show avatar
// //       })

// //       consumer.on('trackended', () => {
// //         console.log('[consume] trackended for:', remoteProducerId)
// //         removeParticipant(remoteProducerId)
// //         producerStreams.current.delete(remoteProducerId)
// //         consumingSet.current.delete(remoteProducerId)
// //       })

// //     } catch (err: any) {
// //       console.error('[consume] error:', err.message)
// //       consumingSet.current.delete(remoteProducerId) // allow retry on error
// //     }
// //   }, [upsertParticipant, removeParticipant])

// //   // ── Create recv transport ──────────────────────────────────────────────────

// //   const createRecvTransport = useCallback(async () => {
// //     const ws     = wsRef.current
// //     const device = deviceRef.current
// //     if (!ws || !device) return

// //     const { params } = await ws.request('createWebRtcTransport', { consumer: true })
// //     console.log('[recvTransport] created id:', params.id)

// //     const transport = device.createRecvTransport(params)
// //     recvTransportRef.current = transport

// //     transport.on('connect', ({ dtlsParameters }: any, callback: any, errback: any) => {
// //       console.log('[recvTransport] connect fired')
// //       ws.request('transport-recv-connect', {
// //         dtlsParameters,
// //         serverConsumerTransportId: transport.id,
// //       })
// //         .then(callback)
// //         .catch(errback)
// //     })

// //     transport.on('connectionstatechange', (state: string) => {
// //       console.log('[recvTransport] ICE state:', state)
// //       if (state === 'failed') {
// //         console.error('[recvTransport] ICE failed — check ANNOUNCED_IP in mediasoup .env')
// //       }
// //     })

// //   }, [])

// //   // ── Create send transport + produce ───────────────────────────────────────

// //   const createSendTransport = useCallback(async (stream: MediaStream) => {
// //     const ws     = wsRef.current
// //     const device = deviceRef.current
// //     if (!ws || !device) return

// //     const { params } = await ws.request('createWebRtcTransport', { consumer: false })
// //     console.log('[sendTransport] created id:', params.id)

// //     const transport = device.createSendTransport(params)
// //     sendTransportRef.current = transport

// //     transport.on('connect', ({ dtlsParameters }: any, callback: any, errback: any) => {
// //       console.log('[sendTransport] connect fired')
// //       ws.request('transport-connect', { dtlsParameters })
// //         .then(callback)
// //         .catch(errback)
// //     })

// //     transport.on('produce', async ({ kind, rtpParameters }: any, callback: any, errback: any) => {
// //       console.log('[sendTransport] produce fired, kind:', kind)
// //       try {
// //         const { id } = await ws.request('transport-produce', { kind, rtpParameters })
// //         callback({ id })
// //       } catch (err) {
// //         errback(err)
// //       }
// //     })

// //     transport.on('connectionstatechange', (state: string) => {
// //       console.log('[sendTransport] ICE state:', state)
// //       if (state === 'failed') {
// //         console.error('[sendTransport] ICE failed — check ANNOUNCED_IP in mediasoup .env')
// //       }
// //     })

// //     // Produce audio
// //     const audioTrack = stream.getAudioTracks()[0]
// //     if (audioTrack) {
// //       const ap = await transport.produce({ track: audioTrack })
// //       producersRef.current.set('audio', ap)
// //       console.log('[sendTransport] audio producer:', ap.id)
// //     } else {
// //       console.warn('[sendTransport] no audio track found')
// //     }

// //     // Produce video
// //     const videoTrack = stream.getVideoTracks()[0]
// //     if (videoTrack) {
// //       const vp = await transport.produce({ track: videoTrack })
// //       producersRef.current.set('video', vp)
// //       console.log('[sendTransport] video producer:', vp.id)
// //     } else {
// //       console.warn('[sendTransport] no video track found')
// //     }

// //   }, [])

// //   // ── Join ───────────────────────────────────────────────────────────────────

// //   const join = useCallback(async () => {
// //     if (connectionState !== 'idle') return
// //     setConnectionState('connecting')
// //     setError(null)

// //     try {
// //       // 1. Connect WS
// //       const ws = new WSClient(WS_URL, token)
// //       wsRef.current = ws
// //       const { socketId } = await ws.connect()
// //       localSocketId.current = socketId
// //       console.log('[join] WS connected, socketId:', socketId)

// //       // 2. Server-push listeners — register BEFORE joinRoom
// //       ws.on('new-producer', async ({ producerId }: { producerId: string }) => {
// //         console.log('[WS] ← new-producer:', producerId)
// //         await consumeProducer(producerId)
// //       })

// //       ws.on('producer-closed', ({ remoteProducerId }: { remoteProducerId: string }) => {
// //         console.log('[WS] ← producer-closed:', remoteProducerId)
// //         removeParticipant(remoteProducerId)
// //         producerStreams.current.delete(remoteProducerId)
// //         consumingSet.current.delete(remoteProducerId)
// //       })

// //       // 3. Join room → get rtpCapabilities
// //       const { rtpCapabilities } = await ws.request('joinRoom', { roomName })
// //       console.log('[join] got rtpCapabilities')

// //       // 4. Load mediasoup Device
// //       const device = new Device()
// //       await device.load({ routerRtpCapabilities: rtpCapabilities })
// //       deviceRef.current = device
// //       console.log('[join] device loaded')

// //       // 5. Get local media
// //       const stream = await navigator.mediaDevices.getUserMedia({
// //         audio: true,
// //         video: { width: 1280, height: 720, facingMode: 'user' },
// //       })
// //       setLocalStream(stream)
// //       console.log('[join] got local media — audio tracks:', stream.getAudioTracks().length, 'video tracks:', stream.getVideoTracks().length)

// //       // 6. Add local tile
// //       upsertParticipant(socketId, {
// //         socketId,
// //         name:    displayName,
// //         stream,
// //         isLocal: true,
// //       })

// //       // 7. Create recv transport BEFORE consuming
// //       await createRecvTransport()
// //       console.log('[join] recv transport ready')

// //       // 8. Consume any EXISTING producers in the room
// //       const { producers: existingProducers } = await ws.request('getProducers', {})
// //       console.log('[join] existing producers in room:', existingProducers)
// //       for (const producerId of existingProducers) {
// //         await consumeProducer(producerId)
// //       }

// //       // 9. Create send transport + start producing our own media
// //       await createSendTransport(stream)
// //       console.log('[join] fully joined ✅')

// //       setConnectionState('connected')

// //     } catch (err: any) {
// //       console.error('[join] failed:', err)
// //       setError(err.message ?? 'Failed to join')
// //       setConnectionState('error')
// //     }
// //   }, [
// //     roomName, token, displayName, connectionState,
// //     consumeProducer, createRecvTransport, createSendTransport,
// //     upsertParticipant, removeParticipant,
// //   ])

// //   // ── Toggle audio ───────────────────────────────────────────────────────────

// //   const toggleAudio = useCallback(() => {
// //     const track = localStream?.getAudioTracks()[0]
// //     if (!track) return
// //     const producer = producersRef.current.get('audio')
// //     if (audioMuted) {
// //       track.enabled = true
// //       producer?.resume()
// //       setAudioMuted(false)
// //     } else {
// //       track.enabled = false
// //       producer?.pause()
// //       setAudioMuted(true)
// //     }
// //   }, [audioMuted, localStream])

// //   // ── Toggle video ───────────────────────────────────────────────────────────

// //   const toggleVideo = useCallback(() => {
// //     const track = localStream?.getVideoTracks()[0]
// //     if (!track) return
// //     const producer = producersRef.current.get('video')
// //     if (videoOff) {
// //       track.enabled = true
// //       producer?.resume()
// //       setVideoOff(false)
// //     } else {
// //       track.enabled = false
// //       producer?.pause()
// //       setVideoOff(true)
// //     }
// //   }, [videoOff, localStream])

// //   // ── Leave ──────────────────────────────────────────────────────────────────

// //   const leave = useCallback(() => {
// //     localStream?.getTracks().forEach(t => t.stop())
// //     sendTransportRef.current?.close()
// //     recvTransportRef.current?.close()
// //     consumerMap.current.forEach(c => c.close())
// //     consumerMap.current.clear()
// //     producersRef.current.forEach(p => p.close())
// //     producersRef.current.clear()
// //     consumingSet.current.clear()
// //     producerStreams.current.clear()
// //     wsRef.current?.disconnect()
// //     wsRef.current = null
// //     setLocalStream(null)
// //     setParticipants(new Map())
// //     setConnectionState('disconnected')
// //   }, [localStream])

// //   return {
// //     participants,
// //     connectionState,
// //     localStream,
// //     audioMuted,
// //     videoOff,
// //     error,
// //     join,
// //     leave,
// //     toggleAudio,
// //     toggleVideo,
// //   }
// // }



// export const useMediasoup = (roomName: string, token: string, displayName: string) => {
//   const [participants,    setParticipants]    = useState<Map<string, Participant>>(new Map())
//   const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
//   const [localStream,     setLocalStream]     = useState<MediaStream | null>(null)
//   const [audioMuted,      setAudioMuted]      = useState(false)
//   const [videoOff,        setVideoOff]        = useState(false)
//   const [error,           setError]           = useState<string | null>(null)

//   const wsRef            = useRef<WSClient | null>(null)
//   const deviceRef        = useRef<Device | null>(null)
//   const sendTransportRef = useRef<any>(null)
//   const recvTransportRef = useRef<any>(null)
//   const producersRef     = useRef<Map<string, any>>(new Map())
//   const consumersRef     = useRef<Map<string, any>>(new Map()) // producerId → consumer
//   const consumingSet     = useRef<Set<string>>(new Set())

//   // ── Participant state helpers ───────────────────────────────────────────────

//   const upsertParticipant = (id: string, data: Partial<Participant>) => {
//     setParticipants(prev => {
//       const next     = new Map(prev)
//       const existing = next.get(id) ?? {
//         socketId: id, name: 'Remote User',
//         audioMuted: false, videoOff: false, isLocal: false,
//       }
//       next.set(id, { ...existing, ...data } as Participant)
//       return next
//     })
//   }

//   const removeParticipant = (id: string) => {
//     setParticipants(prev => {
//       const next = new Map(prev)
//       next.delete(id)
//       return next
//     })
//   }

//   // ── Consume a remote producer ──────────────────────────────────────────────
//   // Strategy:
//   //  - video producer → create tile with video stream
//   //  - audio producer → find the matching video tile and attach audioStream to it
//   //    If the video tile doesn't exist yet, store audio and attach when video arrives

//   // Pending audio streams waiting for their video tile
//   // key = socketId prefix of producerId (we don't have socketId so we store by order)
//   const pendingAudio = useRef<Map<string, MediaStream>>(new Map()) // producerId → audioStream

//   const consumeProducer = useCallback(async (remoteProducerId: string) => {
//     const ws     = wsRef.current
//     const device = deviceRef.current
//     const recv   = recvTransportRef.current
//     if (!ws || !device || !recv) return
//     if (consumingSet.current.has(remoteProducerId)) return
//     consumingSet.current.add(remoteProducerId)

//     try {
//       const { params } = await ws.request('consume', {
//         rtpCapabilities:           device.rtpCapabilities,
//         remoteProducerId,
//         serverConsumerTransportId: recv.id,
//       })

//       if (params?.error) {
//         consumingSet.current.delete(remoteProducerId)
//         return
//       }

//       const consumer = await recv.consume({
//         id:            params.id,
//         producerId:    params.producerId,
//         kind:          params.kind,
//         rtpParameters: params.rtpParameters,
//       })

//       consumersRef.current.set(remoteProducerId, consumer)
//       await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })

//       const stream = new MediaStream([consumer.track])

//       if (params.kind === 'video') {
//         // Create/update tile with video stream
//         // Also check if we already have a pending audio stream for this peer
//         // Audio arrives slightly before or after video — handle both cases
//         upsertParticipant(remoteProducerId, {
//           socketId: remoteProducerId,
//           stream,
//           isLocal:  false,
//           videoOff: false,
//         })

//         // Clean up tile when video track ends
//         consumer.track.onended = () => {
//           removeParticipant(remoteProducerId)
//           consumingSet.current.delete(remoteProducerId)
//         }

//       } else if (params.kind === 'audio') {
//         // Find the video tile this audio belongs to.
//         // Since both audio+video come from the same peer, and producers are
//         // returned in order, the most recently added video tile is this peer's.
//         // We store it as pendingAudio until the video tile is ready.
//         pendingAudio.current.set(remoteProducerId, stream)

//         // Try to attach to an existing video tile
//         // We attach audio to the LAST video tile that doesn't have audio yet
//         setParticipants(prev => {
//           const next = new Map(prev)
//           // Find a remote tile without audioStream yet
//           for (const [id, p] of next) {
//             if (!p.isLocal && !p.audioStream) {
//               next.set(id, { ...p, audioStream: stream })
//               pendingAudio.current.delete(remoteProducerId)
//               break
//             }
//           }
//           return next
//         })
//       }

//     } catch (err: any) {
//       console.error('[consume] error:', err.message)
//       consumingSet.current.delete(remoteProducerId)
//     }
//   }, [])

//   // ── Transports ─────────────────────────────────────────────────────────────

//   const createRecvTransport = useCallback(async () => {
//     const ws = wsRef.current!
//     const device = deviceRef.current!
//     const { params } = await ws.request('createWebRtcTransport', { consumer: true })
//     const transport = device.createRecvTransport(params)
//     recvTransportRef.current = transport

//     transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
//       ws.request('transport-recv-connect', {
//         dtlsParameters,
//         serverConsumerTransportId: transport.id,
//       }).then(cb).catch(eb)
//     })

//     transport.on('connectionstatechange', (state: string) => {
//       if (state === 'failed') console.error('[recvTransport] ICE failed — check ANNOUNCED_IP')
//     })
//   }, [])

//   const createSendTransport = useCallback(async (stream: MediaStream) => {
//     const ws = wsRef.current!
//     const device = deviceRef.current!
//     const { params } = await ws.request('createWebRtcTransport', { consumer: false })
//     const transport = device.createSendTransport(params)
//     sendTransportRef.current = transport

//     transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
//       ws.request('transport-connect', { dtlsParameters }).then(cb).catch(eb)
//     })

//     transport.on('produce', async ({ kind, rtpParameters }: any, cb: any, eb: any) => {
//       try {
//         const { id } = await ws.request('transport-produce', { kind, rtpParameters })
//         cb({ id })
//       } catch (e) { eb(e) }
//     })

//     transport.on('connectionstatechange', (state: string) => {
//       if (state === 'failed') console.error('[sendTransport] ICE failed — check ANNOUNCED_IP')
//     })

//     const audio = stream.getAudioTracks()[0]
//     if (audio) producersRef.current.set('audio', await transport.produce({ track: audio }))

//     const video = stream.getVideoTracks()[0]
//     if (video) producersRef.current.set('video', await transport.produce({ track: video }))
//   }, [])

//   // ── Join ───────────────────────────────────────────────────────────────────

//   const join = useCallback(async () => {
//     if (connectionState !== 'idle') return
//     setConnectionState('connecting')
//     setError(null)

//     try {
//       const ws = new WSClient(WS_URL, token)
//       wsRef.current = ws
//       const { socketId } = await ws.connect()

//       ws.on('new-producer', async ({ producerId }: any) => {
//         await consumeProducer(producerId)
//       })

//       ws.on('producer-closed', ({ remoteProducerId }: any) => {
//         console.log('[WS] producer-closed:', remoteProducerId)
//         removeParticipant(remoteProducerId)
//         consumersRef.current.get(remoteProducerId)?.close()
//         consumersRef.current.delete(remoteProducerId)
//         consumingSet.current.delete(remoteProducerId)
//         pendingAudio.current.delete(remoteProducerId)
//       })

//       const { rtpCapabilities } = await ws.request('joinRoom', { roomName })

//       const device = new Device()
//       await device.load({ routerRtpCapabilities: rtpCapabilities })
//       deviceRef.current = device

//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
//       setLocalStream(stream)

//       setParticipants(prev => {
//         const next = new Map(prev)
//         next.set(socketId, {
//           socketId, name: displayName, stream,
//           audioMuted: false, videoOff: false, isLocal: true,
//         })
//         return next
//       })

//       await createRecvTransport()

//       const { producers } = await ws.request('getProducers', {})
//       for (const pid of producers) await consumeProducer(pid)

//       await createSendTransport(stream)
//       setConnectionState('connected')

//     } catch (err: any) {
//       setError(err.message ?? 'Failed to join')
//       setConnectionState('error')
//     }
//   }, [roomName, token, displayName, connectionState, consumeProducer, createRecvTransport, createSendTransport])

//   // ── Controls ───────────────────────────────────────────────────────────────

//   const toggleAudio = useCallback(() => {
//     const track = localStream?.getAudioTracks()[0]
//     if (!track) return
//     track.enabled = audioMuted
//     producersRef.current.get('audio')?.[audioMuted ? 'resume' : 'pause']()
//     setAudioMuted(m => !m)
//   }, [audioMuted, localStream])

//   const toggleVideo = useCallback(() => {
//     const track = localStream?.getVideoTracks()[0]
//     if (!track) return
//     track.enabled = videoOff
//     producersRef.current.get('video')?.[videoOff ? 'resume' : 'pause']()
//     setVideoOff(v => !v)
//   }, [videoOff, localStream])

//   const leave = useCallback(() => {
//     localStream?.getTracks().forEach(t => t.stop())
//     sendTransportRef.current?.close()
//     recvTransportRef.current?.close()
//     consumersRef.current.forEach(c => c.close())
//     consumersRef.current.clear()
//     producersRef.current.forEach(p => p.close())
//     producersRef.current.clear()
//     consumingSet.current.clear()
//     pendingAudio.current.clear()
//     wsRef.current?.disconnect()
//     wsRef.current = null
//     setLocalStream(null)
//     setParticipants(new Map())
//     setConnectionState('disconnected')
//   }, [localStream])

//   return {
//     participants, connectionState, localStream,
//     audioMuted, videoOff, error,
//     join, leave, toggleAudio, toggleVideo,
//   }
// }


'use client'

/**
 * hooks/useMediasoup.ts  (phase 3)
 *
 * Phase 3 additions:
 *   1. connectionState gains 'reconnecting' state shown in UI
 *   2. WSClient receives onReconnect and onDisconnect callbacks
 *   3. rejoinRoom() restores the full session after reconnect:
 *      - re-loads device with fresh rtpCapabilities
 *      - re-creates send + recv transports
 *      - re-produces local media
 *      - re-consumes all existing producers in the room
 *   4. Remote participants are cleared on disconnect, re-populated on rejoin
 *
 * Everything else unchanged from phase 1+2.
 */

import { useCallback, useRef, useState } from 'react'
import { Device }   from 'mediasoup-client'
import { WSClient } from '../libs/wsClient'
import type { Participant, ConnectionState } from '../types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'

// export const useMediasoup = (roomName: string, token: string, displayName: string) => {
//   const [participants,    setParticipants]    = useState<Map<string, Participant>>(new Map())
//   const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
//   const [localStream,     setLocalStream]     = useState<MediaStream | null>(null)
//   const [audioMuted,      setAudioMuted]      = useState(false)
//   const [videoOff,        setVideoOff]        = useState(false)
//   const [error,           setError]           = useState<string | null>(null)

//   const wsRef            = useRef<WSClient | null>(null)
//   const deviceRef        = useRef<Device | null>(null)
//   const sendTransportRef = useRef<any>(null)
//   const recvTransportRef = useRef<any>(null)
//   const producersRef     = useRef<Map<string, any>>(new Map())
//   const consumersRef     = useRef<Map<string, any>>(new Map())
//   const consumingSet     = useRef<Set<string>>(new Set())
//   const localStreamRef   = useRef<MediaStream | null>(null)  // stable ref for rejoin
//   const localSocketId    = useRef<string>('')

//   // ── Participant helpers ────────────────────────────────────────────────────

//   const addParticipant = (id: string, data: Partial<Participant>) => {
//     setParticipants(prev => {
//       const next = new Map(prev)
//       next.set(id, {
//         socketId: id, name: 'Remote User',
//         audioMuted: false, videoOff: false, isLocal: false,
//         ...data,
//       } as Participant)
//       return next
//     })
//   }

//   const removeParticipant = (id: string) => {
//     setParticipants(prev => {
//       const next = new Map(prev)
//       next.delete(id)
//       return next
//     })
//   }

//   // ── Consume a remote producer ──────────────────────────────────────────────

//   const consumeProducer = useCallback(async (remoteProducerId: string) => {
//     const ws     = wsRef.current
//     const device = deviceRef.current
//     const recv   = recvTransportRef.current
//     if (!ws || !device || !recv) return

//     if (consumingSet.current.has(remoteProducerId)) return
//     consumingSet.current.add(remoteProducerId)

//     try {
//       const { params } = await ws.request('consume', {
//         rtpCapabilities:           device.rtpCapabilities,
//         remoteProducerId,
//         serverConsumerTransportId: recv.id,
//       })

//       if (params?.error) {
//         consumingSet.current.delete(remoteProducerId)
//         return
//       }

//       if (params.kind !== 'video') {
//         await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })
//         const consumer = await recv.consume({
//           id: params.id, producerId: params.producerId,
//           kind: params.kind, rtpParameters: params.rtpParameters,
//         })
//         consumersRef.current.set(remoteProducerId, consumer)
//         return
//       }

//       const consumer = await recv.consume({
//         id: params.id, producerId: params.producerId,
//         kind: params.kind, rtpParameters: params.rtpParameters,
//       })
//       consumersRef.current.set(remoteProducerId, consumer)

//       await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })

//       const stream = new MediaStream([consumer.track])
//       addParticipant(remoteProducerId, { stream })

//       consumer.track.onended = () => {
//         removeParticipant(remoteProducerId)
//         consumingSet.current.delete(remoteProducerId)
//       }

//     } catch (err: any) {
//       console.error('[consume] error:', err.message)
//       consumingSet.current.delete(remoteProducerId)
//     }
//   }, [])

//   // ── Create transports ──────────────────────────────────────────────────────

//   const createRecvTransport = useCallback(async () => {
//     const ws = wsRef.current!
//     const device = deviceRef.current!
//     const { params } = await ws.request('createWebRtcTransport', { consumer: true })
//     const transport   = device.createRecvTransport(params)
//     recvTransportRef.current = transport
//     transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
//       ws.request('transport-recv-connect', {
//         dtlsParameters,
//         serverConsumerTransportId: transport.id,
//       }).then(cb).catch(eb)
//     })
//     transport.on('connectionstatechange', (state: string) => {
//       if (state === 'failed') console.error('[recvTransport] ICE failed — check ANNOUNCED_IP')
//     })
//   }, [])

//   const createSendTransport = useCallback(async (stream: MediaStream) => {
//     const ws = wsRef.current!
//     const device = deviceRef.current!
//     const { params } = await ws.request('createWebRtcTransport', { consumer: false })
//     const transport   = device.createSendTransport(params)
//     sendTransportRef.current = transport
//     transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
//       ws.request('transport-connect', { dtlsParameters }).then(cb).catch(eb)
//     })
//     transport.on('produce', async ({ kind, rtpParameters }: any, cb: any, eb: any) => {
//       try {
//         const { id } = await ws.request('transport-produce', { kind, rtpParameters })
//         cb({ id })
//       } catch (e) { eb(e) }
//     })
//     transport.on('connectionstatechange', (state: string) => {
//       if (state === 'failed') console.error('[sendTransport] ICE failed')
//     })
//     const audio = stream.getAudioTracks()[0]
//     if (audio) producersRef.current.set('audio', await transport.produce({ track: audio }))
//     const video = stream.getVideoTracks()[0]
//     if (video) producersRef.current.set('video', await transport.produce({ track: video }))
//   }, [])

//   // ── Close transports and consumers (without stopping local tracks) ─────────

//   const closeTransports = useCallback(() => {
//     sendTransportRef.current?.close()
//     recvTransportRef.current?.close()
//     sendTransportRef.current = null
//     recvTransportRef.current = null
//     producersRef.current.forEach(p => p.close())
//     producersRef.current.clear()
//     consumersRef.current.forEach(c => c.close())
//     consumersRef.current.clear()
//     consumingSet.current.clear()
//   }, [])

//   // ── Rejoin after reconnect ─────────────────────────────────────────────────
//   // Called by WSClient.onReconnect after a successful reconnect.
//   // Re-establishes the full WebRTC session using the existing local stream.

//   const rejoinRoom = useCallback(async () => {
//     const ws     = wsRef.current
//     const stream = localStreamRef.current
//     if (!ws || !stream) return

//     console.log('[rejoin] Reconnected — rejoining room:', roomName)
//     setConnectionState('reconnecting')

//     try {
//       // Re-register listeners (new connection = new socketId)
//       ws.on('new-producer', async ({ producerId }: any) => {
//         await consumeProducer(producerId)
//       })
//       ws.on('producer-closed', ({ remoteProducerId }: any) => {
//         removeParticipant(remoteProducerId)
//         consumersRef.current.get(remoteProducerId)?.close()
//         consumersRef.current.delete(remoteProducerId)
//         consumingSet.current.delete(remoteProducerId)
//       })

//       // Close old transports — new socketId = new session on mediasoup
//       closeTransports()

//       // Clear remote participants — we'll re-populate from getProducers
//       setParticipants(prev => {
//         const next = new Map(prev)
//         // Keep only the local tile
//         for (const [id, p] of next) {
//           if (!p.isLocal) next.delete(id)
//         }
//         return next
//       })

//       // Re-join room with new socketId
//       const { rtpCapabilities } = await ws.request('joinRoom', { roomName })

//       // Reload device — rtpCapabilities may have changed
//       const device = new Device()
//       await device.load({ routerRtpCapabilities: rtpCapabilities })
//       deviceRef.current = device

//       // Update local tile with new socketId
//       const newSocketId = (ws as any).socketId || localSocketId.current
//       setParticipants(prev => {
//         const next    = new Map(prev)
//         const localId = Array.from(next.values()).find(p => p.isLocal)?.socketId
//         if (localId && localId !== newSocketId) {
//           const tile = next.get(localId)!
//           next.delete(localId)
//           next.set(newSocketId, { ...tile, socketId: newSocketId })
//         }
//         return next
//       })

//       // Re-create recv transport
//       await createRecvTransport()

//       // Consume everyone currently in the room
//       const { producers } = await ws.request('getProducers', {})
//       for (const pid of producers) await consumeProducer(pid)

//       // Re-create send transport with existing local stream
//       await createSendTransport(stream)

//       setConnectionState('connected')
//       console.log('[rejoin] ✅ Rejoined room:', roomName)

//     } catch (err: any) {
//       console.error('[rejoin] Failed to rejoin:', err.message)
//       setConnectionState('error')
//       setError(`Reconnect failed: ${err.message}`)
//     }
//   }, [roomName, consumeProducer, closeTransports, createRecvTransport, createSendTransport])

//   // ── Join ───────────────────────────────────────────────────────────────────

//   const join = useCallback(async () => {
//     if (connectionState !== 'idle') return
//     setConnectionState('connecting')
//     setError(null)

//     try {
//       const ws = new WSClient(WS_URL, token, {
//         // Called after successful reconnect — restores full session
//         onReconnect: () => rejoinRoom(),

//         // Called when connection drops — update UI while retrying
//         onDisconnect: () => {
//           console.log('[WS] Disconnected — will auto-reconnect')
//           setConnectionState('reconnecting')
//         },
//         maxRetries: 10,
//       })

//       wsRef.current = ws
//       const { socketId } = await ws.connect()
//       localSocketId.current = socketId

//       ws.on('new-producer', async ({ producerId }: any) => {
//         await consumeProducer(producerId)
//       })

//       ws.on('producer-closed', ({ remoteProducerId }: any) => {
//         removeParticipant(remoteProducerId)
//         consumersRef.current.get(remoteProducerId)?.close()
//         consumersRef.current.delete(remoteProducerId)
//         consumingSet.current.delete(remoteProducerId)
//       })

//       const { rtpCapabilities } = await ws.request('joinRoom', { roomName })

//       const device = new Device()
//       await device.load({ routerRtpCapabilities: rtpCapabilities })
//       deviceRef.current = device

//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
//       setLocalStream(stream)
//       localStreamRef.current = stream   // keep stable ref for rejoin

//       setParticipants(prev => {
//         const next = new Map(prev)
//         next.set(socketId, {
//           socketId, name: displayName, stream,
//           audioMuted: false, videoOff: false, isLocal: true,
//         })
//         return next
//       })

//       await createRecvTransport()

//       const { producers } = await ws.request('getProducers', {})
//       for (const pid of producers) await consumeProducer(pid)

//       await createSendTransport(stream)
//       setConnectionState('connected')

//     } catch (err: any) {
//       setError(err.message ?? 'Failed to join')
//       setConnectionState('error')
//     }
//   }, [roomName, token, displayName, connectionState,
//       consumeProducer, createRecvTransport, createSendTransport, rejoinRoom])

//   // ── Controls ───────────────────────────────────────────────────────────────

//   const toggleAudio = useCallback(() => {
//     const track = localStream?.getAudioTracks()[0]
//     if (!track) return
//     track.enabled = audioMuted
//     producersRef.current.get('audio')?.[audioMuted ? 'resume' : 'pause']()
//     setAudioMuted(m => !m)
//   }, [audioMuted, localStream])

//   const toggleVideo = useCallback(() => {
//     const track = localStream?.getVideoTracks()[0]
//     if (!track) return
//     track.enabled = videoOff
//     producersRef.current.get('video')?.[videoOff ? 'resume' : 'pause']()
//     setVideoOff(v => !v)
//   }, [videoOff, localStream])

//   const leave = useCallback(() => {
//     localStreamRef.current?.getTracks().forEach(t => t.stop())
//     closeTransports()
//     wsRef.current?.disconnect()
//     wsRef.current        = null
//     localStreamRef.current = null
//     setLocalStream(null)
//     setParticipants(new Map())
//     setConnectionState('disconnected')
//   }, [closeTransports])

//   return {
//     participants, connectionState, localStream,
//     audioMuted, videoOff, error,
//     join, leave, toggleAudio, toggleVideo,
//   }
// }




// Frezzing issue

/**
 * hooks/useMediasoup.ts  (phase 3)
 *
 * Phase 3 additions:
 *   1. connectionState gains 'reconnecting' state shown in UI
 *   2. WSClient receives onReconnect and onDisconnect callbacks
 *   3. rejoinRoom() restores the full session after reconnect:
 *      - re-loads device with fresh rtpCapabilities
 *      - re-creates send + recv transports
 *      - re-produces local media
 *      - re-consumes all existing producers in the room
 *   4. Remote participants are cleared on disconnect, re-populated on rejoin
 *
 * Everything else unchanged from phase 1+2.
 */



/**
 * hooks/useMediasoup.ts  (phase 3)
 *
 * Phase 3 additions:
 *   1. connectionState gains 'reconnecting' state shown in UI
 *   2. WSClient receives onReconnect and onDisconnect callbacks
 *   3. rejoinRoom() restores the full session after reconnect:
 *      - re-loads device with fresh rtpCapabilities
 *      - re-creates send + recv transports
 *      - re-produces local media
 *      - re-consumes all existing producers in the room
 *   4. Remote participants are cleared on disconnect, re-populated on rejoin
 *
 * Everything else unchanged from phase 1+2.
 */



/**
 * hooks/useMediasoup.ts  (phase 3)
 *
 * Phase 3 additions:
 *   1. connectionState gains 'reconnecting' state shown in UI
 *   2. WSClient receives onReconnect and onDisconnect callbacks
 *   3. rejoinRoom() restores the full session after reconnect:
 *      - re-loads device with fresh rtpCapabilities
 *      - re-creates send + recv transports
 *      - re-produces local media
 *      - re-consumes all existing producers in the room
 *   4. Remote participants are cleared on disconnect, re-populated on rejoin
 *
 * Everything else unchanged from phase 1+2.
 */



export const useMediasoup = (roomName: string, token: string, displayName: string) => {
  const [participants,    setParticipants]    = useState<Map<string, Participant>>(new Map())
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [localStream,     setLocalStream]     = useState<MediaStream | null>(null)
  const [audioMuted,      setAudioMuted]      = useState(false)
  const [videoOff,        setVideoOff]        = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  const wsRef            = useRef<WSClient | null>(null)
  const deviceRef        = useRef<Device | null>(null)
  const sendTransportRef = useRef<any>(null)
  const recvTransportRef = useRef<any>(null)
  const producersRef     = useRef<Map<string, any>>(new Map())
  const consumersRef     = useRef<Map<string, any>>(new Map())
  const consumingSet     = useRef<Set<string>>(new Set())
  // Maps every producerId (video OR audio) → the participant key it belongs to.
  // A peer has 2 producers — this lets producer-closed find the right tile
  // regardless of which producer closes first.
  const producerToParticipant = useRef<Map<string, string>>(new Map())
  const localStreamRef   = useRef<MediaStream | null>(null)  // stable ref for rejoin
  const localSocketId    = useRef<string>('')

  // ── Participant helpers ────────────────────────────────────────────────────

  const addParticipant = (id: string, data: Partial<Participant>) => {
    setParticipants(prev => {
      const next = new Map(prev)
      // FIX: merge with existing participant data instead of replacing.
      // Without this, calling addParticipant({audioStream}) AFTER addParticipant({stream})
      // would wipe the video stream because defaults spread over the existing entry.
      const existing = next.get(id)
      next.set(id, {
        socketId: id, name: 'Remote User',
        audioMuted: false, videoOff: false, isLocal: false,
        ...existing,   // keep existing fields (stream, audioStream, etc.)
        ...data,       // apply new fields on top
      } as Participant)
      return next
    })
  }

  const removeParticipant = (id: string) => {
    setParticipants(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  // ── Consume a remote producer ──────────────────────────────────────────────

  const consumeProducer = useCallback(async (remoteProducerId: string) => {
    const ws     = wsRef.current
    const device = deviceRef.current
    const recv   = recvTransportRef.current
    if (!ws || !device || !recv) return

    if (consumingSet.current.has(remoteProducerId)) return
    consumingSet.current.add(remoteProducerId)

    try {
      const { params } = await ws.request('consume', {
        rtpCapabilities:           device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId: recv.id,
      })

      if (params?.error) {
        consumingSet.current.delete(remoteProducerId)
        return
      }

      if (params.kind !== 'video') {
        // ── AUDIO FIX ──────────────────────────────────────────────────────
        // Previously: audio was consumed but the track was never attached to
        // anything. The <audio> element in VideoTile expects participant.audioStream.
        // Fix: create a MediaStream from the audio track and call addParticipant
        // with { audioStream } so VideoTile's <audio> srcObject gets set.
        const consumer = await recv.consume({
          id: params.id, producerId: params.producerId,
          kind: params.kind, rtpParameters: params.rtpParameters,
        })
        await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })
        consumersRef.current.set(remoteProducerId, consumer)

        const audioStream = new MediaStream([consumer.track])
        // addParticipant merges into existing participant (if video already loaded)
        // or creates a new entry — either way audioStream gets attached.
        // The participant key is remoteProducerId for audio (video may not be here yet).
        // We register the mapping so producer-closed can find the tile by audio producerId too.
        addParticipant(remoteProducerId, { audioStream })
        producerToParticipant.current.set(remoteProducerId, remoteProducerId)

        consumer.track.onended = () => {
          const key = producerToParticipant.current.get(remoteProducerId) ?? remoteProducerId
          removeParticipant(key)
          producerToParticipant.current.delete(remoteProducerId)
          consumingSet.current.delete(remoteProducerId)
        }
        return
      }

      const consumer = await recv.consume({
        id: params.id, producerId: params.producerId,
        kind: params.kind, rtpParameters: params.rtpParameters,
      })
      consumersRef.current.set(remoteProducerId, consumer)

      await ws.request('consumer-resume', { serverConsumerId: params.serverConsumerId })

      const stream = new MediaStream([consumer.track])
      addParticipant(remoteProducerId, { stream })
      // Register video producerId → participant key so producer-closed finds the tile
      producerToParticipant.current.set(remoteProducerId, remoteProducerId)

      consumer.track.onended = () => {
        const key = producerToParticipant.current.get(remoteProducerId) ?? remoteProducerId
        removeParticipant(key)
        producerToParticipant.current.delete(remoteProducerId)
        consumingSet.current.delete(remoteProducerId)
      }

    } catch (err: any) {
      console.error('[consume] error:', err.message)
      consumingSet.current.delete(remoteProducerId)
    }
  }, [])

  // ── Create transports ──────────────────────────────────────────────────────

  const createRecvTransport = useCallback(async () => {
    const ws = wsRef.current!
    const device = deviceRef.current!
    const { params } = await ws.request('createWebRtcTransport', { consumer: true })
    const transport   = device.createRecvTransport(params)
    recvTransportRef.current = transport
    transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
      ws.request('transport-recv-connect', {
        dtlsParameters,
        serverConsumerTransportId: transport.id,
      }).then(cb).catch(eb)
    })
    transport.on('connectionstatechange', (state: string) => {
      if (state === 'failed') console.error('[recvTransport] ICE failed — check ANNOUNCED_IP')
    })
  }, [])

  const createSendTransport = useCallback(async (stream: MediaStream) => {
    const ws = wsRef.current!
    const device = deviceRef.current!
    const { params } = await ws.request('createWebRtcTransport', { consumer: false })
    const transport   = device.createSendTransport(params)
    sendTransportRef.current = transport
    transport.on('connect', ({ dtlsParameters }: any, cb: any, eb: any) => {
      ws.request('transport-connect', { dtlsParameters }).then(cb).catch(eb)
    })
    transport.on('produce', async ({ kind, rtpParameters }: any, cb: any, eb: any) => {
      try {
        const { id } = await ws.request('transport-produce', { kind, rtpParameters })
        cb({ id })
      } catch (e) { eb(e) }
    })
    transport.on('connectionstatechange', (state: string) => {
      if (state === 'failed') console.error('[sendTransport] ICE failed')
    })
    const audio = stream.getAudioTracks()[0]
    if (audio) producersRef.current.set('audio', await transport.produce({ track: audio }))
    const video = stream.getVideoTracks()[0]
    if (video) producersRef.current.set('video', await transport.produce({ track: video }))
  }, [])

  // ── Close transports and consumers (without stopping local tracks) ─────────

  const closeTransports = useCallback(() => {
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    sendTransportRef.current = null
    recvTransportRef.current = null
    producersRef.current.forEach(p => p.close())
    producersRef.current.clear()
    consumersRef.current.forEach(c => c.close())
    consumersRef.current.clear()
    consumingSet.current.clear()
    producerToParticipant.current.clear()
  }, [])

  // ── Rejoin after reconnect ─────────────────────────────────────────────────
  // Called by WSClient.onReconnect after a successful reconnect.
  // Re-establishes the full WebRTC session using the existing local stream.

  const rejoinRoom = useCallback(async () => {
    const ws     = wsRef.current
    const stream = localStreamRef.current
    if (!ws || !stream) return

    console.log('[rejoin] Reconnected — rejoining room:', roomName)
    setConnectionState('reconnecting')

    try {
      // Re-register listeners (new connection = new socketId)
      ws.on('new-producer', async ({ producerId }: any) => {
        await consumeProducer(producerId)
      })
      ws.on('producer-closed', ({ remoteProducerId }: any) => {
        console.log('[DEBUG-Frontend] ▶ producer-closed received! id:', remoteProducerId)
        const participantKey = producerToParticipant.current.get(remoteProducerId) ?? remoteProducerId
        console.log('[DEBUG-Frontend]   removing participant key:', participantKey)
        removeParticipant(participantKey)
        consumersRef.current.get(remoteProducerId)?.close()
        consumersRef.current.delete(remoteProducerId)
        producerToParticipant.current.delete(remoteProducerId)
        consumingSet.current.delete(remoteProducerId)
      })

      // Close old transports — new socketId = new session on mediasoup
      closeTransports()

      // Clear remote participants — we'll re-populate from getProducers
      setParticipants(prev => {
        const next = new Map(prev)
        // Keep only the local tile
        for (const [id, p] of next) {
          if (!p.isLocal) next.delete(id)
        }
        return next
      })

      // Re-join room with new socketId
      const { rtpCapabilities } = await ws.request('joinRoom', { roomName })

      // Reload device — rtpCapabilities may have changed
      const device = new Device()
      await device.load({ routerRtpCapabilities: rtpCapabilities })
      deviceRef.current = device

      // Update local tile with new socketId
      const newSocketId = (ws as any).socketId || localSocketId.current
      setParticipants(prev => {
        const next    = new Map(prev)
        const localId = Array.from(next.values()).find(p => p.isLocal)?.socketId
        if (localId && localId !== newSocketId) {
          const tile = next.get(localId)!
          next.delete(localId)
          next.set(newSocketId, { ...tile, socketId: newSocketId })
        }
        return next
      })

      // Re-create recv transport
      await createRecvTransport()

      // Consume everyone currently in the room
      const { producers } = await ws.request('getProducers', {})
      for (const pid of producers) await consumeProducer(pid)

      // Re-create send transport with existing local stream
      await createSendTransport(stream)

      setConnectionState('connected')
      console.log('[rejoin] ✅ Rejoined room:', roomName)

    } catch (err: any) {
      console.error('[rejoin] Failed to rejoin:', err.message)
      setConnectionState('error')
      setError(`Reconnect failed: ${err.message}`)
    }
  }, [roomName, consumeProducer, closeTransports, createRecvTransport, createSendTransport])

  // ── Join ───────────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    if (connectionState !== 'idle') return
    setConnectionState('connecting')
    setError(null)

    try {
      const ws = new WSClient(WS_URL, token, {
        // Called after successful reconnect — restores full session
        onReconnect: () => rejoinRoom(),

        // Called when connection drops — update UI while retrying
        onDisconnect: () => {
          console.log('[WS] Disconnected — will auto-reconnect')
          setConnectionState('reconnecting')
        },
        maxRetries: 10,
      })

      wsRef.current = ws
      const { socketId } = await ws.connect()
      localSocketId.current = socketId

      ws.on('new-producer', async ({ producerId }: any) => {
        await consumeProducer(producerId)
      })

      ws.on('producer-closed', ({ remoteProducerId }: any) => {
        // Use lookup map so we find the tile even if it's the AUDIO producer that closed first.
        const participantKey = producerToParticipant.current.get(remoteProducerId) ?? remoteProducerId
        removeParticipant(participantKey)
        consumersRef.current.get(remoteProducerId)?.close()
        consumersRef.current.delete(remoteProducerId)
        producerToParticipant.current.delete(remoteProducerId)
        consumingSet.current.delete(remoteProducerId)
      })

      const { rtpCapabilities } = await ws.request('joinRoom', { roomName })

      const device = new Device()
      await device.load({ routerRtpCapabilities: rtpCapabilities })
      deviceRef.current = device

      // Explicit AEC/noise constraints.
      // 'true' lets the browser pick defaults — which vary wildly between Chrome and Firefox.
      // Explicit values force both browsers into the same mode and give better echo/noise handling,
      // especially when testing on the same machine with two browsers sharing speakers + mic.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:    { ideal: true },  // cancel speaker feedback into mic
          noiseSuppression:    { ideal: true },  // cut background noise
          autoGainControl:     { ideal: true },  // normalise volume levels
          sampleRate:          { ideal: 48000 }, // match Opus codec sample rate
          channelCount:        { ideal: 1 },     // mono is enough for voice, halves bandwidth
        },
        video: {
          width:     { ideal: 1280, max: 1920 },
          height:    { ideal: 720,  max: 1080 },
          frameRate: { ideal: 30,   max: 60   },
          facingMode: 'user',
        },
      })
      setLocalStream(stream)
      localStreamRef.current = stream   // keep stable ref for rejoin

      setParticipants(prev => {
        const next = new Map(prev)
        next.set(socketId, {
          socketId, name: displayName, stream,
          audioMuted: false, videoOff: false, isLocal: true,
        })
        return next
      })

      await createRecvTransport()

      const { producers } = await ws.request('getProducers', {})
      for (const pid of producers) await consumeProducer(pid)

      await createSendTransport(stream)
      setConnectionState('connected')

    } catch (err: any) {
      setError(err.message ?? 'Failed to join')
      setConnectionState('error')
    }
  }, [roomName, token, displayName, connectionState,
      consumeProducer, createRecvTransport, createSendTransport, rejoinRoom])

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    const track = localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = audioMuted
    producersRef.current.get('audio')?.[audioMuted ? 'resume' : 'pause']()
    setAudioMuted(m => !m)
  }, [audioMuted, localStream])

  const toggleVideo = useCallback(() => {
    const track = localStream?.getVideoTracks()[0]
    if (!track) return
    track.enabled = videoOff
    producersRef.current.get('video')?.[videoOff ? 'resume' : 'pause']()
    setVideoOff(v => !v)
  }, [videoOff, localStream])

  const leave = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    closeTransports()
    wsRef.current?.disconnect()
    wsRef.current        = null
    localStreamRef.current = null
    setLocalStream(null)
    setParticipants(new Map())
    setConnectionState('disconnected')
  }, [closeTransports])

  return {
    participants, connectionState, localStream,
    audioMuted, videoOff, error,
    join, leave, toggleAudio, toggleVideo,
  }
}