#!/usr/bin/env tsx
/**
 * Script to check if local package versions are out of sync with published versions on npm
 * 
 * Usage:
 *   tsx scripts/check-package-versions.ts
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';

// Color codes for terminal output
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  reset: '\x1b[0m',
};

function log(message: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : '';
  console.log(`${colorCode}${message}${colors.reset}`);
}

interface PackageInfo {
  name: string;
  shortName: string;
  localVersion: string;
  publishedVersion: string | null;
  needsBump: boolean;
  error?: string;
}

/**
 * Fetch package version from npm registry
 */
function fetchPublishedVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${packageName}`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            // Package not found on npm
            resolve(null);
            return;
          }
          
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          
          const packageData = JSON.parse(data);
          const latestVersion = packageData['dist-tags']?.latest || 
                               (packageData.versions ? Object.keys(packageData.versions).pop() : null);
          
          resolve(latestVersion || null);
        } catch (error) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Compare two version strings
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  // Remove any prerelease/build metadata for comparison
  const cleanV1 = v1.split('-')[0].split('+')[0];
  const cleanV2 = v2.split('-')[0].split('+')[0];
  
  const parts1 = cleanV1.split('.').map(Number);
  const parts2 = cleanV2.split('.').map(Number);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}

/**
 * Get package info from local package.json
 */
function getLocalPackageInfo(shortName: string, packagesDir: string): PackageInfo | null {
  const packagePath = join(packagesDir, shortName);
  const packageJsonPath = join(packagePath, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    if (!packageJson.name || !packageJson.version) {
      return null;
    }
    
    return {
      name: packageJson.name,
      shortName,
      localVersion: packageJson.version,
      publishedVersion: null,
      needsBump: false,
    };
  } catch (error) {
    return null;
  }
}

async function main() {
  log('🔍 Checking package versions against npm registry...', 'blue');
  console.log();
  
  const packagesDir = join(process.cwd(), 'packages');
  const allPackages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  
  log(`📦 Found ${allPackages.length} packages`, 'cyan');
  console.log();
  
  // Collect local package info
  const packages: PackageInfo[] = [];
  
  for (const shortName of allPackages) {
    const pkgInfo = getLocalPackageInfo(shortName, packagesDir);
    if (pkgInfo) {
      packages.push(pkgInfo);
    }
  }
  
  log('📥 Fetching published versions from npm...', 'blue');
  console.log();
  
  // Fetch published versions
  const fetchPromises = packages.map(async (pkg) => {
    try {
      const publishedVersion = await fetchPublishedVersion(pkg.name);
      pkg.publishedVersion = publishedVersion;
      
      if (publishedVersion === null) {
        pkg.error = 'Not found on npm';
        pkg.needsBump = false; // Can't determine if needs bump if not published
      } else {
        const comparison = compareVersions(pkg.localVersion, publishedVersion);
        pkg.needsBump = comparison < 0; // Local is older than published
      }
      
      return pkg;
    } catch (error) {
      pkg.error = error instanceof Error ? error.message : 'Unknown error';
      pkg.needsBump = false;
      return pkg;
    }
  });
  
  const results = await Promise.all(fetchPromises);
  
  // Separate packages into categories
  const needsBump = results.filter(p => p.needsBump);
  const inSync = results.filter(p => !p.needsBump && p.publishedVersion !== null && !p.error);
  const notPublished = results.filter(p => p.publishedVersion === null && !p.error);
  const errors = results.filter(p => p.error);
  
  // Display results
  console.log();
  log('──────────────────────────────────────', 'blue');
  log('📊 Results', 'blue');
  log('──────────────────────────────────────', 'blue');
  console.log();
  
  if (needsBump.length > 0) {
    log(`⚠️  Packages that need version bumping (${needsBump.length}):`, 'yellow');
    console.log();
    needsBump.forEach((pkg) => {
      console.log(`  ${pkg.name}`);
      console.log(`    Local:     ${pkg.localVersion}`);
      console.log(`    Published: ${pkg.publishedVersion}`);
      console.log(`    Status:    ${colors.red}OUT OF SYNC${colors.reset}`);
      // output package.json
      console.log(`    package.json: ${join(packagesDir, pkg.shortName, 'package.json')}`);
      console.log();
    });
  }
  
  if (inSync.length > 0) {
    log(`✅ Packages in sync (${inSync.length}):`, 'green');
    console.log();
    inSync.forEach((pkg) => {
      console.log(`  ${pkg.name}: ${pkg.localVersion} ${colors.green}✓${colors.reset}`);
    });
    console.log();
  }
  
  if (notPublished.length > 0) {
    log(`📭 Packages not yet published (${notPublished.length}):`, 'cyan');
    console.log();
    notPublished.forEach((pkg) => {
      console.log(`  ${pkg.name}: ${pkg.localVersion}`);
    });
    console.log();
  }
  
  if (errors.length > 0) {
    log(`❌ Packages with errors (${errors.length}):`, 'red');
    console.log();
    errors.forEach((pkg) => {
      console.log(`  ${pkg.name}: ${pkg.error}`);
    });
    console.log();
  }
  
  // Summary
  console.log();
  log('──────────────────────────────────────', 'blue');
  log('📋 Summary', 'blue');
  log('──────────────────────────────────────', 'blue');
  console.log(`  Total packages:     ${results.length}`);
  console.log(`  ${colors.yellow}Needs bumping:      ${needsBump.length}${colors.reset}`);
  console.log(`  ${colors.green}In sync:            ${inSync.length}${colors.reset}`);
  console.log(`  ${colors.cyan}Not published:      ${notPublished.length}${colors.reset}`);
  if (errors.length > 0) {
    console.log(`  ${colors.red}Errors:             ${errors.length}${colors.reset}`);
  }
  console.log();
  
  if (needsBump.length > 0) {
    log('⚠️  Action required: Some packages need version bumping!', 'yellow');
    console.log();
    log('To fix, run:', 'blue');
    console.log('  pnpm version:patch [package1,package2,...]');
    console.log('  pnpm version:minor [package1,package2,...]');
    console.log('  pnpm version:major [package1,package2,...]');
    console.log();
    process.exit(1);
  } else {
    log('✅ All published packages are in sync!', 'green');
    console.log();
    process.exit(0);
  }
}

main().catch((error) => {
  log(`❌ Unexpected error: ${error}`, 'red');
  process.exit(1);
});

