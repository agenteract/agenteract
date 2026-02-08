#!/usr/bin/env tsx
/**
 * Build Cache Management for E2E Tests
 * 
 * Tracks built packages by version + dist hash to avoid unnecessary rebuilds.
 * Cache location: $HOME/.cache/agenteract/builds/
 * 
 * Usage:
 *   import { calculateDistHash, getCachedBuild, cacheBuild, ... } from './build-cache.js'
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const CACHE_ROOT = join(homedir(), '.cache', 'agenteract', 'builds');

export interface BuildCacheMetadata {
  packageName: string;
  version: string;      // e.g., "0.1.3-e2e.0"
  baseVersion: string;  // e.g., "0.1.2" (from package.json)
  distHash: string;     // Hash of dist/ directory
  depVersions: Record<string, string>; // @agenteract/* dependency versions used in this build
  timestamp: number;
  gitHash: string;      // For reference
}

/**
 * Calculate SHA-1 hash of dist/ directory contents
 */
export function calculateDistHash(packagePath: string): string | null {
  const distPath = join(packagePath, 'dist');
  
  if (!existsSync(distPath)) {
    return null;
  }

  const hash = createHash('sha1');
  
  function hashDir(dir: string) {
    try {
      const entries = readdirSync(dir).sort();
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively hash subdirectories
          hashDir(fullPath);
        } else if (stat.isFile()) {
          // Hash file contents (skip .tsbuildinfo files)
          if (!entry.endsWith('.tsbuildinfo')) {
            const content = readFileSync(fullPath);
            hash.update(fullPath); // Include path for uniqueness
            hash.update(content);
          }
        }
      }
    } catch (error) {
      console.error(`Error hashing directory ${dir}:`, error);
      throw error;
    }
  }
  
  hashDir(distPath);
  return hash.digest('hex').substring(0, 7); // Short hash like git
}

/**
 * Get cache directory for a package
 */
