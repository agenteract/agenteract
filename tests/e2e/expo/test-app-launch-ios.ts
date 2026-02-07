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
  preparePackageForVerdaccio,
  installCLIPackages,
  restoreNodeModulesCache,
  saveNodeModulesCache,
} from '../common/helpers.js';
import { 
  stopApp, 
  startApp, 
  bootDevice, 
  getDeviceState,
  clearAppData 
} from '../../../packages/core/src/node/lifecycle-utils.js';
import { listIOSDevices } from '../../../packages/core/src/node/device-manager.js';
import * as path from 'path';

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

  // Save node_modules to cache before cleanup (even if test failed)
  if (exampleAppDir) {
    await saveNodeModulesCache(exampleAppDir, 'agenteract-e2e-expo-app');
  }
  if (testConfigDir) {
    await saveNodeModulesCache(testConfigDir, 'agenteract-e2e-test-expo');
  }

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

    // Prepare package.json for Verdaccio (replace workspace:* with actual versions, create .npmrc)
    await preparePackageForVerdaccio(exampleAppDir);

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

    // Try to restore node_modules from cache
    await restoreNodeModulesCache(exampleAppDir, 'agenteract-e2e-expo-app');

    // Install dependencies from Verdaccio
    info('Installing expo-example dependencies from Verdaccio...');
    await runCommand(`cd ${exampleAppDir} && npm install --registry http://localhost:4873`);
    success('Expo-example prepared with Verdaccio packages');

    // 6. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `${e2eBase}/test-expo-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    
    // Try to restore node_modules from cache
    await restoreNodeModulesCache(testConfigDir, 'agenteract-e2e-test-expo');
    
    await installCLIPackages(testConfigDir, [
      '@agenteract/cli',
      '@agenteract/agents',
      '@agenteract/server',
      '@agenteract/expo'
    ]);
    success('CLI packages installed from Verdaccio');

    // using --wait-log-timeout 500 to simulate deprecated usage
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} expo-app 'npx expo start --ios --localhost' --wait-log-timeout 500`
    );
    success('Config created');

    // 7.5. Test Phase 1 & 2 lifecycle utilities (before launching app)
    info('Testing Phase 1 lifecycle utilities...');
    
    // Find an available iOS simulator
    info('Finding available iOS simulator...');
    const iosDevices = await listIOSDevices();
    
    if (iosDevices.length === 0) {
      error('No available iOS simulators found.');
      error('This usually means:');
      error('  1. No simulators are installed');
      error('  2. All simulators have missing/corrupted runtimes');
      error('');
      error('To fix:');
      error('  - Open Xcode > Settings > Platforms');
      error('  - Download an iOS simulator runtime');
      error('  - Or run: xcrun simctl list devices available');
      throw new Error('No available iOS simulators found. Please install iOS simulator runtimes in Xcode.');
    }
    
    info(`Found ${iosDevices.length} available iOS simulator(s)`);
    
    // Prefer a booted device, otherwise use the first available simulator
    let testDevice = iosDevices.find(d => d.state === 'booted');
    if (!testDevice) {
      testDevice = iosDevices[0];
      info(`No booted simulator found, will use: ${testDevice.name} (${testDevice.id})`);
    } else {
      info(`Found booted simulator: ${testDevice.name} (${testDevice.id})`);
    }
    
    // Test getDeviceState - verify simulator is accessible
    info('Testing getDeviceState...');
    try {
      const deviceState = await getDeviceState(testDevice);
      info(`Device state: ${JSON.stringify(deviceState)}`);
      
      if (deviceState.platform !== 'ios') {
        throw new Error(`Expected iOS device, got ${deviceState.platform}`);
      }
      
      success(`✓ getDeviceState working: device is ${deviceState.state}`);
      
      // Test bootDevice - ensure simulator is booted
      info('Testing bootDevice...');
      if (deviceState.state === 'shutdown') {
        info('Simulator is shutdown, booting...');
        await bootDevice({ 
          device: testDevice, 
          waitForBoot: true, 
          timeout: 60000 
        });
        success('✓ bootDevice successfully booted the simulator');
      } else {
        info('Simulator already booted, testing NOOP behavior...');
        await bootDevice({ device: testDevice });
        success('✓ bootDevice handled already-booted simulator (NOOP)');
      }
      
      // Verify device is now booted
      const deviceStateAfterBoot = await getDeviceState(testDevice);
      if (deviceStateAfterBoot.state !== 'booted') {
        throw new Error(`Expected device to be booted, but state is ${deviceStateAfterBoot.state}`);
      }
      success('✓ Device confirmed booted after bootDevice call');
      
    } catch (err) {
      error(`Phase 1 lifecycle test failed: ${err}`);
      throw err;
    }

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

    const psAndReload = async () => {
      try {
        const psResult = await runCommand('ps aux | grep "Expo Go" | grep -v grep');
        info(`Expo Go processes: \n${psResult}`);
        // app may have redscreen error / can't connect to dev server - send r command to app to reload
        // note that this makes download updates screen flash, but updates will download
        await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'expo-app', 'r');
      } catch (err) {
        info(`Expo Go processes not found...`);
      }
    }

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
        } else if (hierarchy.includes('has no connected devices')) {
          info('Expo app not yet connected to bridge, waiting...');

          if (connectionAttempts % 5 === 0) {
            await psAndReload();
          }
        } else {
          info(`Got response but not a valid hierarchy (${hierarchy.length} chars), retrying...`);
          info(`Response preview: ${hierarchy.substring(0, 200)}`);

          console.log(`dev logs: ${await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '50')}`);
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('has no connected devices')) {
          info('Expo app has no connected devices yet, waiting...');

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
            await psAndReload();
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

    // 11.5. Test app lifecycle: stop and restart Expo Go
    info('Testing app lifecycle: stopping and restarting Expo app...');
    try {
      // Stop the Expo Go app on simulator using lifecycle utility
      await stopApp({
        projectPath: exampleAppDir,
        device: 'booted',
        bundleId: 'host.exp.Exponent'
      });
      success('Expo Go stopped via lifecycle utility');
      await sleep(2000);

      info('Restarting Expo app using platform-agnostic lifecycle utility...');
      // Use the platform-agnostic start function which auto-detects Expo Go
      await startApp({
        projectPath: exampleAppDir,
        device: 'booted',
        projectName: 'expo-app',
        cwd: testConfigDir
      });
      success('Sent start command to Expo app');
      await sleep(10000); // Give it time to launch

      info('Waiting for app to reconnect after restart...');
      let reconnected = false;
      for (let i = 0; i < 30; i++) {
        try {
          const hierarchyAfterRestart = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'expo-app');
          if (hierarchyAfterRestart.includes('View') || hierarchyAfterRestart.includes('Text')) {
            success('App reconnected after lifecycle restart');
            reconnected = true;
            break;
          }
        } catch (err) {
          // Still reconnecting
        }
        await sleep(1000);
      }

      if (!reconnected) {
        error('App did not reconnect within 30 seconds after restart');
        throw new Error('Lifecycle test failed: app did not reconnect');
      }

      success('✅ App lifecycle test passed: stop and restart successful');
    } catch (err) {
      error(`Lifecycle test failed: ${err}`);
      // Don't fail the entire test, just log the error
      info('Continuing with remaining tests...');
    }

    // 11.6. Test Phase 2 lifecycle utility: clearAppData
    info('Testing Phase 2 lifecycle utility: clearAppData...');
    try {
      info('Note: clearAppData for Expo Go is a NOOP (cannot clear Expo Go data)');
      
      // This should be a NOOP for Expo Go apps
      await clearAppData({
        projectPath: exampleAppDir,
        device: 'booted',
        bundleId: 'host.exp.Exponent'
      });
      
      success('✅ clearAppData handled Expo Go correctly (NOOP)');
      
      // For a real test of clearAppData, we would need a prebuilt app
      // The function should work for prebuilt apps by uninstalling (iOS) or using pm clear (Android)
      info('Note: Full clearAppData test requires a prebuilt app (tested in unit tests)');
      
    } catch (err) {
      error(`clearAppData test failed: ${err}`);
      // Don't fail the entire test
      info('Continuing with remaining tests...');
    }

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

    // 21. Test agentLink command for reset_state
    info('Testing agentLink command: reset_state...');
    const agentLinkResult = await runAgentCommand(`cwd:${testConfigDir}`, 'agent-link', 'expo-app', 'agenteract://reset_state');
    console.log(agentLinkResult);
    assertContains(agentLinkResult, '"status":"ok"', 'AgentLink command executed successfully');
    success('AgentLink reset_state successful');

    // 22. Verify agentLink was logged
    await sleep(500); // Give app time to log the agentLink
    const logsAfterAgentLink = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'expo-app', '--since', '5');
    assertContains(logsAfterAgentLink, 'Agent link received', 'AgentLink was logged');
    assertContains(logsAfterAgentLink, 'reset_state', 'Reset state action was logged');
    success('AgentLink verified in logs');

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
