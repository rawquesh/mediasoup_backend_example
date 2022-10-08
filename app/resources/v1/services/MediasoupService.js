const publicIp = require('public-ip');
const os = require('os');
const mediasoup = require('mediasoup');
const { io } = require('socket.io-client');
const Peer = require('../models/classes/Peer');
const Room = require('../models/classes/Room');
const RoomDB = require('../models/Room');
const PeerDB = require('../models/Peer');
const ecsUtil = require('../../../utils/ecs');
const mediasoupConfig = require('../../../config/mediasoupConfig');
const { BroadcastTypes } = require('../../../utils/constant');

const ifaces = os.networkInterfaces();
let nextMediasoupWorkerIdx = 0;
let ecsTaskId = null;
let serverIp;
const roomMap = new Map();
const peerMap = new Map();
const transportMap = new Map();
const pipeTransportMap = new Map();
const producerMap = new Map();
const producerPeerMap = new Map();
const consumerMap = new Map();
const workers = [];

const getLocalIP = () => {
  const ip = ifaces.en0.find(e => e.family === 'IPv4')?.address;
  return ip;
};

const getPublicIP = async () => {
  const ip = await publicIp.v4();
  return ip;
};

const getAvailableWorker = () => {
  const worker = workers[nextMediasoupWorkerIdx];
  if (++nextMediasoupWorkerIdx === workers.length) { nextMediasoupWorkerIdx = 0; }
  return worker;
};

const setupAudioObserver = async ({ roomId, router }) => {
  const room = roomMap.get(roomId);
  room.audioLevelObserver = await createAudioLevelObserver({ roomId, router });
  room.activeSpeakerObserver = await createActiveSpeakerObserver({ roomId, router });
  roomMap.set(room);
};

const createAudioLevelObserver = async ({ roomId, router }) => {
  const audioLevelObserver = await router.createAudioLevelObserver({
    maxEntries: 1,
    threshold: -120,
    interval: 800
  });

  audioLevelObserver.on('volumes', (volumes) => {
    const audioLevels = volumes.map(e => {
      const peer = producerPeerMap.get(e.producer.id);
      return {
        peerId: peer.id,
        producerId: e.producer.id,
        volume: e.volume,
        volumeUnit: 'dBvo'
      };
    });
    SocketIO.SFU.to(roomId).emit(BroadcastTypes.AudioLevel, audioLevels);
    // console.log(`=> AudioLevel volumes: ${JSON.stringify(audioLevels)}`);
  });

  audioLevelObserver.on('silence', () => {
    SocketIO.SFU.to(roomId).emit(BroadcastTypes.AudioSilence, {});
  });

  return audioLevelObserver;
};

const createActiveSpeakerObserver = async ({ roomId, router }) => {
  const activeSpeakerObserver = await router.createActiveSpeakerObserver();

  activeSpeakerObserver.on('dominantspeaker', (dominantSpeaker) => {
    const peer = producerPeerMap.get(dominantSpeaker.producer.id);
    SocketIO.SFU.to(roomId).emit(BroadcastTypes.ActiveSpeaker, { peerId: peer.id });
    console.log(`=> Active Speaker: ${peer.id}`);
  });

  return activeSpeakerObserver;
};

exports.createOrJoinRoom = async ({ peerId, roomId, socket }) => {
  let room;
  const roomDb = await RoomDB.findById(roomId);
  if (!roomDb) {
    room = await module.exports.createRoom({ peerId, roomId });
  } else {
    room = await module.exports.joinRoom({ roomId, peerId, socket });
  }
  return room;
};

exports.createRoom = async ({ peerId, roomId }) => {
  const worker = getAvailableWorker();
  const router = await worker.createRouter(mediasoupConfig.routerOptions);

  await RoomDB.deleteOne({ _id: roomId });
  const roomDb = await RoomDB.create({ _id: roomId, peers: [peerId] });

  const room = new Room({ id: roomDb.id, router });
  roomMap.set(room.id, room);

  await PeerDB.deleteOne({ _id: peerId });
  const peerDb = await PeerDB.create({
    _id: peerId,
    room: roomDb._id,
    ecsTaskId,
    serverIp,
    serverPort: process.env.HOST_PORT,
    connected: true
  });

  const peer = new Peer({ id: peerDb._id, roomId: room.id });
  peerMap.set(peer.id, peer);

  setupAudioObserver({ roomId: room.id, router });

  console.log('=> Created room: ', room.id);
  return room;
};

