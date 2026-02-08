#!/usr/bin/env tsx
/**
 * Script to publish packages to local Verdaccio for local testing
 * 
 * Features:
 * - Smart caching: Only rebuilds packages when dist/ changes
 * - Dependency tracking: Rebuilds dependents when dependencies change
 * - E2E versioning: Uses bumped patch versions (0.1.2 -> 0.1.3-e2e.0)
 * 
 * Usage:
 *   tsx scripts/publish-local.ts              # Smart caching (local dev)
 *   tsx scripts/publish-local.ts --no-cache   # Force rebuild (like CI)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  calculateDistHash, 
  getCachedBuild, 
  cacheBuild, 
  getNextE2EVersion,
  createMetadata,
  type BuildCacheMetadata 
} from './build-cache.js';
import { 
  buildDependencyGraph, 
  getDependents, 
  getPublishOrder,
  type DependencyGraph 
} from './dependency-graph.js';

const VERDACCIO_URL = process.env.VERDACCIO_URL || 'http://localhost:4873';
const VERDACCIO_USER = process.env.VERDACCIO_USER || 'test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

async function checkVerdaccioRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${VERDACCIO_URL}/-/ping`);
    return response.ok;
  } catch {
    return false;
  }
}

function configureRegistry(): void {
  console.log('📝 Configuring npm registry...');
  execSync(`npm config set registry "${VERDACCIO_URL}"`, { stdio: 'inherit' });
  execSync(`pnpm config set registry "${VERDACCIO_URL}"`, { stdio: 'inherit' });
}

function checkAuthentication(): boolean {
  try {
    const result = execSync(`npm whoami --registry "${VERDACCIO_URL}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`✓ Already authenticated as: ${result.trim()}`);
    return true;
  } catch {
    return false;
  }
}

function authenticate(): boolean {
  console.log(`   Authenticating user '${VERDACCIO_USER}'...`);

  const authScriptPath = join(__dirname, 'verdaccio-auth.ts');
  const result = spawnSync('npx', ['tsx', authScriptPath], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    console.log('✓ Successfully authenticated');
    return true;
  } else {
    console.log('❌ Authentication failed');
    console.log('');
    console.log('Or authenticate manually:');
    console.log(`  npm adduser --registry ${VERDACCIO_URL}`);
    return false;
  }
}

function buildPackages(): void {
  console.log('');
  console.log('📦 Building packages...');
  try {
    // Build with explicit error handling
    const buildResult = execSync('pnpm run build', { 
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Check for TypeScript errors in output
    if (buildResult.includes('error TS') || buildResult.includes('Found')) {
      console.error('❌ TypeScript compilation errors detected:');
      console.error(buildResult);
      process.exit(1);
    }
    
    console.log('✓ Build command completed');
    
    // Verify core package was built
    const coreDistPath = join(PROJECT_ROOT, 'packages', 'core', 'dist');
    if (!existsSync(coreDistPath)) {
      console.error('❌ Build failed: dist directory not created for @agenteract/core');
      console.error(`   Expected: ${coreDistPath}`);
      process.exit(1);
    }
    
    const coreCjsPath = join(coreDistPath, 'cjs', 'src', 'index.js');
    const coreEsmPath = join(coreDistPath, 'esm', 'src', 'index.js');
    
    if (!existsSync(coreCjsPath)) {
      console.error(`❌ Build failed: Missing ${coreCjsPath}`);
      console.error('   This suggests TypeScript compilation did not produce the expected output.');
      console.error('   Check TypeScript configuration and ensure build scripts are working correctly.');
      process.exit(1);
    }
    if (!existsSync(coreEsmPath)) {
      console.error(`❌ Build failed: Missing ${coreEsmPath}`);
      process.exit(1);
    }
    
    console.log('✓ Build files verified');
  } catch (error: any) {
    console.error('❌ Build failed');
    console.error(`   Error: ${error.message}`);
    if (error.stdout) {
      console.error('   stdout:', error.stdout);
    }
    if (error.stderr) {
      console.error('   stderr:', error.stderr);
    }
    process.exit(1);
  }
}

/**
 * Build specific packages only
 */
