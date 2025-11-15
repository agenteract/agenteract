#!/usr/bin/env tsx
/**
 * Integration test: Verify packages can be installed and imported
 * This test assumes packages are already published to the configured registry
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_DIR = join(tmpdir(), `agenteract-integration-test-${process.pid}`);
const REGISTRY = process.env.REGISTRY || 'http://localhost:4873';
const START_DIR = process.cwd();

function cleanupTestDir() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// Helper function to execute Node.js code reliably on Windows
function execNodeCode(code: string, description: string): void {
  const testFile = join(TEST_DIR, `test-${Date.now()}.js`);
  try {
    writeFileSync(testFile, code);
    const execOptions: any = { 
      stdio: 'pipe',
      cwd: TEST_DIR
    };
    if (process.platform === 'win32') {
      execOptions.shell = true;
    }
    execSync(`node "${testFile}"`, execOptions);
    unlinkSync(testFile);
  } catch (error: any) {
    try {
      unlinkSync(testFile);
    } catch {
      // Ignore cleanup errors
    }
    const errorMessage = error?.stderr?.toString() || error?.message || 'Unknown error';
    console.error(`❌ ${description}`);
    console.error(`Error details: ${errorMessage}`);
    throw error;
  }
}

async function main() {
  console.log('🧪 Running integration tests...');
  console.log(`Registry: ${REGISTRY}`);

  // Clean npm cache
  execSync('npm cache clean --force', { stdio: 'ignore' });

  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);

  // Initialize test project
  console.log('Initializing test project...');
  execSync('npm init -y', { stdio: 'ignore' });

  // Install packages
  console.log(`Installing @agenteract packages from ${REGISTRY}...`);
  execSync(
    `npm install @agenteract/core @agenteract/react @agenteract/agents --registry "${REGISTRY}"`,
    { stdio: 'inherit' }
  );

  // Verify package structure after installation
  console.log('Verifying installed package structure...');
  const corePackagePath = join(TEST_DIR, 'node_modules', '@agenteract', 'core');
  const corePackageJsonPath = join(corePackagePath, 'package.json');
  const expectedCjsPath = join(corePackagePath, 'dist', 'cjs', 'src', 'index.js');
  const expectedEsmPath = join(corePackagePath, 'dist', 'esm', 'src', 'index.js');

  if (!existsSync(corePackageJsonPath)) {
    console.error(`❌ Package not installed: ${corePackageJsonPath}`);
    process.exit(1);
  }

  const corePackageJson = JSON.parse(readFileSync(corePackageJsonPath, 'utf-8'));
  console.log(`✓ Package installed: ${corePackageJson.name}@${corePackageJson.version}`);

  if (!existsSync(expectedCjsPath)) {
    console.error(`❌ Missing CommonJS build file: ${expectedCjsPath}`);
    console.error(`   This indicates the package was published without being built.`);
    console.error(`   Please run: pnpm run build && pnpm verdaccio:publish`);
    process.exit(1);
  }

  if (!existsSync(expectedEsmPath)) {
    console.error(`❌ Missing ESM build file: ${expectedEsmPath}`);
    console.error(`   This indicates the package was published without being built.`);
    console.error(`   Please run: pnpm run build && pnpm verdaccio:publish`);
    process.exit(1);
  }

  console.log('✓ Package structure verified');

  // Test 1: CommonJS require
  console.log('Test 1: CommonJS import...');
  try {
    execNodeCode(
      `const core = require('@agenteract/core');\nconsole.log('✓ @agenteract/core imported successfully');`,
      'Failed to import @agenteract/core via CommonJS'
    );
  } catch (error: any) {
    // Additional diagnostics if import fails despite file existing
    if (existsSync(expectedCjsPath)) {
      console.error(`   File exists but import failed. Checking file content...`);
      try {
        const fileContent = readFileSync(expectedCjsPath, 'utf-8');
        console.error(`   File size: ${fileContent.length} bytes`);
        console.error(`   First 200 chars: ${fileContent.substring(0, 200)}`);
      } catch (e) {
        console.error(`   Could not read file: ${e}`);
      }
    }
    process.exit(1);
  }

  // Test 2: ESM import
  console.log('Test 2: ESM import...');
  writeFileSync(
    join(TEST_DIR, 'test.mjs'),
    `import '@agenteract/core';
console.log('✓ @agenteract/core imported via ESM');
`
  );
  try {
    const execOptions: any = { 
      stdio: 'pipe',
      cwd: TEST_DIR
    };
    if (process.platform === 'win32') {
      execOptions.shell = true;
    }
    execSync('node test.mjs', execOptions);
  } catch (error: any) {
    const errorMessage = error?.stderr?.toString() || error?.message || 'Unknown error';
    console.error('❌ Failed to import @agenteract/core via ESM');
    console.error(`Error details: ${errorMessage}`);
    process.exit(1);
  }

  // Test 3: Verify workspace dependencies are resolved
  console.log('Test 3: Checking workspace dependencies...');
  try {
    execNodeCode(
      `const react = require('@agenteract/react');\nconsole.log('✓ @agenteract/react and its dependencies imported successfully');`,
      'Failed to import @agenteract/react'
    );
  } catch {
    process.exit(1);
  }

  // Test 4: Check package.json exports
  console.log('Test 4: Verifying package exports...');
  try {
    execNodeCode(
      `const corePackage = require('@agenteract/core/package.json');\nif (!corePackage.exports) { throw new Error('Package exports not found'); }\nconsole.log('✓ Package exports are properly configured');`,
      'Package exports verification failed'
    );
  } catch {
    process.exit(1);
  }

  // Test 5: @agenteract/agents CLI
  console.log('Test 5: Verifying @agenteract/agents CLI...');

  // Create mock agenteract.config.js for the CLI to find
  writeFileSync(
    join(TEST_DIR, 'agenteract.config.js'),
    `export default {
  port: 8766,
  projects: [
    {
      name: 'my-project',
      path: './app',
      type: 'native'
    },
    {
      name: 'expo-app',
      path: './expo',
      devServer: {
        command: 'npx expo start',
        port: 8790
      }
    },
    {
      name: 'vite-app',
      path: './vite',
      devServer: {
        command: 'npx vite',
        port: 8791
      }
    }
  ]
};
`
  );

  // Start mock server
  console.log(TEST_DIR);
  const mockServerPath = join(START_DIR, 'tests', 'integration', 'mock-server.ts');
  const serverProcess = spawn('npx', ['tsx', mockServerPath], {
    stdio: 'ignore',
    detached: false,
    shell: process.platform === 'win32',
  });

  // Give servers time to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Cleanup server on exit
  const cleanupServer = () => {
    try {
      serverProcess.kill();
    } catch {
      // Ignore errors
    }
  };
  process.on('exit', cleanupServer);
  process.on('SIGINT', () => {
    cleanupServer();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanupServer();
    process.exit(143);
  });

  // Run CLI tests
  console.log('Running @agenteract/agents CLI tests...');

  try {
    const logs = execSync('npx @agenteract/agents logs my-project', { encoding: 'utf-8' });
    if (!logs.includes('agent log line 1')) {
      throw new Error('agents: logs command failed');
    }
    console.log('✓ agents: logs command works');
  } catch (error) {
    console.error('❌ agents: logs command failed');
    cleanupServer();
    process.exit(1);
  }

  try {
    const devLogs = execSync('npx @agenteract/agents dev-logs expo-app', { encoding: 'utf-8' });
    if (!devLogs.includes('expo log line 1')) {
      throw new Error('agents: dev-logs expo-app command failed');
    }
    console.log('✓ agents: dev-logs expo-app command works');
  } catch {
    console.error('❌ agents: dev-logs expo-app command failed');
    cleanupServer();
    process.exit(1);
  }

  try {
    const viteLogs = execSync('npx @agenteract/agents dev-logs vite-app', { encoding: 'utf-8' });
    if (!viteLogs.includes('vite log line 1')) {
      throw new Error('agents: dev-logs vite-app command failed');
    }
    console.log('✓ agents: dev-logs vite-app command works');
  } catch {
    console.error('❌ agents: dev-logs vite-app command failed');
    cleanupServer();
    process.exit(1);
  }

  try {
    execSync('npx @agenteract/agents cmd expo-app r', { stdio: 'pipe' });
    console.log("✓ Sent command 'r' to expo-app");
    console.log('✓ agents: cmd expo-app command works');
  } catch {
    console.error('❌ agents: cmd expo-app command failed');
    cleanupServer();
    process.exit(1);
  }

  try {
    const hierarchyPath = join(tmpdir(), 'hierarchy.txt');
    const execOptions: any = {};
    if (process.platform === 'win32') {
      execOptions.shell = true;
    }
    execSync(`npx @agenteract/agents hierarchy my-project > "${hierarchyPath}"`, execOptions);
    const hierarchy = readFileSync(hierarchyPath, 'utf-8');
    if (!hierarchy.includes('"hierarchy":"mock"')) {
      throw new Error('agents: hierarchy command failed');
    }
    console.log('✓ agents: hierarchy command works');
  } catch {
    console.error('❌ agents: hierarchy command failed');
    cleanupServer();
    process.exit(1);
  }

  console.log('');
  console.log('--- Console Logs ---');
  execSync('npx @agenteract/agents logs my-project', { stdio: 'inherit' });

  try {
    execSync('npx @agenteract/agents tap my-project my-button', { stdio: 'pipe' });
    console.log('✓ agents: tap command works');
  } catch {
    console.error('❌ agents: tap command failed');
    cleanupServer();
    process.exit(1);
  }

  console.log('✓ @agenteract/agents CLI tests passed!');

  // Cleanup
  cleanupServer();
  process.chdir('/');
  cleanupTestDir();

  console.log('');
  console.log('✅ All integration tests passed!');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.chdir('/');
  cleanupTestDir();
  process.exit(1);
});
