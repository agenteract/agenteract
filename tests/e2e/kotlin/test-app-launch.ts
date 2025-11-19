#!/usr/bin/env node
/**
 * E2E Test: Kotlin KMP App Launch
 *
 * Tests that the Kotlin example app:
 * 1. Builds successfully
 * 2. Starts (via ./gradlew run)
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 */

import { ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
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
let appProcess: ChildProcess | null = null;
let testConfigDir: string | null = null;

async function cleanup() {
  info('Cleaning up...');

  if (appProcess) {
    // Gradle runs the app in a child process, we might need to be more aggressive
    // But for now, standard kill
    await killProcess(appProcess, 'KMP App');
  }

  if (agentServer) {
    await killProcess(agentServer, 'Agenteract dev');
  }

  if (!process.env.CI) {
    await stopVerdaccio();
    
    if (testConfigDir) {
      try {
         rmSync(testConfigDir, { recursive: true, force: true });
      } catch (e) { /* ignore */ }
    }
  }
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting Kotlin E2E test: App Launch');

    // 1. Clean up ports
    if (process.platform !== 'win32') {
       try {
         await runCommand('lsof -ti:8765,8766 | xargs kill -9 2>/dev/null || true');
       } catch (e) {}
    }

    // 2. Start Verdaccio & Publish JS packages (for the CLI)
    await startVerdaccio();
    await publishPackages();

    const timestamp = Date.now();
    testConfigDir = join(getTmpDir(), `agenteract-e2e-test-kotlin-${timestamp}`);
    
    // 3. Install CLI tools
    info('Installing CLI packages...');
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    mkdirSync(testConfigDir, { recursive: true });
    
    await runCommand(`cd "${testConfigDir}" && npm init -y`);
    await runCommand(`cd "${testConfigDir}" && npm install @agenteract/cli @agenteract/agents @agenteract/server --registry http://localhost:4873`);

    // 4. Setup Agenteract Config
    // We point to the local example app. 
    // The app itself uses `includeBuild` to find the local kotlin package, so we don't need to publish it.
    const exampleAppDir = join(process.cwd(), 'examples', 'kmp-example');
    
    info(`Configuring agenteract for app at: ${exampleAppDir}`);
    await runCommand(
      `cd "${testConfigDir}" && npx @agenteract/cli add-config "${exampleAppDir}" kmp-app "native"`
    );

    // 5. Start Agent Server
    info('Starting agenteract dev server...');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    await sleep(5000);

    // 6. Run the Kotlin App
    info('Starting KMP App (this may take a moment to compile)...');
    // We use 'run' task from the compose plugin
    appProcess = spawnBackground(
        './gradlew', 
        ['run', '--quiet'], 
        'kmp-app', 
        { cwd: exampleAppDir }
    );

    // 7. Wait for Connection & Hierarchy
    info('Waiting for app to connect and report hierarchy...');
    
    let hierarchy: string | null = null;
    await waitFor(
        async () => {
            try {
                // Try to get hierarchy
                hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
                info(`Hierarchy received: ${hierarchy.substring(0, 100)}...`);
                // Check for the presence of AgentRegistry and a button with a testID and the initial text
                return hierarchy.includes('AgentRegistry') && hierarchy.includes('"testID":"test-button"') && hierarchy.includes('"text":"Hello, World!"');
            } catch (err) {
                // Expected while waiting for connection
                return false;
            }
        },
        'App to connect and return hierarchy',
        30000, // 30 seconds
        2000
    );

    if (!hierarchy) {
        throw new Error('Failed to get hierarchy from KMP app');
    }

    // 8. Verify initial UI loaded correctly
    assertContains(hierarchy, '"testID":"test-button"', 'Initial UI contains test button');
    assertContains(hierarchy, '"testID":"text-label"', 'Initial UI contains text label');
    assertContains(hierarchy, '"text":"Hello, World!"', 'Initial UI contains \"Hello, World!\" text');
    success('Initial UI hierarchy fetched and verified successfully');

    // 9. Test tap interaction
    info('Testing tap interaction on test-button...');
    // We send the tap command and rely on subsequent UI state change for verification.
    await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'kmp-app', 'test-button');
    success('Button tap command sent');

    // 10. Wait for UI update and re-fetch hierarchy
    await sleep(1000); // Give app time to process tap and re-render
    info('Fetching UI hierarchy after tap...');
    const hierarchyAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
    assertContains(hierarchyAfterTap, '"text":"Hello, Agenteract!"', 'UI updated to \"Hello, Agenteract!\" after tap');
    success('UI updated successfully after tap');
    success('UI updated successfully after tap');

    // TODO: Implement getConsoleLogs in AgentDebugBridge.kt to verify log output
    // info('Fetching app logs after tap...');
    // const logsAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'kmp-app', '--since', '5');
    // assertContains(logsAfterTap, 'Button clicked via Agent or User!', 'Button click was logged');
    // success('Button tap verified in logs');

    success('✅ Kotlin E2E Test Passed!');

  } catch (err) {
    error(`Test failed: ${err}`);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

main();
