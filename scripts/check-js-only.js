import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hard Rule Verification:
 * Scans the repository to ensure NO TypeScript source or config files (.ts, .tsx, tsconfig*.json) exist.
 */

const FORBIDDEN_EXTENSIONS = ['.ts', '.tsx'];
const FORBIDDEN_FILES = ['tsconfig.json', 'tsconfig.base.json'];
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', '.expo'];

let violations = [];

function scanDirectory(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile()) {
      const lower = entry.toLowerCase();
      if (
        FORBIDDEN_FILES.includes(lower) ||
        FORBIDDEN_EXTENSIONS.some(ext => lower.endsWith(ext))
      ) {
        violations.push(fullPath);
      }
    }
  }
}

console.log('🔍 Checking repository for strict JavaScript-only compliance...');
scanDirectory(process.cwd());

if (violations.length > 0) {
  console.error(
    '\n❌ HARD RULE VIOLATION: TypeScript files are strictly prohibited in Workaholic!',
  );
  console.error('Found forbidden files:');
  for (const file of violations) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log('✅ JavaScript-only verification passed: No TypeScript files found.');
process.exit(0);
