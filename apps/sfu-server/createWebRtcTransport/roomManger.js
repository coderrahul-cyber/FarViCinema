/**
 * roomManager.js
 * 
 * Owns all in-memory state that was previously global in app.js:
 *   rooms, peers, transports, producers, consumers
 * 
 * Exposes clean functions so server.js (REST layer) never touches state directly.
 */

let rooms      = {}   // { roomName: { router, peers: [socketId, ...] } }
let peers      = {}   // { socketId: { roomName, transports:[], producers:[], consumers:[] } }
let transports = []   // [{ socketId, roomName, transport, consumer(bool) }]
let producers  = []   // [{ socketId, roomName, producer }]
let consumers  = []   // [{ socketId, roomName, consumer }]

// ─── Rooms ───────────────────────────────────────────────────────────────────

/**
 * Returns the existing router for roomName, or creates a new one.
 * @param {string} roomName
 * @param {string} socketId
 * @param {import('mediasoup').types.Worker} worker
 * @param {Array} mediaCodecs
 * @returns {import('mediasoup').types.Router}
 */
const getOrCreateRoom = async (roomName, socketId, worker, mediaCodecs) => {
  let router
  let existingPeers = []

  if (rooms[roomName]) {
    router        = rooms[roomName].router
    existingPeers = rooms[roomName].peers || []
  } else {
    router = await worker.createRouter({ mediaCodecs })
    console.log(`[RoomManager] New router created. ID: ${router.id}`)
  }

  rooms[roomName] = {
    router,
    peers: [...existingPeers, socketId],
  }

  return router
}

const getRouter = (roomName) => {
  if (!rooms[roomName]) return null
  return rooms[roomName].router
}

const getRoomNameForPeer = (socketId) => {
  return peers[socketId]?.roomName ?? null
}

// ─── Peers ───────────────────────────────────────────────────────────────────

const addPeer = (socketId, roomName) => {
  peers[socketId] = {
    roomName,
    transports: [],
    producers:  [],
    consumers:  [],
  }
}

const removePeer = (socketId) => {
  const roomName = peers[socketId]?.roomName

  // close + remove transports
  transports = transports.filter(t => {
    if (t.socketId === socketId) {
      t.transport.close()
      return false
    }
    return true
  })

  // close + remove producers
  producers = producers.filter(p => {
    if (p.socketId === socketId) {
      p.producer.close()
      return false
    }
    return true
  })

  // close + remove consumers
  consumers = consumers.filter(c => {
    if (c.socketId === socketId) {
      c.consumer.close()
      return false
    }
    return true
  })

  delete peers[socketId]

  // remove peer from room list
  if (roomName && rooms[roomName]) {
    rooms[roomName] = {
      router: rooms[roomName].router,
      peers:  rooms[roomName].peers.filter(id => id !== socketId),
    }
  }

  console.log(`[RoomManager] Peer ${socketId} removed and cleaned up.`)
}

// ─── Transports ──────────────────────────────────────────────────────────────

const addTransport = (socketId, roomName, transport, isConsumer) => {
  transports.push({ socketId, roomName, transport, consumer: isConsumer })

  peers[socketId] = {
    ...peers[socketId],
    transports: [...peers[socketId].transports, transport.id],
  }
}

/**
 * Get the producer (send) transport for a socket.
 */
const getProducerTransport = (socketId) => {
  const found = transports.find(t => t.socketId === socketId && !t.consumer)
  return found?.transport ?? null
}

/**
 * Get a specific transport by its mediasoup transport ID.
 */
const getTransportById = (transportId) => {
  const found = transports.find(t => t.transport.id === transportId && t.consumer)
  return found?.transport ?? null
}

// ─── Producers ───────────────────────────────────────────────────────────────

const addProducer = (socketId, roomName, producer) => {
  producers.push({ socketId, roomName, producer })

  peers[socketId] = {
    ...peers[socketId],
    producers: [...peers[socketId].producers, producer.id],
  }
}

/**
 * Returns all producer IDs in a room EXCEPT the requesting socket's own producers.
 */
const getProducersInRoom = (roomName, excludeSocketId) => {
  return producers
    .filter(p => p.roomName === roomName && p.socketId !== excludeSocketId)
    .map(p => p.producer.id)
}

/**
 * Returns all OTHER peers' socketIds in a room (used for notifying new producer).
 */
const getOtherPeerSocketIds = (roomName, excludeSocketId) => {
  return producers
    .filter(p => p.roomName === roomName && p.socketId !== excludeSocketId)
    .map(p => p.socketId)
}

// ─── Consumers ───────────────────────────────────────────────────────────────

const addConsumer = (socketId, roomName, consumer) => {
  consumers.push({ socketId, roomName, consumer })

  peers[socketId] = {
    ...peers[socketId],
    consumers: [...peers[socketId].consumers, consumer.id],
  }
}

const getConsumerById = (consumerId) => {
  const found = consumers.find(c => c.consumer.id === consumerId)
  return found?.consumer ?? null
}

const removeConsumerTransport = (consumerTransportId) => {
  transports = transports.filter(t => t.transport.id !== consumerTransportId)
}

const removeConsumer = (consumerId) => {
  consumers = consumers.filter(c => c.consumer.id !== consumerId)
}


/**
 * Returns all producer IDs belonging to a specific peer.
 * Called before removePeer so we can notify WS server.
 */
const getProducersForPeer = (socketId) => {
  return producers
    .filter(p => p.socketId === socketId)
    .map(p => p.producer.id)
}

export {
  // rooms
  getOrCreateRoom,
  getRouter,
  getRoomNameForPeer,
  // peers
  addPeer,
  removePeer,
  // transports
  addTransport,
  getProducerTransport,
  getTransportById,
  removeConsumerTransport,
  // producers
  addProducer,
  getProducersForPeer,
  getProducersInRoom,
  getOtherPeerSocketIds,
  // consumers
  addConsumer,
  getConsumerById,
  removeConsumer,
}