exports.joinRoom = async ({ roomId, peerId, socket }) => {
  const roomDb = await RoomDB.findById(roomId);
  let room = roomMap.get(roomId);
  if (!roomDb) throw new Error('Room does not exist.');
  if (roomDb && !room) {
    const worker = getAvailableWorker();
    const router = await worker.createRouter(mediasoupConfig.routerOptions);
    room = new Room({ id: roomDb.id, router });
    roomMap.set(room.id, room);
  }
  await PeerDB.deleteOne({ _id: peerId });
  const peerDb = await PeerDB.create({
    _id: peerId,
    room: roomDb._id,
    ecsTaskId,
    serverIp,
    serverPort: process.env.HOST_PORT,
    connected: true
  });
  const peer = new Peer({ id: peerDb._id, roomId: room.id });
  peerMap.set(peer.id, peer);
  await roomDb.updateOne({ $push: { peers: peerId } });
  socket.broadcast.to(peer.roomId).emit(BroadcastTypes.PeerJoined, {
    peerId,
    roomId: peer.roomId,
  });

  setupAudioObserver({ roomId: room.id, router: room.router });

  console.log('=> Joined room: ', room.id);
  return room;
};

const cleanUpTransport = async (peerId, transportId) => {
  transportMap.delete(transportId);
  await PeerDB.updateOne(
    { _id: peerId },
    {
      $pull: { transports: transportId }
    }
  );
};

exports.createWebRtcTransport = async ({ peerId }) => {
  const peer = peerMap.get(peerId);
  if (!peer) throw new Error('Peer does not exist.');
  const room = roomMap.get(peer.roomId);
  if (!room) throw new Error('Peer does not exist.');
  const router = room.router;
  const transport = await router.createWebRtcTransport(mediasoupConfig.webRtcTransportOptions);

  transport.observer.on('routerclose', () => {
    console.log('=> Transport: routerclose');
  });

  transport.observer.on('icestatechange', (iceState) => {
    console.log(`=> Transport: icestatechange: ${iceState}`);
  });

  transport.observer.on('iceselectedtuplechange', (iceSelectedTuple) => {
    console.log(`=> Transport: iceselectedtuplechange: ${iceSelectedTuple}`);
  });

  transport.observer.on('dtlsstatechange', (dtlsState) => {
    console.log(`=> Transport: dtlsstatechange: ${dtlsState}`);
    if (dtlsState === 'closed') {
      // transport?.close();
    }
  });

  transport.observer.on('sctpstatechange', (sctpState) => {
    console.log(`=> Transport: dtlsstatechange: ${sctpState}`);
  });

  transport.observer.on('close', () => {
    console.log('=> Transport: close');
    cleanUpTransport(peerId, transport.id);
  });

  transport.observer.on('newproducer', (producer) => {
    console.log('=> Transport: newproducer');
  });

  transport.observer.on('newconsumer', (consumer) => {
    console.log('=> Transport: newconsumer');
  });

  transport.observer.on('trace', (trace) => {
    console.log('=> Transport: trace');
  });

  console.log('=> Created WebRtcTransport:', transport.id);
  transportMap.set(transport.id, transport);

  await PeerDB.updateOne(
    { _id: peerId },
    {
      $push: {
        transports: transport.id
      }
    }
  );

  return transport;
};

exports.connectWebRtcTransport = async ({ transportId, dtlsParameters }) => {
  const transport = transportMap.get(transportId);
  if (!transport) throw new Error('Transport does not exist.');
  await transport.connect({ dtlsParameters });
  console.log('=> Connected WebRtcTransport:', transport.id);
};

