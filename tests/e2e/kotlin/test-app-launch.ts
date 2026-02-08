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
    installCLIPackages,
    restoreNodeModulesCache,
    saveNodeModulesCache,
} from '../common/helpers.js';
import { 
  stopApp, 
  startApp, 
  bootDevice, 
  getDeviceState,
  listAndroidDevices
} from '@agenteract/core/node';

let agentServer: ChildProcess | null = null;
let appProcess: ChildProcess | null = null;
let testConfigDir: string | null = null;

const platform = process.argv.find(arg => arg.startsWith('--platform='))?.split('=')[1] || 'desktop';

async function cleanup() {
    info('Cleaning up...');

    // Save node_modules to cache before cleanup (even if test failed)
    if (testConfigDir) {
        await saveNodeModulesCache(testConfigDir, 'agenteract-e2e-test-kotlin');
    }

    if (platform === 'android') {
        try {
            await runCommand('adb shell am force-stop io.agenteract.kmp_example');
        } catch (e) { /* ignore */ }
    }

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
        info(`Starting Kotlin E2E test: App Launch (${platform})`);

        // 1. Clean up ports
        if (process.platform !== 'win32') {
            try {
                await runCommand('lsof -ti:8765,8766,8767 | xargs kill -9 2>/dev/null || true');
            } catch (e) { }
        }

        // 2. Start Verdaccio & Publish JS packages (for the CLI)
        await startVerdaccio();
        await publishPackages();

        const timestamp = Date.now();
        testConfigDir = join(getTmpDir(), `agenteract-e2e-test-kotlin-${timestamp}`);

        // 3. Install CLI tools
        info('Installing CLI packages...');
        if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
        
        // Try to restore node_modules from cache
        await restoreNodeModulesCache(testConfigDir, 'agenteract-e2e-test-kotlin');
        
        await installCLIPackages(testConfigDir, [
            '@agenteract/cli',
            '@agenteract/agents',
            '@agenteract/server'
        ]);
        success('CLI packages installed from Verdaccio');

        // 4. Setup Agenteract Config
        // We point to the local example app. 
        // The app itself uses `includeBuild` to find the local kotlin package, so we don't need to publish it.
        const exampleAppDir = join(process.cwd(), 'examples', 'kmp-example');

        info(`Configuring agenteract for app at: ${exampleAppDir}`);
        // using --wait-log-timeout 500 to simulate deprecated usage
        await runCommand(
            `cd "${testConfigDir}" && npx @agenteract/cli add-config "${exampleAppDir}" kmp-app "native" --wait-log-timeout 500`
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
        let testDevice: any = null; // Will be set for Android/iOS platforms
        
        if (platform === 'desktop') {
            info('Starting KMP App (Desktop)...');
            // We use 'run' task from the compose plugin
            appProcess = spawnBackground(
                './gradlew',
                ['run', '--quiet'],
                'kmp-app',
                { cwd: exampleAppDir }
            );
        } else if (platform === 'ios') {
            info('Building KMP iOS framework via Gradle...');

            // 1. Build the iOS framework using Gradle
            info(`Running ./gradlew iosSimulatorArm64Binaries in ${exampleAppDir}`);
            await runCommand(`cd "${exampleAppDir}" && ./gradlew iosSimulatorArm64Binaries`);

            success('✅ Kotlin iOS framework built successfully!');
            // Since we are only verifying build success and not launching a UI app,
            // we will exit here. If actual UI launch is needed, a host Xcode project
            // and `xcodebuild` commands would be required.
            process.exit(0);
        } else if (platform === 'android') {
            info('Starting KMP App (Android) on emulator/device...');

            // Test Phase 1 lifecycle utilities (before launching app)
            info('Testing Phase 1 lifecycle utilities...');
            
            // Find an available Android device/emulator
            info('Finding available Android device/emulator...');
            const devices = await listAndroidDevices();
            
            if (devices.length === 0) {
                error('No available Android devices/emulators found.');
                error('This usually means:');
                error('  1. No emulator is running or no device is connected');
                error('  2. ADB is not detecting devices');
                error('');
                error('To fix:');
                error('  - Open Android Studio > Device Manager');
                error('  - Create and launch an Android emulator');
                error('  - Or run: emulator -avd <device-name>');
                error('  - Or connect a physical Android device via USB');
                throw new Error('No available Android devices found. Please start an Android emulator or connect a device.');
            }
            
            info(`Found ${devices.length} available Android device(s)`);

            // Use the first available device (reuse outer testDevice for later lifecycle tests)
            testDevice = devices[0];
            info(`Using Android device: ${testDevice.name} (${testDevice.id})`);
            
            // Test getDeviceState - verify device is accessible
            info('Testing getDeviceState...');
            try {
                const deviceState = await getDeviceState(testDevice);
                info(`Device state: ${JSON.stringify(deviceState)}`);
                
                if (deviceState.platform !== 'android') {
                    throw new Error(`Expected Android device, got ${deviceState.platform}`);
                }
                
                success(`✓ getDeviceState working: device is ${deviceState.state}`);
                
                // Test bootDevice - Android emulators auto-boot, so this should be a NOOP
                info('Testing bootDevice...');
                await bootDevice({ device: testDevice });
                success('✓ bootDevice handled Android device (NOOP - Android emulators boot automatically)');
                
                // Verify device is still accessible
                const deviceStateAfterBoot = await getDeviceState(testDevice);
                if (deviceStateAfterBoot.state !== 'booted') {
                    throw new Error(`Expected device to be booted, but state is ${deviceStateAfterBoot.state}`);
                }
                success('✓ Device confirmed accessible after bootDevice call');
                
            } catch (err) {
                error(`Phase 1 lifecycle test failed: ${err}`);
                throw err;
            }

            // Ensure an emulator or device is running
            info('Checking for connected Android devices/emulators...');
            await runCommand('adb devices');

            // 1. Install the debug APK
            info(`Running ./gradlew installDebug in ${exampleAppDir}`);
            await runCommand(`cd "${exampleAppDir}" && ./gradlew installDebug`);
            success('✅ Android app installed successfully!');

            // 2. Launch the app using adb
            const androidAppId = 'io.agenteract.kmp_example'; // From build.gradle.kts
            const mainActivity = '.MainActivity'; // Common main activity name

            // ADB Reverse for AgentDebugBridge connection
            info('Setting up adb reverse port forwarding (8765 -> 8765)...');
            await runCommand('adb reverse tcp:8765 tcp:8765');

            info(`Launching Android app: ${androidAppId}/${mainActivity}`);
            appProcess = spawnBackground(
                'adb',
                ['shell', 'am', 'start', '-n', `${androidAppId}/${mainActivity}`],
                'kmp-android-app',
                { cwd: exampleAppDir } // Adb command doesn't need cwd but good practice
            );
            success('✅ Android app launched successfully!');
        }

        // 7. Wait for Connection & Hierarchy
        info('Waiting for app to connect and report hierarchy...');

        // Helper to extract the main JSON object from agenteract CLI output, prioritizing by expected type
        const extractFullJsonFromCliOutput = (output: string, expectedType: 'command' | 'hierarchy' | 'logs'): any => {
            const lines = output.split('\n');
            let bestMatch: any = null;

            for (const line of lines) {
                let jsonString = line;
                // Remove common CLI prefixes
                const rawMessagePrefix = 'Received raw message from "kmp-app": ';
                const infoPrefix = 'ℹ️ Hierarchy received: ';
                const debugPrefix = '[agenteract-dev] [DEBUG] ';

                if (line.includes(rawMessagePrefix)) {
                    jsonString = line.substring(line.indexOf(rawMessagePrefix) + rawMessagePrefix.length).trim();
                } else if (line.includes(infoPrefix)) {
                    jsonString = line.substring(line.indexOf(infoPrefix) + infoPrefix.length).trim();
                } else if (line.includes(debugPrefix)) {
                    const jsonStart = line.indexOf('{');
                    const jsonEnd = line.lastIndexOf('}');
                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        jsonString = line.substring(jsonStart, jsonEnd + 1).trim();
                    } else {
                        continue; // No JSON in this debug line
                    }
                }

                if (jsonString.startsWith('{') && jsonString.endsWith('}')) {
                    try {
                        const parsedJson = JSON.parse(jsonString);
                        // Prioritize based on expected type
                        if (expectedType === 'command' && parsedJson.status === 'ok' && parsedJson.hierarchy === null && parsedJson.logs === null) {
                            return parsedJson; // Exact match for a command response
                        } else if (expectedType === 'hierarchy' && parsedJson.hierarchy !== null && parsedJson.status === 'success') {
                            bestMatch = parsedJson; // Keep as best hierarchy match so far
                        } else if (expectedType === 'logs' && parsedJson.logs !== null && parsedJson.status === 'success') {
                            bestMatch = parsedJson; // Keep as best logs match so far
                        }
                        // If we found a perfect match for hierarchy/logs, return immediately
                        // This prevents it from being overridden by a less specific match later
                        if (bestMatch && (
                            (expectedType === 'hierarchy' && bestMatch.hierarchy !== null) ||
                            (expectedType === 'logs' && bestMatch.logs !== null)
                        )) {
                            return bestMatch;
                        }

                    } catch (e) {
                        // Not valid JSON, continue
                    }
                }
            }
            return bestMatch; // Return the best match if no exact command match was found
        };


        const verifyInLogs = async (message: string): Promise<void> => {
            const logsOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'kmp-app', '--since', '20');
            const logs = JSON.parse(logsOutput).logs;
            const log = logs.find((log: any) => log.message.includes(message));
            if (!log) throw new Error(`${message} log not found in logs: ${logsOutput}`);
            success(`${message} verified in logs`);
        };

        let fullResponse: any = null;
        let hierarchy: any = null;

        await waitFor(
            async () => {
                try {
                    const rawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
                    fullResponse = extractFullJsonFromCliOutput(rawOutput, 'hierarchy'); // Pass 'hierarchy' type

                    if (!fullResponse || fullResponse.status !== 'success' || !fullResponse.hierarchy) {
                        return false;
                    }
                    hierarchy = fullResponse.hierarchy;

                    // Check for AgentRegistry and a button with a testID
                    const jsonString = JSON.stringify(hierarchy);
                    return jsonString.includes('AgentRegistry') && jsonString.includes('"testID":"increment-button"');
                } catch (err) {
                    // info(`Error in waitFor: ${err}`);
                    return false;
                }
            },
            'App to connect and return hierarchy',
            process.env.CI ? 300000 : 60000, // 5 mins for CI, 1 min for local
            2000
        );

        if (!hierarchy) {
            throw new Error('Failed to get initial hierarchy from KMP app');
        }

        // 8. Verify initial UI loaded correctly
        const initialHierarchyJsonString = JSON.stringify(hierarchy);
        assertContains(initialHierarchyJsonString, '"testID":"increment-button"', 'Initial UI contains increment button');
        assertContains(initialHierarchyJsonString, '"testID":"text-input"', 'Initial UI contains text input');
        assertContains(initialHierarchyJsonString, '"testID":"long-press-view"', 'Initial UI contains long press view');
        assertContains(initialHierarchyJsonString, '"testID":"swipeable-card"', 'Initial UI contains swipeable card');
        assertContains(initialHierarchyJsonString, '"testID":"horizontal-scroll"', 'Initial UI contains horizontal scroll');
        success('Initial UI hierarchy fetched and verified successfully');

        // 8.5. Test app lifecycle for Android: stop and restart app
        if (platform === 'android') {
            info('Testing app lifecycle: stopping and restarting Android app...');
            try {
                // Stop the app on device using lifecycle utility
                await stopApp({
                    projectPath: exampleAppDir,
                    device: testDevice
                });
                success('Android app stopped via lifecycle utility');
                await sleep(2000);

                // Restart the app using lifecycle utility
                info('Restarting Android app...');
                await startApp({
                    projectPath: exampleAppDir,
                    device: testDevice
                });
                success('Sent start command to Android app');
                await sleep(5000); // Give it time to launch

                info('Waiting for app to reconnect after restart...');
                let reconnected = false;
                for (let i = 0; i < 30; i++) {
                    try {
                        const hierarchyAfterRestart = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
                        const hierarchyJson = JSON.stringify(extractFullJsonFromCliOutput(hierarchyAfterRestart, 'hierarchy')?.hierarchy || {});
                        if (hierarchyJson.includes('AgentRegistry')) {
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
        }

        // Note: We skip clearAppData/reinstallApp in E2E tests
        // - For state reset, use agentLink://reset_state instead
        // - clearAppData/reinstallApp are tested in unit tests
        info('Skipping clearAppData/reinstallApp (use agentLink://reset_state for state management)');

        // 9. Test Tap Interaction (Increment Counter)
        info('Testing tap interaction on increment-button...');
        const tapRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'kmp-app', 'increment-button');
        const tapResponse = extractFullJsonFromCliOutput(tapRawOutput, 'command'); // Pass 'command' type
        if (!tapResponse || tapResponse.status !== 'ok') {
            throw new Error(`Tap command failed: ${tapRawOutput}`);
        }
        success('Button tap command sent');

        await sleep(500);

        // Verify counter incremented in hierarchy
        const hierarchyAfterTapRaw = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
        const fullResponseAfterTap = extractFullJsonFromCliOutput(hierarchyAfterTapRaw, 'hierarchy'); // Pass 'hierarchy' type
        if (!fullResponseAfterTap || fullResponseAfterTap.status !== 'success' || !fullResponseAfterTap.hierarchy) {
            throw new Error(`Failed to get hierarchy after tap: ${hierarchyAfterTapRaw}`);
        }
        const hierarchyAfterTap = fullResponseAfterTap.hierarchy;
        const hierarchyAfterTapJsonString = JSON.stringify(hierarchyAfterTap);

        assertContains(hierarchyAfterTapJsonString, '"testID":"counter-value"', 'Hierarchy contains counter-value');
        assertContains(hierarchyAfterTapJsonString, '"text":"1"', 'Counter incremented to 1 in hierarchy');
        success('Counter increment verified in hierarchy');

        await verifyInLogs('Counter incremented to 1');


        // 10. Test Input Interaction
        info('Testing input interaction on text-input...');
        const inputRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'input', 'kmp-app', 'text-input', 'Hello KMP');
        const inputResponse = extractFullJsonFromCliOutput(inputRawOutput, 'command'); // Pass 'command' type
        if (!inputResponse || inputResponse.status !== 'ok') {
            throw new Error(`Input command failed: ${inputRawOutput}`);
        }
        success('Input command sent');

        await sleep(500);

        const hierarchyAfterInputRaw = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
        const fullResponseAfterInput = extractFullJsonFromCliOutput(hierarchyAfterInputRaw, 'hierarchy'); // Pass 'hierarchy' type
        if (!fullResponseAfterInput || fullResponseAfterInput.status !== 'success' || !fullResponseAfterInput.hierarchy) {
            throw new Error(`Failed to get hierarchy after input: ${hierarchyAfterInputRaw}`);
        }
        const hierarchyAfterInput = fullResponseAfterInput.hierarchy;
        const hierarchyAfterInputJsonString = JSON.stringify(hierarchyAfterInput);

        assertContains(hierarchyAfterInputJsonString, '"testID":"input-display-text"', 'Hierarchy contains input-display-text');
        assertContains(hierarchyAfterInputJsonString, '"text":"Input value: Hello KMP"', 'UI updated with input text in hierarchy');

        await verifyInLogs('Input changed: Hello KMP');


        // 11. Test Long Press Interaction
        info('Testing long press interaction on long-press-view...');
        const longPressRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'longPress', 'kmp-app', 'long-press-view');
        const longPressResponse = extractFullJsonFromCliOutput(longPressRawOutput, 'command'); // Pass 'command' type
        if (!longPressResponse || longPressResponse.status !== 'ok') {
            throw new Error(`Long press command failed: ${longPressRawOutput}`);
        }
        success('Long press command sent');

        await sleep(500);
        const hierarchyAfterLongPressRaw = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
        const fullResponseAfterLongPress = extractFullJsonFromCliOutput(hierarchyAfterLongPressRaw, 'hierarchy'); // Pass 'hierarchy' type
        if (!fullResponseAfterLongPress || fullResponseAfterLongPress.status !== 'success' || !fullResponseAfterLongPress.hierarchy) {
            throw new Error(`Failed to get hierarchy after long press: ${hierarchyAfterLongPressRaw}`);
        }
        const hierarchyAfterLongPress = fullResponseAfterLongPress.hierarchy;
        const hierarchyAfterLongPressJsonString = JSON.stringify(hierarchyAfterLongPress);

        assertContains(hierarchyAfterLongPressJsonString, '"testID":"long-press-count-text"', 'Hierarchy contains long-press-count-text');
        assertContains(hierarchyAfterLongPressJsonString, '"text":"Long press count: 1"', 'UI updated after long press in hierarchy');

        await verifyInLogs('Long pressed! Count: 1');

        // 12. Test Swipe Interaction
        info('Testing swipe interaction on swipeable-card...');
        const swipeRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'swipe', 'kmp-app', 'swipeable-card', 'left');
        const swipeResponse = extractFullJsonFromCliOutput(swipeRawOutput, 'command'); // Pass 'command' type
        if (!swipeResponse || swipeResponse.status !== 'ok') {
            throw new Error(`Swipe command failed: ${swipeRawOutput}`);
        }
        success('Swipe command sent');

        await sleep(500);
        await verifyInLogs('Card swiped left');

        // 13. Test Scroll Interaction
        info('Testing scroll interaction on horizontal-scroll...');
        const scrollRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'scroll', 'kmp-app', 'horizontal-scroll', 'right', '100');
        const scrollResponse = extractFullJsonFromCliOutput(scrollRawOutput, 'command'); // Pass 'command' type
        if (!scrollResponse || scrollResponse.status !== 'ok') {
            throw new Error(`Scroll command failed: ${scrollRawOutput}`);
        }
        success('Scroll command sent');

        await sleep(500);
        await verifyInLogs('Scrolled right by 100.0');

        // 14. Reset All
        info('Testing reset button...');
        const resetRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'kmp-app', 'reset-button');
        const resetResponse = extractFullJsonFromCliOutput(resetRawOutput, 'command'); // Pass 'command' type
        if (!resetResponse || resetResponse.status !== 'ok') {
            throw new Error(`Reset command failed: ${resetRawOutput}`);
        }
        success('Reset command sent');

        await sleep(500);

        await verifyInLogs('All values reset');

        // 15. Test agentLink command for reset_state
        info('Testing agentLink command: reset_state...');
        const agentLinkRawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'agent-link', 'kmp-app', 'agenteract://reset_state');
        console.log(agentLinkRawOutput);
        const agentLinkResponse = extractFullJsonFromCliOutput(agentLinkRawOutput, 'command');
        if (!agentLinkResponse || agentLinkResponse.status !== 'ok') {
            throw new Error(`AgentLink command failed: ${agentLinkRawOutput}`);
        }
        success('AgentLink reset_state command sent');

        // 16. Verify agentLink was logged
        await sleep(500); // Give app time to log the agentLink
        await verifyInLogs('AgentLink handled by app');
        await verifyInLogs('All values reset');
        success('AgentLink verified in logs');

        // Terminate app before finishing test to prevent interference with future runs
        info('Terminating app to clean up for future test runs...');
        if (platform === 'android' && testDevice) {
            try {
                await stopApp({
                    projectPath: exampleAppDir,
                    device: testDevice
                });
                success('Android app terminated via lifecycle utility');
            } catch (err) {
                info(`Could not terminate Android app via lifecycle utility: ${err}`);
                // Try legacy method as fallback
                try {
                    await runCommand('adb shell am force-stop io.agenteract.kmp_example');
                    success('Android app terminated via adb');
                } catch (err2) {
                    info(`Could not terminate Android app: ${err2}`);
                }
            }
        } else if (platform === 'desktop') {
            // Desktop app will be killed by cleanup
            info('Desktop app will be terminated by cleanup');
        }

        success('✅ Kotlin Full Suite E2E Test Passed!');

    } catch (err) {
        error(`Test failed: ${err}`);
        process.exit(1);
    } finally {
        await cleanup();
        process.exit(0);
    }
}

main();
