
require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const nunjucks = require('nunjucks');
const cors = require('cors');
const expressRateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongodb = require('./app/db/mongodb');
const { startSocketServer } = require('./app/socket');
const mediasoupService = require('./app/resources/v1/services/MediasoupService');

process.on('SIGTERM', async () => {
  await mediasoupService.cleanUpOnInstanceTerminate();
  process.exit(0);
});

const run = async () => {
  const ROUTE_PREFIX = '/call';
  const app = express();
  const httpServer = http.createServer(app);

  app.set('port', process.env.HOST_PORT || 3000);
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev', {
    skip: (req, res) => (res.statusCode < 400)
  }));

  app.set('view engine', 'html');

  // Apply rate limit middleware
  app.use(`${ROUTE_PREFIX}/api/`, expressRateLimit({
    windowMs: 60 * 1000, // 1 minutes
    max: 100
  }));

  nunjucks.configure('views', {
    autoescape: true,
    express: app
  });

  // Connect to mongodb database
  await mongodb();
  await mediasoupService.run();

  // start websocket
  startSocketServer(httpServer, ROUTE_PREFIX);

  app.use('/web', express.static(path.join(__dirname, 'public')));

  await httpServer.listen(app.get('port'), () => {
    console.log('Server is running at http://localhost:%d in %s mode', app.get('port'), app.get('env'));
    console.log('Press CTRL+C to stop\n');
  });
};

run();
