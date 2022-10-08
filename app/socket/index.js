const socketServer = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const sfu = require('./sfu');

exports.startSocketServer = async (httpServer, routePrefix) => {
  const io = socketServer(httpServer, {
    path: `${routePrefix}/socket`,
    cors: { origin: '*' },
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || 20000),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || 25000)
  });

  const REDIS_URL = `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
  });

  const sfuNspace = sfu(io, routePrefix);
  
  // set to global to be accessible everywhere
  global.SocketIO = {
    SFU: sfuNspace,
    Main: io
  };
};