function getPackageCacheDir(packageName: string): string {
  // Sanitize package name for filesystem (@agenteract/core -> @agenteract-core)
  const safeName = packageName.replace(/\//g, '-');
  return join(CACHE_ROOT, safeName);
}

/**
 * Get cache directory for a specific version/hash
 */
function getBuildCacheDir(packageName: string, version: string, distHash: string): string {
  return join(getPackageCacheDir(packageName), version, distHash);
}

/**
 * Check if this exact dist hash with matching dependency versions was already published
 */
export function getCachedBuild(
  packageName: string, 
  distHash: string,
  currentDepVersions: Record<string, string> = {}
): BuildCacheMetadata | null {
  const packageCacheDir = getPackageCacheDir(packageName);
  
  if (!existsSync(packageCacheDir)) {
    return null;
  }

  try {
    // Look through all version directories
    const versions = readdirSync(packageCacheDir);
    
    for (const version of versions) {
      const versionPath = join(packageCacheDir, version);
      
      if (!statSync(versionPath).isDirectory()) {
        continue;
      }

      // Check if this hash exists in this version
      const hashPath = join(versionPath, distHash);
      if (existsSync(hashPath)) {
        const metadataPath = join(hashPath, 'metadata.json');
        if (existsSync(metadataPath)) {
          const metadata: BuildCacheMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          
          // Check if dependency versions match
          const cachedDepVersions = metadata.depVersions || {};
          const depVersionsMatch = Object.keys(currentDepVersions).every(dep => 
            cachedDepVersions[dep] === currentDepVersions[dep]
          ) && Object.keys(cachedDepVersions).every(dep =>
            currentDepVersions[dep] === cachedDepVersions[dep]
          );
          
          if (depVersionsMatch) {
            return metadata;
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading cache for ${packageName}:`, error);
  }

  return null;
}

/**
 * Get the next e2e version number for a package
 * Strategy: Bump patch version, add -e2e.N suffix
 * Examples:
 *   0.1.2 -> 0.1.3-e2e.0 (first e2e build)
 *   0.1.3-e2e.0 -> 0.1.3-e2e.1 (second e2e build with changes)
 */
export function getNextE2EVersion(baseVersion: string, packageName: string): string {
  const packageCacheDir = getPackageCacheDir(packageName);
  
  // Parse base version
  const match = baseVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid version format: ${baseVersion}`);
  }

  const [, major, minor, patch] = match;
  const patchNum = parseInt(patch);
  
  // Bumped patch version becomes our e2e base
  const e2eBaseVersion = `${major}.${minor}.${patchNum + 1}`;

  // Check existing e2e versions for this base
  let maxE2ECount = -1;
  
  if (existsSync(packageCacheDir)) {
    try {
      const versions = readdirSync(packageCacheDir);
      
      for (const version of versions) {
        // Look for versions matching this e2e base (e.g., 0.1.3-e2e.0, 0.1.3-e2e.1)
        const e2eMatch = version.match(new RegExp(`^${e2eBaseVersion.replace(/\./g, '\\.')}-e2e\\.(\\d+)$`));
        if (e2eMatch) {
          const count = parseInt(e2eMatch[1]);
          maxE2ECount = Math.max(maxE2ECount, count);
        }
      }
    } catch (error) {
      // Ignore errors, will use count 0
    }
  }

  const nextCount = maxE2ECount + 1;
  return `${e2eBaseVersion}-e2e.${nextCount}`;
}

/**
 * Get current git hash
 */
function getCurrentGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Store successful build in cache
 */
export function cacheBuild(metadata: BuildCacheMetadata): void {
  const cacheDir = getBuildCacheDir(metadata.packageName, metadata.version, metadata.distHash);
  
  try {
    mkdirSync(cacheDir, { recursive: true });
    
    const metadataPath = join(cacheDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    
    console.log(`   ✓ Cached build: ${metadata.packageName}@${metadata.version} (${metadata.distHash})`);
  } catch (error) {
    console.error(`   ⚠️  Failed to cache build for ${metadata.packageName}:`, error);
  }
}

/**
 * Clear cache for a package or all packages
 */
export function clearCache(packageName?: string): void {
  if (packageName) {
    const packageCacheDir = getPackageCacheDir(packageName);
    if (existsSync(packageCacheDir)) {
      rmSync(packageCacheDir, { recursive: true, force: true });
      console.log(`✓ Cleared cache for ${packageName}`);
    } else {
      console.log(`ℹ️  No cache found for ${packageName}`);
    }
  } else {
    if (existsSync(CACHE_ROOT)) {
      rmSync(CACHE_ROOT, { recursive: true, force: true });
      console.log(`✓ Cleared all build cache at ${CACHE_ROOT}`);
    } else {
      console.log(`ℹ️  No cache found at ${CACHE_ROOT}`);
    }
  }
}

/**
 * Get cache status/statistics
 */
export function getCacheStatus(): void {
  console.log(`📊 Build Cache Status`);
  console.log(`Location: ${CACHE_ROOT}`);
  console.log();

  if (!existsSync(CACHE_ROOT)) {
    console.log('ℹ️  Cache is empty');
    return;
  }

  try {
    const packages = readdirSync(CACHE_ROOT);
    
    if (packages.length === 0) {
      console.log('ℹ️  Cache is empty');
      return;
    }

    console.log(`Cached packages: ${packages.length}`);
    console.log();

    for (const pkg of packages) {
      const pkgPath = join(CACHE_ROOT, pkg);
      if (!statSync(pkgPath).isDirectory()) continue;

      const versions = readdirSync(pkgPath);
      console.log(`  ${pkg.replace(/-/g, '/')}`);
      
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
            const date = new Date(metadata.timestamp).toLocaleString();
            console.log(`    └─ ${version} (${hash}) - ${date}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading cache:', error);
  }
}

/**
 * Helper to prepare metadata for caching
 */
export function createMetadata(
  packageName: string,
  version: string,
  baseVersion: string,
  distHash: string,
  depVersions: Record<string, string> = {}
): BuildCacheMetadata {
  return {
    packageName,
    version,
    baseVersion,
    distHash,
    depVersions,
    timestamp: Date.now(),
    gitHash: getCurrentGitHash(),
  };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    getCacheStatus();
  } else if (args.includes('--clear')) {
    const packageName = args[args.indexOf('--clear') + 1];
    clearCache(packageName);
  } else {
    console.log('Build Cache Management');
    console.log();
    console.log('Usage:');
    console.log('  tsx scripts/build-cache.ts --status              # Show cache status');
    console.log('  tsx scripts/build-cache.ts --clear               # Clear all cache');
    console.log('  tsx scripts/build-cache.ts --clear <package>     # Clear package cache');
  }
}
