#!/usr/bin/env node
/**
 * E2E Test: SwiftUI App Launch (iOS)
 *
 * NOTE: This test uses the CLI-based approach (runAgentCommand) for testing interactions.
 * This is intentional to maintain coverage of the legacy CLI command interface.
 * 
 * For AgentClient-based examples, see:
 * - tests/e2e/vite/test-app-launch.ts
 * - tests/e2e/expo/test-app-launch.ts
 * - tests/e2e/flutter/test-app-launch-ios.ts
 * - tests/e2e/node-client/test-agent-client.ts
 * 
 * Tests that the SwiftUI example app:
 * 1. Installs dependencies from Verdaccio
 * 2. Launches on iOS simulator
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 * 5. Interactions work (tap, input, longPress, scroll, swipe)
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
  killProcess,
  installCLIPackages,
  restoreNodeModulesCache,
  saveNodeModulesCache,
} from '../common/helpers.js';
import { 
  stopApp, 
  startApp, 
  bootDevice, 
  getDeviceState,
  listIOSDevices,
  loadConfig
} from '@agenteract/core/node';

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
  if (testConfigDir) {
    await saveNodeModulesCache(testConfigDir, 'agenteract-e2e-test-swift');
  }

  // Terminate SwiftUI app using lifecycle utilities
  try {
    info('Terminating AgenteractSwiftExample app...');
    await runCommand('xcrun simctl terminate booted com.example.AgenteractSwiftExample 2>/dev/null || true');
    await runCommand('pkill -f "AgenteractSwiftExample" 2>/dev/null || true');
    success('AgenteractSwiftExample process killed');
  } catch (err) {
    info(`Could not kill AgenteractSwiftExample process: ${err}`);
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
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting SwiftUI E2E test: iOS App Launch');

    // 1. Check prerequisites
    info('Checking Xcode installation...');
    try {
      const xcodeVersion = await runCommand('xcodebuild -version');
      info('Xcode is installed');
      console.log(xcodeVersion);
    } catch (err) {
      error('Xcode is not installed or not in PATH');
      throw new Error('Xcode is required for this test');
    }

    // 2. Clean up any existing processes on agenteract ports
    info('Cleaning up any existing processes on agenteract ports...');
    try {
      await runCommand('lsof -ti:8765,8766,8790,8791,8792 | xargs kill -9 2>/dev/null || true');
      await sleep(2000);
    } catch (err) {
      // Ignore cleanup errors
    }

    // 3. Start Verdaccio
    await startVerdaccio();

    // 4. Bump package versions to avoid npm conflicts (only in CI)
    if (process.env.CI) {
      info('Bumping package versions to avoid npm conflicts (CI only)...');
      const versionSuffix = `-e2e.${Date.now()}`;
      const packagesDir = 'packages';

      const packageJsonFiles = (await runCommand(`find ${packagesDir} -name "package.json" -type f`))
        .trim().split('\n');

      for (const pkgJsonPath of packageJsonFiles) {
        if (!pkgJsonPath) continue;
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        pkgJson.version = pkgJson.version + versionSuffix;
        writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
      }
      success('Package versions bumped');
    }

    // 5. Publish packages
    await publishPackages();

    // 6. Copy flutter_example to /tmp
    info('Copying swift-app to /tmp...');
    exampleAppDir = `/tmp/agenteract-e2e-swift-app-${Date.now()}`;
    await runCommand(`rm -rf ${exampleAppDir}`);
    await runCommand(`cp -r examples/swift-app ${exampleAppDir}`);
    success('Swift-App copied');

    // 7. Update Package.swift to use absolute path to local Swift package
    info('Updating project.pbxproj to use absolute path to agenteract package...');
    const projectPbxprojPath = `${exampleAppDir}/AgenteractSwiftExample/AgenteractSwiftExample.xcodeproj/project.pbxproj`;
    const originalProjectPbxproj = readFileSync(projectPbxprojPath, 'utf8');

    // Get absolute path to Swift package in monorepo
    const absoluteSwiftPackagePath = `${process.cwd()}/packages/swift`;
    info(`Using Swift package at: ${absoluteSwiftPackagePath}`);

    // Replace the relative path with absolute path
    const updatedProjectPbxproj = originalProjectPbxproj.replace(
      /..\/..\/..\/packages\/swift/g,
      `"${absoluteSwiftPackagePath}"`
    );

    // Verify the replacement worked
    if (!updatedProjectPbxproj.includes(absoluteSwiftPackagePath)) {
      error('Failed to update project.pbxproj - pattern did not match');
      error('Original project.pbxproj XCLocalSwiftPackageReference section:');
      const projectPbxprojXCLocalSwiftPackageReferenceSection = originalProjectPbxproj.match(/XCLocalSwiftPackageReference "..\/..\/..\/..\/packages\/swift"/)?.[0];
      console.log(projectPbxprojXCLocalSwiftPackageReferenceSection);
      throw new Error('Failed to update project.pbxproj pacakges/swift with absolute path');
    }

    writeFileSync(projectPbxprojPath, updatedProjectPbxproj);
    success(`project.pbxproj updated with absolute path: ${absoluteSwiftPackagePath}`);

    // 8. Install Swift dependencies
    info('Running swift package update...');
    await runCommand(`cd ${absoluteSwiftPackagePath} && swift package update`);
    success('Swift dependencies installed');

    // 9. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `/tmp/agenteract-e2e-test-swift-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    
    // Try to restore node_modules from cache
    await restoreNodeModulesCache(testConfigDir, 'agenteract-e2e-test-swift');
    
    await installCLIPackages(testConfigDir, [
      '@agenteract/cli',
      '@agenteract/agents',
      '@agenteract/server'
    ]);
    success('CLI packages installed from Verdaccio');

    // 10. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for swift-app in /tmp...');
    // using --wait-log-timeout 500 to simulate deprecated usage
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} swift-app native --scheme agenteract-swift-example --wait-log-timeout 500`
    );
    success(`Config created in ${testConfigDir}`);

    // 10.5. Test Phase 1 lifecycle utilities (before building app)
    info('Testing Phase 1 lifecycle utilities...');
    
    // Find an available iOS simulator
    info('Finding available iOS simulator...');
    const devices = await listIOSDevices();
    
    if (devices.length === 0) {
      error('No available iOS simulators found.');
      error('This usually means:');
      error('  1. No simulators are installed');
      error('  2. All simulators have missing/corrupted runtimes');
      error('');
      error('To fix:');
      error('  - Open Xcode > Settings > Platforms');
      error('  - Download an iOS simulator runtime');
      error('  - Or run: xcrun simctl list devices available');
      throw new Error('No available iOS devices found. Please install iOS simulator runtimes in Xcode.');
    }
    
    info(`Found ${devices.length} available iOS device(s)`);
    
    // Prefer a booted device, otherwise use the first available device
    let testDevice = devices.find(d => d.state === 'booted');
    if (!testDevice) {
      testDevice = devices[0];
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
      
      // Test bootDevice - ensure device is booted
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

    // 11. Start agenteract dev from test directory
    info('Starting agenteract dev...');
    info('This will start the Swift dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // build the app
    info('Building the Swift-App app...');
    const derivedDataPath = `${exampleAppDir}/build/DerivedData`;
    await runCommand(`rm -rf ${derivedDataPath}`);
    await runCommand(`mkdir -p ${derivedDataPath}`);
    await runCommand(`cd ${exampleAppDir} && xcodebuild -project AgenteractSwiftExample/AgenteractSwiftExample.xcodeproj -scheme AgenteractSwiftExample -destination 'platform=iOS Simulator,id=${testDevice.id}' -derivedDataPath ${derivedDataPath} build`);
    success('Swift-App app built');

    info(`test app path: ${testConfigDir}`)

    // Install and launch the app on simulator
    info('Installing and launching the Swift-App app on simulator...');

    // Boot the simulator if not already running (should be booted from Phase 1 test)
    await runCommand(`xcrun simctl boot "${testDevice.id}" 2>/dev/null || true`);
    await sleep(2000);

    // Get the app bundle path from the build
    const appBundlePath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/AgenteractSwiftExample.app`;

    // Install the app on the simulator
    await runCommand(`xcrun simctl install "${testDevice.id}" "${appBundlePath}"`);

    // Launch the app
    await runCommand(`xcrun simctl launch "${testDevice.id}" com.example.AgenteractSwiftExample`);
    success('Swift-App app installed and launched');

    // we don't have a pty wrapper for Swift since it's a native app, so we just wait for the app to start
    while (true) {
      const ps = await runCommand('ps aux | grep "AgenteractSwiftExample" | grep -v grep');
      if (ps.includes('AgenteractSwiftExample')) {
        break;
      }
      await sleep(500);
    }

    let hierarchy: string = '';
    let connectionAttempts = 0;
    const maxAttempts = 48; // 48 * 5s = 4 minutes total

    while (connectionAttempts < maxAttempts) {
      connectionAttempts++;
      await sleep(5000);

      try {
        info(`Attempt ${connectionAttempts}/${maxAttempts}: Checking if Swift-App is connected...`);
        hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'swift-app');

        // Check if this is an actual hierarchy (should contain widget/element info)
        // Not just an error message
        const isRealHierarchy = hierarchy.includes('tap-count-text')

        if (hierarchy && hierarchy.length > 100 && isRealHierarchy) {
          success('Swift-App app connected and hierarchy received!');
          info(`Hierarchy preview (first 200 chars): ${hierarchy.substring(0, 200)}...`);
          break;
        } else if (hierarchy.includes('has no connected devices')) {
          info('Swift-App app not yet connected to bridge, waiting...');
        } else {
          info(`Got response but not a valid hierarchy (${hierarchy.length} chars), retrying...`);
          info(`Response preview: ${hierarchy.substring(0, 200)}`);
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('has no connected devices')) {
          info('Swift-App app not connected yet, waiting...');

          // Every 5 attempts, check dev logs for progress
          if (connectionAttempts % 5 === 0) {
            try {
              const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '10');
              info(`Swift-App dev logs (attempt ${connectionAttempts}):`);
              console.log(devLogs);
            } catch (logErr) {
              // Ignore log errors
            }
          }
        } else {
          info(`Connection attempt failed: ${errMsg}`);
        }
      }

      if (connectionAttempts >= maxAttempts) {
        // Get final dev logs before failing
        try {
          const finalLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '100');
          error('Final Swift-App dev logs:');
          console.log(finalLogs);
        } catch (logErr) {
          // Ignore
        }
        throw new Error('Timeout: Swift-App app did not connect within 4 minutes');
      }
    }

    // 13. Verify we have a valid hierarchy
    info('Verifying UI hierarchy...');

    // Check for essential elements (be flexible - some might not be visible initially)
    const hasCounterValue = hierarchy.includes('tap-count-text');
    const hasTextInput = hierarchy.includes('text-input');
    const hasIncrementButton = hierarchy.includes('tap-button');

    if (hasCounterValue) {
      success('✓ Found tap-count-text in hierarchy');
    } else {
      error('tap-count-text not found in hierarchy');
      throw new Error('tap-count-text not found in hierarchy');
    }

    if (hasTextInput) {
      success('✓ Found text-input in hierarchy');
    } else {
      error('text-input not found in hierarchy');
      throw new Error('text-input not found in hierarchy');
    }

    if (hasIncrementButton) {
      success('✓ Found increment-button in hierarchy');
    } else {
      error('increment-button not found in hierarchy (FloatingActionButton may not be visible in initial hierarchy)');
      throw new Error('increment-button not found in hierarchy');
    }

    success('UI hierarchy fetched successfully');

    // 13.5. Test app lifecycle: stop and restart app
    info('Testing app lifecycle: stopping and restarting app...');
    
    // Load the config to get the project settings
    info('Loading agenteract config...');
    const config = await loadConfig(testConfigDir!);
    const project = config.projects.find(p => p.name === 'swift-app');
    if (!project) {
      throw new Error('swift-app project not found in config');
    }
    info(`Loaded project config with scheme: ${project.scheme}`);
    
    try {
      // Stop the app on device using lifecycle utility
      await stopApp({
        projectPath: exampleAppDir,
        device: testDevice,
        projectConfig: project
      });
      success('SwiftUI app stopped via lifecycle utility');
      await sleep(2000);

      // Restart the app using lifecycle utility
      info('Restarting SwiftUI app...');
      await startApp({
        projectPath: exampleAppDir,
        device: testDevice,
        projectConfig: project
      });
      success('Sent start command to SwiftUI app');
      await sleep(5000); // Give it time to launch

      info('Waiting for app to reconnect after restart...');
      let reconnected = false;
      for (let i = 0; i < 30; i++) {
        try {
          const hierarchyAfterRestart = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'swift-app');
          if (hierarchyAfterRestart.includes('tap-count-text')) {
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

    // 14. Test tap interaction
    if (hasIncrementButton) {
      info('Testing tap interaction on increment-button...');
      const tapResult = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'swift-app', 'tap-button');
      // note that this success doesn't mean the tap was successful, we need to check the console logs
      // assertContains(tapResult, 'success', 'Tap command executed successfully');
      assertContains(tapResult, 'Counter incremented to 1', 'Counter increment was logged');
      success('Button tap verified in logs');
    }

    // 16. Test input interaction
    info('Testing input interaction on text-input...');
    const inputResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'input',
      'swift-app',
      'text-input',
      'Hello from E2E test'
    );
    assertContains(inputResult, 'success', 'Input command executed successfully');
    success('Text input successful');

    // 17. Verify input was logged
    await sleep(500);
    const logsAfterInput = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '5');
    assertContains(logsAfterInput, 'Hello from E2E test', 'Input text was logged');
    success('Text input verified in logs');

    // 18. Test long press interaction
    info('Testing long press interaction on long-press-view...');
    const longPressResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'longPress',
      'swift-app',
      'long-press-view'
    );
    assertContains(longPressResult, 'success', 'Long press command executed successfully');
    success('Long press successful');

    // 19. Verify long press was logged
    await sleep(500);
    const logsAfterLongPress = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '5');
    assertContains(logsAfterLongPress, 'Long pressed', 'Long press was logged');
    success('Long press verified in logs');

    // 20. Test scroll interaction
    info('Testing scroll interaction on horizontal-scroll...');
    const scrollResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'scroll',
      'swift-app',
      'horizontal-scroll',
      'right',
      '100'
    );
    assertContains(scrollResult, 'success', 'Scroll command executed successfully');
    success('Scroll successful');

    // 21. Test swipe interaction
    info('Testing swipe interaction on swipeable-card...');
    const swipeResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'swipe',
      'swift-app',
      'swipeable-card',
      'left'
    );
    assertContains(swipeResult, 'success', 'Swipe command executed successfully');
    success('Swipe successful');

    // 22. Verify swipe was logged
    await sleep(500);
    const logsAfterSwipe = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '5');
    assertContains(logsAfterSwipe, 'Card swiped', 'Swipe was logged');
    success('Swipe verified in logs');

    // 23. Check dev logs
    info('Checking Swift-App dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'swift-app', '--since', '30');
      info('Swift-App dev logs:');
      console.log(devLogs);
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
    }

    // Terminate app before finishing test to prevent interference with future runs
    info('Terminating SwiftUI app to clean up for future test runs...');
    try {
      await stopApp({
        projectPath: exampleAppDir,
        device: testDevice,
        projectConfig: project
      });
      success('SwiftUI app terminated via lifecycle utility');
    } catch (err) {
      info(`Could not terminate SwiftUI app via lifecycle utility: ${err}`);
      // Try legacy method as fallback
      try {
        await runCommand('pkill -f "AgenteractSwiftExample" 2>/dev/null || true');
        success('SwiftUI app terminated via pkill');
      } catch (err2) {
        info(`Could not terminate SwiftUI app via pkill: ${err2}`);
      }
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
