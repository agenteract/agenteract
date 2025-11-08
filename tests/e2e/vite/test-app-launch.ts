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

import { ChildProcess } from 'child_process';
import puppeteer, { Browser } from 'puppeteer';
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

  await stopVerdaccio();

  // Clean up temp test directory
  try {
    await runCommand(`rm -rf ${process.cwd()}/.e2e-test-vite`);
  } catch (err) {
    // Ignore cleanup errors
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

    // 2. Start Verdaccio
    await startVerdaccio();

    // 2. Publish packages
    await publishPackages();

    // 3. Install packages in react-example
    info('Installing packages in react-example...');
    await runCommand('cd examples/react-example && npm config set registry http://localhost:4873');
    await runCommand('cd examples/react-example && pnpm install --no-frozen-lockfile');
    success('Packages installed');

    // 4. Create agenteract config for just the react-example
    info('Creating agenteract config for react-example...');
    const testConfigDir = `${process.cwd()}/.e2e-test-vite`;
    await runCommand(`rm -rf ${testConfigDir}`); // Clean up any previous test
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(
      `cd ${testConfigDir} && pnpm agenteract add-config ${process.cwd()}/examples/react-example react-app vite`
    );
    success('Config created');

    // 5. Start agenteract dev from test directory (starts dev servers and agent bridge)
    info('Starting agenteract dev...');
    info('This will start the Vite dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'pnpm',
      ['agenteract', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Give it time to start dev servers
    await sleep(10000);

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
          await runAgentCommand('hierarchy', 'react-app');
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
    const hierarchy = await runAgentCommand('hierarchy', 'react-app');

    // Basic assertions - verify app loaded correctly
    assertContains(hierarchy, 'Agenteract Web Demo', 'UI contains app title');
    assertContains(hierarchy, 'test-button', 'UI contains test button');
    assertContains(hierarchy, 'username-input', 'UI contains username input');
    success('UI hierarchy fetched successfully');

    // 10. Test tap interaction
    info('Testing tap interaction on test-button...');
    const tapResult = await runAgentCommand('tap', 'react-app', 'test-button');
    assertContains(tapResult, 'success', 'Tap command executed successfully');
    success('Button tap successful');

    // 11. Verify tap was logged
    await sleep(500); // Give app time to log the tap
    const logsAfterTap = await runAgentCommand('logs', 'react-app', '--since', '5');
    assertContains(logsAfterTap, 'Simulate button pressed', 'Button press was logged');
    success('Button tap verified in logs');

    // 12. Get all logs to verify app is running
    info('Fetching app logs...');
    const logs = await runAgentCommand('logs', 'react-app', '--since', '15');
    info('Recent logs:');
    console.log(logs);

    success('✅ All tests passed!');

  } catch (err) {
    error(`Test failed: ${err}`);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
