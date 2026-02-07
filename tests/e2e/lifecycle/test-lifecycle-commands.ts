#!/usr/bin/env node
/**
 * E2E Test: Lifecycle Commands
 *
 * Tests that the lifecycle commands work correctly:
 * 1. Platform detection
 * 2. Device management
 * 3. Bundle ID resolution
 * 
 * This is a smoke test that validates the commands run without errors.
 * Full integration testing requires running apps which is covered by
 * platform-specific E2E tests.
 */

import { detectPlatform } from '../../../packages/core/src/node/platform-detector.js';
import { listDevices } from '../../../packages/core/src/node/device-manager.js';
import { resolveBundleInfo } from '../../../packages/core/src/node/bundle-resolver.js';
import { join } from 'path';
import { existsSync } from 'fs';

const info = (msg: string) => console.log(`\x1b[33mℹ️  ${msg}\x1b[0m`);
const success = (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const error = (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);

async function main() {
  try {
    info('Starting Lifecycle Commands E2E Test');

    // Test 1: Platform Detection
    info('Test 1: Platform Detection');
    
    // Test Vite detection
    const viteExample = join(process.cwd(), 'examples', 'react-example');
    if (existsSync(viteExample)) {
      const platform = await detectPlatform(viteExample);
      if (platform === 'vite') {
        success('Vite platform detected correctly');
      } else {
        error(`Expected vite, got ${platform}`);
        process.exit(1);
      }
    }

    // Test Expo detection
    const expoExample = join(process.cwd(), 'examples', 'expo-example');
    if (existsSync(expoExample)) {
      const platform = await detectPlatform(expoExample);
      if (platform === 'expo') {
        success('Expo platform detected correctly');
      } else {
        error(`Expected expo, got ${platform}`);
        process.exit(1);
      }
    }

    // Test Flutter detection
    const flutterExample = join(process.cwd(), 'examples', 'flutter_example');
    if (existsSync(flutterExample)) {
      const platform = await detectPlatform(flutterExample);
      if (platform === 'flutter') {
        success('Flutter platform detected correctly');
      } else {
        error(`Expected flutter, got ${platform}`);
        process.exit(1);
      }
    }

    // Test 2: Device Listing
    info('Test 2: Device Management');
    
    try {
      const iosDevices = await listDevices('ios');
      info(`Found ${iosDevices.length} iOS simulator(s)`);
      success('iOS device listing works');
    } catch (err) {
      // May fail if Xcode not installed
      info('iOS device listing skipped (Xcode may not be installed)');
    }

    try {
      const androidDevices = await listDevices('android');
      info(`Found ${androidDevices.length} Android device(s)/emulator(s)`);
      success('Android device listing works');
    } catch (err) {
      // May fail if Android SDK not installed
      info('Android device listing skipped (Android SDK may not be installed)');
    }

    // Test 3: Bundle ID Resolution
    info('Test 3: Bundle ID Resolution');
    
    if (existsSync(expoExample)) {
      const bundleInfo = await resolveBundleInfo(expoExample, 'expo', {});
      // Expo may or may not have bundle IDs configured - just check the function runs
      info(`Bundle resolution completed: iOS=${bundleInfo.ios || 'not configured'}, Android=${bundleInfo.android || 'not configured'}`);
      success('Bundle ID resolution works');
    }

    success('✅ All lifecycle command tests passed!');
    process.exit(0);

  } catch (err) {
    error(`Test failed: ${err}`);
    console.error(err);
    process.exit(1);
  }
}

main();