const cleanUpProducer = async (peerId, producerId) => {
  // const peer = peerMap.get(peerId);
  // if (!peer) return;

  // const room = roomMap.get(peer.roomId);
  // if (!room) return;

  // const producer = producerMap.get(producerId);
  // if (!producer) return;

  // if (producer.kind === 'audio') {
  //   room.audioLevelObserver?.removeProducer(producer.id);
  //   room.activeSpeakerObserver?.removeProducer(producer.id);
  // }

  producerMap.delete(producerId);
  await PeerDB.updateOne(
    { _id: peerId },
    {
      $pull: { producers: producerId }
    }
  );
};

const handlePeerOrientationChanged = async ({ peerId, videoOrientation }) => {
  const peer = peerMap.get(peerId);
  SocketIO.SFU.to(peer.roomId).emit(BroadcastTypes.PeerVideoOrientationChanged, { peerId, videoOrientation });
};

exports.produce = async ({ peerId, transportId, produceParams }) => {
  const peer = peerMap.get(peerId);
  if (!peer) throw Error('Peer not found.');

  const room = roomMap.get(peer.roomId);
  if (!room) throw new Error('Room not found.');

  const transport = transportMap.get(transportId);
  const producer = await transport.produce(produceParams);

  producer.on('transportclose', () => {
    console.log('=> Producer: transportclose');
    producer?.close();
  });

  producer.observer.on('close', () => {
    console.log('=> Producer: close');
    cleanUpProducer(peerId, producer.id);
  });

  producer.observer.on('score', (score) => {
    // console.log(`=> Producer: score, Peer ${peerId}, Transport ${transportId}`, score);
  });

  producer.observer.on('pause', () => {
    console.log('=> Producer: pause');
  });

  producer.observer.on('resume', () => {
    console.log('=> Producer: resume');
  });

  producer.on('videoorientationchange', (videoOrientation) => {
    console.log(`=> Producer: videoorientationchange ${JSON.stringify(videoOrientation)}`);
    handlePeerOrientationChanged({ peerId, videoOrientation });
  });

  producer.observer.on('trace', (videoOrientation) => {
    console.log(`=> Producer: trace ${videoOrientation}`);
  });

  producerMap.set(producer.id, producer);
  producerPeerMap.set(producer.id, peer);

  await PeerDB.updateOne(
    { _id: peerId },
    {
      $push: {
        producers: producer.id
      }
    }
  );

  // setTimeout(async () => {
  if (producer.kind === 'audio') {
    await room.audioLevelObserver.addProducer({ producerId: producer.id });
    await room.activeSpeakerObserver.addProducer({ producerId: producer.id });
  }
  // }, 5000);

  console.log('=> Produced', producer.id);
  return producer;
};

const cleanUpConsumer = async (peerId, consumerId) => {
  consumerMap.delete(consumerId);
  await PeerDB.updateOne(
    { _id: peerId },
    {
      $pull: { consumers: consumerId }
    }
  );
};

const setupConsumerObserver = async (peerId, consumer) => {
  consumer.observer.on('close', () => {
    console.log('=> Consumer: closed');
    cleanUpConsumer(peerId, consumer.id);
  });

  consumer.on('transportclose', () => {
    console.log('=> Consumer: transportclose');
  });

  consumer.on('producerclose', () => {
    console.log('=> Consumer: producerclose');
    consumer?.close();
  });

  consumer.on('producerpause', () => {
    console.log('=> Consumer: producerpause');
  });

  consumer.on('producerresume', () => {
    console.log('=> Consumer: producerresume');
  });

  consumer.on('score', (score) => {
    // console.log(`=> Consumer: score , Consumer ${consumer.id}`, score);
  });

  consumer.on('layerschange', (layers) => {
    console.log(`=> Consumer: layerschange ${JSON.stringify(layers)}`);
  });

  consumer.on('trace', (trace) => {
    console.log(`=> Consumer: trace ${trace}`);
  });
};

