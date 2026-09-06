import { createApp } from './app.js';
import { config } from './core/config.js';
import { closePool } from './core/db.js';

const app = createApp();

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`🚀 Workaholic Backend running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await closePool();
    process.exit(0);
  });
}

start();
