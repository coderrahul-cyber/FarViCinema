// /**
//  * webhookEmitter.js  —  mediasoup-server
//  *
//  * When a producer closes (peer left, transport died), mediasoup has no
//  * socket access. This module fires an HTTP POST to the Bun WS server
//  * so it can push 'producer-closed' to all affected consumers.
//  */

// const WS_SERVER_URL    = process.env.WS_SERVER_URL    || 'https://localhost:8080'
// const WEBHOOK_SECRET   = process.env.WEBHOOK_SECRET   || ''

// /**
//  * Notify the WS server that a producer has closed.
//  * Non-blocking — fire and forget with error logging.
//  *
//  * @param {string} producerId
//  * @param {string} roomName
// */


// export const emitProducerClosed = (producerId, roomName) => {

//   const url = `${WS_SERVER_URL}/webhook/producer-closed`;
//   fetch(url, {
//     method:  'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body:    JSON.stringify({ producerId, roomName, secret: WEBHOOK_SECRET }),
//     // @ts-ignore — Node fetch / undici option for self-signed certs
//     dispatcher: undefined, // if needed, use undici Agent with rejectUnauthorized: false
//   })
//     .then(res => {
//       if (!res.ok) {
//         res.json().then(err =>
//           console.error(`[WebhookEmitter] Failed: ${res.status}`, err)
//         )
//       } else {
//         console.log(`[WebhookEmitter] producer-closed sent: producerId=${producerId}`)
//       }
//     })
//     .catch(err => {
//       console.error('[WebhookEmitter] Network error sending webhook:', err.message)
//     })
// }


/**
 * webhookEmitter.js  —  mediasoup-server
 *
 * When a producer closes (peer left, transport died), mediasoup has no
 * socket access. This module fires an HTTP POST to the Bun WS server
 * so it can push 'producer-closed' to all affected consumers.
 */

const WS_SERVER_URL    = process.env.WS_SERVER_URL    || 'https://localhost:8080'
const WEBHOOK_SECRET   = process.env.WEBHOOK_SECRET   || ''

/**
 * Notify the WS server that a producer has closed.
 * Non-blocking — fire and forget with error logging.
 *
 * @param {string} producerId
 * @param {string} roomName
 */
export const emitProducerClosed = (producerId, roomName) => {
  const url = `${WS_SERVER_URL}/webhook/producer-closed`

  // DEBUG — log every time this fires
  console.log(`[DEBUG-Emitter] ▶ firing webhook: url=${url} producerId=${producerId} room=${roomName} secret=${WEBHOOK_SECRET ? '✓set' : '✗EMPTY'}`)

  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ producerId, roomName, secret: WEBHOOK_SECRET }),
    dispatcher: undefined,
  })
    .then(res => {
      console.log(`[DEBUG-Emitter] ◀ webhook response: HTTP ${res.status}`)
      if (!res.ok) {
        res.json().then(err =>
          console.error(`[DEBUG-Emitter] ✗ webhook rejected:`, err)
        )
      } else {
        console.log(`[DEBUG-Emitter] ✓ webhook accepted for producerId=${producerId}`)
      }
    })
    .catch(err => {
      console.error(`[DEBUG-Emitter] ✗ NETWORK ERROR — cannot reach ${url}:`, err.message)
      console.error(`[DEBUG-Emitter]   Check: is ws-server running? Is WS_SERVER_URL correct? (current: ${WS_SERVER_URL})`)
    })
}