const consumeFromLocalHost = async ({ peerId, router, transport, producerId, rtpCapabilities }) => {
  const isCanConsumer = router.canConsume({ producerId: producerId, rtpCapabilities });
  if (isCanConsumer) {
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true
    });

    setupConsumerObserver(peerId, consumer);

    return consumer;
  } else {
    console.log('=> Can\'t consume a producer:', producerId);
    throw new Error('Can\'t consume a producer');
  }
};

const consumeFromRemoteHost = async ({ peerId, targetPeerDb, router, transport, producerId, rtpCapabilities }) => {
  const SOCKET_URL = `http://${targetPeerDb.serverIp}:${targetPeerDb.serverPort}/call/socket/sfu`;
  const socket = io(SOCKET_URL, {
    auth: {
      deviceId: 'pipe-agent'
    },
    reconnection: false
  });
  socket.on('connect', () => console.log('=> Pipe Socket: connected successfully'));
  socket.on('connect_error', (error) => console.log('=> Pipe Socket: failed to connect', error));
  const localPipeTransport = await router.createPipeTransport({
    listenIps: mediasoupConfig.listenIps,
    enableSctp: true,
    numSctpStreams: { OS: 1024, MIS: 1024 },
    enableRtx: false,
    enableSrtp: false
  });
  pipeTransportMap.set(localPipeTransport.id, localPipeTransport);

  const pipeConsumePromise = new Promise((resolve, reject) => {
    socket.emit('pipeConsume', {
      producerId,
      ip: localPipeTransport.tuple.localIp,
      port: localPipeTransport.tuple.localPort
    }, async (response) => {
      console.log('pipeConsume', response);
      const { ip, port, pipeConsumer } = response.data;

      try {
        await localPipeTransport.connect({ ip, port });
        const pipeProducer = await localPipeTransport.produce({
          id: producerId,
          kind: pipeConsumer.kind,
          rtpParameters: pipeConsumer.rtpParameters,
          paused: pipeConsumer.producerPaused
        });

        producerMap.set(pipeProducer.id, pipeProducer);

        const isCanConsumer = router.canConsume({ producerId, rtpCapabilities });
        if (isCanConsumer) {
          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true
          });

          setupConsumerObserver(peerId, consumer);

          resolve(consumer);
        } else {
          console.log('=> Can\'t consume a producer:', producerId);
        }
      } catch (err) {
        reject(err);
      }
    });
  });
  const consumeResult = await pipeConsumePromise;
  return consumeResult;
};

exports.consume = async ({ peerId, producerId, transportId, rtpCapabilities }) => {
  const peer = peerMap.get(peerId);
  const roomId = peer.roomId;
  const room = roomMap.get(roomId);
  const router = room.router;
  const targetPeer = producerPeerMap.get(producerId);
  const targetPeerDb = await PeerDB.findById(targetPeer.id);
  if (!targetPeerDb.producers.includes(producerId)) { throw new Error('Producer doesn\'t exist or removed'); }
  const transport = transportMap.get(transportId);
  if (!transport) throw new Error('Web RTC Transport does not exist.');

  const producer = producerMap.get(producerId);
  const isProducerInTheSameHost = targetPeerDb.ecsTaskId === ecsTaskId;
  const isProducerInRemoteHostButAlreadyPiped = !isProducerInTheSameHost && producer;

  let consumer;
  if (isProducerInTheSameHost || isProducerInRemoteHostButAlreadyPiped) {
    console.log('=> Consume without PipeTransport');
    consumer = await consumeFromLocalHost({ peerId, roomId, router, transport, producerId, transportId, rtpCapabilities });
  } else {
    console.log('=> Consume with PipeTransport');
    consumer = await consumeFromRemoteHost({ peerId, targetPeerDb, router, transport, producerId, rtpCapabilities });
  }

  consumerMap.set(consumer.id, consumer);
  await PeerDB.updateOne(
    { _id: peerId },
    {
      $push: {
        consumers: consumer.id
      }
    }
  );
  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
  };
};

