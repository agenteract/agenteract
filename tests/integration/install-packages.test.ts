#!/usr/bin/env tsx
/**
 * Integration test: Verify packages can be installed and imported
 * This test assumes packages are already published to the configured registry
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
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

  // Test 1: CommonJS require
  console.log('Test 1: CommonJS import...');
  try {
    execSync(
      `node -e "const core = require('@agenteract/core'); console.log('✓ @agenteract/core imported successfully');"`,
      { stdio: 'pipe' }
    );
  } catch {
    console.error('❌ Failed to import @agenteract/core via CommonJS');
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
    execSync('node test.mjs', { stdio: 'pipe' });
  } catch {
    console.error('❌ Failed to import @agenteract/core via ESM');
    process.exit(1);
  }

  // Test 3: Verify workspace dependencies are resolved
  console.log('Test 3: Checking workspace dependencies...');
  try {
    execSync(
      `node -e "const react = require('@agenteract/react'); console.log('✓ @agenteract/react and its dependencies imported successfully');"`,
      { stdio: 'pipe' }
    );
  } catch {
    console.error('❌ Failed to import @agenteract/react');
    process.exit(1);
  }

  // Test 4: Check package.json exports
  console.log('Test 4: Verifying package exports...');
  try {
    execSync(
      `node -e "const corePackage = require('@agenteract/core/package.json'); if (!corePackage.exports) { throw new Error('Package exports not found'); } console.log('✓ Package exports are properly configured');"`,
      { stdio: 'pipe' }
    );
  } catch {
    console.error('❌ Package exports verification failed');
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
    execSync(`npx @agenteract/agents hierarchy my-project > "${hierarchyPath}"`, {
      shell: true,
    });
    const hierarchy = execSync(`cat "${hierarchyPath}"`, { encoding: 'utf-8' });
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
