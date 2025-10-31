#!/usr/bin/env tsx
/**
 * Unified version management script for Agenteract
 * Handles both NPM packages (package.json) and Dart packages (pubspec.yaml)
 *
 * Usage:
 *   pnpm version:patch [package1,package2,...]
 *   pnpm version:minor [package1,package2,...]
 *   pnpm version:major [package1,package2,...]
 *   pnpm version:alpha [package1,package2,...]
 *   pnpm version:beta [package1,package2,...]
 *   pnpm version:rc [package1,package2,...]
 *
 * Examples:
 *   pnpm version:minor                    # Bump all packages
 *   pnpm version:patch agents,core        # Bump specific packages
 *   pnpm version:alpha flutter            # Create alpha prerelease for flutter
 *   pnpm version:major flutter-cli,react  # Major bump for specific packages
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

// Color codes for terminal output
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m',
};

function log(message: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : '';
  console.log(`${colorCode}${message}${colors.reset}`);
}

// Parse pre-defined responses from environment variable for testing
// Format: VERSION_SCRIPT_RESPONSES="y,n,y"
const predefinedResponses: string[] = process.env.VERSION_SCRIPT_RESPONSES
  ? process.env.VERSION_SCRIPT_RESPONSES.split(',')
  : [];

/**
 * Get a response from the user, either from predefined responses (for testing)
 * or from stdin (for interactive use)
 */
function getResponse(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // If predefined responses exist, use them
    if (predefinedResponses.length > 0) {
      const response = predefinedResponses.shift();

      if (response === undefined) {
        reject(new Error('No more predefined responses available'));
        return;
      }

      // Log the prompt and simulated response for visibility
      console.log(prompt + response);
      resolve(response);
      return;
    }

    // Otherwise, use stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

type VersionType = 'patch' | 'minor' | 'major' | 'prerelease';
type PrereleaseType = 'alpha' | 'beta' | 'rc';

interface PackageInfo {
  name: string;
  shortName: string;
  path: string;
  type: 'npm' | 'dart';
  currentVersion: string;
  newVersion: string;
}

// Parse command line arguments
const versionArg = process.argv[2] as VersionType | PrereleaseType;
const packagesArg = process.argv[3];

if (!versionArg) {
  log('❌ Error: Version type not specified', 'red');
  log('\nUsage: pnpm version:<type> [packages]', 'yellow');
  log('\nTypes: patch, minor, major, alpha, beta, rc');
  process.exit(1);
}

// Determine if this is a prerelease
const prereleaseTypes: PrereleaseType[] = ['alpha', 'beta', 'rc'];
const isPrerelease = prereleaseTypes.includes(versionArg as PrereleaseType);
const versionType: VersionType = isPrerelease ? 'prerelease' : (versionArg as VersionType);
const prereleaseType = isPrerelease ? versionArg : undefined;

// Generate prerelease ID
const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
const prereleaseId = prereleaseType ? `${prereleaseType}.${gitHash}` : undefined;

log('🏷️  Agenteract Version Manager', 'blue');
console.log();

// Ensure clean working tree
try {
  const status = execSync('git status -s', { encoding: 'utf-8' });
  if (status.trim()) {
    log('❌ Error: Working directory is not clean', 'red');
    log('Please commit or stash your changes first');
    process.exit(1);
  }
} catch (error) {
  log('❌ Error checking git status', 'red');
  process.exit(1);
}

// Pull latest changes (if remote exists)
log('📥 Pulling latest changes...', 'blue');
try {
  // Check if we have a remote configured
  const hasRemote = execSync('git remote', { encoding: 'utf-8' }).trim().length > 0;
  if (hasRemote) {
    // Check if current branch has an upstream
    try {
      execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { stdio: 'pipe' });
      execSync('git pull --rebase', { stdio: 'inherit' });
    } catch {
      log('⚠️  No upstream branch configured, skipping pull', 'yellow');
    }
  } else {
    log('⚠️  No remote configured, skipping pull', 'yellow');
  }
} catch (error) {
  log('⚠️  Unable to pull, continuing anyway', 'yellow');
}
console.log();