function buildSpecificPackages(packagePaths: string[]): void {
  console.log('');
  console.log(`📦 Building ${packagePaths.length} package(s)...`);
  
  for (const pkgPath of packagePaths) {
    const packageJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
    console.log(`   Building ${packageJson.name}...`);
    
    try {
      execSync('pnpm run build', { 
        cwd: pkgPath,
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      console.log(`   ✓ ${packageJson.name} built`);
    } catch (error: any) {
      console.error(`   ❌ Failed to build ${packageJson.name}`);
      console.error(`      Error: ${error.message}`);
      throw error;
    }
  }
  
  console.log('✓ Specific packages built');
}

interface PublishResult {
  name: string;
  status: 'published' | 'already-exists' | 'failed';
}

function verifyBuildFiles(packageDir: string, packageJson: any): boolean {
  // Check if package has a files field that includes dist
  if (packageJson.files && Array.isArray(packageJson.files)) {
    const hasDistFiles = packageJson.files.some((pattern: string) => 
      pattern.includes('dist') && !pattern.startsWith('!')
    );
    
    if (hasDistFiles) {
      // Check if dist directory exists and has files
      const distPath = join(packageDir, 'dist');
      if (!existsSync(distPath)) {
        console.error(`   ⚠️  ${packageJson.name}: dist directory does not exist`);
        return false;
      }
      
      // For core package, check specific expected files
      if (packageJson.name === '@agenteract/core') {
        const cjsPath = join(distPath, 'cjs', 'src', 'index.js');
        const esmPath = join(distPath, 'esm', 'src', 'index.js');
        if (!existsSync(cjsPath)) {
          console.error(`   ⚠️  ${packageJson.name}: Missing dist/cjs/src/index.js`);
          return false;
        }
        if (!existsSync(esmPath)) {
          console.error(`   ⚠️  ${packageJson.name}: Missing dist/esm/src/index.js`);
          return false;
        }
      }
    }
  }
  
  return true;
}

function publishPackage(packageDir: string, version?: string, versionMap?: Map<string, string>): PublishResult {
  const packageJsonPath = join(packageDir, 'package.json');
  let packageName = 'unknown';
  let packageJson: any = null;
  let originalVersion: string | undefined;
  let originalPackageJson: string | undefined;

  try {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(packageJsonContent);
    packageName = packageJson.name;
    
    // Track if we need to restore package.json
    let needsRestore = false;
    
    // If a version is provided, temporarily update package.json
    if (version && version !== packageJson.version) {
      originalVersion = packageJson.version;
      packageJson.version = version;
      needsRestore = true;
    }
    
    // Update inter-package dependencies to use e2e versions
    if (versionMap && versionMap.size > 0) {
      if (!needsRestore) {
        originalPackageJson = packageJsonContent;
      }
      
      let updated = false;
      ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
        if (packageJson[depType]) {
          Object.keys(packageJson[depType]).forEach(depName => {
            const e2eVersion = versionMap.get(depName);
            if (e2eVersion) {
              packageJson[depType][depName] = e2eVersion;
              updated = true;
            }
          });
        }
      });
      
      if (updated) {
        needsRestore = true;
      }
    }
    
    // Write updated package.json if needed
    if (needsRestore) {
      if (!originalPackageJson) {
        originalPackageJson = packageJsonContent;
      }
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    }
  } catch (error) {
    console.error(`   ❌ Failed to read package.json at ${packageJsonPath}: ${error}`);
    return { name: packageName, status: 'failed' };
  }

  // Verify build files exist before publishing
  if (!verifyBuildFiles(packageDir, packageJson)) {
    console.error(`   ❌ ${packageName}: Build files missing, skipping publish`);
    
    // Restore original package.json if needed
    if (originalPackageJson) {
      writeFileSync(packageJsonPath, originalPackageJson);
    }
    
    return { name: packageName, status: 'failed' };
  }

  // pnpm publish will use the versions we set in package.json
  const result = spawnSync(
    'pnpm',
    ['publish', '--registry', VERDACCIO_URL, '--no-git-checks'],
    {
      cwd: packageDir,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    }
  );

  // Restore original package.json if needed
  if (originalPackageJson) {
    writeFileSync(packageJsonPath, originalPackageJson);
  }

  const output = (result.stdout || '') + (result.stderr || '');

  if (output.includes('this package is already present')) {
    return { name: packageName, status: 'already-exists' };
  } else if (output.includes('Publishing') || result.status === 0) {
    return { name: packageName, status: 'published' };
  } else {
    return { name: packageName, status: 'failed' };
  }
}

