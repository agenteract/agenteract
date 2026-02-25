#!/usr/bin/env tsx
/**
 * Lists all publishable packages that have changed since the last npm release tag.
 *
 * Finds the highest v* git tag, diffs against it, and reports which packages
 * under packages/ have changed files — including non-package.json changes.
 *
 * Usage:
 *   tsx scripts/pending-versions.ts
 *   pnpm version:pending
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function log(message: string, color?: keyof typeof colors): void {
  const colorCode = color ? colors[color] : '';
  console.log(`${colorCode}${message}${colors.reset}`);
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function run(cmd: string): string {
  return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8' }).trim();
}

/**
 * Returns all v* tags sorted by semver descending, highest first.
 */
function getReleaseTags(): string[] {
  const raw = run('git tag --list "v*"');
  if (!raw) return [];

  return raw
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => {
      // Compare as semver (strip leading "v")
      const partsA = a.replace(/^v/, '').split('.').map(Number);
      const partsB = b.replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
}

/**
 * Returns the set of packages/X directories that have any changed file
 * between `tag` and HEAD.
 */
function getChangedPackageDirs(tag: string): Set<string> {
  const output = run(`git diff ${tag} --name-only -- packages`);
  if (!output) return new Set();

  const changed = new Set<string>();
  for (const line of output.split('\n')) {
    const parts = line.trim().split('/');
    // line format: packages/<dir>/...
    if (parts.length >= 2 && parts[0] === 'packages') {
      changed.add(parts[1]);
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Package helpers
// ---------------------------------------------------------------------------

interface PackageInfo {
  shortName: string;
  name: string;
  version: string;
  private: boolean;
}

function readPackageInfo(shortName: string): PackageInfo | null {
  const pkgJsonPath = join(PROJECT_ROOT, 'packages', shortName, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (!pkg.name || !pkg.version) return null;
    return {
      shortName,
      name: pkg.name,
      version: pkg.version,
      private: pkg.private === true,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const tags = getReleaseTags();

  if (tags.length === 0) {
    log('No v* release tags found in this repository.', 'red');
    process.exit(1);
  }

  const latestTag = tags[0];
  log(`Last release tag: ${colors.bold}${latestTag}${colors.reset}`, 'blue');
  console.log();

  const changedDirs = getChangedPackageDirs(latestTag);

  if (changedDirs.size === 0) {
    log(`No changes detected under packages/ since ${latestTag}.`, 'green');
    process.exit(0);
  }

  // Filter to publishable packages only
  const pending: PackageInfo[] = [];
  const skipped: string[] = [];

  for (const shortName of [...changedDirs].sort()) {
    const info = readPackageInfo(shortName);
    if (!info) {
      skipped.push(shortName);
      continue;
    }
    if (info.private) {
      skipped.push(shortName);
      continue;
    }
    pending.push(info);
  }

  if (pending.length === 0) {
    log(`No publishable packages changed since ${latestTag}.`, 'green');
    if (skipped.length > 0) {
      console.log();
      log(`Skipped (no package.json or private): ${skipped.join(', ')}`, 'cyan');
    }
    process.exit(0);
  }

  log(`Publishable packages changed since ${latestTag}:`, 'yellow');
  console.log();

  for (const pkg of pending) {
    console.log(`  ${colors.bold}${pkg.name}${colors.reset}  v${pkg.version}`);
  }

  if (skipped.length > 0) {
    console.log();
    log(`Skipped (no package.json or private): ${skipped.join(', ')}`, 'cyan');
  }

  console.log();
  log('To bump versions, run:', 'blue');
  const names = pending.map((p) => p.shortName).join(',');
  console.log(`  pnpm version:patch ${names}`);
  console.log(`  pnpm version:minor ${names}`);
  console.log(`  pnpm version:major ${names}`);
  console.log();
}

main();
