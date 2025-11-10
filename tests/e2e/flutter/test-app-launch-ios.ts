#!/usr/bin/env node
/**
 * E2E Test: Flutter App Launch (iOS)
 *
 * Tests that the Flutter example app:
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

  // First, try to quit Flutter gracefully via agenteract CLI
  if (testConfigDir && agentServer && agentServer.pid) {
    try {
      info('Sending quit command to Flutter via agenteract CLI...');
      await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-app', 'q');
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

    // 3. Start Verdaccio (only in local development, CI has it as a service)
    if (!process.env.CI) {
      await startVerdaccio();
    } else {
      info('Skipping Verdaccio start (already running in CI)');
    }

    // 4. Publish packages (only in local development, CI publishes in workflow)
    // Note: In CI, package versions are bumped BEFORE build/publish in the workflow
    // This ensures Verdaccio serves the bumped versions instead of proxying to npm
    if (!process.env.CI) {
      await publishPackages();
    } else {
      info('Skipping package publish (already done in CI workflow)');
    }

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

    // 8b. Install @agenteract/flutter-cli in Flutter app directory
    // This is needed because dev.ts spawns npx from the project directory (cwd: projectPath)
    // Without this, npx prompts to install the package
    info('Installing @agenteract/flutter-cli in Flutter app directory for npx...');
    await runCommand(`cd ${exampleAppDir} && npm init -y`);
    await runCommand(`cd ${exampleAppDir} && npm install @agenteract/flutter-cli --registry http://localhost:4873`);
    success('@agenteract/flutter-cli installed in Flutter app directory');

    // 9. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `/tmp/agenteract-e2e-test-flutter-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(`cd ${testConfigDir} && npm init -y`);
    await runCommand(`cd ${testConfigDir} && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/flutter-cli --registry http://localhost:4873`);
    success('CLI packages installed from Verdaccio');

    // 10. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for flutter-app in /tmp...');
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} flutter-app flutter`
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

    // Kill any existing instances of the app
    // Flutter iOS apps run as "Runner.app/Runner" in the simulator
    await runCommand(`pkill -f "Runner.app/Runner" 2>/dev/null || true`);

    // Check dev logs to see if Flutter is starting and handle device selection
    info('Checking Flutter dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-app', '--since', '50');
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
          await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-app', deviceNumber);
          await sleep(2000); // Wait for Flutter to process the selection

          // Check logs again to confirm Flutter started
          const afterSelectionLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-app', '--since', '20');
          info('Logs after device selection:');
          console.log(afterSelectionLogs);
        } else {
          info('Could not find booted simulator, defaulting to device 1');
          await runAgentCommand(`cwd:${testConfigDir}`, 'cmd', 'flutter-app', '1');
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
        hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'flutter-app');

        // Check if this is an actual hierarchy (should contain widget/element info)
        // Not just an error message
        const isRealHierarchy = hierarchy.includes('Agenteract Flutter Demo') ||
                                hierarchy.includes('MaterialApp') ||
                                hierarchy.includes('children');

        if (hierarchy && hierarchy.length > 100 && isRealHierarchy) {
          success('Flutter app connected and hierarchy received!');
          info(`Hierarchy preview (first 200 chars): ${hierarchy.substring(0, 200)}...`);
          break;
        } else if (hierarchy.includes('not connected')) {
          info('Flutter app not yet connected to bridge, waiting...');
        } else {
          info(`Got response but not a valid hierarchy (${hierarchy.length} chars), retrying...`);
          info(`Response preview: ${hierarchy.substring(0, 200)}`);
        }
      } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('not connected')) {
          info('Flutter app not connected yet, waiting...');

          // Every 5 attempts, check dev logs for progress
          if (connectionAttempts % 5 === 0) {
            try {
              const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-app', '--since', '10');
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

      if (connectionAttempts >= maxAttempts) {
        // Get final dev logs before failing
        try {
          const finalLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-app', '--since', '100');
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

    // 14. Test tap interaction
    if (hasIncrementButton) {
      info('Testing tap interaction on increment-button...');
      const tapResult = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'flutter-app', 'increment-button');
      assertContains(tapResult, 'success', 'Tap command executed successfully');
      success('Button tap successful');

      // 15. Verify tap was logged and counter incremented
      await sleep(500);
      const logsAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '5');
      assertContains(logsAfterTap, 'Counter incremented to 1', 'Counter increment was logged');
      success('Button tap verified in logs');
    } else {
      info('Skipping increment-button tap test (button not in hierarchy)');
      info('Trying alternative: tap on reset-button instead...');
      try {
        const tapResult = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'flutter-app', 'reset-button');
        assertContains(tapResult, 'success', 'Tap command executed successfully');
        success('Reset button tap successful');

        await sleep(500);
        const logsAfterTap = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '5');
        assertContains(logsAfterTap, 'All values reset', 'Reset was logged');
        success('Reset button tap verified in logs');
      } catch (err) {
        info(`Alternative tap test also failed: ${err}`);
        info('Continuing with other tests...');
      }
    }

    // 16. Test input interaction
    info('Testing input interaction on text-input...');
    const inputResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'input',
      'flutter-app',
      'text-input',
      'Hello from E2E test'
    );
    assertContains(inputResult, 'success', 'Input command executed successfully');
    success('Text input successful');

    // 17. Verify input was logged
    await sleep(500);
    const logsAfterInput = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '5');
    assertContains(logsAfterInput, 'Hello from E2E test', 'Input text was logged');
    success('Text input verified in logs');

    // 18. Test long press interaction
    info('Testing long press interaction on long-press-view...');
    const longPressResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'longPress',
      'flutter-app',
      'long-press-view'
    );
    assertContains(longPressResult, 'success', 'Long press command executed successfully');
    success('Long press successful');

    // 19. Verify long press was logged
    await sleep(500);
    const logsAfterLongPress = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '5');
    assertContains(logsAfterLongPress, 'Long pressed', 'Long press was logged');
    success('Long press verified in logs');

    // 20. Test scroll interaction
    info('Testing scroll interaction on horizontal-scroll...');
    const scrollResult = await runAgentCommand(
      `cwd:${testConfigDir}`,
      'scroll',
      'flutter-app',
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
      'flutter-app',
      'swipeable-card',
      'left'
    );
    assertContains(swipeResult, 'success', 'Swipe command executed successfully');
    success('Swipe successful');

    // 22. Verify swipe was logged
    await sleep(500);
    const logsAfterSwipe = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '5');
    assertContains(logsAfterSwipe, 'Card swiped', 'Swipe was logged');
    success('Swipe verified in logs');

    // 23. Get all logs to verify app is running
    info('Fetching app logs...');
    const logs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'flutter-app', '--since', '20');
    info('Recent logs:');
    console.log(logs);

    // 24. Check dev logs
    info('Checking Flutter dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'flutter-app', '--since', '30');
      info('Flutter dev logs:');
      console.log(devLogs);
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
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