function publishPackages(): { published: number; alreadyExists: number; failed: number } {
  console.log('');
  console.log('📤 Publishing packages to Verdaccio...');

  const packagesDir = join(PROJECT_ROOT, 'packages');
  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(packagesDir, dirent.name))
    .filter(dir => existsSync(join(dir, 'package.json'))); // Only include dirs with package.json

  let publishedCount = 0;
  let alreadyExistsCount = 0;
  let failedCount = 0;

  for (const packageDir of packageDirs) {
    const result = publishPackage(packageDir);

    switch (result.status) {
      case 'published':
        console.log(`   ✅ ${result.name} (published)`);
        publishedCount++;
        break;
      case 'already-exists':
        console.log(`   ⏭️  ${result.name} (already exists)`);
        alreadyExistsCount++;
        break;
      case 'failed':
        console.log(`   ❌ ${result.name} (failed)`);
        failedCount++;
        break;
    }
  }

  return { published: publishedCount, alreadyExists: alreadyExistsCount, failed: failedCount };
}

/**
 * Extract @agenteract/* dependency versions from package.json
 */
function extractAgenteractDeps(packageJson: any): Record<string, string> {
  const deps: Record<string, string> = {};
  ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
    if (packageJson[depType]) {
      Object.keys(packageJson[depType]).forEach(key => {
        if (key.startsWith('@agenteract/')) {
          deps[key] = packageJson[depType][key];
        }
      });
    }
  });
  return deps;
}

/**
 * Smart publish with caching - only rebuilds packages when dist/ changes
 */