// Get all packages
const packagesDir = join(process.cwd(), 'packages');
const allPackages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

// Determine target packages
const targetPackages = packagesArg
  ? packagesArg.split(',').map((p) => p.trim())
  : allPackages;

if (packagesArg) {
  log('📦 Mode: Update SPECIFIC packages', 'yellow');
} else {
  log('📦 Mode: Update ALL packages', 'yellow');
}

console.log();
if (isPrerelease) {
  log(`Release Type: Prerelease (${prereleaseType})`, 'blue');
  log(`Identifier: ${prereleaseId}`, 'blue');
} else {
  log(`Version Type: ${versionType}`, 'blue');
}
console.log();

// Helper: Detect package type and read version
function getPackageInfo(shortName: string): PackageInfo | null {
  const packagePath = join(packagesDir, shortName);
  const packageJsonPath = join(packagePath, 'package.json');
  const pubspecPath = join(packagePath, 'pubspec.yaml');

  if (existsSync(packageJsonPath)) {
    // NPM package
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return {
      name: packageJson.name,
      shortName,
      path: packagePath,
      type: 'npm',
      currentVersion: packageJson.version,
      newVersion: '', // Will be calculated
    };
  } else if (existsSync(pubspecPath)) {
    // Dart package
    const pubspecContent = readFileSync(pubspecPath, 'utf-8');
    const nameMatch = pubspecContent.match(/^name:\s*(.+)$/m);
    const versionMatch = pubspecContent.match(/^version:\s*(.+)$/m);

    if (!nameMatch || !versionMatch) {
      log(`❌ Error: Could not parse pubspec.yaml for ${shortName}`, 'red');
      return null;
    }

    return {
      name: nameMatch[1].trim(),
      shortName,
      path: packagePath,
      type: 'dart',
      currentVersion: versionMatch[1].trim(),
      newVersion: '', // Will be calculated
    };
  }

  return null;
}

// Helper: Calculate new version using semver logic
function bumpVersion(version: string, type: VersionType, prereleaseId?: string): string {
  // Parse version (supports X.Y.Z and X.Y.Z-prerelease+build)
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  let [, major, minor, patch, prerelease, build] = match;
  let majorNum = parseInt(major);
  let minorNum = parseInt(minor);
  let patchNum = parseInt(patch);

  if (type === 'major') {
    majorNum++;
    minorNum = 0;
    patchNum = 0;
    prerelease = '';
  } else if (type === 'minor') {
    minorNum++;
    patchNum = 0;
    prerelease = '';
  } else if (type === 'patch') {
    patchNum++;
    prerelease = '';
  } else if (type === 'prerelease') {
    // If already a prerelease, increment patch
    if (!prerelease) {
      patchNum++;
    }
    prerelease = prereleaseId || '';
  }

  let newVersion = `${majorNum}.${minorNum}.${patchNum}`;
  if (prerelease) {
    newVersion += `-${prerelease}`;
  }

  return newVersion;
}

// Collect package information
log('📋 Analyzing packages...', 'blue');
console.log();

const packages: PackageInfo[] = [];

for (const shortName of targetPackages) {
  const pkgInfo = getPackageInfo(shortName);

  if (!pkgInfo) {
    log(`❌ Error: Package '${shortName}' not found or invalid`, 'red');
    console.log();
    log('Available packages:');
    allPackages.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }

  // Calculate new version
  try {
    pkgInfo.newVersion = bumpVersion(pkgInfo.currentVersion, versionType, prereleaseId);
  } catch (error) {
    log(`❌ Error calculating version for ${shortName}: ${error}`, 'red');
    process.exit(1);
  }

  packages.push(pkgInfo);

  log(`  ✓ ${pkgInfo.name}`, 'green');
  console.log(`    ${pkgInfo.currentVersion} → ${pkgInfo.newVersion}`);
}