exports.handleDisconnectedPeer = async ({ peerId, socket }) => {
  await PeerDB.updateOne({ _id: peerId }, { $set: { connected: false } });
  setTimeout(async () => {
    const peerDb = await PeerDB.findById(peerId);
    if (!peerDb || peerDb.connected === false) {
      module.exports.cleanUpPeer({ peerId, socket });
    }
  }, 15000);
};

exports.cleanUpPeer = async ({ peerId, socket }) => {
  console.log('=> Cleaning up peer...');
  const peer = peerMap.get(peerId);
  if (!peer) return;

  let roomDb = await RoomDB.findById(peer.roomId);
  if (!roomDb) return;

  const room = roomMap.get(peer.roomId);
  if (!room) return;

  const peerDb = await PeerDB.findById(peerId);
  if (!peerDb) return;
  // close all producers that associcated with peer
  for (const producerId of peerDb.producers) {
    const producer = producerMap.get(producerId);
    producer?.close();
  }

  // close all consumers that associcated with peer
  for (const consumerId of peerDb.consumers) {
    const consumer = consumerMap.get(consumerId);
    consumer?.close();
  }

  // close all transports that associcated with peer
  for (const transportId of peerDb.transports) {
    const transport = transportMap.get(transportId);
    transport?.close();
  }

  peerMap.delete(peerId);
  await peerDb.remove();

  // remove peer from room
  roomDb = await RoomDB.findOneAndUpdate({ _id: roomDb._id }, { $pull: { peers: peerId } }, { new: true });

  // if all peers are left => remove the room
  if (roomDb.peers.length < 1) {
    await roomDb.remove();
    room?.router?.close();
    roomMap.delete(room.id);
  }
  socket.broadcast.to(roomDb.id).emit(BroadcastTypes.PeerLeft, { peerId });

  return { roomId: roomDb.id };
};

exports.getOtherPeers = async ({ peerId }) => {
  const me = await PeerDB.findById(peerId);
  const peers = await PeerDB.find({ _id: { $ne: peerId }, room: me.room });
  return peers;
};

exports.pipeConsume = async ({ producerId, ip, port }) => {
  const peerDb = await PeerDB.findOne({ producers: producerId });
  if (!peerDb) throw new Error('Peer does not exist in DB.');
  const room = roomMap.get(peerDb.room.toString());
  if (!room) throw new Error('Room does not exist.');
  const router = room.router;

  const pipeTransport = await router.createPipeTransport({
    listenIps: mediasoupConfig.listenIps,
    enableSctp: true,
    numSctpStreams: { OS: 1024, MIS: 1024 },
    enableRtx: false,
    enableSrtp: false
  });
  await pipeTransport.connect({ ip, port });
  const pipeConsumer = await pipeTransport.consume({ producerId });
  return {
    ip: pipeTransport.tuple.localIp,
    port: pipeTransport.tuple.localPort,
    pipeConsumer: {
      kind: pipeConsumer.kind,
      rtpParameters: pipeConsumer.rtpParameters,
      paused: pipeConsumer.producerPaused
    }
  };
};

exports.pauseConsumer = async ({ consumerId }) => {
  const consumer = consumerMap.get(consumerId);
  await consumer?.pause();
  console.log('=> Consumer paused:', consumerId);
};

exports.resumeConsumer = async ({ consumerId }) => {
  const consumer = consumerMap.get(consumerId);
  await consumer?.resume();
  console.log('=> Consumer resumed:', consumerId);
};

exports.closeConsumer = async ({ consumerId }) => {
  const consumer = consumerMap.get(consumerId);
  await consumer?.close();
  console.log('=> Consumer closed:', consumerId);
};

exports.pauseProducer = async ({ peerId, producerId, socket }) => {
  const peer = peerMap.get(peerId);
  const producer = producerMap.get(producerId);
  if (!producer) { throw new Error('No producer found.'); }
  await producer.pause();
  socket.broadcast.to(peer.roomId).emit(BroadcastTypes.PeerPausedProducer, {
    peerId,
    producerId: producer.id,
    producerKind: producer.kind
  });
  console.log('=> Producer paused:', producerId);
};