async function smartPublishPackages(): Promise<{ published: number; alreadyExists: number; failed: number; cached: number }> {
  console.log('');
  console.log('📤 Smart publishing packages to Verdaccio...');
  
  const packagesDir = join(PROJECT_ROOT, 'packages');
  
  // Build dependency graph
  const depGraph = buildDependencyGraph(packagesDir);
  
  // Get all packages
  const allPackages = Object.keys(depGraph);
  
  // Track what needs to be rebuilt
  const packagesToRebuild = new Map<string, { path: string; baseVersion: string; reason: string }>();
  const cachedPackages = new Map<string, { path: string; metadata: BuildCacheMetadata }>();
  let cachedCount = 0;
  
  console.log('🔍 Analyzing packages for changes...');
  
  // First pass: Check each package for changes
  for (const packageName of allPackages) {
    const packagePath = depGraph[packageName].packagePath;
    const packageJsonPath = join(packagePath, 'package.json');
    
    if (!existsSync(packageJsonPath)) continue;
    
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const baseVersion = packageJson.version;
    
    // Calculate dist hash
    const distHash = calculateDistHash(packagePath);
    
    if (!distHash) {
      // No dist directory - needs build
      packagesToRebuild.set(packageName, { 
        path: packagePath, 
        baseVersion,
        reason: 'no dist directory'
      });
      console.log(`   ⚠️  ${packageName}: No dist/ found, needs build`);
      continue;
    }
    
    // Extract current dependency base versions
    const currentDepVersions = extractAgenteractDeps(packageJson);
    
    // Check cache (matches dist hash + dependency base versions)
    const cached = getCachedBuild(packageName, distHash, currentDepVersions);
    
    if (cached) {
      // Cache hit! No rebuild needed
      console.log(`   ✓ ${packageName}: Cached (${distHash})`);
      cachedPackages.set(packageName, { path: packagePath, metadata: cached });
      cachedCount++;
    } else {
      // Cache miss - needs rebuild
      packagesToRebuild.set(packageName, { 
        path: packagePath, 
        baseVersion,
        reason: `dist changed (${distHash})`
      });
      console.log(`   🔨 ${packageName}: Needs rebuild (${cached ? 'version changed' : 'new dist hash'})`);
    }
  }
  
  // Second pass: Add dependents to rebuild list
  const initialRebuildPackages = new Set(packagesToRebuild.keys());
  for (const packageName of initialRebuildPackages) {
    const dependents = getDependents(packageName, depGraph);
    for (const dependent of dependents) {
      if (!packagesToRebuild.has(dependent)) {
        const packagePath = depGraph[dependent].packagePath;
        const packageJsonPath = join(packagePath, 'package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        
        packagesToRebuild.set(dependent, {
          path: packagePath,
          baseVersion: packageJson.version,
          reason: `depends on ${packageName}`
        });
        
        // Remove from cached packages since we need to rebuild with new dependency versions
        if (cachedPackages.has(dependent)) {
          cachedPackages.delete(dependent);
          cachedCount--;
        }
        
        console.log(`   ↪️  ${dependent}: Rebuild needed (depends on ${packageName})`);
      }
    }
  }
  
  // Check if anything needs rebuild
  if (packagesToRebuild.size === 0) {
    console.log('');
    console.log('✅ All packages cached, nothing to rebuild!');
    console.log(`   Cached: ${cachedCount} package(s)`);
    return { published: 0, alreadyExists: cachedCount, failed: 0, cached: cachedCount };
  }
  
  console.log('');
  console.log(`📦 Need to rebuild ${packagesToRebuild.size} package(s):`);
  for (const [name, info] of packagesToRebuild) {
    console.log(`   • ${name} (${info.reason})`);
  }
  
  // Get build order
  const buildOrder = getPublishOrder([...packagesToRebuild.keys()], depGraph);
  
  console.log('');
  console.log(`🔨 Building in dependency order:`);
  buildOrder.forEach((pkg, i) => console.log(`   ${i + 1}. ${pkg}`));
  
  // Build each package
  const packagePaths = buildOrder.map(name => packagesToRebuild.get(name)!.path);
  buildSpecificPackages(packagePaths);
  
  // Publish each package with e2e version
  console.log('');
  console.log('📤 Publishing packages...');
  
  // First pass: generate all e2e versions
  const versionMap = new Map<string, string>();
  for (const packageName of buildOrder) {
    const info = packagesToRebuild.get(packageName)!;
    const { baseVersion } = info;
    const e2eVersion = getNextE2EVersion(baseVersion, packageName);
    versionMap.set(packageName, e2eVersion);
  }
  
  // Also include cached packages in version map so dependencies work
  for (const [packageName, cachedInfo] of cachedPackages) {
    versionMap.set(packageName, cachedInfo.metadata.version);
  }
  
  let publishedCount = 0;
  let alreadyExistsCount = 0;
  let failedCount = 0;
  
  // Second pass: publish with updated dependencies
  for (const packageName of buildOrder) {
    const info = packagesToRebuild.get(packageName)!;
    const { path: packagePath, baseVersion } = info;
    const e2eVersion = versionMap.get(packageName)!;
    
    console.log(`   Publishing ${packageName}@${e2eVersion}...`);
    
    // Publish with e2e version and version map for inter-package dependencies
    const result = publishPackage(packagePath, e2eVersion, versionMap);
    
    if (result.status === 'published' || result.status === 'already-exists') {
      // Success! Cache this build (even if already published to Verdaccio)
      const distHash = calculateDistHash(packagePath)!;
      
      // Read package.json to get current dependency base versions (before we modified them)
      const packageJsonPath = join(packagePath, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const depVersions = extractAgenteractDeps(packageJson);
      
      const metadata = createMetadata(packageName, e2eVersion, baseVersion, distHash, depVersions);
      cacheBuild(metadata);
      
      if (result.status === 'published') {
        console.log(`   ✅ ${packageName}@${e2eVersion} (published & cached)`);
        publishedCount++;
      } else {
        console.log(`   ⏭️  ${packageName}@${e2eVersion} (already exists, cached)`);
        alreadyExistsCount++;
      }
    } else {
      console.log(`   ❌ ${packageName}@${e2eVersion} (failed)`);
      failedCount++;
    }
  }
  
  return { published: publishedCount, alreadyExists: alreadyExistsCount, failed: failedCount, cached: cachedCount };
}

async function main(): Promise<void> {
  console.log(`🔧 Publishing to Verdaccio at ${VERDACCIO_URL}`);

  // Check for --no-cache flag
  const useCache = !process.argv.includes('--no-cache') && !process.env.CI;
  
  if (useCache) {
    console.log('💡 Smart caching enabled (local development mode)');
    console.log('   Use --no-cache to force rebuild all packages');
  } else {
    console.log('🔄 Cache disabled (CI mode or --no-cache flag)');
    console.log('🗑️  Clearing Verdaccio storage for @agenteract packages...');
    try {
      execSync('rm -rf .verdaccio/storage/@agenteract', { stdio: 'inherit' });
      console.log('✓ Verdaccio storage cleared');
    } catch (error) {
      console.log('⚠️  Could not clear Verdaccio storage (might not exist yet)');
    }
  }

  // Check if Verdaccio is running
  const isRunning = await checkVerdaccioRunning();
  if (!isRunning) {
    console.log(`❌ Error: Verdaccio is not running at ${VERDACCIO_URL}`);
    console.log('   Start with: pnpm verdaccio:start');
    process.exit(1);
  }

  console.log('✓ Verdaccio is running');

  // Configure npm to use local registry
  configureRegistry();

  // Setup authentication
  console.log('🔐 Setting up authentication...');

  const isAuthenticated = checkAuthentication();
  if (!isAuthenticated) {
    const authSuccess = authenticate();
    if (!authSuccess) {
      process.exit(1);
    }
  }

  let published = 0;
  let alreadyExists = 0;
  let failed = 0;
  let cached = 0;

  if (useCache) {
    // Smart publishing with caching
    const result = await smartPublishPackages();
    published = result.published;
    alreadyExists = result.alreadyExists;
    failed = result.failed;
    cached = result.cached;
  } else {
    // Traditional flow: build all, publish all
    buildPackages();
    const result = publishPackages();
    published = result.published;
    alreadyExists = result.alreadyExists;
    failed = result.failed;
  }

  // Summary
  console.log('');
  console.log('──────────────────────────────────────');
  if (published > 0) {
    console.log(`✅ Successfully published ${published} package(s)`);
  }
  if (cached > 0) {
    console.log(`💾 Used cache for ${cached} package(s)`);
  }
  if (alreadyExists > 0) {
    console.log(`ℹ️  ${alreadyExists} package(s) already existed`);
  }
  if (failed > 0) {
    console.log(`❌ ${failed} package(s) failed`);
    console.log('');
    console.log('To republish, restart Verdaccio to clear packages:');
    console.log('  pnpm verdaccio:stop && pnpm verdaccio:start --clean');
    process.exit(1);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  • Test installation: pnpm test:integration');
  console.log(`  • Install a package: npm install @agenteract/core --registry ${VERDACCIO_URL}`);
  console.log('  • Stop when done: pnpm verdaccio:stop');
  
  if (useCache) {
    console.log('');
    console.log('Cache management:');
    console.log('  • View cache: pnpm cache:status');
    console.log('  • Clear cache: pnpm cache:clear');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
