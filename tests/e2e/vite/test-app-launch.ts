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
import { readFileSync, writeFileSync } from 'fs';

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
        await runCommand(`rm -rf ${testConfigDir}`);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    if (exampleAppDir) {
      try {
        await runCommand(`rm -rf ${exampleAppDir}`);
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

    // 1. Clean up any existing processes on agenteract ports
    info('Cleaning up any existing processes on agenteract ports...');
    try {
      await runCommand('lsof -ti:8765,8766,8790,8791,8792,5173 | xargs kill -9 2>/dev/null || true');
      await sleep(2000); // Give processes time to die
    } catch (err) {
      // Ignore cleanup errors
    }

    // 2. Start Verdaccio (only in local development, CI has it as a service)
    if (!process.env.CI) {
      await startVerdaccio();
    } else {
      info('Skipping Verdaccio start (already running in CI)');
    }

    // 3. Publish packages (only in local development, CI publishes in workflow)
    // Note: In CI, package versions are bumped BEFORE build/publish in the workflow
    // This ensures Verdaccio serves the bumped versions instead of proxying to npm
    if (!process.env.CI) {
      await publishPackages();
    } else {
      info('Skipping package publish (already done in CI workflow)');
    }

    // 3. Copy react-example to /tmp and replace workspace:* dependencies
    info('Copying react-example to /tmp and preparing for Verdaccio...');
    exampleAppDir = `/tmp/agenteract-e2e-vite-app-${Date.now()}`;
    await runCommand(`rm -rf ${exampleAppDir}`);
    await runCommand(`cp -r examples/react-example ${exampleAppDir}`);

    // Remove node_modules to avoid workspace symlinks
    await runCommand(`rm -rf ${exampleAppDir}/node_modules package-lock.json`);

    // Replace workspace:* dependencies with * for Verdaccio
    info('Replacing workspace:* dependencies...');
    const pkgJsonPath = `${exampleAppDir}/package.json`;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

    ['dependencies', 'devDependencies'].forEach(depType => {
      if (pkgJson[depType]) {
        Object.keys(pkgJson[depType]).forEach(key => {
          if (pkgJson[depType][key] === 'workspace:*') {
            pkgJson[depType][key] = '*';
          }
        });
      }
    });

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    success('Workspace dependencies replaced');

    // Fix vite.config.ts to remove monorepo-specific paths
    info('Fixing vite.config.ts...');
    const viteConfigPath = `${exampleAppDir}/vite.config.ts`;
    const newViteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;
    writeFileSync(viteConfigPath, newViteConfig);
    success('Vite config fixed');

    // Install dependencies from Verdaccio
    info('Installing react-example dependencies from Verdaccio...');
    await runCommand(`cd ${exampleAppDir} && npm install --registry http://localhost:4873`);
    success('React-example prepared with Verdaccio packages');

    // 4. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `/tmp/agenteract-e2e-test-vite-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(`cd ${testConfigDir} && npm init -y`);
    await runCommand(`cd ${testConfigDir} && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/vite --registry http://localhost:4873`);
    success('CLI packages installed from Verdaccio');

    // 5. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for react-app in /tmp...');
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} react-app vite`
    );
    success('Config created');

    // Debug: Check what @agenteract/pty package.json looks like
    info('🔍 DEBUG: Checking installed @agenteract/pty package.json...');
    try {
      const ptyPkgJson = await runCommand(`cat ${testConfigDir}/node_modules/@agenteract/pty/package.json`);
      info('📦 Installed @agenteract/pty package.json:');
      console.log(ptyPkgJson);
    } catch (err) {
      error(`Failed to read @agenteract/pty package.json: ${err}`);
    }

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
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'react-app', '--since', '50');
      info('Vite dev logs:');
      console.log(devLogs);
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
    }

    // 6. Launch headless browser with Puppeteer
    info('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    info('Opening http://localhost:5173 in headless browser...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    success('Browser loaded Vite app');

    // Give AgentDebugBridge time to connect
    await sleep(3000);

    // 8. Wait for AgentDebugBridge connection
    await waitFor(
      async () => {
        try {
          await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'react-app');
          return true;
        } catch {
          return false;
        }
      },
      'AgentDebugBridge to connect',
      30000,
      2000
    );

    // 9. Get hierarchy and verify UI loaded
    info('Fetching UI hierarchy...');
    const hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'react-app');

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
    await cleanup();
    process.exit(0);
  }
}

main();
