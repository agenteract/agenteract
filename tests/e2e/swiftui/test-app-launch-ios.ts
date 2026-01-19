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
import { join } from 'path';
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
      info('Killing AgenteractSwiftApp process...');
      await runCommand('pkill -f "AgenteractSwiftExample" 2>/dev/null || true');
      success('AgenteractSwiftExample process killed');
    } catch (err) {
      info(`Could not kill AgenteractSwiftExample process: ${err}`);
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

    let simulatorName: string | undefined;

    // Check for iOS simulator
    info('Checking for iOS simulator...');
    try {
      const simulators = await runCommand('xcrun simctl list devices available');
      if (!simulators.includes('iPhone')) {
        throw new Error('No iPhone simulator found');
      }
      simulatorName = simulators.split('\n').find(line => line.includes('iPhone'))?.split('(')[0].trim() ?? undefined;

      if (!simulatorName) {
        throw new Error('No iPhone simulator found');
      }

      success(`iOS simulator ${simulatorName} available`);
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
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(`cd ${testConfigDir} && npm init -y`);
    await runCommand(`cd ${testConfigDir} && npm install @agenteract/cli @agenteract/agents @agenteract/server --registry http://localhost:4873`);
    success('CLI packages installed from Verdaccio');

    // 10. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for swift-app in /tmp...');
    // using --wait-log-timeout 500 to simulate deprecated usage
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} swift-app native --wait-log-timeout 500`
    );
    success(`Config created in ${testConfigDir}`);

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
    await runCommand(`cd ${exampleAppDir} && xcodebuild -project AgenteractSwiftExample/AgenteractSwiftExample.xcodeproj -scheme AgenteractSwiftExample -destination 'platform=iOS Simulator,name=${simulatorName}' -derivedDataPath ${derivedDataPath} build`);
    await runCommand(`cd ${exampleAppDir} && xcodebuild -project AgenteractSwiftExample/AgenteractSwiftExample.xcodeproj -scheme AgenteractSwiftExample -destination 'platform=iOS Simulator,name=${simulatorName}' build`);
    success('Swift-App app built');

    info(`test app path: ${testConfigDir}`)

    // Install and launch the app on simulator
    info('Installing and launching the Swift-App app on simulator...');

    // First, boot the simulator if not already running
    const simulatorId = await runCommand(`xcrun simctl list devices available | grep "${simulatorName}" | grep -E -o -i "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})" | head -1`);
    await runCommand(`xcrun simctl boot "${simulatorId.trim()}" 2>/dev/null || true`);
    await sleep(2000);

    // Get the app bundle path from the build
    const appBundlePath = `${derivedDataPath}/Build/Products/Debug-iphonesimulator/AgenteractSwiftExample.app`;

    // Install the app on the simulator
    await runCommand(`xcrun simctl install "${simulatorId.trim()}" "${appBundlePath}"`);

    // Launch the app
    await runCommand(`xcrun simctl launch "${simulatorId.trim()}" com.example.AgenteractSwiftExample`);
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

    // Basic check - just verify we got a hierarchy
    assertContains(hierarchy, 'tap-button', 'UI contains tap button');

    success('UI hierarchy fetched successfully');

    // 14. Run YAML test suite
    info('Running YAML test suite...');
    const testFilePath = join(process.cwd(), 'tests', 'e2e', 'swiftui', 'test-app.yaml');
    const testResult = await runAgentCommand(`cwd:${testConfigDir}`, 'test', testFilePath);

    // Parse JSON result
    const result = JSON.parse(testResult);

    // Log the full result for debugging
    info('Test Result:');
    console.log(JSON.stringify(result, null, 2));

    // Verify test passed
    if (result.status !== 'passed') {
      error(`Test failed at step ${result.failedAt}: ${result.error}`);
      throw new Error(`YAML test failed: ${result.error}`);
    }

    success(`✅ YAML test passed! (${result.steps.length} steps in ${result.duration}ms)`);

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
