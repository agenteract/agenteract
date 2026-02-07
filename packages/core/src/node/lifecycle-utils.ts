import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Device } from './device-manager.js';
import { detectPlatform } from './platform-detector.js';
import { resolveBundleInfo } from './bundle-resolver.js';

const execFileAsync = promisify(execFile);

/**
 * Options for app lifecycle operations
 */
export interface AppLifecycleOptions {
  /** Project root path - used to detect app type (Expo Go vs prebuilt, etc.) */
  projectPath: string;
  
  /** Target device - platform is determined from device.type */
  device: Device | string;
  
  /** Optional bundle ID override - if not provided, will be resolved from project */
  bundleId?: string;
  
  /** Optional Android main activity - if not provided, uses default launcher */
  mainActivity?: string;
  
  /** Force stop (Android only) - use force-stop instead of graceful kill */
  force?: boolean;
}

/**
 * Device state information
 */
export interface DeviceState {
  /** Device identifier */
  id: string;
  /** Current state of the device */
  state: 'booted' | 'shutdown' | 'unknown';
  /** Platform type */
  platform: 'ios' | 'android' | 'desktop';
}

/**
 * Options for booting a device
 */
export interface DeviceBootOptions {
  /** Target device - can be Device object or device ID string */
  device: Device | string;
  /** Wait for device to fully boot before returning (default: true) */
  waitForBoot?: boolean;
  /** Timeout in milliseconds for boot operation (default: 30000) */
  timeout?: number;
}

/**
 * Options for setting up port forwarding (Android only)
 */
export interface PortForwardingOptions {
  /** Target device - can be Device object or device ID string */
  device: Device | string;
  /** Port number on the device */
  port: number;
  /** Port number on the host (defaults to same as device port) */
  hostPort?: number;
}

/**
 * Options for installing apps
 */
export interface InstallOptions extends AppLifecycleOptions {
  /** Build configuration (debug or release, default: debug) */
  configuration?: 'debug' | 'release';
  /** Path to APK file for Android (if not building from source) */
  apkPath?: string;
}

/**
 * Options for building apps
 */
export interface BuildOptions extends AppLifecycleOptions {
  /** Build configuration (debug, release, or custom config name) */
  configuration?: 'debug' | 'release' | string;
  /** Target platform (ios or android) */
  platform?: 'ios' | 'android';
  /** Silent mode - suppress build output (default: true) */
  silent?: boolean;
}

/**
 * Detect if an Expo project uses Expo Go (no prebuild) or has custom native code
 * 
 * @param projectPath - Path to Expo project root
 * @returns true if using Expo Go, false if prebuilt
 */
export function isExpoGo(projectPath: string): boolean {
  // If ios/ or android/ directories exist, it's prebuilt
  return !existsSync(join(projectPath, 'ios')) && !existsSync(join(projectPath, 'android'));
}

/**
 * Get the current state of a device (booted, shutdown, or unknown)
 * 
 * @param device - Device object or device ID string
 * @returns DeviceState object with id, state, and platform
 * 
 * @example
 * ```typescript
 * const state = await getDeviceState(myDevice);
 * if (state.state === 'shutdown') {
 *   await bootDevice({ device: myDevice });
 * }
 * ```
 */
