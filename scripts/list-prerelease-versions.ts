#!/usr/bin/env tsx
/**
 * Lists the latest pre-release (e2e) versions from the build cache
 * 
 * This script reads the build cache to find all published e2e versions
 * and outputs them in a format suitable for installing in other apps.
 * 
 * Usage:
 *   tsx scripts/list-prerelease-versions.ts                    # List all latest versions
 *   tsx scripts/list-prerelease-versions.ts --json             # Output as JSON
 *   tsx scripts/list-prerelease-versions.ts --package-json     # Output as package.json snippet
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { BuildCacheMetadata } from './build-cache.js';

const CACHE_ROOT = join(homedir(), '.cache', 'agenteract', 'builds');

interface PackageVersion {
  packageName: string;
  version: string;
  baseVersion: string;
  distHash: string;
  timestamp: number;
  gitHash: string;
}

/**
 * Get the latest e2e version for each package from the build cache
 */
function getLatestPrereleaseVersions(): Map<string, PackageVersion> {
  const latestVersions = new Map<string, PackageVersion>();

  if (!existsSync(CACHE_ROOT)) {
    return latestVersions;
  }

  try {
    const packages = readdirSync(CACHE_ROOT);

    for (const pkg of packages) {
      const pkgPath = join(CACHE_ROOT, pkg);
      if (!statSync(pkgPath).isDirectory()) continue;

      // Convert sanitized name back to package name (@agenteract-core -> @agenteract/core)
      const packageName = pkg.replace(/-/g, '/');

      const versions = readdirSync(pkgPath);
      
      // Track the latest version by timestamp
      let latestMetadata: BuildCacheMetadata | null = null;
      let latestTimestamp = 0;

      for (const version of versions) {
        const versionPath = join(pkgPath, version);
        if (!statSync(versionPath).isDirectory()) continue;

        const hashes = readdirSync(versionPath);
        for (const hash of hashes) {
          const hashPath = join(versionPath, hash);
          if (!statSync(hashPath).isDirectory()) continue;

          const metadataPath = join(hashPath, 'metadata.json');
          if (existsSync(metadataPath)) {
            const metadata: BuildCacheMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
            
            if (metadata.timestamp > latestTimestamp) {
              latestTimestamp = metadata.timestamp;
              latestMetadata = metadata;
            }
          }
        }
      }

      if (latestMetadata) {
        latestVersions.set(packageName, {
          packageName: latestMetadata.packageName,
          version: latestMetadata.version,
          baseVersion: latestMetadata.baseVersion,
          distHash: latestMetadata.distHash,
          timestamp: latestMetadata.timestamp,
          gitHash: latestMetadata.gitHash,
        });
      }
    }
  } catch (error) {
    console.error('Error reading cache:', error);
  }

  return latestVersions;
}

/**
 * Output versions in human-readable table format
 */
function outputTable(versions: Map<string, PackageVersion>): void {
  if (versions.size === 0) {
    console.log('No pre-release versions found in cache.');
    console.log('');
    console.log('Run `pnpm publish:local` to publish packages to Verdaccio first.');
    return;
  }

  console.log('Latest Pre-release Versions');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  // Sort by package name
  const sortedVersions = Array.from(versions.values()).sort((a, b) => 
    a.packageName.localeCompare(b.packageName)
  );

  for (const pkg of sortedVersions) {
    const date = new Date(pkg.timestamp).toLocaleString();
    console.log(`${pkg.packageName}`);
    console.log(`  Version:  ${pkg.version}`);
    console.log(`  Hash:     ${pkg.distHash} (git: ${pkg.gitHash})`);
    console.log(`  Built:    ${date}`);
    console.log();
  }

  console.log('Install commands:');
  console.log('───────────────────────────────────────────────────────────────');
  for (const pkg of sortedVersions) {
    console.log(`npm install ${pkg.packageName}@${pkg.version} --registry http://localhost:4873`);
  }
}

/**
 * Output versions as JSON
 */
function outputJson(versions: Map<string, PackageVersion>): void {
  const obj: Record<string, string> = {};
  for (const [name, pkg] of versions) {
    obj[name] = pkg.version;
  }
  console.log(JSON.stringify(obj, null, 2));
}

/**
 * Output as package.json dependencies snippet
 */
function outputPackageJson(versions: Map<string, PackageVersion>): void {
  console.log('{');
  console.log('  "dependencies": {');
  
  const sortedVersions = Array.from(versions.entries()).sort((a, b) => 
    a[0].localeCompare(b[0])
  );

  sortedVersions.forEach(([name, pkg], index) => {
    const comma = index < sortedVersions.length - 1 ? ',' : '';
    console.log(`    "${name}": "${pkg.version}"${comma}`);
  });

  console.log('  }');
  console.log('}');
  console.log();
  console.log('// To use these versions, also configure your .npmrc:');
  console.log('// @agenteract:registry=http://localhost:4873');
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const versions = getLatestPrereleaseVersions();

  if (args.includes('--json')) {
    outputJson(versions);
  } else if (args.includes('--package-json')) {
    outputPackageJson(versions);
  } else {
    outputTable(versions);
  }
}

main();
