#!/usr/bin/env tsx
/**
 * Script to publish packages to local Verdaccio for local testing
 * Usage: tsx scripts/publish-local.ts
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    
    // List what's actually in dist to help debug
    console.log('Checking dist directory structure...');
    try {
      const distContents = readdirSync(coreDistPath);
      console.log(`   dist contains: ${distContents.join(', ')}`);
      
      if (existsSync(join(coreDistPath, 'cjs'))) {
        const cjsContents = readdirSync(join(coreDistPath, 'cjs'));
        console.log(`   dist/cjs contains: ${cjsContents.join(', ')}`);
        
        if (existsSync(join(coreDistPath, 'cjs', 'src'))) {
          const cjsSrcContents = readdirSync(join(coreDistPath, 'cjs', 'src'));
          console.log(`   dist/cjs/src contains: ${cjsSrcContents.join(', ')}`);
        }
      }
    } catch (e) {
      // Ignore listing errors
    }
    
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

function publishPackage(packageDir: string): PublishResult {
  const packageJsonPath = join(packageDir, 'package.json');
  let packageName = 'unknown';
  let packageJson: any = null;

  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    packageName = packageJson.name;
  } catch {
    // Unable to read package name
  }

  // Verify build files exist before publishing
  if (packageJson && !verifyBuildFiles(packageDir, packageJson)) {
    console.error(`   ❌ ${packageName}: Build files missing, skipping publish`);
    return { name: packageName, status: 'failed' };
  }

  const result = spawnSync(
    'pnpm',
    ['publish', '--registry', VERDACCIO_URL, '--no-git-checks'],
    {
      cwd: packageDir,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    }
  );

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
    .map(dirent => join(packagesDir, dirent.name));

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

async function main(): Promise<void> {
  console.log(`🔧 Publishing to Verdaccio at ${VERDACCIO_URL}`);

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

  // Build packages
  buildPackages();

  // Publish packages
  const { published, alreadyExists, failed } = publishPackages();

  // Summary
  console.log('');
  console.log('──────────────────────────────────────');
  if (published > 0) {
    console.log(`✅ Successfully published ${published} package(s)`);
  }
  if (alreadyExists > 0) {
    console.log(`ℹ️  ${alreadyExists} package(s) already existed`);
  }
  if (failed > 0) {
    console.log(`❌ ${failed} package(s) failed`);
    console.log('');
    console.log('To republish, restart Verdaccio to clear packages:');
    console.log('  pnpm verdaccio:stop && pnpm verdaccio:start');
    process.exit(1);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  • Test installation: pnpm test:integration');
  console.log(`  • Install a package: npm install @agenteract/core --registry ${VERDACCIO_URL}`);
  console.log('  • Stop when done: pnpm verdaccio:stop');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