export async function getDeviceState(device: Device | string): Promise<DeviceState> {
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  const deviceId = deviceObj.id;
  
  // Desktop devices are always "booted"
  if (platform === 'desktop') {
    return {
      id: deviceId,
      state: 'booted',
      platform: 'desktop'
    };
  }
  
  if (platform === 'ios') {
    // Use xcrun simctl list to get device state
    try {
      const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '--json'], {
        timeout: 10000,
      });
      
      const data = JSON.parse(stdout);
      const devices = data.devices;
      
      // Find the device across all runtime versions
      for (const runtime in devices) {
        const deviceList = devices[runtime];
        const foundDevice = deviceList.find((d: any) => d.udid === deviceId || d.name === deviceId);
        
        if (foundDevice) {
          const state = foundDevice.state?.toLowerCase();
          
          if (state === 'booted') {
            return { id: deviceId, state: 'booted', platform: 'ios' };
          } else if (state === 'shutdown') {
            return { id: deviceId, state: 'shutdown', platform: 'ios' };
          } else {
            return { id: deviceId, state: 'unknown', platform: 'ios' };
          }
        }
      }
      
      // Device not found
      return { id: deviceId, state: 'unknown', platform: 'ios' };
    } catch (error: any) {
      throw new Error(`Failed to get iOS device state: ${error.message}`);
    }
  } else if (platform === 'android') {
    // Use adb devices to check if device is online
    try {
      const { stdout } = await execFileAsync('adb', ['devices', '-l'], {
        timeout: 10000,
      });
      
      // Parse output - format is: "device_id    device/offline    ..."
      const lines = stdout.split('\n').slice(1); // Skip header
      const deviceLine = lines.find(line => line.trim().startsWith(deviceId));
      
      if (!deviceLine) {
        return { id: deviceId, state: 'shutdown', platform: 'android' };
      }
      
      const parts = deviceLine.trim().split(/\s+/);
      const state = parts[1];
      
      if (state === 'device') {
        return { id: deviceId, state: 'booted', platform: 'android' };
      } else if (state === 'offline') {
        return { id: deviceId, state: 'shutdown', platform: 'android' };
      } else {
        return { id: deviceId, state: 'unknown', platform: 'android' };
      }
    } catch (error: any) {
      throw new Error(`Failed to get Android device state: ${error.message}`);
    }
  }
  
  // Unknown platform
  return { id: deviceId, state: 'unknown', platform };
}

/**
 * Find gradle executable (wrapper or global installation)
 * 
 * Checks for ./gradlew in the project directory first, then falls back to global gradle
 * 
 * @param projectPath - Path to Android project root
 * @returns Path to gradle executable ('./gradlew' or 'gradle')
 * @throws Error if neither gradle wrapper nor global gradle is found
 * 
 * @example
 * ```typescript
 * const gradle = await findGradle('/path/to/android/project');
 * // Returns './gradlew' or 'gradle'
 * ```
 */
export async function findGradle(projectPath: string): Promise<string> {
  // First check for gradle wrapper (./gradlew)
  const gradlewPath = join(projectPath, 'gradlew');
  if (existsSync(gradlewPath)) {
    return './gradlew';
  }
  
  // Fallback to global gradle installation
  try {
    await execFileAsync('which', ['gradle'], { timeout: 5000 });
    return 'gradle';
  } catch (error) {
    throw new Error(
      `Gradle not found. Please install gradle or run 'gradle wrapper' to generate gradlew in ${projectPath}`
    );
  }
}

/**
 * Boot a device (start/power on)
 * 
 * Platform-specific behavior:
 * - iOS: Boots the simulator if shutdown, waits for boot completion if requested
 * - Android: NOOP (Android emulators boot automatically when accessed)
 * - Desktop: NOOP (desktop is always booted)
 * 
 * @param options - Boot options including device, waitForBoot, and timeout
 * @throws Error if boot fails or times out
 * 
 * @example
 * ```typescript
 * // Boot iOS simulator and wait for completion
 * await bootDevice({
 *   device: myIOSSimulator,
 *   waitForBoot: true,
 *   timeout: 30000
 * });
 * 
 * // Quick boot without waiting
 * await bootDevice({
 *   device: myIOSSimulator,
 *   waitForBoot: false
 * });
 * ```
 */
