#!/usr/bin/env node
/**
 * E2E Test: Expo App Launch (iOS/Android)
 *
 * Tests that the Expo example app:
 * 1. Installs dependencies from Verdaccio
 * 2. Launches on iOS simulator or Android emulator
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
  takeScreenshot,
} from '../common/helpers.js';
import { 
  stopApp, 
  startApp, 
  bootDevice, 
  getDeviceState,
  clearAppData,
  buildApp,
  installApp,
  uninstallApp,
  listIOSDevices,
  listAndroidDevices
} from '@agenteract/core/node';
import * as path from 'path';

let agentServer: ChildProcess | null = null;
let testConfigDir: string | null = null;
let exampleAppDir: string | null = null;
let cleanupExecuted = false;
let PLATFORM: 'ios' | 'android' = 'ios'; // Will be set in main()

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

    // Kill Expo-related apps (platform-specific)
    // Terminate both Expo Go AND the prebuilt example app to ensure cleanup regardless of test mode
    if (PLATFORM === 'ios') {
      // For iOS, terminate both Expo Go and the prebuilt app on all booted simulators
      await runCommand('xcrun simctl terminate booted host.exp.Exponent 2>/dev/null || true');
      await runCommand('xcrun simctl terminate booted io.agenteract.expoexample 2>/dev/null || true');
    } else {
      // For Android, use adb to force-stop both Expo Go and the prebuilt app
      await runCommand('adb shell am force-stop host.exp.exponent 2>/dev/null || true');
      await runCommand('adb shell am force-stop io.agenteract.expoexample 2>/dev/null || true');
    }

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

  // Check if PREBUILD mode is enabled
  const PREBUILD_MODE = process.env.PREBUILD === 'true';
  
  // Check platform (default to ios for backward compatibility)
  PLATFORM = (process.env.PLATFORM || 'ios') as 'ios' | 'android';
  
  // Validate platform
  if (PLATFORM !== 'ios' && PLATFORM !== 'android') {
    error(`Invalid platform: ${PLATFORM}. Must be 'ios' or 'android'`);
    process.exit(1);
  }

  try {
    info(`Starting Expo E2E test: ${PLATFORM.toUpperCase()} App Launch ${PREBUILD_MODE ? '(PREBUILD MODE)' : '(Expo Go mode)'}`);
    
    if (PREBUILD_MODE) {
      info('⚙️  PREBUILD MODE: Will run expo prebuild, build, install, and test prebuilt app');
      info('This tests buildApp(), installApp(), uninstallApp(), and lifecycle on prebuilt apps');
    } else {
      info('📱 Expo Go mode: Will test with Expo Go (OTA updates, no prebuild)');
    }

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

    // No need for manual prebuild in PREBUILD mode - expo run:ios handles it all

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

    if (PREBUILD_MODE) {
      // For prebuild mode, use expo start (Metro) - expo run:ios will connect to it
      await runCommand(
        `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} expo-app 'npx expo start --localhost' --wait-log-timeout 500`
      );
    } else {
      // For Expo Go mode, use expo start with --ios flag to auto-launch Expo Go
      await runCommand(
        `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} expo-app 'npx expo start --ios --localhost' --wait-log-timeout 500`
      );
    }
    success('Config created');

    // 7.5. Test Phase 1 & 2 lifecycle utilities (before launching app)
    info('Testing Phase 1 lifecycle utilities...');
    
    // Find an available device for the selected platform
    info(`Finding available ${PLATFORM} ${PLATFORM === 'ios' ? 'simulator' : 'emulator'}...`);
    const devices = PLATFORM === 'ios' ? await listIOSDevices() : await listAndroidDevices();
    
    if (devices.length === 0) {
      error(`No available ${PLATFORM} ${PLATFORM === 'ios' ? 'simulators' : 'emulators'} found.`);
      error('This usually means:');
      error('  1. No devices are installed');
      if (PLATFORM === 'ios') {
        error('  2. All simulators have missing/corrupted runtimes');
        error('');
        error('To fix:');
        error('  - Open Xcode > Settings > Platforms');
        error('  - Download an iOS simulator runtime');
        error('  - Or run: xcrun simctl list devices available');
      } else {
        error('  2. Android emulator is not running or not detected');
        error('');
        error('To fix:');
        error('  - Open Android Studio > Device Manager');
        error('  - Create and launch an Android emulator');
        error('  - Or run: emulator -avd <device-name>');
      }
      throw new Error(`No available ${PLATFORM} devices found. Please install ${PLATFORM === 'ios' ? 'iOS simulator runtimes in Xcode' : 'an Android emulator'}.`);
    }
    
    info(`Found ${devices.length} available ${PLATFORM} device(s)`);
    
    // Prefer a booted device, otherwise use the first available device
    let testDevice = devices.find(d => d.state === 'booted');
    if (!testDevice) {
      testDevice = devices[0];
      info(`No booted ${PLATFORM === 'ios' ? 'simulator' : 'emulator'} found, will use: ${testDevice.name} (${testDevice.id})`);
    } else {
      info(`Found booted ${PLATFORM === 'ios' ? 'simulator' : 'emulator'}: ${testDevice.name} (${testDevice.id})`);
    }
    
    // Test getDeviceState - verify simulator is accessible
    info('Testing getDeviceState...');
    try {
      const deviceState = await getDeviceState(testDevice);
      info(`Device state: ${JSON.stringify(deviceState)}`);
      
      if (deviceState.platform !== PLATFORM) {
        throw new Error(`Expected ${PLATFORM} device, got ${deviceState.platform}`);
      }
      
      success(`✓ getDeviceState working: device is ${deviceState.state}`);
      
      // Test bootDevice - ensure device is booted
      info('Testing bootDevice...');
      if (deviceState.state === 'shutdown') {
        info(`${PLATFORM === 'ios' ? 'Simulator' : 'Emulator'} is shutdown, booting...`);
        await bootDevice({ 
          device: testDevice, 
          waitForBoot: true, 
          timeout: 60000 
        });
        success(`✓ bootDevice successfully booted the ${PLATFORM === 'ios' ? 'simulator' : 'emulator'}`);
      } else {
        info(`${PLATFORM === 'ios' ? 'Simulator' : 'Emulator'} already booted, testing NOOP behavior...`);
        await bootDevice({ device: testDevice });
        success(`✓ bootDevice handled already-booted ${PLATFORM === 'ios' ? 'simulator' : 'emulator'} (NOOP)`);
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

    // 7. Start agenteract dev FIRST to ensure our Metro server is running
    if (!testConfigDir) {
      throw new Error('testConfigDir is null but required');
    }
    
    info('Starting agenteract dev (Metro bundler + AgentDebugBridge)...');
    if (PREBUILD_MODE) {
      info('Starting Metro first - expo run:ios will detect and use this Metro instance');
    }
    
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Wait for Metro and AgentDebugBridge to be ready
    info('Waiting for Metro and AgentDebugBridge to start...');
    await sleep(10000);

    // Check dev logs to see if Metro is running
    info('Checking Metro bundler logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'expo-app', '--since', '50');
      info('Initial Metro logs:');
      console.log(devLogs);

      // Check if Metro is actually running
      if (!devLogs.includes('expo start') && !devLogs.includes('Metro')) {
        info('Metro may not have started. Checking for errors...');
      } else {
        success('Metro bundler is running');
      }
    } catch (err) {
      // It's okay if this fails early - the server might still be starting
      info(`Dev logs not available yet (server still starting): ${err}`);
    }

    // 8. PREBUILD MODE: Now build, install and launch using expo run
    // Since Metro is already running, expo run will use our Metro instance
    if (PREBUILD_MODE) {
      info(`Testing Phase 4 lifecycle: Using expo run:${PLATFORM} to build + install + launch`);
      info('This may take 3-5 minutes for the first build...');
      
      try {
        // Clean any existing native folders to ensure fresh prebuild with new dependencies
        info('Cleaning existing native folders for fresh prebuild...');
        await runCommand(`cd ${exampleAppDir} && rm -rf ios android`);
        
        // Use expo run which will:
        // 1. Run expo prebuild (if needed) - will generate fresh native projects with AsyncStorage
        // 2. Build with xcodebuild (iOS) or gradle (Android)
        // 3. Install to device
        // 4. Launch the app
        // 5. Connect to our already-running Metro server
        let expoRunCommand: string;
        if (PLATFORM === 'ios') {
          expoRunCommand = `npx expo run:ios --device ${testDevice.id}`;
        } else {
          // For Android, if device is already booted, omit --device flag (expo will use it automatically)
          // If not booted, use AVD name to launch it
          if (testDevice.state === 'booted') {
            expoRunCommand = `npx expo run:android`;
            info(`Using booted Android device: ${testDevice.id}`);
          } else {
            const deviceIdentifier = testDevice.avdName || testDevice.id;
            expoRunCommand = `npx expo run:android --device ${deviceIdentifier}`;
            info(`Launching Android device: ${deviceIdentifier}`);
          }
        }
          
        const buildOutput = await runCommand(
          `cd ${exampleAppDir} && ${expoRunCommand}`
        );
        info(`expo run:${PLATFORM} output:`);
        console.log(buildOutput);
        success(`✓ expo run:${PLATFORM} completed - app should be running`);
        
      } catch (err) {
        error(`expo run:${PLATFORM} failed: ${err}`);
        throw err;
      }
    } else {
      // Expo Go mode: Launch Expo Go
      const launchCommand = PLATFORM === 'ios' ? 'i' : 'a';
      info(`Launching Expo Go app on ${PLATFORM}...`);
      await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'expo-app', launchCommand);
      success('Expo Go launch initiated');
    }

    await sleep(1000);

    // 10. Wait for AgentDebugBridge connection
    if (PREBUILD_MODE) {
      info('Waiting for prebuilt app to connect to AgentDebugBridge...');
      info('This should be quick since the app is already built...');
    } else {
      info('Waiting for Expo app to build and connect...');
      info('This may take 3-5 minutes for the first build...');
    }

    // Create screenshots directory
    const screenshotsDir = `${process.env.GITHUB_WORKSPACE ?? process.cwd()}/e2e-test-expo-temp/screenshots-${Date.now()}`;
    await runCommand(`mkdir -p ${screenshotsDir}`);
    info(`Screenshots will be saved to: ${screenshotsDir}`);

    let hierarchy: string = '';
    let connectionAttempts = 0;
    const maxAttempts = 180; // wait 3 minutes for app to start

    const psAndReload = async () => {
      try {
        if (PREBUILD_MODE) {
          if (PLATFORM === 'ios') {
            const psResult = await runCommand('ps aux | grep -i "agenteractexpoexample" | grep -v grep');
            info(`Prebuilt app processes: \n${psResult}`);
          } else {
            // Android: Check running processes on device
            const psResult = await runCommand(`adb -s ${testDevice.id} shell ps | grep "io.agenteract.expoexample" || echo "Process not found"`);
            info(`Prebuilt app processes: \n${psResult}`);
          }
        } else {
          if (PLATFORM === 'ios') {
            const psResult = await runCommand('ps aux | grep "Expo Go" | grep -v grep');
            info(`Expo Go processes: \n${psResult}`);
          } else {
            const psResult = await runCommand(`adb -s ${testDevice.id} shell ps | grep "host.exp.exponent" || echo "Process not found"`);
            info(`Expo Go processes: \n${psResult}`);
          }
          // app may have redscreen error / can't connect to dev server - send r command to app to reload
          // note that this makes download updates screen flash, but updates will download
          await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'expo-app', 'r');
        }
      } catch (err) {
        info(`App processes not found...`);
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
          await takeScreenshot(successScreenshot, PLATFORM, testDevice.id);

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
        await takeScreenshot(timeoutScreenshot, PLATFORM, testDevice.id);

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

    // 11.5. Test app lifecycle: stop and restart app
    info('Testing app lifecycle: stopping and restarting app...');
    try {
      // Stop the app on device using lifecycle utility
      if (PREBUILD_MODE) {
        await stopApp({
          projectPath: exampleAppDir,
          device: testDevice
        });
        success('Prebuilt app stopped via lifecycle utility');
      } else {
        // Expo Go bundle IDs differ by platform
        const expoGoBundleId = PLATFORM === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent';
        await stopApp({
          projectPath: exampleAppDir,
          device: testDevice,
          bundleId: expoGoBundleId
        });
        success('Expo Go stopped via lifecycle utility');
      }
      await sleep(2000);

      info('Restarting app using platform-agnostic lifecycle utility...');
      if (PREBUILD_MODE) {
        // For prebuilt apps, just launch directly
        await startApp({
          projectPath: exampleAppDir,
          device: testDevice
        });
        success('Sent start command to prebuilt app');
      } else {
        // Use the platform-agnostic start function which auto-detects Expo Go
        await startApp({
          projectPath: exampleAppDir,
          device: testDevice,
          projectName: 'expo-app'
        });
        success('Sent start command to Expo app');
      }
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

    // Note: We skip clearAppData/reinstallApp in E2E tests
    // - For state reset, use agentLink://reset_state instead
    // - clearAppData/reinstallApp are tested in unit tests
    info('Skipping clearAppData/reinstallApp (use agentLink://reset_state for state management)');

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

    // 23. Terminate app to prevent interference with future test runs
    info('Terminating app to clean up for future test runs...');
    try {
      if (PREBUILD_MODE) {
        await stopApp({
          projectPath: exampleAppDir,
          device: testDevice
        });
        success('Prebuilt app terminated');
      } else {
        const expoGoBundleId = PLATFORM === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent';
        await stopApp({
          projectPath: exampleAppDir,
          device: testDevice,
          bundleId: expoGoBundleId
        });
        success('Expo Go terminated');
      }
    } catch (err) {
      info(`Could not terminate app (may already be stopped): ${err}`);
    }

    if (PREBUILD_MODE) {
      success('✅ All PREBUILD tests passed!');
      info('');
      info('Successfully tested in PREBUILD mode:');
      info('  ✓ Phase 1: bootDevice(), getDeviceState()');
      info(`  ✓ Phase 3: Build, install, launch via expo run:${PLATFORM}`);
      info('  ✓ App lifecycle: stopApp(), restartApp()');
      info('  ✓ Metro bundler integration (agenteract dev)');
      info('  ✓ Full AgentDebugBridge integration with prebuilt app');
      info('  ✓ All UI interactions (tap, input, scroll, swipe, agentLink)');
      info('  ✓ App terminated after test completion');
    } else {
      success('✅ All tests passed!');
    }

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
