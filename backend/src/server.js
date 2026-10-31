'use strict';
const app = require('./app');
const config = require('./config/env');
const { pool } = require('./config/db');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => logger.info(`API démarrée sur le port ${config.port}`));

const shutdown = async () => {
  server.close(async () => { await pool.end(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => logger.error('unhandledRejection', { message: err && err.message }));