export async function bootDevice(options: DeviceBootOptions): Promise<void> {
  const { device, waitForBoot = true, timeout = 30000 } = options;
  
  // Get device state
  const state = await getDeviceState(device);
  const deviceId = typeof device === 'string' ? device : device.id;
  
  // Platform-specific handling
  if (state.platform === 'android') {
    console.log('ℹ️  Android emulators boot automatically when accessed (NOOP)');
    return;
  }
  
  if (state.platform === 'desktop') {
    console.log('ℹ️  Not applicable for desktop platform (NOOP)');
    return;
  }
  
  // iOS boot logic
  if (state.platform === 'ios') {
    // Check if already booted
    if (state.state === 'booted') {
      console.log(`ℹ️  Device ${deviceId} is already booted (NOOP)`);
      return;
    }
    
    if (state.state === 'unknown') {
      throw new Error(`Device ${deviceId} not found or in unknown state`);
    }
    
    // Boot the simulator
    try {
      await execFileAsync('xcrun', ['simctl', 'boot', deviceId], {
        timeout: 10000,
      });
      
      console.log(`🔄 Booting device ${deviceId}...`);
      
      // Wait for boot if requested
      if (waitForBoot) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
          const currentState = await getDeviceState(device);
          
          if (currentState.state === 'booted') {
            console.log(`✓ Device ${deviceId} booted successfully`);
            return;
          }
          
          // Wait 1 second before checking again
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error(`Device ${deviceId} boot timed out after ${timeout}ms`);
      } else {
        console.log(`✓ Boot initiated for device ${deviceId}`);
      }
    } catch (error: any) {
      // Handle "already booted" error gracefully
      if (error.message?.includes('Unable to boot device in current state: Booted')) {
        console.log(`ℹ️  Device ${deviceId} is already booted (NOOP)`);
        return;
      }
      throw new Error(`Failed to boot iOS device ${deviceId}: ${error.message}`);
    }
  }
}

/**
 * Start/launch an app - platform and framework agnostic
 * 
 * Automatically detects:
 * - Platform from device.type ('ios' or 'android')
 * - App type from projectPath (Expo Go vs prebuilt, Flutter, Swift, etc.)
 * - Bundle ID from project files (unless overridden)
 * 
 * Handles different launch mechanisms:
 * - Expo Go: Sends 'i' or 'a' keystroke to Expo CLI dev server
 * - Prebuilt Expo/Flutter/Swift/KMP: Uses xcrun simctl launch or adb shell am start
 * 
 * @param options - Lifecycle options
 * @example
 * ```typescript
 * // Minimal usage - auto-detects everything
 * await startApp({
 *   projectPath: '/path/to/expo-app',
 *   device: iosSimulator
 * });
 * 
 * // With bundle ID override
 * await startApp({
 *   projectPath: '/path/to/expo-app',
 *   device: { type: 'android', id: 'emulator-5554', name: 'Pixel 5' },
 *   bundleId: 'com.mycompany.myapp',
 *   mainActivity: '.MainActivity'
 * });
 * ```
 */
export async function startApp(options: AppLifecycleOptions): Promise<void> {
  const { projectPath, device, bundleId: bundleIdOverride, mainActivity } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string' 
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Detect project type
  const platformInfo = await detectPlatform(projectPath);
  
  // Resolve bundle IDs if not provided
  let bundleId = bundleIdOverride;
  if (!bundleId) {
    const bundleInfo = await resolveBundleInfo(projectPath, platformInfo);
    bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
    
    if (!bundleId) {
      throw new Error(`Bundle ID not found for ${platform}. Configure lifecycle.bundleId in agenteract.config.js or pass bundleId option.`);
    }
  }
  
  // Handle different app types
  if (platformInfo === 'expo' && isExpoGo(projectPath)) {
    // Expo Go - send keystroke to CLI
    const keystroke = platform === 'ios' ? 'i' : 'a';
    await sendExpoCLICommand(projectPath, keystroke);
  } else {
    // Prebuilt apps - use platform commands
    if (platform === 'ios') {
      await startIOSApp(deviceObj, bundleId);
    } else {
      await startAndroidApp(deviceObj, bundleId, mainActivity);
    }
  }
}

/**
 * Stop/terminate an app - platform and framework agnostic
 * 
 * @param options - Lifecycle options
 * @example
 * ```typescript
 * await stopApp({
 *   projectPath: '/path/to/app',
 *   device: myDevice,
 *   force: true  // Force kill (Android only)
 * });
 * ```
 */
