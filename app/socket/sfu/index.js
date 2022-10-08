const mediasoupSevice = require('../../resources/v1/services/MediasoupService');
const validator = require('./validator');
const { BroadcastTypes } = require('../../utils/constant');

module.exports = (io, routePrefix) => {
  const socketIO = io.of(`${routePrefix}/socket/sfu`);

  socketIO.on('connection', (socket) => {
    const peerId = socket.handshake.query.peerId;

    console.log('=> Peer connected:', peerId, socket.id);

    socket.on('disconnect', async () => {
      console.log('=> Peer disconnected:', peerId, socket.id);
      await mediasoupSevice.handleDisconnectedPeer({ peerId, socket });
    });

    socket.on('inspect', async (body) => {
      console.log('=> Inspect:', body);
    });

    socket.on('getProducerStats', async (body, callback) => {
      const value = validator.getProducerStats(body);
      const stats = await mediasoupSevice.getProducerStats({ ...value });
      callback({ data: stats });
    });

    socket.on('subscribe', async (body, callback) => {
      const value = validator.subscribe(body);
      socket.join(value.roomId);
      callback({});
    });

    socket.on('createOrJoinRoom', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.createOrJoinRoom(body);
        const room = await mediasoupSevice.createOrJoinRoom({ ...value, socket });
        const data = {
          roomId: room.id,
          rtpCapabilities: room.router.rtpCapabilities
        };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('createRoom', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.createRoom(body);
        const room = await mediasoupSevice.createRoom({ ...value, socket });
        const data = {
          roomId: room.id,
          rtpCapabilities: room.router.rtpCapabilities
        };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('joinRoom', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.joinRoom(body);
        value.socket = socket;
        const room = await mediasoupSevice.joinRoom({ ...value });
        const data = {
          roomId: room.id,
          rtpCapabilities: room.router.rtpCapabilities
        };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('leaveRoom', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.leaveRoom(body);
        value.socket = socket;
        await mediasoupSevice.cleanUpPeer({ ...value });
        callback({ });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('createWebRtcTransport', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.createWebRtcTransport(body);
        const transport = await mediasoupSevice.createWebRtcTransport({ ...value });
        const data = {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
          // sctpParameters: transport.sctpParameters
        };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('connectWebRtcTransport', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.connectWebRtcTransport(body);
        await mediasoupSevice.connectWebRtcTransport(value);
        callback({});
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('produce', async (body, callback) => {
      const notifyOtherPeers = (peerId, producer) => {
        const peer = mediasoupSevice.getPeerById(peerId);
        socket.broadcast.to(peer.roomId).emit(BroadcastTypes.NewProducer, {
          _id: peerId,
          producers: [producer.id]
        });
      };

      try {
        body.peerId = peerId;
        const value = validator.produce(body);
        const producer = await mediasoupSevice.produce(value);
        await notifyOtherPeers(value.peerId, producer);
        const data = { producerId: producer.id };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('getOtherPeers', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.getOtherPeers(body);
        const peers = await mediasoupSevice.getOtherPeers(value);
        const data = { peers };
        callback({ data });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('consume', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.consume(body);
        const consumeData = await mediasoupSevice.consume(value);
        callback({ data: consumeData });
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('pipeConsume', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.pipeConsume({ ...body });
        const consumeData = await mediasoupSevice.pipeConsume(value);
        callback({ data: consumeData });
      } catch (error) {
        console.log(error);
        callback({ error: error.stack });
      }
    });

    socket.on('pauseConsumer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.pauseConsumer(body);
        await mediasoupSevice.pauseConsumer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('resumeConsumer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.resumeConsumer(body);
        await mediasoupSevice.resumeConsumer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('closeConsumer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.closeConsumer(body);
        await mediasoupSevice.closeConsumer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('pauseProducer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.pauseProducer(body);
        value.socket = socket;
        await mediasoupSevice.pauseProducer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('resumeProducer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.resumeProducer(body);
        value.socket = socket;
        await mediasoupSevice.resumeProducer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('closeProducer', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.closeProducer(body);
        value.socket = socket;
        await mediasoupSevice.closeProducer(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('closeTransport', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.closeTransport(body);
        await mediasoupSevice.closeTransport(value);
        callback({});
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });

    socket.on('restartIce', async (body, callback) => {
      try {
        body.peerId = peerId;
        const value = validator.restartIce(body);
        value.socketId = socket.id;
        const iceParameters = await mediasoupSevice.restartIce(value);
        const data = { iceParameters };
        callback({ data });
      } catch (error) {
        console.error(error);
        callback({ error: error.stack });
      }
    });
  });
  return socketIO;
};
