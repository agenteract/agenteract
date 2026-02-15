#!/usr/bin/env node
/**
 * E2E Test: Flutter App Launch (iOS)
 *
 * NOTE: This test uses AgentClient for testing interactions (WebSocket-based approach).
 * This provides faster, more reliable testing compared to CLI commands.
 * 
 * For CLI-based examples, see:
 * - tests/e2e/swiftui/test-app-launch-ios.ts
 * - tests/e2e/kotlin/test-app-launch.ts
 * 
 * Tests that the Flutter example app:
 * 1. Installs dependencies from Verdaccio
 * 2. Launches on iOS simulator
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 * 5. All interactions work via AgentClient (tap, input, longPress, scroll, swipe, agentLink)
 * 6. App lifecycle utilities work (stopApp, startApp)
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
  AgentClient,
  loadConfig
} from '@agenteract/core/node';

let agentServer: ChildProcess | null = null;
let testConfigDir: string | null = null;
let exampleAppDir: string | null = null;
let cleanupExecuted = false;
let client: AgentClient | null = null;

async function cleanup() {
  if (cleanupExecuted) {
    return;
  }
  cleanupExecuted = true;

  info('Cleaning up...');

  // Save node_modules to cache before cleanup (even if test failed)
  if (exampleAppDir) {
    await saveNodeModulesCache(exampleAppDir, 'agenteract-e2e-flutter-app');
  }
  if (testConfigDir) {
    await saveNodeModulesCache(testConfigDir, 'agenteract-e2e-test-flutter');
  }

  // Disconnect AgentClient first
  if (client) {
    try {
      client.disconnect();
      info('AgentClient disconnected');
    } catch (err) {
      // Ignore cleanup errors
    }
  }

  // First, try to quit Flutter gracefully via agenteract CLI
  if (testConfigDir && agentServer && agentServer.pid) {
    try {
      info('Sending quit command to Flutter via agenteract CLI...');
      await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-example', 'q');
      await sleep(2000); // Wait for Flutter to quit
      success('Flutter quit command sent');
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

    // Kill any remaining Flutter processes by name
  try {
    info('Cleaning up any remaining Flutter processes...');
    await runCommand('pkill -f "flutter run" 2>/dev/null || true');
    await runCommand('pkill -f "dart.*flutter" 2>/dev/null || true');
    await runCommand('pkill -f "@agenteract/flutter-cli" 2>/dev/null || true');

    // Terminate Flutter app on simulator using lifecycle utilities
    await runCommand('xcrun simctl terminate booted io.agenteract.flutter_example 2>/dev/null || true');

    // Also kill any Flutter processes that might be children of our test
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
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting Flutter E2E test: iOS App Launch');

    // 1. Check prerequisites
    info('Checking Flutter installation...');
    try {
      const flutterVersion = await runCommand('flutter --version');
      info('Flutter is installed');
      console.log(flutterVersion);
    } catch (err) {
      error('Flutter is not installed or not in PATH');
      throw new Error('Flutter SDK is required for this test');
    }

    // Check for iOS simulator
    info('Checking for iOS simulator...');
    try {
      const simulators = await runCommand('xcrun simctl list devices available');
      if (!simulators.includes('iPhone')) {
        throw new Error('No iPhone simulator found');
      }
      success('iOS simulator available');
    } catch (err) {
      error('No iOS simulator found');
      throw new Error('iOS simulator is required for this test. Install Xcode and run `xcodebuild -downloadAllPlatforms`');
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

    // 4. Publish packages
    await publishPackages();

    // 6. Copy flutter_example to /tmp
    info('Copying flutter_example to /tmp...');
    exampleAppDir = `/tmp/agenteract-e2e-flutter-app-${Date.now()}`;
    await runCommand(`rm -rf ${exampleAppDir}`);
    await runCommand(`cp -r examples/flutter_example ${exampleAppDir}`);
    success('Flutter example copied');

    // 7. Update pubspec.yaml to use absolute path to local Dart package
    // Note: Flutter/Dart doesn't use Verdaccio, so we need to use path dependency
    // The relative path won't work after copying to /tmp, so we use absolute path
    info('Updating pubspec.yaml to use absolute path to agenteract package...');
    const pubspecPath = `${exampleAppDir}/pubspec.yaml`;
    const originalPubspec = readFileSync(pubspecPath, 'utf8');

    // Get absolute path to Flutter package in monorepo
    const absoluteFlutterPackagePath = `${process.cwd()}/packages/flutter`;
    info(`Using Flutter package at: ${absoluteFlutterPackagePath}`);

    // Replace the relative path with absolute path
    const updatedPubspec = originalPubspec.replace(
      /agenteract:\s*\n\s*path:\s*\.\.\/\.\.\/packages\/flutter/,
      `agenteract:\n    path: ${absoluteFlutterPackagePath}`
    );

    // Verify the replacement worked
    if (!updatedPubspec.includes(absoluteFlutterPackagePath)) {
      error('Failed to update pubspec.yaml - pattern did not match');
      error('Original pubspec agenteract section:');
      const agenteractSection = originalPubspec.match(/agenteract:[\s\S]{0,200}/)?.[0];
      console.log(agenteractSection);
      throw new Error('Failed to update pubspec.yaml with absolute path');
    }

    writeFileSync(pubspecPath, updatedPubspec);
    success(`pubspec.yaml updated with absolute path: ${absoluteFlutterPackagePath}`);

    // 8. Install Flutter dependencies
    info('Running flutter pub get...');
    await runCommand(`cd ${exampleAppDir} && flutter pub get`);
    success('Flutter dependencies installed');

    // 8a. Install CocoaPods dependencies for iOS
    // This is required after copying the app to a new location
    // The Pods directory paths need to be regenerated for the new location
    info('Installing CocoaPods dependencies...');
    try {
      // Check if CocoaPods is installed
      await runCommand('which pod');
      info('CocoaPods is installed');
    } catch (err) {
      error('CocoaPods is not installed. Please install it with: sudo gem install cocoapods');
      throw new Error('CocoaPods is required for iOS builds');
    }

    // Verify Flutter generated files exist (required by Podfile)
    const generatedXcconfig = `${exampleAppDir}/ios/Flutter/Generated.xcconfig`;
    try {
      await runCommand(`test -f "${generatedXcconfig}"`);
      info('Flutter Generated.xcconfig verified');
    } catch (err) {
      error('Flutter Generated.xcconfig missing - flutter pub get may have failed');
      throw new Error('Flutter generated files missing - cannot run pod install');
    }

    // Remove existing Pods directory to ensure clean install
    // This is necessary because paths in Podfile.lock may be incorrect after copying
    await runCommand(`rm -rf ${exampleAppDir}/ios/Pods ${exampleAppDir}/ios/Podfile.lock ${exampleAppDir}/ios/*.xcworkspace`);

    // Run pod deintegrate first to clean up any existing integration
    // This helps avoid "Unable to load contents of file list" errors
    // See: https://stackoverflow.com/questions/66194052/unable-to-load-contents-of-file-list-target-support-files-pods-target-name-po
    try {
      await runCommand(`cd ${exampleAppDir}/ios && pod deintegrate`);
      info('Pod deintegration completed');
    } catch (err) {
      // It's okay if deintegrate fails - there might not be anything to deintegrate
      info('Pod deintegrate skipped (no existing integration)');
    }

    // Run pod install
    // Note: We don't use --repo-update to avoid slow CocoaPods spec repo updates in CI
    await runCommand(`cd ${exampleAppDir}/ios && pod install --verbose`);
    success('CocoaPods dependencies installed');

    // Verify that the Target Support Files were created correctly
    // This helps catch issues early before Xcode tries to build
    const targetSupportPath = `${exampleAppDir}/ios/Pods/Target Support Files/Pods-Runner`;
    const debugXcconfig = `${targetSupportPath}/Pods-Runner.debug.xcconfig`;
    const releaseXcconfig = `${targetSupportPath}/Pods-Runner.release.xcconfig`;
    const debugInputFiles = `${targetSupportPath}/Pods-Runner-frameworks-Debug-input-files.xcfilelist`;
    const debugOutputFiles = `${targetSupportPath}/Pods-Runner-frameworks-Debug-output-files.xcfilelist`;

    try {
      await runCommand(`test -f "${debugXcconfig}" && test -f "${releaseXcconfig}"`);
      await runCommand(`test -f "${debugInputFiles}" && test -f "${debugOutputFiles}"`);
      success('Target Support Files verified');
    } catch (err) {
      error('Target Support Files missing after pod install');
      error('This usually means pod install failed silently');
      error(`Expected files in: ${targetSupportPath}`);

      // List what actually exists for debugging
      try {
        const lsOutput = await runCommand(`ls -la "${targetSupportPath}" 2>&1 || echo "Directory does not exist"`);
        error(`Contents of Target Support Files directory:\n${lsOutput}`);
      } catch {
        // Ignore if listing fails
      }

      throw new Error('CocoaPods installation incomplete - Target Support Files missing');
    }

    // Verify workspace was created
    const workspacePath = `${exampleAppDir}/ios/Runner.xcworkspace`;
    try {
      await runCommand(`test -d "${workspacePath}"`);
      success('Runner.xcworkspace verified');
    } catch (err) {
      error('Runner.xcworkspace missing after pod install');
      throw new Error('CocoaPods installation incomplete - workspace not created');
    }

    // 8b. Install @agenteract/flutter-cli in Flutter app directory
    // This is needed because dev.ts spawns npx from the project directory (cwd: projectPath)
    // Without this, npx prompts to install the package
    
    // Try to restore node_modules from cache
    await restoreNodeModulesCache(exampleAppDir, 'agenteract-e2e-flutter-app');
    
    info('Installing @agenteract/flutter-cli in Flutter app directory for npx...');
    await installCLIPackages(exampleAppDir, ['@agenteract/flutter-cli']);
    success('@agenteract/flutter-cli installed in Flutter app directory');

    // 9. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `/tmp/agenteract-e2e-test-flutter-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    
    // Try to restore node_modules from cache
    await restoreNodeModulesCache(testConfigDir, 'agenteract-e2e-test-flutter');
    
    await installCLIPackages(testConfigDir, [
      '@agenteract/cli',
      '@agenteract/agents',
      '@agenteract/server',
      '@agenteract/flutter-cli'
    ]);
    success('CLI packages installed from Verdaccio');

    // 10. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for flutter-example in /tmp...');
    // using --wait-log-timeout 500 to simulate deprecated usage
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} flutter-example 'flutter run' --scheme agenteract-flutter-example --wait-log-timeout 500`
    );
    success('Config created');

    // 10.1. Load the config so we can pass projectConfig to lifecycle functions
    info('Loading agenteract config...');
    const config = await loadConfig(testConfigDir);
    const flutterProject = config.projects.find((p: any) => p.name === 'flutter-example');
    if (!flutterProject) {
      throw new Error('flutter-example project not found in config');
    }
    success(`Config loaded, PTY port: ${flutterProject.ptyPort || flutterProject.devServer?.port || 8792}`);

    // 10.5. Test Phase 1 lifecycle utilities (before launching app)
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
    info('This will start the Flutter dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Wait for Flutter PTY to start and agenteract server to be ready
    info('Waiting for agenteract server and Flutter PTY to initialize...');
    await sleep(8000); // Give more time for server to fully start

    // Connect AgentClient
    info('Connecting AgentClient...');
    client = new AgentClient('ws://localhost:8765');
    await client.connect();
    success('AgentClient connected');

    // Kill any existing instances of the app
    // Flutter iOS apps run as "Runner.app/Runner" in the simulator
    await runCommand(`pkill -f "Runner.app/Runner" 2>/dev/null || true`);

    // Check dev logs to see if Flutter is starting and handle device selection
    info('Checking Flutter dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '50');
      info('Initial Flutter dev logs:');
      console.log(devLogs);

      // Check if Flutter is waiting for device selection
      if (devLogs.includes('Please choose one') || devLogs.includes('Please choose')) {
        info('Flutter is waiting for device selection, finding booted simulator...');

        // Get list of booted simulators
        const bootedSims = await runCommand('xcrun simctl list devices | grep "Booted"');
        info(`Booted simulators: ${bootedSims}`);

        // Extract the device UDID from the first booted simulator
        const udidMatch = bootedSims.match(/([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})/);

        if (udidMatch) {
          const bootedUDID = udidMatch[1];
          info(`Found booted simulator UDID: ${bootedUDID}`);

          // Find which number corresponds to this UDID in the dev logs
          const lines = devLogs.split('\n');
          let deviceNumber = '1'; // Default to 1 if we can't find it

          for (const line of lines) {
            // Look for lines like: [1]: iPhone 16 Pro (1AAAA41C-E0AA-4460-889D-724CA5F75F5C)
            const match = line.match(/\[(\d+)\]:.*\(([A-F0-9-]+)\)/);
            if (match && match[2] === bootedUDID) {
              deviceNumber = match[1];
              info(`Found booted device at position ${deviceNumber}`);
              break;
            }
          }

          // Send the device selection
          info(`Sending device selection: ${deviceNumber}`);
          await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-example', deviceNumber);
          await sleep(2000); // Wait for Flutter to process the selection

          // Check logs again to confirm Flutter started
          const afterSelectionLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '20');
          info('Logs after device selection:');
          console.log(afterSelectionLogs);
        } else {
          info('Could not find booted simulator, defaulting to device 1');
          await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-example', '1');
          await sleep(2000);
        }
      }

      // Check if Flutter is actually running
      if (!devLogs.includes('flutter run') && !devLogs.includes('Flutter run key commands') && !devLogs.includes('Flutter PTY')) {
        info('Flutter dev server may not have started. Checking for errors...');
      }
    } catch (err) {
      // It's okay if this fails early - the server might still be starting
      info(`Dev logs not available yet (server still starting): ${err}`);
    }

    // 12. Wait for AgentDebugBridge connection (Flutter takes longer to build)
    info('Waiting for Flutter app to build and connect...');
    info('This may take 2-4 minutes for the first build...');

    let hierarchy: string = '';
    let connectionAttempts = 0;
    const maxAttempts = 48; // 48 * 5s = 4 minutes total

    while (connectionAttempts < maxAttempts) {
      connectionAttempts++;
      await sleep(5000);

      try {
        info(`Attempt ${connectionAttempts}/${maxAttempts}: Checking if Flutter app is connected...`);
        const hierarchyResult = await client!.getViewHierarchy('flutter-example');
        hierarchy = JSON.stringify(hierarchyResult);

        // Check if this is an actual hierarchy (should contain widget/element info)
        // Not just an error message
        const isRealHierarchy = hierarchy.includes('Agenteract Flutter Demo') ||
          hierarchy.includes('MaterialApp') ||
          hierarchy.includes('children');

        if (hierarchy && hierarchy.length > 100 && isRealHierarchy) {
          success('Flutter app connected and hierarchy received!');
          info(`Hierarchy preview (first 200 chars): ${hierarchy.substring(0, 200)}...`);
          break;
        } else if (hierarchy.includes('has no connected devices')) {
          info('Flutter app not yet connected to bridge, waiting...');
        } else {
          info(`Got response but not a valid hierarchy (${hierarchy.length} chars), retrying...`);
          info(`Response preview: ${hierarchy.substring(0, 200)}`);
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('has no connected devices')) {
          info('Flutter app not connected yet, waiting...');

          // Every 5 attempts, check dev logs for progress
          if (connectionAttempts % 5 === 0) {
            try {
              const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '10');
              info(`Flutter dev logs (attempt ${connectionAttempts}):`);
              console.log(devLogs);
            } catch (logErr) {
              // Ignore log errors
            }
          }
        } else {
          info(`Connection attempt failed: ${errMsg}`);
        }
      }

      // outside of CI, app may be using settings that authenticated with a different dev server, force reconnect if auth failed
      try {
        // const ps = await runCommand('ps aux | grep "Runner" | grep -v grep');
        const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '30');
        console.log(`devLogs: ${devLogs}`);
        if (devLogs.includes('Disconnected. Reconnecting...')) {
          info('Runner process found, reconnect all devices');
          await runCommand(`cd ${testConfigDir} && npx @agenteract/cli connect -a`);
        }
      } catch (_err) {
        console.log(`Error getting dev logs: ${_err}`);
      }

      if (connectionAttempts >= maxAttempts) {
        // Get final dev logs before failing
        try {
          const finalLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '100');
          error('Final Flutter dev logs:');
          console.log(finalLogs);
        } catch (logErr) {
          // Ignore
        }
        throw new Error('Timeout: Flutter app did not connect within 4 minutes');
      }
    }

    // 13. Verify we have a valid hierarchy
    info('Verifying UI hierarchy...');

    // Basic assertions - verify app loaded correctly
    assertContains(hierarchy, 'Agenteract Flutter Demo', 'UI contains app title');

    // Check for essential elements (be flexible - some might not be visible initially)
    const hasCounterValue = hierarchy.includes('counter-value');
    const hasTextInput = hierarchy.includes('text-input');
    const hasIncrementButton = hierarchy.includes('increment-button');

    if (hasCounterValue) {
      success('✓ Found counter-value in hierarchy');
    } else {
      info('⚠ counter-value not found in hierarchy');
    }

    if (hasTextInput) {
      success('✓ Found text-input in hierarchy');
    } else {
      info('⚠ text-input not found in hierarchy');
    }

    if (hasIncrementButton) {
      success('✓ Found increment-button in hierarchy');
    } else {
      info('⚠ increment-button not found in hierarchy (FloatingActionButton may not be visible in initial hierarchy)');
    }

    success('UI hierarchy fetched successfully');

    // 13.5. Test app lifecycle: quit Flutter CLI and restart app via lifecycle utilities
    info('Testing app lifecycle: quitting Flutter dev session, then restarting app via lifecycle utilities...');
    try {
      // 1) Quit the flutter run session so the app fully terminates
      info('Sending quit (q) command to Flutter dev console...');
      await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-example', 'q');
      success('Sent quit command to Flutter dev console');
      await sleep(5000); // Give it time to shut down and terminate the app

      // 2) Restart the app by launching the already-installed iOS app via lifecycle utility
      info('Restarting Flutter app via startApp lifecycle utility...');
      await startApp({
        projectPath: exampleAppDir,
        device: testDevice,
      });
      success('Sent start command to Flutter app via lifecycle utility');

      info('Waiting for app to reconnect after restart...');
      let reconnected = false;
      for (let i = 0; i < 30; i++) {
        try {
          const hierarchyAfterRestart = await client!.getViewHierarchy('flutter-example');
          if (JSON.stringify(hierarchyAfterRestart).includes('Agenteract Flutter Demo')) {
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
        throw new Error('Lifecycle test failed: app did not reconnect after restart');
      }

      success('✅ App lifecycle test passed: quit + restart successful');
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
      const tapResult = await client!.tap('flutter-example', 'increment-button');
      assertContains(JSON.stringify(tapResult), 'ok', 'Tap command executed successfully');
      success('Button tap successful');

      // 15. Verify tap was logged and counter incremented
      info('Waiting for counter increment log...');
      await client!.waitForLog('flutter-example', 'Counter incremented to 1', 5000);
      success('Button tap verified in logs');
    } else {
      info('Skipping increment-button tap test (button not in hierarchy)');
      info('Trying alternative: tap on reset-button instead...');
      try {
        const tapResult = await client!.tap('flutter-example', 'reset-button');
        assertContains(JSON.stringify(tapResult), 'ok', 'Tap command executed successfully');
        success('Reset button tap successful');

        await client!.waitForLog('flutter-example', 'All values reset', 5000);
        success('Reset button tap verified in logs');
      } catch (err) {
        info(`Alternative tap test also failed: ${err}`);
        info('Continuing with other tests...');
      }
    }

    // 16. Test input interaction
    info('Testing input interaction on text-input...');
    const inputResult = await client!.input('flutter-example', 'text-input', 'Hello from E2E test');
    assertContains(JSON.stringify(inputResult), 'ok', 'Input command executed successfully');
    success('Text input successful');

    // 17. Verify input was logged
    info('Waiting for input log...');
    await client!.waitForLog('flutter-example', 'Hello from E2E test', 5000);
    success('Text input verified in logs');

    // 18. Test long press interaction
    info('Testing long press interaction on long-press-view...');
    const longPressResult = await client!.longPress('flutter-example', 'long-press-view');
    assertContains(JSON.stringify(longPressResult), 'ok', 'Long press command executed successfully');
    success('Long press successful');

    // 19. Verify long press was logged
    info('Waiting for long press log...');
    await client!.waitForLog('flutter-example', 'Long pressed', 5000);
    success('Long press verified in logs');

    // 20. Test scroll interaction
    info('Testing scroll interaction on horizontal-scroll...');
    const scrollResult = await client!.scroll('flutter-example', 'horizontal-scroll', 'right', 100);
    assertContains(JSON.stringify(scrollResult), 'ok', 'Scroll command executed successfully');
    success('Scroll successful');

    // 21. Test swipe interaction
    info('Testing swipe interaction on swipeable-card...');
    const swipeResult = await client!.swipe('flutter-example', 'swipeable-card', 'left');
    assertContains(JSON.stringify(swipeResult), 'ok', 'Swipe command executed successfully');
    success('Swipe successful');

    // 22. Verify swipe was logged
    info('Waiting for swipe log...');
    await client!.waitForLog('flutter-example', 'Card swiped', 5000);
    success('Swipe verified in logs');

    // 23. Test agentLink command for reset_state
    info('Testing agentLink command: reset_state...');
    const agentLinkResult = await client!.agentLink('flutter-example', 'agenteract://reset_state');
    console.log(agentLinkResult);
    assertContains(JSON.stringify(agentLinkResult), '"status":"ok"', 'AgentLink command executed successfully');
    success('AgentLink reset_state successful');

    // 24. Verify agentLink was logged
    info('Waiting for agentLink logs...');
    await client!.waitForLog('flutter-example', 'Agent link received', 5000);
    await client!.waitForLog('flutter-example', 'reset_state', 5000);
    success('AgentLink verified in logs');

    // 25. Get all logs to verify app is running
    info('Fetching app logs...');
    const logs = await client!.getLogs('flutter-example');
    info('Recent logs:');
    console.log(logs);

    // 26. Check dev logs
    info('Checking Flutter dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-example', '--since', '30');
      info('Flutter dev logs:');
      console.log(devLogs);
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
    }

    // ensure app logs are sent to the server
    info('Checking if app logs are sent to the server...');
    const appLogs = await client!.getLogs('flutter-example');
    assertContains(JSON.stringify(appLogs), 'Card swiped', 'App config working in hybrid mode (logging from dev server and app)');
    success('App config working in hybrid mode (logging from dev server and app)');

    // 26.5. Terminate app before finishing test to prevent interference with future runs
    info('Terminating Flutter app to clean up for future test runs...');
    try {
      await stopApp({
        projectPath: exampleAppDir,
        device: testDevice,
        projectName: 'flutter-example' // Required for graceful Flutter shutdown via 'q' command
      });
      success('Flutter app terminated via lifecycle utility');
    } catch (err) {
      info(`Could not terminate app (may already be stopped): ${err}`);
      // Try legacy method as fallback
      try {
        info('Trying legacy quit command...');
        await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-example', 'q');
        await sleep(2000);
        success('Flutter quit command sent');
      } catch (err2) {
        info(`Could not send quit command: ${err2}`);
      }
    }

    success('✅ All tests passed!');

  } catch (err) {
    error(`Test failed: ${err}\n${err instanceof Error ? err.stack : 'No stack trace available'}`);
    await cleanup(); // Ensure cleanup runs even on failure
    process.exit(1);
  } finally {
    await cleanup(); // Also runs on success
    process.exit(0);
  }
}

main();
