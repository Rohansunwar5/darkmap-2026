/* eslint-disable @typescript-eslint/no-explicit-any */
import os from 'os';
import cluster from 'cluster';
import app from './app';
import logger from './utils/logger';
import connectDB from './db';
import redisClient from './services/cache';

(async () => {
  logger.info('Connecting to Database...');
  await connectDB();
  logger.info('DB connected');
  await redisClient.connect();

  const numCPUs = process.env.NODE_ENV === 'production' ? os.cpus().length : 1;
  if (cluster.isMaster) {
    logger.info(`Master ${process.pid} is running`);

    // Fork workers...
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker) => {
      logger.info(`worker ${worker.process.pid} died`);
      const newWorker = cluster.fork();
      logger.info(`fork-worker: New worker started with PID - ${newWorker.process.pid}`);
    });
  } else {
    const normalizePort = (val: any) => {
      const port = parseInt(val, 10);

      if (Number.isNaN(port)) {
        return val;
      }

      if (port >= 0) {
        return port;
      }

      return false;
    };

    const port = normalizePort(process.env.PORT || '4020');

    const onError = (error: any) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof port === 'string' ? `pipe ${port}` : `port ${port}`;
      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    };

    app.on('error', onError);
    const onListening = () => {
      const bind = typeof port === 'string' ? `pipe ${port}` : `port ${port}`;
      logger.info(`Listening on ${bind}`);
      logger.info('Connected!');
    };

    app.listen(port, onListening);
    logger.info(`Worker ${process.pid} started`);
  }
})();