console.log();
log('──────────────────────────────────────', 'blue');
log('📊 Summary', 'blue');
log('──────────────────────────────────────', 'blue');
console.log(`  Packages to update: ${packages.length}`);
console.log(`  NPM packages: ${packages.filter(p => p.type === 'npm').length}`);
console.log(`  Dart packages: ${packages.filter(p => p.type === 'dart').length}`);
if (isPrerelease) {
  console.log(`  Release type: Prerelease (${prereleaseType})`);
} else {
  console.log(`  Version bump: ${versionType}`);
}
console.log();

// Calculate root package version
const rootPackageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
const currentRootVersion = rootPackageJson.version;

// Get all package versions after updates
const allCurrentVersions = readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => {
    const pkgInfo = getPackageInfo(dirent.name);
    if (!pkgInfo) return null;

    // If this package is being updated, use new version
    const updatedPkg = packages.find(p => p.shortName === dirent.name);
    return updatedPkg ? updatedPkg.newVersion : pkgInfo.currentVersion;
  })
  .filter((v): v is string => v !== null);

// Find highest package version (strip prerelease for comparison)
const stripPrerelease = (v: string) => v.split('-')[0];
const sortedVersions = allCurrentVersions
  .map(v => ({ original: v, base: stripPrerelease(v) }))
  .sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.base.split('.').map(Number);
    const [bMajor, bMinor, bPatch] = b.base.split('.').map(Number);

    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });

const highestPackageVersion = isPrerelease
  ? sortedVersions[0].original
  : sortedVersions[0].base;

// Calculate new root version:
// - The root must be >= highest package version
// - The root must ALWAYS be bumped when packages are updated (to create a new tag)
let newRootVersion: string;

const currentRootBase = stripPrerelease(currentRootVersion);
const highestPkgBase = stripPrerelease(highestPackageVersion);

// Compare versions to see if highest package is greater than current root
const compareVersions = (v1: string, v2: string): number => {
  const [v1Major, v1Minor, v1Patch] = v1.split('.').map(Number);
  const [v2Major, v2Minor, v2Patch] = v2.split('.').map(Number);

  if (v1Major !== v2Major) return v1Major - v2Major;
  if (v1Minor !== v2Minor) return v1Minor - v2Minor;
  return v1Patch - v2Patch;
};

if (compareVersions(highestPkgBase, currentRootBase) > 0) {
  // Highest package version is greater than current root, use it
  newRootVersion = highestPackageVersion;
} else {
  // Highest package is <= current root, so bump the root by the same increment
  newRootVersion = bumpVersion(currentRootVersion, versionType, prereleaseId);
}

log('🔍 Root package version:', 'blue');
console.log(`  Current: ${currentRootVersion}`);
console.log(`  Highest package: ${highestPackageVersion}`);
console.log(`  New:     ${newRootVersion}`);
console.log();

// Confirmation
log('──────────────────────────────────────', 'yellow');

