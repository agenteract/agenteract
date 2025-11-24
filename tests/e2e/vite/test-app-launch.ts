#!/usr/bin/env node
/**
 * E2E Test: Vite App Launch
 *
 * Tests that the Vite example app:
 * 1. Builds successfully
 * 2. Starts dev server
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 */

import { ChildProcess, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import puppeteer, { Browser } from 'puppeteer';
import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const exec = promisify(execCallback);
import {
  info,
  success,
  error,
  startVerdaccio,
  stopVerdaccio,
  publishPackages,
  runCommand,
  runAgentCommand,
  assertContains,
  spawnBackground,
  killProcess,
  waitFor,
  sleep,
  setupCleanup,
  getTmpDir,
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
    await stopVerdaccio();

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
  }
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting Vite E2E test: App Launch');

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

    // 3. Copy react-example to temp directory and replace workspace:* dependencies
    info('Copying react-example to temp directory and preparing for Verdaccio...');
    exampleAppDir = join(getTmpDir(), `agenteract-e2e-vite-app-${timestamp}`);
    info(`Target directory: ${exampleAppDir}`);

    // Clean up if exists
    if (existsSync(exampleAppDir)) {
      rmSync(exampleAppDir, { recursive: true, force: true });
    }

    // Use Node.js native cpSync for reliable cross-platform copying
    const sourceDir = join(process.cwd(), 'examples', 'react-example');
    info(`Copying from: ${sourceDir}`);
    cpSync(sourceDir, exampleAppDir, { recursive: true });

    // Verify the copy worked - check for critical files
    const copiedPkgPath = join(exampleAppDir, 'package.json');
    const copiedSrcPath = join(exampleAppDir, 'src', 'main.tsx');

    if (!existsSync(copiedPkgPath)) {
      throw new Error(`Copy failed: package.json not found at ${copiedPkgPath}`);
    }
    if (!existsSync(copiedSrcPath)) {
      throw new Error(`Copy failed: src/main.tsx not found at ${copiedSrcPath}`);
    }
    success(`Verified copy: package.json and src/main.tsx exist`);

    // Remove node_modules to avoid workspace symlinks
    const nodeModulesPath = join(exampleAppDir, 'node_modules');
    const packageLockPath = join(exampleAppDir, 'package-lock.json');
    if (existsSync(nodeModulesPath)) {
      rmSync(nodeModulesPath, { recursive: true, force: true });
    }
    if (existsSync(packageLockPath)) {
      rmSync(packageLockPath, { force: true });
    }

    // Replace workspace:* dependencies with * for Verdaccio
    info('Replacing workspace:* dependencies...');
    const pkgJsonPath = join(exampleAppDir, 'package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

    let replacedCount = 0;
    ['dependencies', 'devDependencies'].forEach(depType => {
      if (pkgJson[depType]) {
        Object.keys(pkgJson[depType]).forEach(key => {
          if (pkgJson[depType][key] === 'workspace:*') {
            pkgJson[depType][key] = '*';
            replacedCount++;
          }
        });
      }
    });

    // Write the file with explicit encoding
    const newContent = JSON.stringify(pkgJson, null, 2) + '\n';
    writeFileSync(pkgJsonPath, newContent, 'utf8');

    // Verify the file was written correctly
    await sleep(200); // Small delay to ensure file system sync on Windows
    const verifyContent = readFileSync(pkgJsonPath, 'utf8');
    if (verifyContent.includes('workspace:')) {
      throw new Error('Failed to replace workspace dependencies');
    }
    success(`Workspace dependencies replaced (${replacedCount} replacements)`);

    // Copy mock files from monorepo to temp app
    info('Copying React Native mocks...');
    const mocksDir = join(exampleAppDir, '__mocks__');
    mkdirSync(mocksDir, { recursive: true });

    const monorepoMocksDir = join(process.cwd(), 'packages', 'react', '__mocks__');
    cpSync(monorepoMocksDir, mocksDir, { recursive: true });
    success('Mocks copied');

    // Fix vite.config.ts to remove monorepo-specific paths but preserve necessary aliases
    info('Fixing vite.config.ts...');
    const viteConfigPath = join(exampleAppDir, 'vite.config.ts');
    const newViteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
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
    success('Vite config fixed');

    // Install dependencies from Verdaccio
    info('Installing react-example dependencies from Verdaccio...');
    await runCommand(`cd "${exampleAppDir}" && npm install --registry http://localhost:4873`);
    success('React-example prepared with Verdaccio packages');

    // 4. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = join(getTmpDir(), `agenteract-e2e-test-vite-${timestamp}`);

    // Clean up if exists
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Create directory
    mkdirSync(testConfigDir, { recursive: true });
    await runCommand(`cd "${testConfigDir}" && npm init -y`);
    // install packages so latest are used with npx
    await runCommand(`cd "${testConfigDir}" && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/pty --registry http://localhost:4873`);
    success('CLI packages installed from Verdaccio');

    // 5. Create agenteract config pointing to the temp app
    info('Creating agenteract config for react-app in temp directory...');
    await runCommand(
      `cd "${testConfigDir}" && npx @agenteract/cli add-config "${exampleAppDir}" react-app "npm run dev"`
    );
    success('Config created');

    // 5. Start agenteract dev from test directory (starts dev servers and agent bridge)
    info('Starting agenteract dev...');
    info('This will start the Vite dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Give servers time to start
    await sleep(5000);

    // Check dev logs to see what port Vite is running on
    info('Checking Vite dev server logs...');
    try {
      await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'react-app', '--since', '50');
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
    }

    // 6. Launch headless browser with Puppeteer
    info('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security', // Allow module loading in headless mode
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();

    info('Opening http://localhost:5173 in headless browser...');
    await page.goto('http://localhost:5173', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    success('Browser navigation complete');

    // Wait for React to actually render
    info('Waiting for React app to render...');
    try {
      await page.waitForFunction(
        () => {
          const root = document.getElementById('root');
          return root && root.children.length > 0;
        },
        { timeout: 30000 }
      );
      success('React app rendered');
    } catch (err) {
      error('React app did not render within 30 seconds');
      throw new Error('React app failed to render');
    }

    let hierarchy: string | null = null;

    await waitFor(
      async () => {
        try {
          hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'react-app');
          info(`page content: ` + await page.content());
          // print page console logs
          info(`Hierarchy: ${hierarchy}`);

          const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'react-app', '--since', '50');
          info('Vite dev logs:');
          console.log(devLogs);

          return hierarchy?.includes('Agenteract Web Demo');
        } catch (err) {
          error(`Error getting hierarchy: ${err}`);
          return false;
        }
      },
      'Vite dev server to start',
      300000,
      5000
    );

    if (!hierarchy) {
      throw new Error('Unexpected error: hierarchy not found');
    }

    // 9. Get hierarchy and verify UI loaded
    info('Fetching UI hierarchy...');

    // Basic assertions - verify app loaded correctly
    assertContains(hierarchy, 'Agenteract Web Demo', 'UI contains app title');
    assertContains(hierarchy, 'test-button', 'UI contains test button');
    assertContains(hierarchy, 'username-input', 'UI contains username input');
    success('UI hierarchy fetched successfully');

    // 10. Test tap interaction
    info('Testing tap interaction on test-button...');
    const tapResult = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'react-app', 'test-button');
    assertContains(tapResult, 'success', 'Tap command executed successfully');
    success('Button tap successful');

    // 11. Verify tap was logged
    await sleep(500); // Give app time to log the tap
    const logsAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'react-app', '--since', '5');
    assertContains(logsAfterTap, 'Simulate button pressed', 'Button press was logged');
    success('Button tap verified in logs');

    // 12. Get all logs to verify app is running
    info('Fetching app logs...');
    const logs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'react-app', '--since', '15');
    info('Recent logs:');
    console.log(logs);

    success('✅ All tests passed!');

  } catch (err) {
    error(`Test failed: ${err}`);
    process.exit(1);
  } finally {
    // await cleanup();
    process.exit(0);
  }
}

main();
