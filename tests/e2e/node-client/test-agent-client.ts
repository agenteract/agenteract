#!/usr/bin/env node
/**
 * E2E Test: AgentClient (Node.js)
 *
 * NOTE: This test focuses specifically on the AgentClient API (WebSocket-based approach).
 * This is the programmatic interface for Node.js integration testing.
 * 
 * For CLI-based examples, see:
 * - tests/e2e/swiftui/test-app-launch-ios.ts
 * - tests/e2e/kotlin/test-app-launch.ts
 * 
 * Tests that the AgentClient can:
 * 1. Connect to Agenteract server via WebSocket
 * 2. Send all interaction commands (tap, input, etc.)
 * 3. Receive and stream logs in real-time
 * 4. Wait for UI elements and log messages
 * 5. Handle agent links
 */

import { ChildProcess } from 'child_process';
import puppeteer, { Browser } from 'puppeteer';
import { readFileSync, existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AgentClient } from '@agenteract/core/node'; 

import {
  info,
  success,
  error,
  startVerdaccio,
  stopVerdaccio,
  publishPackages,
  runCommand,
  assertContains,
  spawnBackground,
  killProcess,
  waitFor,
  sleep,
  setupCleanup,
  getTmpDir,
  preparePackageForVerdaccio,
  restoreNodeModulesCache,
  saveNodeModulesCache,
} from '../common/helpers.js';

let agentServer: ChildProcess | null = null;
let browser: Browser | null = null;
let testConfigDir: string | null = null;
let exampleAppDir: string | null = null;

async function cleanup() {
  info('Cleaning up...');

  if (browser) {
    try {
      await browser.close();
      info('Browser closed');
    } catch (err) {
      // Ignore browser cleanup errors
    }
  }

  if (agentServer) {
    await killProcess(agentServer, 'Agenteract dev');
  }

  // Clean up temp directories (skip in CI to preserve artifacts)
  if (!process.env.CI) {
    if (testConfigDir) {
      try {
        rmSync(testConfigDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    if (exampleAppDir) {
      try {
        rmSync(exampleAppDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  } else {
    // In CI, stop Verdaccio to clean up
    await stopVerdaccio();
  }
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting Agent Client E2E test');

    // 1. Clean up any existing processes on agenteract ports (Unix only)
    if (process.platform !== 'win32') {
      info('Cleaning up any existing processes on agenteract ports...');
      try {
        await runCommand('lsof -ti:8765,8766,8790,8791,8792,5173 | xargs kill -9 2>/dev/null || true');
        await sleep(2000); // Give processes time to die
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    // 2. Start Verdaccio
    await startVerdaccio();

    // 3. Publish packages
    await publishPackages();

    const timestamp = Date.now();

    // 3. Copy react-example to temp directory and prepare
    info('Copying react-example to temp directory...');
    exampleAppDir = join(getTmpDir(), `agenteract-e2e-node-client-app-${timestamp}`);
    
    // Clean up if exists
    if (existsSync(exampleAppDir)) {
      rmSync(exampleAppDir, { recursive: true, force: true });
    }

    const sourceDir = join(process.cwd(), 'examples', 'react-example');
    cpSync(sourceDir, exampleAppDir, { recursive: true });

    // Remove node_modules and lockfile
    const nodeModulesPath = join(exampleAppDir, 'node_modules');
    const packageLockPath = join(exampleAppDir, 'package-lock.json');
    if (existsSync(nodeModulesPath)) {
      rmSync(nodeModulesPath, { recursive: true, force: true });
    }
    if (existsSync(packageLockPath)) {
      rmSync(packageLockPath, { force: true });
    }

    // Prepare package.json for Verdaccio
    await preparePackageForVerdaccio(exampleAppDir);

    // Copy mocks
    const mocksDir = join(exampleAppDir, '__mocks__');
    mkdirSync(mocksDir, { recursive: true });
    const monorepoMocksDir = join(process.cwd(), 'packages', 'react', '__mocks__');
    cpSync(monorepoMocksDir, mocksDir, { recursive: true });

    // Fix vite config
    const viteConfigPath = join(exampleAppDir, 'vite.config.ts');
    const newViteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, '__mocks__/react-native.ts'),
      'expo-linking': path.resolve(__dirname, '__mocks__/expo-linking.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, '__mocks__/async-storage.ts'),
    },
  },
})
`;
    writeFileSync(viteConfigPath, newViteConfig);

    // Install dependencies
    await runCommand(`cd "${exampleAppDir}" && npm install --registry http://localhost:4873`);
    success('React-example prepared');

    // 4. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = join(getTmpDir(), `agenteract-e2e-node-client-test-${timestamp}`);
    mkdirSync(testConfigDir, { recursive: true });
    
    await runCommand(`cd "${testConfigDir}" && npm init -y`);
    await runCommand(`cd "${testConfigDir}" && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/pty --registry http://localhost:4873`);

    // 5. Create agenteract config
    info('Creating agenteract config...');
    await runCommand(
      `cd "${testConfigDir}" && npx @agenteract/cli add-config "${exampleAppDir}" react-app "npm run dev"`
    );

    // 5. Start agenteract dev
    info('Starting agenteract dev...');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Give servers time to start
    await sleep(5000);

    // 6. Launch headless browser
    info('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });

    const page = await browser.newPage();
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Wait for React
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return root && root.children.length > 0;
      },
      { timeout: 30000 }
    );
    success('App loaded');

    // 7. Test AgentClient
    info('Testing AgentClient...');
    
    // Connect client
    const client = new AgentClient('ws://localhost:8765');
    await client.connect();
    success('AgentClient connected');

    // Get Hierarchy
    info('Fetching hierarchy...');
    const hierarchy = await client.getViewHierarchy('react-app');
    info('Hierarchy received');
    assertContains(JSON.stringify(hierarchy), 'Agenteract Web Demo', 'Hierarchy contains title');

    // Tap
    info('Sending tap command...');
    const tapResult = await client.tap('react-app', 'test-button');
    console.log('Tap result:', tapResult);
    assertContains(JSON.stringify(tapResult), '"status":"ok"', 'Tap command ok');

    // Wait for log
    info('Waiting for tap log...');
    await client.waitForLog('react-app', 'Simulate button pressed', 5000);
    success('Log received via subscription');

    // Reset state via Agent Link
    info('Sending agent link...');
    const linkResult = await client.agentLink('react-app', 'agenteract://reset_state');
    console.log('Link result:', linkResult);
    assertContains(JSON.stringify(linkResult), '"status":"ok"', 'Agent link ok');

    // Verify reset log
    await client.waitForLog('react-app', 'reset_state', 5000);
    success('Reset state log received');

    // Test waitForElement
    info('Testing waitForElement...');
    // We know 'test-button' exists
    await client.waitForElement('react-app', 'test-button', 5000);
    success('waitForElement succeeded');

    client.disconnect();
    success('✅ AgentClient tests passed!');

  } catch (err) {
    error(`Test failed: ${err}`);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

main();
