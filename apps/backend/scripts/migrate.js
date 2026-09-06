import { runMigrations, sanitizeDatabaseUrl } from '../src/core/migrator.js';
import { config } from '../src/core/config.js';

const command = process.argv[2] || 'up';
const validCommands = ['up', 'down', 'status'];

if (!validCommands.includes(command)) {
  console.error(`Invalid command "${command}". Supported commands: ${validCommands.join(', ')}`);
  process.exit(1);
}

async function main() {
  console.log(
    `📦 Running migrations [${command}] on ${sanitizeDatabaseUrl(config.databaseUrl)}...`,
  );

  try {
    if (command === 'status') {
      const { getMigrationStatus } = await import('../src/core/migrator.js');
      const status = await getMigrationStatus();
      if (status.pendingCount === 0) {
        console.log('✅ All migrations applied. Database schema is up to date.');
      } else {
        console.log(`ℹ️ ${status.pendingCount} pending migration(s):`);
        for (const name of status.pending) {
          console.log(`  - ${name}`);
        }
      }
      process.exit(0);
    }

    const isDown = command === 'down';
    const executed = await runMigrations({
      direction: isDown ? 'down' : 'up',
      count: isDown ? 1 : Infinity,
      verbose: true,
    });

    if (executed.length === 0) {
      console.log('✅ No pending migrations to apply. Database schema is up to date.');
    } else {
      console.log(`✅ Successfully executed ${executed.length} migration(s):`);
      for (const m of executed) {
        console.log(`  - ${m.name}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

main();