export async function stopApp(options: AppLifecycleOptions): Promise<void> {
  const { projectPath, device, bundleId: bundleIdOverride, force = false } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Detect project type and resolve bundle ID
  const platformInfo = await detectPlatform(projectPath);
  let bundleId = bundleIdOverride;
  
  if (!bundleId) {
    const bundleInfo = await resolveBundleInfo(projectPath, platformInfo);
    bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
    
    if (!bundleId) {
      throw new Error(`Bundle ID not found for ${platform}`);
    }
  }
  
  // Stop using platform commands
  if (platform === 'ios') {
    await stopIOSApp(deviceObj, bundleId);
  } else {
    await stopAndroidApp(deviceObj, bundleId, force);
  }
}

/**
 * Restart an app - platform and framework agnostic
 * 
 * Combines stop and start with appropriate delays
 * 
 * @param options - Lifecycle options
 * @example
 * ```typescript
 * await restartApp({
 *   projectPath: '/path/to/expo-app',
 *   device: iosSimulator
 * });
 * ```
 */
export async function restartApp(options: AppLifecycleOptions): Promise<void> {
  await stopApp(options);
  // Small delay to ensure clean shutdown
  await new Promise(resolve => setTimeout(resolve, 1000));
  await startApp(options);
}

//
// Low-level platform-specific commands
// These are exported for advanced use cases but most code should use the high-level functions above
//

/**
 * Stop an iOS app running on a simulator
 * 
 * @param device - iOS device/simulator (use device.id = 'booted' for currently active simulator)
 * @param bundleId - App bundle identifier (e.g., 'host.exp.Exponent', 'com.example.myapp')
 * @throws Error if xcrun simctl command fails
 */
export async function stopIOSApp(device: Device | string, bundleId: string): Promise<void> {
  const deviceId = typeof device === 'string' ? device : device.id;
  
  try {
    await execFileAsync('xcrun', ['simctl', 'terminate', deviceId, bundleId], {
      timeout: 10000,
    });
  } catch (error: any) {
    // Ignore error if app is not running
    if (!error.message?.includes('No matching processes')) {
      throw new Error(`Failed to stop iOS app ${bundleId} on device ${deviceId}: ${error.message}`);
    }
  }
}

/**
 * Start (launch) an iOS app on a simulator
 * 
 * @param device - iOS device/simulator (use device.id = 'booted' for currently active simulator)
 * @param bundleId - App bundle identifier (e.g., 'host.exp.Exponent', 'com.example.myapp')
 * @throws Error if xcrun simctl command fails
 */
export async function startIOSApp(device: Device | string, bundleId: string): Promise<void> {
  const deviceId = typeof device === 'string' ? device : device.id;
  
  try {
    await execFileAsync('xcrun', ['simctl', 'launch', deviceId, bundleId], {
      timeout: 30000,
    });
  } catch (error: any) {
    throw new Error(`Failed to start iOS app ${bundleId} on device ${deviceId}: ${error.message}`);
  }
}

/**
 * Restart an iOS app (stop then start)
 * 
 * @param device - iOS device/simulator (use device.id = 'booted' for currently active simulator)
 * @param bundleId - App bundle identifier
 * @throws Error if xcrun simctl commands fail
 */
export async function restartIOSApp(device: Device | string, bundleId: string): Promise<void> {
  await stopIOSApp(device, bundleId);
  // Small delay to ensure clean shutdown
  await new Promise(resolve => setTimeout(resolve, 500));
  await startIOSApp(device, bundleId);
}

/**
 * Stop an Android app
 * 
 * @param device - Android device/emulator (use device.id for specific device)
 * @param bundleId - App package name (e.g., 'com.example.myapp')
 * @param force - If true, use force-stop (immediate); if false, use kill (graceful). Default: false
 * @throws Error if adb command fails
 */
