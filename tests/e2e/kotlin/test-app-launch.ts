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

const platform = process.argv.find(arg => arg.startsWith('--platform='))?.split('=')[1] || 'desktop';

async function cleanup() {
    info('Cleaning up...');

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
        mkdirSync(testConfigDir, { recursive: true });

        await runCommand(`cd "${testConfigDir}" && npm init -y`);
        await runCommand(`cd "${testConfigDir}" && npm install @agenteract/cli @agenteract/agents @agenteract/server --registry http://localhost:4873`);

        // 4. Setup Agenteract Config
        // We point to the local example app. 
        // The app itself uses `includeBuild` to find the local kotlin package, so we don't need to publish it.
        const exampleAppDir = join(process.cwd(), 'examples', 'kmp-example');

        info(`Configuring agenteract for app at: ${exampleAppDir}`);
        // using --wait-log-timeout 500 to simulate deprecated usage
        await runCommand(
            `cd "${testConfigDir}" && npx @agenteract/cli add-config "${exampleAppDir}" kmp-app "native" --scheme agenteract-kmp-example --wait-log-timeout 500`
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

            // Ensure an emulator or device is running
            info('Checking for connected Android devices/emulators...');
            await runCommand('adb devices');

            // 1. Install the debug APK
            info(`Running ./gradlew installDebug in ${exampleAppDir}`);
            await runCommand(`cd "${exampleAppDir}" && ./gradlew installDebug`);
            success('✅ Android app installed successfully!');

            // // 1. Install the debug APK directly via ADB (more reliable than gradle)
            // info(`Installing APK via ADB...`);
            // const apkPath = join(exampleAppDir, 'build/outputs/apk/debug/kmp-example-debug.apk');
            // await runCommand(`adb install -r "${apkPath}"`);
            // success('✅ Android app installed successfully!');

            // // 2. Clear app data to ensure fresh state (no old tokens)
            // info('Clearing app data...');
            // await runCommand('adb shell pm clear io.agenteract.kmp_example');

            // 3. Launch the app using adb
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

        // 7. Wait for app to connect
        info('Waiting for app to connect to agent server...');

        await waitFor(
            async () => {
                try {
                    // Just check if we can get any hierarchy response
                    const rawOutput = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'kmp-app');
                    return rawOutput.includes('increment-button');
                } catch (err) {
                    return false;
                }
            },
            'App to connect and return hierarchy',
            process.env.CI ? 300000 : 60000, // 5 mins for CI, 1 min for local
            2000
        );

        success('KMP app connected and initial hierarchy loaded');

        // 8. Run YAML test suite
        info('Running YAML test suite...');
        const testFilePath = join(process.cwd(), 'tests', 'e2e', 'kotlin', 'test-app.yaml');
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
        process.exit(1);
    } finally {
        await cleanup();
        process.exit(0);
    }
}

main();
