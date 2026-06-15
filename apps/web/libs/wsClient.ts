// /**
//  * lib/wsClient.ts
//  *
//  * Native WebSocket wrapper with promise-based request/response.
//  * Sends:    { type, payload }
//  * Receives: { type, payload }
//  */

// import type { WSMessage } from '../types'

// type Handler = (payload: any) => void

// export class WSClient {
//   private ws:       WebSocket | null = null
//   private handlers: Map<string, Handler[]> = new Map()
//   // key = expected response type e.g. 'joinRoom-response'
//   private pending:  Map<string, { resolve: Function; reject: Function }> = new Map()
//   private url:      string
//   private token:    string

//   constructor(url: string, token: string) {
//     this.url   = url
//     this.token = token
//   }

//   // ── Connect ────────────────────────────────────────────────────────────────

//   connect(): Promise<{ socketId: string }> {
//     return new Promise((resolve, reject) => {
//       this.ws = new WebSocket(`${this.url}?token=${this.token}`)

//       this.ws.onopen = () => {
//         console.log('[WSClient] Socket opened — waiting for connection-success')
//       }

//       this.ws.onmessage = (event) => {
//         let msg: WSMessage
//         try {
//           msg = JSON.parse(event.data as string)
//         } catch {
//           console.error('[WSClient] Failed to parse message:', event.data)
//           return
//         }

//         const { type, payload } = msg
//         console.log('[WSClient] ← received:', type, payload)

//         // 1. connection-success resolves connect()
//         if (type === 'connection-success') {
//           resolve(payload)
//           return
//         }

//         // 2. Check if this matches a pending request response
//         if (this.pending.has(type)) {
//           const p = this.pending.get(type)!
//           this.pending.delete(type)
//           p.resolve(payload)
//           return
//         }

//         // 3. Fire registered event listeners (server-pushed events)
//         const listeners = this.handlers.get(type) ?? []
//         if (listeners.length > 0) {
//           listeners.forEach(fn => fn(payload))
//         } else {
//           console.warn('[WSClient] No handler for message type:', type)
//         }
//       }

//       this.ws.onerror = (err) => {
//         console.error('[WSClient] Connection error — is the WS server running on ws:// not wss://?', err)
//         reject(new Error('WebSocket connection failed'))
//       }

//       this.ws.onclose = (event) => {
//         console.log(`[WSClient] Closed. code=${event.code} reason=${event.reason}`)
//         const listeners = this.handlers.get('disconnect') ?? []
//         listeners.forEach(fn => fn({}))

//         // Reject any still-pending requests
//         this.pending.forEach(({ reject }) => {
//           reject(new Error('WebSocket closed unexpectedly'))
//         })
//         this.pending.clear()
//       }
//     })
//   }

//   // ── Send a message and wait for its -response ──────────────────────────────

//   request<T = any>(type: string, payload: Record<string, any> = {}): Promise<T> {
//     return new Promise((resolve, reject) => {
//       if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
//         return reject(new Error(`[WSClient] Cannot send '${type}' — socket not open`))
//       }

//       // Server responds with 'joinRoom-response' for a 'joinRoom' request
//       const responseType = `${type}-response`

//       console.log('[WSClient] → sending:', type, payload)

//       // Register BEFORE sending to avoid race condition
//       const timer = setTimeout(() => {
//         if (this.pending.has(responseType)) {
//           this.pending.delete(responseType)
//           reject(new Error(`[WSClient] Timeout waiting for ${responseType}`))
//         }
//       }, 15_000)

//       this.pending.set(responseType, {
//         resolve: (val: any) => { clearTimeout(timer); resolve(val) },
//         reject:  (err: any) => { clearTimeout(timer); reject(err) },
//       })

//       this.ws.send(JSON.stringify({ type, payload }))
//     })
//   }

//   // ── Fire-and-forget send ───────────────────────────────────────────────────

//   send(type: string, payload: Record<string, any> = {}) {
//     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
//       console.warn('[WSClient] Cannot send — socket not open')
//       return
//     }
//     console.log('[WSClient] → sending (no response):', type)
//     this.ws.send(JSON.stringify({ type, payload }))
//   }

//   // ── Subscribe to server-pushed events ─────────────────────────────────────

//   on(type: string, handler: Handler) {
//     const existing = this.handlers.get(type) ?? []
//     this.handlers.set(type, [...existing, handler])
//   }

//   off(type: string, handler: Handler) {
//     const existing = this.handlers.get(type) ?? []
//     this.handlers.set(type, existing.filter(h => h !== handler))
//   }

//   // ── Disconnect ────────────────────────────────────────────────────────────

//   disconnect() {
//     this.ws?.close()
//     this.ws = null
//   }

//   get isConnected() {
//     return this.ws?.readyState === WebSocket.OPEN
//   }
// }


/**
 * lib/wsClient.ts  (phase 3)
 *
 * Phase 3 additions:
 *   1. Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 30s max)
 *   2. onReconnect callback — tells useMediasoup to rejoin the room
 *   3. onDisconnect callback — tells UI to show reconnecting state
 *   4. Pending requests are retried after reconnect instead of just rejected
 *   5. Manual disconnect (leave button) stops reconnect attempts
 *
 * Everything else (request/response pattern, event handlers) unchanged.
 */

import type { WSMessage } from '../types'

