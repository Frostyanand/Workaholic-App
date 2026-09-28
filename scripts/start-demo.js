#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function log(prefix, color, message) {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${COLORS.dim}[${time}]${COLORS.reset} ${color}${COLORS.bold}${prefix}${COLORS.reset} ${message}`,
  );
}

/**
 * Checks if a TCP port is open.
 */
function checkPort(port, host = 'localhost', timeoutMs = 1500) {
  return new Promise(resolvePromise => {
    const socket = createConnection({ port, host, timeout: timeoutMs });
    socket.once('connect', () => {
      socket.destroy();
      resolvePromise(true);
    });
    socket.once('error', () => {
      resolvePromise(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolvePromise(false);
    });
  });
}

async function ensurePostgres() {
  log('[DB-CHECK]', COLORS.yellow, 'Verifying PostgreSQL database on port 5432...');
  const isAvailable = await checkPort(5432);

  if (isAvailable) {
    log(
      '[DB-CHECK]',
      COLORS.green,
      '✅ PostgreSQL is active and accepting connections on port 5432.',
    );
    return;
  }

  log(
    '[DB-CHECK]',
    COLORS.yellow,
    'PostgreSQL is not responding on port 5432. Attempting to start via Docker Compose...',
  );
  try {
    execSync('docker compose up -d postgres', { cwd: rootDir, stdio: 'inherit' });
    log('[DB-CHECK]', COLORS.yellow, 'Waiting for PostgreSQL container to become ready...');

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkPort(5432)) {
        log('[DB-CHECK]', COLORS.green, '✅ PostgreSQL container started successfully.');
        return;
      }
    }
    throw new Error('PostgreSQL port 5432 did not open within 15 seconds.');
  } catch {
    log('[DB-CHECK]', COLORS.red, '❌ Could not start PostgreSQL automatically.');
    console.log(`
${COLORS.yellow}${COLORS.bold}PLEASE ENSURE POSTGRESQL IS RUNNING:${COLORS.reset}
1. If using Docker: run ${COLORS.cyan}docker compose up -d postgres${COLORS.reset}
2. Or start your local PostgreSQL service:
   Host: localhost:5432
   User: workaholic
   Database: workaholic_dev
   Password: workaholic_dev_secret
`);
    process.exit(1);
  }
}

async function runMigrations() {
  log('[MIGRATE]', COLORS.magenta, 'Running database schema migrations...');
  try {
    execSync('npm run migrate:up -w @workaholic/backend', {
      cwd: rootDir,
      stdio: 'inherit',
    });
    log('[MIGRATE]', COLORS.green, '✅ Database schema verified up to date.');
  } catch {
    log('[MIGRATE]', COLORS.red, '❌ Database migration failed.');
    process.exit(1);
  }
}

function startProcess(name, command, args, cwd, color) {
  const child = spawn(command, args, {
    cwd,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.stdout.on('data', data => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`${color}${COLORS.bold}[${name}]${COLORS.reset} ${line}`);
      }
    }
  });

  child.stderr.on('data', data => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(
          `${color}${COLORS.bold}[${name}]${COLORS.reset} ${COLORS.red}${line}${COLORS.reset}`,
        );
      }
    }
  });

  child.on('close', code => {
    log(name, color, `Process exited with code ${code}`);
  });

  return child;
}

async function main() {
  console.log(`
${COLORS.cyan}${COLORS.bold}========================================================================${COLORS.reset}
${COLORS.cyan}${COLORS.bold}             WORKAHOLIC — LOCAL HACKATHON DEMO LAUNCHER                ${COLORS.reset}
${COLORS.cyan}${COLORS.bold}========================================================================${COLORS.reset}
`);

  await ensurePostgres();
  await runMigrations();

  console.log(`
${COLORS.green}${COLORS.bold}🚀 Starting API & Web Client Servers...${COLORS.reset}
`);

  const backend = startProcess('API', 'node', ['apps/backend/src/server.js'], rootDir, COLORS.cyan);

  const frontend = startProcess(
    'WEB',
    'npm',
    ['run', 'dev', '-w', '@workaholic/web'],
    rootDir,
    COLORS.green,
  );

  // Wait a short moment to display banner
  setTimeout(() => {
    console.log(`
${COLORS.bold}========================================================================${COLORS.reset}
${COLORS.bold}🎉 Workaholic Local Demo is Live!${COLORS.reset}
${COLORS.bold}========================================================================${COLORS.reset}
  ${COLORS.green}🖥️  Web Client UI:${COLORS.reset}       http://localhost:5173
  ${COLORS.cyan}🔌 Backend Fastify API:${COLORS.reset} http://localhost:3001
  ${COLORS.magenta}🩺 API Health Check:${COLORS.reset}    http://localhost:3001/api/v1/health
  ${COLORS.blue}🔗 Google OAuth Callback:${COLORS.reset} http://localhost:3001/api/v1/auth/google/callback

${COLORS.yellow}ℹ️  Press Ctrl+C at any time to gracefully shut down both servers.${COLORS.reset}
${COLORS.bold}========================================================================${COLORS.reset}
`);
  }, 2000);

  const cleanup = () => {
    console.log(`\n${COLORS.yellow}Shutting down Workaholic servers...${COLORS.reset}`);
    try {
      backend.kill('SIGINT');
      frontend.kill('SIGINT');
    } catch {
      // Process already terminated
      log('[SHUTDOWN]', COLORS.dim, 'Cleaned up child processes.');
    }
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