export async function stopAndroidApp(
  device: Device | string, 
  bundleId: string, 
  force: boolean = false
): Promise<void> {
  const deviceId = typeof device === 'string' ? device : device.id;
  
  try {
    const command = force ? 'force-stop' : 'kill';
    await execFileAsync('adb', ['-s', deviceId, 'shell', 'am', command, bundleId], {
      timeout: 10000,
    });
  } catch (error: any) {
    // Graceful kill may fail if app is not running - that's OK
    if (force || !error.message?.includes('does not exist')) {
      throw new Error(`Failed to stop Android app ${bundleId} on device ${deviceId}: ${error.message}`);
    }
  }
}

/**
 * Start (launch) an Android app
 * 
 * @param device - Android device/emulator (use device.id for specific device)
 * @param bundleId - App package name (e.g., 'com.example.myapp')
 * @param mainActivity - Main activity class name (e.g., '.MainActivity' or 'com.example.myapp.MainActivity')
 *                       If not provided, attempts to launch the default launcher activity
 * @throws Error if adb command fails
 */
export async function startAndroidApp(
  device: Device | string, 
  bundleId: string, 
  mainActivity?: string
): Promise<void> {
  const deviceId = typeof device === 'string' ? device : device.id;
  
  try {
    if (mainActivity) {
      // Launch specific activity
      const activityPath = mainActivity.startsWith('.') 
        ? `${bundleId}${mainActivity}` 
        : mainActivity;
      
      await execFileAsync('adb', [
        '-s', deviceId, 
        'shell', 'am', 'start', 
        '-n', `${bundleId}/${activityPath}`
      ], {
        timeout: 30000,
      });
    } else {
      // Launch default launcher activity
      await execFileAsync('adb', [
        '-s', deviceId,
        'shell', 'monkey',
        '-p', bundleId,
        '-c', 'android.intent.category.LAUNCHER',
        '1'
      ], {
        timeout: 30000,
      });
    }
  } catch (error: any) {
    throw new Error(`Failed to start Android app ${bundleId} on device ${deviceId}: ${error.message}`);
  }
}

/**
 * Restart an Android app (stop then start)
 * 
 * @param device - Android device/emulator
 * @param bundleId - App package name
 * @param mainActivity - Main activity class name (optional)
 * @param force - Use force-stop instead of graceful kill. Default: false
 * @throws Error if adb commands fail
 */
export async function restartAndroidApp(
  device: Device | string, 
  bundleId: string, 
  mainActivity?: string,
  force: boolean = false
): Promise<void> {
  await stopAndroidApp(device, bundleId, force);
  // Small delay to ensure clean shutdown
  await new Promise(resolve => setTimeout(resolve, 500));
  await startAndroidApp(device, bundleId, mainActivity);
}

//
// Helper functions
//

/**
 * Send a command keystroke to the Expo CLI dev server
 * 
 * This simulates pressing a key in the Expo CLI terminal to trigger actions like:
 * - 'i' to open in iOS simulator
 * - 'a' to open in Android emulator  
 * - 'r' to reload
 * 
 * @param projectPath - Path to Expo project (used for context, not actually used for finding the server)
 * @param keystroke - The keystroke to send ('i', 'a', 'r', etc.)
 */
async function sendExpoCLICommand(projectPath: string, keystroke: string): Promise<void> {
  // The Expo CLI is typically running in the background via the PTY server
  // We need to send the keystroke through the PTY interface
  // This is handled by the agent-server's PTY functionality
  
  // For now, we'll use a simple approach: send the keystroke via stdin
  // In practice, this would go through the agent-server's cmd endpoint
  try {
    const { execFile: execFileCb } = await import('child_process');
    const util = await import('util');
    const execFilePromise = util.promisify(execFileCb);
    
    // Call the agents CLI to send the command
    await execFilePromise('npx', ['@agenteract/agents', 'cmd', projectPath, keystroke], {
      timeout: 5000,
    });
  } catch (error: any) {
    throw new Error(`Failed to send Expo CLI command '${keystroke}': ${error.message}`);
  }
}