(async () => {
  let answer: string;
  try {
    answer = await getResponse(colors.yellow + 'Proceed with version bump? [y/N]: ' + colors.reset);
  } catch (error) {
    log('❌ Error getting user response: ' + error, 'red');
    process.exit(1);
  }

  log('──────────────────────────────────────', 'yellow');

  if (answer.toLowerCase() !== 'y') {
    log('❌ Version bump cancelled', 'red');
    process.exit(0);
  }

  console.log();
  log('✅ Confirmed! Applying version changes...', 'green');
  console.log();

  // Apply version changes
  for (const pkg of packages) {
    if (pkg.type === 'npm') {
      // Update package.json using npm version
      const packageJsonPath = join(pkg.path, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      packageJson.version = pkg.newVersion;
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    } else if (pkg.type === 'dart') {
      // Update pubspec.yaml
      const pubspecPath = join(pkg.path, 'pubspec.yaml');
      let pubspecContent = readFileSync(pubspecPath, 'utf-8');
      pubspecContent = pubspecContent.replace(
        /^version:\s*.*$/m,
        `version: ${pkg.newVersion}`
      );
      writeFileSync(pubspecPath, pubspecContent);
    }

    log(`  ✓ Updated ${pkg.shortName} to ${pkg.newVersion}`, 'green');
  }

  // Update root package.json
  console.log();
  log('🔄 Updating root package.json...', 'blue');
  rootPackageJson.version = newRootVersion;
  writeFileSync('package.json', JSON.stringify(rootPackageJson, null, 2) + '\n');
  log(`  ✓ Root version set to ${newRootVersion}`, 'green');

  // Commit changes
  console.log();
  log('📝 Committing version changes...', 'blue');
  execSync('git add .');

  // Create commit message
  let commitMsg: string;
  if (isPrerelease) {
    if (packages.length === 1) {
      commitMsg = `chore: prerelease ${packages[0].name} v${packages[0].newVersion}`;
    } else if (packages.length === allPackages.length) {
      commitMsg = `chore: prerelease v${newRootVersion}`;
    } else {
      commitMsg = `chore: prerelease ${packages.length} packages v${newRootVersion}`;
    }
  } else {
    if (packages.length === 1) {
      commitMsg = `chore: bump ${packages[0].name} to v${packages[0].newVersion}`;
    } else if (packages.length === allPackages.length) {
      commitMsg = `chore: release v${newRootVersion}`;
    } else {
      commitMsg = `chore: bump ${packages.length} packages to v${newRootVersion}`;
    }
  }

  execSync(`git commit -m "${commitMsg}"`);
  log(`  ✓ Committed: ${commitMsg}`, 'green');

  // Create git tag
  console.log();

  // For Dart packages, use flutter-v prefix, otherwise use v prefix
  const dartPackages = packages.filter(p => p.type === 'dart');
  let tagPrefix = 'v';
  if (dartPackages.length > 0 && packages.length === dartPackages.length) {
    tagPrefix = 'flutter-v';
  }

  const tagName = `${tagPrefix}${newRootVersion}`;
  log(`🏷️  Creating git tag: ${tagName}`, 'blue');

  try {
    execSync(`git tag -a "${tagName}" -m "Release ${tagName}"`);
  } catch (error) {
    log(`⚠️  Tag ${tagName} already exists, skipping tag creation`, 'yellow');
  }

  console.log();
  log('──────────────────────────────────────', 'green');
  log('✅ Version bump complete!', 'green');
  log('──────────────────────────────────────', 'green');
  console.log();
  console.log(`Root version: ${currentRootVersion} → ${newRootVersion}`);
  console.log();
  console.log('Updated packages:');
  packages.forEach((pkg) => {
    console.log(`  • ${pkg.name}: ${pkg.currentVersion} → ${pkg.newVersion}`);
  });
  console.log();
  log('Next steps:', 'blue');
  console.log('  1. Review changes: git show');
  console.log('  2. Push to remote: git push && git push --tags');
  if (isPrerelease) {
    console.log("  3. GitHub Actions will publish with '@next' tag on NPM");
    console.log();
    log('Installation:', 'blue');
    console.log('  npm install @agenteract/core@next');
    console.log(`  npm install @agenteract/core@${newRootVersion}`);
  } else {
    console.log('  3. GitHub Actions will publish only updated packages to NPM');
  }
  console.log();
  log('To undo:', 'yellow');
  console.log('  git reset --hard HEAD~1');
  console.log(`  git tag -d ${tagName}`);
  console.log();
})().catch((error) => {
  log('❌ Unexpected error: ' + error, 'red');
  process.exit(1);
});