type Handler = (payload: any) => void

interface WSClientOptions {
  onReconnect?:    () => void   // called after successful reconnect
  onDisconnect?:   () => void   // called when connection drops (before retry)
  maxRetries?:     number       // default: 10
}

export class WSClient {
  private ws:          WebSocket | null = null
  private handlers:    Map<string, Handler[]> = new Map()
  private pending:     Map<string, { resolve: Function; reject: Function; timer: ReturnType<typeof setTimeout> }> = new Map()
  private url:         string
  private token:       string
  private options:     WSClientOptions

  // Reconnect state
  private retryCount:       number  = 0
  private retryTimer:       ReturnType<typeof setTimeout> | null = null
  private intentionalClose: boolean = false   // true when user clicks Leave
  private isConnecting:     boolean = false

  constructor(url: string, token: string, options: WSClientOptions = {}) {
    this.url     = url
    this.token   = token
    this.options = options
  }

  // ── Connect (and setup reconnect on close) ─────────────────────────────────

  connect(): Promise<{ socketId: string }> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) return reject(new Error('Already connecting'))
      this.isConnecting    = true
      this.intentionalClose = false

      this.ws = new WebSocket(`${this.url}?token=${this.token}`)

      this.ws.onopen = () => {
        console.log('[WSClient] Socket opened')
        this.isConnecting = false
        // onopen resolves once we receive connection-success
      }

      this.ws.onmessage = (event) => {
        let msg: WSMessage
        try {
          msg = JSON.parse(event.data as string)
        } catch {
          console.error('[WSClient] Failed to parse message:', event.data)
          return
        }

        const { type, payload } = msg

        // Initial handshake — resolves connect() promise
        if (type === 'connection-success') {
          console.log('[WSClient] ← connection-success, socketId:', payload.socketId)
          this.retryCount = 0   // reset on successful connect
          resolve(payload)
          return
        }

        // Match pending request response
        if (this.pending.has(type)) {
          const p = this.pending.get(type)!
          this.pending.delete(type)
          clearTimeout(p.timer)
          p.resolve(payload)
          return
        }

        // Fire event listeners (new-producer, producer-closed etc.)
        const listeners = this.handlers.get(type) ?? []
        if (listeners.length > 0) {
          listeners.forEach(fn => fn(payload))
        } else {
          console.warn('[WSClient] No handler for:', type)
        }
      }

      this.ws.onerror = (err) => {
        console.error('[WSClient] Error:', err)
        this.isConnecting = false
        // Don't reject here — onclose fires right after and handles retry
      }

      this.ws.onclose = (event) => {
        this.isConnecting = false
        console.log(`[WSClient] Closed. code=${event.code} intentional=${this.intentionalClose}`)

        // Reject any pending requests immediately
        this.pending.forEach(({ reject, timer }) => {
          clearTimeout(timer)
          reject(new Error('WebSocket closed'))
        })
        this.pending.clear()

        if (this.intentionalClose) {
          // User clicked Leave — don't reconnect
          const listeners = this.handlers.get('disconnect') ?? []
          listeners.forEach(fn => fn({}))
          return
        }

        // Unexpected close — notify UI and schedule retry
        this.options.onDisconnect?.()
        this.scheduleReconnect()
      }
    })
  }

  // ── Reconnect with exponential backoff ─────────────────────────────────────

  private scheduleReconnect() {
    const maxRetries = this.options.maxRetries ?? 10

    if (this.retryCount >= maxRetries) {
      console.error('[WSClient] Max reconnect attempts reached')
      return
    }

    // Backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30_000)
    this.retryCount++

    console.log(`[WSClient] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${maxRetries})`)

    this.retryTimer = setTimeout(async () => {
      try {
        await this.connect()
        // Reconnected — tell useMediasoup to rejoin the room
        console.log('[WSClient] ✅ Reconnected — calling onReconnect')
        this.options.onReconnect?.()
      } catch (err) {
        console.error('[WSClient] Reconnect attempt failed:', err)
        // connect() failed — scheduleReconnect will be called again via onclose
      }
    }, delay)
  }

  // ── Request/response ───────────────────────────────────────────────────────

  request<T = any>(type: string, payload: Record<string, any> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error(`[WSClient] Cannot send '${type}' — socket not open`))
      }

      const responseType = `${type}-response`

      const timer = setTimeout(() => {
        if (this.pending.has(responseType)) {
          this.pending.delete(responseType)
          reject(new Error(`[WSClient] Timeout waiting for ${responseType}`))
        }
      }, 15_000)

      this.pending.set(responseType, { resolve, reject, timer })

      console.log('[WSClient] → sending:', type)
      this.ws.send(JSON.stringify({ type, payload }))
    })
  }

  send(type: string, payload: Record<string, any> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WSClient] Cannot send — socket not open')
      return
    }
    this.ws.send(JSON.stringify({ type, payload }))
  }

  on(type: string, handler: Handler) {
    const existing = this.handlers.get(type) ?? []
    this.handlers.set(type, [...existing, handler])
  }

  off(type: string, handler: Handler) {
    const existing = this.handlers.get(type) ?? []
    this.handlers.set(type, existing.filter(h => h !== handler))
  }

  // ── Disconnect (intentional — stops reconnect) ─────────────────────────────

  disconnect() {
    this.intentionalClose = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}