exports.resumeProducer = async ({ peerId, producerId, socket }) => {
  const peer = peerMap.get(peerId);
  const producer = producerMap.get(producerId);
  if (!producer) { throw new Error('No producer found.'); }
  await producer.resume();
  socket.broadcast.to(peer.roomId).emit(BroadcastTypes.PeerResumedProducer, {
    peerId,
    producerId: producer.id,
    producerKind: producer.kind
  });
  console.log('=> Producer resumed:', producerId);
};

exports.closeProducer = async ({ peerId, producerId, socket }) => {
  const peer = peerMap.get(peerId);
  const producer = producerMap.get(producerId);
  if (!producer) { throw new Error('No producer found.'); }
  producer.close();
  producerMap.delete(producerId);
  await PeerDB.updateOne(
    {
      _id: peerId
    },
    {
      $pull: {
        producers: producerId
      }
    }
  );

  socket.broadcast.to(peer.roomId).emit(BroadcastTypes.PeerClosedProducer, {
    peerId,
    producerId: producer.id,
    producerKind: producer.kind
  });
  console.log('=> Producer closed:', producerId);
};

exports.closeTransport = async ({ transportId }) => {
  const transport = transportMap.get(transportId);
  await transport?.close();
  console.log('=> Transport closed:', transportId);
};

exports.restartIce = async ({ transportId, socketId }) => {
  const transport = transportMap.get(transportId);
  if (!transport) throw new Error('Transport does not exist.');
  const iceParameters = await transport.restartIce();
  console.log('=> Ice restarted for transport:', transportId, socketId);
  console.log(transport.id);
  return iceParameters;
};

exports.getPeerById = (peerId) => {
  return peerMap.get(peerId);
};

exports.getProducerStats = async ({ producerId }) => {
  const producer = producerMap.get(producerId);
  if (!producer) throw new Error('Producer not found');
  const stats = await producer.getStats();
  return stats;
};

exports.getRoom = async ({ roomId }) => {
  const roomDb = await RoomDB.findById(roomId);
  return roomDb;
};

const runMediasoupWorkers = async () => {
  const { numWorkers } = mediasoupConfig;
  console.info('running %d mediasoup Workers...', numWorkers);

  for (let i = 0; i < numWorkers; ++i) {
    const worker = await mediasoup.createWorker({
      logLevel: mediasoupConfig.workerSettings.logLevel,
      logTags: mediasoupConfig.workerSettings.logTags,
      rtcMinPort: Number(mediasoupConfig.workerSettings.rtcMinPort),
      rtcMaxPort: Number(mediasoupConfig.workerSettings.rtcMaxPort)
    });

    worker.on('died', (error) => {
      console.log(error);
      console.error('=> Worker: died, exiting in 2 seconds... [pid:%d]', worker.pid);
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);

    // Log worker resource usage every X seconds.
    // setInterval(async () => {
    //   const usage = await worker.getResourceUsage();
    //   console.info('mediasoup Worker resource usage [pid:%d]: %o', worker.pid, usage);
    // }, 120000);
  }
  return workers;
};

exports.cleanUpOnInstanceTerminate = async () => {
  const peers = await PeerDB.find({ ecsTaskId });
  for (const peer of peers) {
    await peer.remove();
    await RoomDB.updateOne({ _id: peer.room }, { $pull: { peers: peer._id } });
    SocketIO.SFU.to(peer.room.toString()).emit(BroadcastTypes.PeerLeft, { peerId: peer._id });
  }
};

exports.run = async () => {
  ecsTaskId = await ecsUtil.getTaskId();
  serverIp = process.env.NODE_ENV === 'local' ? getLocalIP() : await getPublicIP();
  mediasoupConfig.listenIps = [{ ip: '0.0.0.0', announcedIp: serverIp }];
  mediasoupConfig.webRtcTransportOptions.listenIps = mediasoupConfig.listenIps;
  await runMediasoupWorkers();
};
