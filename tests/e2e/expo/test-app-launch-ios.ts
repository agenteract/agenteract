#!/usr/bin/env node
/**
 * E2E Test: Expo App Launch (iOS)
 *
 * Tests that the Expo example app:
 * 1. Installs dependencies from Verdaccio
 * 2. Launches on iOS simulator
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 * 5. Interactions work (tap, input, etc.)
 */

import { ChildProcess } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
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
  sleep,
  setupCleanup,
  takeSimulatorScreenshot,
} from '../common/helpers.js';

let agentServer: ChildProcess | null = null;
let testConfigDir: string | null = null;
let exampleAppDir: string | null = null;
let cleanupExecuted = false;

async function cleanup() {
  if (cleanupExecuted) {
    return;
  }
  cleanupExecuted = true;

  info('Cleaning up...');

  // First, try to quit Expo gracefully via agenteract CLI
  if (testConfigDir && agentServer && agentServer.pid) {
    try {
      info('Sending quit command to Expo via agenteract CLI...');
      await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'expo-app', 'q');
      await sleep(2000); // Wait for Expo to quit
      success('Expo quit command sent');
    } catch (err) {
      info(`Could not send quit command (server may be down): ${err}`);
    }
  }

  // Then send SIGTERM to agenteract dev for graceful shutdown
  if (agentServer && agentServer.pid) {
    try {
      info(`Sending SIGTERM to agenteract dev (PID ${agentServer.pid})...`);
      agentServer.kill('SIGTERM');

      // Wait a bit for graceful shutdown
      await sleep(2000);

      // If still running, force kill the entire process tree
      try {
        // Check if process still exists
        process.kill(agentServer.pid, 0);
        info(`Process still running, force killing tree...`);
        await runCommand(`pkill -9 -P ${agentServer.pid} 2>/dev/null || true`);
        await runCommand(`kill -9 ${agentServer.pid} 2>/dev/null || true`);
      } catch (err) {
        // Process already exited, good
        success('agenteract dev terminated gracefully');
      }
    } catch (err) {
      // Process doesn't exist or already terminated
    }
  }

  // Kill any remaining Expo/Metro processes by name
  try {
    info('Cleaning up any remaining Expo processes...');
    await runCommand('pkill -f "expo start" 2>/dev/null || true');
    await runCommand('pkill -f "metro" 2>/dev/null || true');
    await runCommand('pkill -f "@agenteract/expo" 2>/dev/null || true');

    // kill expo go app
    // would need to use adb on android to kill the app, and know the bundle id
    await runCommand('pkill -f "Expo Go" 2>/dev/null || true');

    // Also kill any Expo processes that might be children of our test
    if (testConfigDir) {
      await runCommand(`pkill -f "${testConfigDir}" 2>/dev/null || true`);
    }

    await sleep(1000);
  } catch (err) {
    // Ignore cleanup errors
  }

  // Clean up temp directories (skip in CI to preserve artifacts)
  if (!process.env.CI) {
    await stopVerdaccio();

    if (testConfigDir) {
      try {
        await runCommand(`rm -rf "${testConfigDir}"`);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    if (exampleAppDir) {
      try {
        await runCommand(`rm -rf "${exampleAppDir}"`);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }

  // Clean up old test directories (keep only last 3 runs)
  try {
    const e2eBase = `${process.cwd()}/e2e-test-expo-temp`;
    const cleanupCmd = `cd ${e2eBase} 2>/dev/null && ls -t | tail -n +7 | xargs rm -rf 2>/dev/null || true`;
    await runCommand(cleanupCmd);
  } catch (err) {
    // Ignore cleanup errors
  }
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting Expo E2E test: iOS App Launch');

    // 1. Clean up any existing processes on agenteract ports
    info('Cleaning up any existing processes on agenteract ports...');
    try {
      await runCommand('lsof -ti:8765,8766,8790,8791,8792 | xargs kill -9 2>/dev/null || true');
      await sleep(2000);
    } catch (err) {
      // Ignore cleanup errors
    }

    // 2. Start Verdaccio
    await startVerdaccio();

    // 3. Publish packages
    await publishPackages();

    // 5. Copy expo-example to e2e-test-expo-temp within the repo
    // Note: Watchman needs access and will prompt for permissions outside the repo
    // Using a directory in the repo (already in .gitignore) avoids permission issues
    info('Copying expo-example to e2e-test-expo-temp and preparing for Verdaccio...');
    const e2eBase = `${process.cwd()}/e2e-test-expo-temp`;
    await runCommand(`mkdir -p ${e2eBase}`);
    exampleAppDir = `${e2eBase}/expo-app-${Date.now()}`;
    await runCommand(`rm -rf ${exampleAppDir}`);
    await runCommand(`cp -r examples/expo-example ${exampleAppDir}`);

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

    // Fix app.json to remove web output (causes expo-router requirement)
    info('Fixing app.json to remove web output...');
    const appJsonPath = `${exampleAppDir}/app.json`;
    const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));

    // Remove web.output if it exists
    if (appJson.expo && appJson.expo.web && appJson.expo.web.output) {
      delete appJson.expo.web.output;
      writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
      success('app.json fixed - removed web.output');
    }

    // Install dependencies from Verdaccio
    info('Installing expo-example dependencies from Verdaccio...');
    await runCommand(`cd ${exampleAppDir} && npm install --registry http://localhost:4873`);
    success('Expo-example prepared with Verdaccio packages');

    // 6. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `${e2eBase}/test-expo-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(`cd ${testConfigDir} && npm init -y`);
    await runCommand(`cd ${testConfigDir} && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/expo --registry http://localhost:4873`);
    success('CLI packages installed from Verdaccio');

    // 7. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for expo-app in /tmp...');
    // Use --localhost to ensure stable connection in CI/Simulator
    // Use --ios to auto-launch on iOS simulator (more reliable than manual 'i' keystroke)
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} expo-app 'npx expo start --ios --localhost'`
    );
    success('Config created');

    // 8. Start agenteract dev from test directory
    info('Starting agenteract dev...');
    info('This will start the Expo dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Wait for Expo and agenteract server to be ready
    info('Waiting for agenteract server and Expo to initialize...');
    await sleep(10000); // Expo needs more time to start than Vite

    // Check dev logs to see if Expo is starting
    info('Checking Expo dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '50');
      info('Initial Expo dev logs:');
      console.log(devLogs);

      // Check if Expo is actually running
      if (!devLogs.includes('expo start') && !devLogs.includes('Metro')) {
        info('Expo dev server may not have started. Checking for errors...');
      }
    } catch (err) {
      // It's okay if this fails early - the server might still be starting
      info(`Dev logs not available yet (server still starting): ${err}`);
    }

    // 9. Launch iOS app via agenteract CLI command
    info('iOS launch initiated via --ios flag in dev server command');
    // No need to send 'i' command manually anymore
    
    await sleep(1000);

    // 10. Wait for AgentDebugBridge connection (Expo can take a while to build and launch)
    info('Waiting for Expo app to build and connect...');
    info('This may take 3-5 minutes for the first build...');

    // Create screenshots directory
    const screenshotsDir = `${process.env.GITHUB_WORKSPACE ?? process.cwd()}/e2e-test-expo-temp/screenshots-${Date.now()}`;
    await runCommand(`mkdir -p ${screenshotsDir}`);
    info(`Screenshots will be saved to: ${screenshotsDir}`);

    let hierarchy: string = '';
    let connectionAttempts = 0;
    const maxAttempts = 180; // wait 3 minutes for app to start

    while (connectionAttempts < maxAttempts) {
      connectionAttempts++;
      await sleep(1000);

      try {
        info(`Attempt ${connectionAttempts}/${maxAttempts}: Checking if Expo app is connected...`);
        hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'expo-app');

        // Check if this is an actual hierarchy (should contain React Native element info)
        const isRealHierarchy = hierarchy.includes('View') ||
                                hierarchy.includes('Text') ||
                                hierarchy.includes('children');

        if (hierarchy && hierarchy.length > 100 && isRealHierarchy) {
          success('Expo app connected and hierarchy received!');
          info(`Hierarchy preview (first 200 chars): ${hierarchy.substring(0, 200)}...`);

          // Take a final success screenshot
          const successScreenshot = `${screenshotsDir}/success-connected.png`;
          await takeSimulatorScreenshot(successScreenshot);

          break;
        } else if (hierarchy.includes('not connected')) {
          info('Expo app not yet connected to bridge, waiting...');
        } else {
          info(`Got response but not a valid hierarchy (${hierarchy.length} chars), retrying...`);
          info(`Response preview: ${hierarchy.substring(0, 200)}`);
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('not connected')) {
          info('Expo app not connected yet, waiting...');

          // Every 5 attempts, check dev logs for progress
          if (connectionAttempts % 5 === 0) {
            try {
              const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '10');
              info(`Expo dev logs (attempt ${connectionAttempts}):`);
              console.log(devLogs);
            } catch (logErr) {
              // Ignore log errors
              console.log(`Error getting dev logs: ${logErr}`);
            }
          }
          try {
            const psResult = await runCommand('ps aux | grep "Expo Go" | grep -v grep');
            info(`Expo Go processes: \n${psResult}`);
          } catch (err) {
            info(`Expo Go processes not found...`);
          }
        } else {
          info(`Connection attempt failed: ${errMsg}`);
        }
      }

      if (connectionAttempts >= maxAttempts) {
        // Take a final timeout screenshot
        const timeoutScreenshot = `${screenshotsDir}/timeout-failure.png`;
        await takeSimulatorScreenshot(timeoutScreenshot);

        // Get final dev logs before failing
        try {
          const finalLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '100');
          error('Final Expo dev logs:');
          console.log(finalLogs);
        } catch (logErr) {
          // Ignore
        }

        error(`Screenshots saved to: ${screenshotsDir}`);
        throw new Error('Timeout: Expo app did not connect within 15 minutes');
      }
    }

    // 11. Verify we have a valid hierarchy
    info('Verifying UI hierarchy...');

    // Show full hierarchy for debugging
    info('Full hierarchy:');
    console.log(hierarchy);

    // Basic assertion - verify app loaded
    assertContains(hierarchy, 'View', 'UI contains React Native View elements');

    // Check for specific elements in hierarchy
    const hasTestButton = hierarchy.includes('test-button');
    const hasUsernameInput = hierarchy.includes('username-input');
    const hasSwipeableCard = hierarchy.includes('swipeable-card');
    const hasHorizontalScroll = hierarchy.includes('horizontal-scroll');

    if (hasTestButton) {
      success('✓ Found test-button in hierarchy');
    } else {
      info('⚠ test-button not found in hierarchy');
    }

    if (hasUsernameInput) {
      success('✓ Found username-input in hierarchy');
    } else {
      info('⚠ username-input not found in hierarchy');
    }

    if (hasSwipeableCard) {
      success('✓ Found swipeable-card in hierarchy');
    } else {
      info('⚠ swipeable-card not found in hierarchy');
    }

    if (hasHorizontalScroll) {
      success('✓ Found horizontal-scroll in hierarchy');
    } else {
      info('⚠ horizontal-scroll not found in hierarchy');
    }

    success('UI hierarchy fetched successfully');

    // 12. Test tap interaction
    if (hasTestButton) {
      info('Testing tap interaction on test-button...');
      const tapResult = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'expo-app', 'test-button');
      assertContains(tapResult, 'success', 'Tap command executed successfully');
      success('Button tap successful');

      // 13. Verify tap was logged
      await sleep(500);
      const logsAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'expo-app', '--since', '5');
      assertContains(logsAfterTap, 'Simulate button pressed', 'Button press was logged');
      success('Button tap verified in logs');
    } else {
      info('Skipping test-button tap test (button not in hierarchy)');
    }

    // 14. Test input interaction
    if (hasUsernameInput) {
      info('Testing input interaction on username-input...');
      const inputResult = await runAgentCommand(
        `cwd:${testConfigDir}`,
        'input',
        'expo-app',
        'username-input',
        'Hello from E2E test'
      );
      assertContains(inputResult, 'success', 'Input command executed successfully');
      success('Text input successful');

      // 15. Verify input was processed (Note: Expo example doesn't log input, but sets state)
      // We can verify by fetching hierarchy and checking if the input has the value
      await sleep(500);
      const hierarchyAfterInput = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'expo-app');
      assertContains(hierarchyAfterInput, 'Hello from E2E test', 'Input text appears in hierarchy');
      success('Text input verified in hierarchy');
    } else {
      info('Skipping username-input test (input not in hierarchy)');
    }

    // 16. Test scroll interaction
    if (hasHorizontalScroll) {
      info('Testing scroll interaction on horizontal-scroll...');
      const scrollResult = await runAgentCommand(
        `cwd:${testConfigDir}`,
        'scroll',
        'expo-app',
        'horizontal-scroll',
        'right',
        '100'
      );
      assertContains(scrollResult, 'success', 'Scroll command executed successfully');
      success('Scroll successful');
    } else {
      info('Skipping horizontal-scroll test (scroll view not in hierarchy)');
    }

    // 17. Test swipe interaction
    if (hasSwipeableCard) {
      info('Testing swipe interaction on swipeable-card...');
      const swipeResult = await runAgentCommand(
        `cwd:${testConfigDir}`,
        'swipe',
        'expo-app',
        'swipeable-card',
        'left'
      );
      assertContains(swipeResult, 'success', 'Swipe command executed successfully');
      success('Swipe successful');

      // 18. Verify swipe was logged
      await sleep(500);
      const logsAfterSwipe = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'expo-app', '--since', '5');
      assertContains(logsAfterSwipe, 'Agent swipe detected', 'Swipe was logged');
      success('Swipe verified in logs');
    } else {
      info('Skipping swipeable-card test (card not in hierarchy)');
    }

    // 19. Get all logs to verify app is running
    info('Fetching app logs...');
    const logs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'expo-app', '--since', '20');
    info('Recent logs:');
    console.log(logs);

    // 20. Check dev logs
    info('Checking Expo dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '30');
      info('Expo dev logs:');
      console.log(devLogs);
    } catch (err) {
      info(`Dev logs not available: ${err}`);
    }

    success('✅ All tests passed!');

  } catch (err) {
    error(`Test failed: ${err}`);
    await cleanup(); // Ensure cleanup runs even on failure
    process.exit(1);
  } finally {
    await cleanup(); // Also runs on success
    process.exit(0);
  }
}

main();
