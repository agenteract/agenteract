import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Device } from './device-manager.js';
import { detectPlatform } from './platform-detector.js';
import { resolveBundleInfo } from './bundle-resolver.js';
import type { ProjectConfig } from '../config-types.js';
import { parseGradleTasks } from './gradle.js';

const execFileAsync = promisify(execFile);

/**
 * Result returned from starting an app
 */
export interface StartAppResult {
  /** Browser instance (for web apps like Vite) */
  browser?: any;
  /** Process instance (for desktop apps like KMP desktop) */
  process?: ChildProcess;
}

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
  
  /** 
   * Optional project name for Expo Go apps - required for sending CLI commands
   * If not provided, will attempt to resolve from projectPath
   */
  projectName?: string;
  
  /**
   * Optional project config from agenteract.config.js
   * Required for Swift apps to resolve bundle ID via URL scheme
   * Provides access to scheme, lifecycle config, and other project settings
   */
  projectConfig?: ProjectConfig;
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
 * Determine if an Expo project is using Expo Go (no native directories)
 * 
 * @param projectPath - Path to the Expo project
 * @param platform - Target platform (ios or android)
 * @returns true if the project is using Expo Go, false if prebuilt
 */
export function isExpoGo(projectPath: string, platform?: 'ios' | 'android'): boolean {
  // If a specific platform is requested, check only that platform
  if (platform === 'ios') {
    return !existsSync(join(projectPath, 'ios'));
  }
  
  if (platform === 'android') {
    return !existsSync(join(projectPath, 'android'));
  }

  // If ios/ or android/ directories exist, it's prebuilt (legacy behavior)
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
      
      // Special case: 'booted' identifier means "currently booted device"
      if (deviceId === 'booted') {
        // Look for any booted device
        for (const runtime in devices) {
          const deviceList = devices[runtime];
          const bootedDevice = deviceList.find((d: any) => d.state?.toLowerCase() === 'booted');
          
          if (bootedDevice) {
            return { 
              id: bootedDevice.udid, 
              state: 'booted', 
              platform: 'ios' 
            };
          }
        }
        
        // No booted device found
        return { 
          id: 'booted', 
          state: 'shutdown', 
          platform: 'ios' 
        };
      }
      
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
    // Special case: if deviceId is 'booted' and state is 'shutdown', we need a real device to boot
    if (deviceId === 'booted' && state.state === 'shutdown') {
      throw new Error(
        'No iOS simulator is currently booted. Please specify a device ID/name or boot a simulator manually using "xcrun simctl boot <device-id>"'
      );
    }
    
    // Check if already booted
    if (state.state === 'booted') {
      console.log(`ℹ️  Device ${state.id} is already booted (NOOP)`);
      return;
    }
    
    if (state.state === 'unknown') {
      throw new Error(`Device ${deviceId} not found or in unknown state`);
    }
    
    // Boot the simulator - use the actual device ID from state (in case 'booted' was passed)
    const actualDeviceId = state.id;
    try {
      await execFileAsync('xcrun', ['simctl', 'boot', actualDeviceId], {
        timeout: 10000,
      });
      
      console.log(`🔄 Booting device ${actualDeviceId}...`);
      
      // Wait for boot if requested
      if (waitForBoot) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
          const currentState = await getDeviceState(actualDeviceId);
          
          if (currentState.state === 'booted') {
            console.log(`✓ Device ${actualDeviceId} booted successfully`);
            return;
          }
          
          // Wait 1 second before checking again
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error(`Device ${actualDeviceId} boot timed out after ${timeout}ms`);
      } else {
        console.log(`✓ Boot initiated for device ${actualDeviceId}`);
      }
    } catch (error: any) {
      // Handle "already booted" error gracefully
      if (error.message?.includes('Unable to boot device in current state: Booted')) {
        console.log(`ℹ️  Device ${actualDeviceId} is already booted (NOOP)`);
        return;
      }
      throw new Error(`Failed to boot iOS device ${actualDeviceId}: ${error.message}`);
    }
  }
}

/**
 * Clear app data (cache, preferences, databases, etc.)
 * 
 * Platform-specific behavior:
 * - iOS: Uninstalls and reinstalls the app (iOS cannot clear data without uninstalling)
 * - Android: Uses `adb shell pm clear` to clear app data
 * - Expo Go: NOOP (cannot clear data for Expo Go apps)
 * - Desktop: NOOP (not applicable)
 * 
 * @param options - Lifecycle options including projectPath, device, and optional bundleId
 * @throws Error if clearing fails or app is not installed
 * 
 * @example
 * ```typescript
 * // Clear data for a prebuilt app
 * await clearAppData({
 *   projectPath: '/path/to/app',
 *   device: myDevice,
 *   bundleId: 'com.example.myapp' // optional
 * });
 * ```
 */
export async function clearAppData(options: AppLifecycleOptions): Promise<void> {
  const { projectPath, device, bundleId: bundleIdOverride, projectConfig } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  const deviceId = deviceObj.id;
  
  // Desktop is NOOP
  if (platform === 'desktop') {
    console.log('ℹ️  Not applicable for desktop platform (NOOP)');
    return;
  }
  
  // Detect project type
  const platformInfo = await detectPlatform(projectPath);
  
  // Expo Go apps cannot have data cleared
  const expoGoPlatform = (platform === 'ios' || platform === 'android') ? platform : undefined;
  if (platformInfo === 'expo' && isExpoGo(projectPath, expoGoPlatform)) {
    console.log('ℹ️  Cannot clear data for Expo Go apps (NOOP)');
    return;
  }
  
  // Resolve bundle ID if not provided
  let bundleId = bundleIdOverride;
  if (!bundleId) {
    const bundleInfo = await resolveBundleInfo(
      projectPath, 
      platformInfo, 
      projectConfig?.lifecycle,
      projectConfig?.scheme
    );
    bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
    
    if (!bundleId) {
      throw new Error(`Bundle ID not found for ${platform}. Configure lifecycle.bundleId in agenteract.config.js or pass bundleId option.`);
    }
  }
  
  // Platform-specific clearing
  if (platform === 'ios') {
    // iOS: Must uninstall to clear data (no way to clear without uninstalling)
    try {
      await execFileAsync('xcrun', ['simctl', 'uninstall', deviceId, bundleId], {
        timeout: 30000,
      });
      console.log(`✓ Cleared app data for ${bundleId} (uninstalled on iOS)`);
    } catch (error: any) {
      // If app is not installed, that's fine - data is already "cleared"
      if (error.message?.includes('No such file or directory') || 
          error.message?.includes('not installed')) {
        console.log(`ℹ️  App ${bundleId} not installed, data already clear (NOOP)`);
        return;
      }
      throw new Error(`Failed to clear iOS app data for ${bundleId}: ${error.message}`);
    }
  } else if (platform === 'android') {
    // Android: Use pm clear
    try {
      await execFileAsync('adb', ['-s', deviceId, 'shell', 'pm', 'clear', bundleId], {
        timeout: 30000,
      });
      console.log(`✓ Cleared app data for ${bundleId}`);
    } catch (error: any) {
      // If package doesn't exist, data is already clear
      if (error.message?.includes('Failed to clear') || 
          error.message?.includes('Unknown package')) {
        console.log(`ℹ️  App ${bundleId} not installed, data already clear (NOOP)`);
        return;
      }
      throw new Error(`Failed to clear Android app data for ${bundleId}: ${error.message}`);
    }
  }
}

/**
 * Setup port forwarding (Android only)
 * 
 * Forwards a port from the Android device/emulator to the host machine.
 * This is useful for accessing dev servers running on the host (e.g., Metro, Vite).
 * 
 * Platform-specific behavior:
 * - Android: Uses `adb reverse tcp:<port> tcp:<hostPort>` to forward ports
 * - iOS: NOOP (iOS simulators share localhost with the host)
 * - Desktop: NOOP (not applicable)
 * 
 * @param options - Port forwarding options including device, port, and optional hostPort
 * @throws Error if port forwarding setup fails
 * 
 * @example
 * ```typescript
 * // Forward port 8081 (Metro bundler)
 * await setupPortForwarding({
 *   device: androidEmulator,
 *   port: 8081
 * });
 * 
 * // Forward device port 8081 to host port 3000
 * await setupPortForwarding({
 *   device: androidEmulator,
 *   port: 8081,
 *   hostPort: 3000
 * });
 * ```
 */
export async function setupPortForwarding(options: PortForwardingOptions): Promise<void> {
  const { device, port, hostPort = port } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'android' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  const deviceId = deviceObj.id;
  
  // iOS simulators share localhost with host
  if (platform === 'ios') {
    console.log('ℹ️  iOS simulators share localhost with host (NOOP)');
    return;
  }
  
  // Desktop doesn't need port forwarding
  if (platform === 'desktop') {
    console.log('ℹ️  Not applicable for desktop platform (NOOP)');
    return;
  }
  
  // Android: Setup reverse port forwarding
  if (platform === 'android') {
    try {
      await execFileAsync('adb', [
        '-s', deviceId,
        'reverse',
        `tcp:${port}`,
        `tcp:${hostPort}`
      ], {
        timeout: 10000,
      });
      console.log(`✓ Port forwarding setup: device:${port} -> host:${hostPort}`);
    } catch (error: any) {
      // If port is already forwarded, that's fine
      if (error.message?.includes('already reversed')) {
        console.log(`ℹ️  Port ${port} already forwarded (NOOP)`);
        return;
      }
      throw new Error(`Failed to setup port forwarding for port ${port}: ${error.message}`);
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
/**
 * Start/launch an app - platform and framework agnostic
 * 
 * Automatically detects app type (Expo Go, prebuilt native, etc.) and uses appropriate launch method.
 * For Expo Go apps, sends CLI command to reopen the app. For prebuilt apps, uses native launch commands.
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
 * // Expo Go with project name (for CLI commands)
 * await startApp({
 *   projectPath: '/path/to/expo-app',
 *   device: iosSimulator,
 *   projectName: 'my-expo-app'
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
export async function startApp(options: AppLifecycleOptions): Promise<StartAppResult> {
  const { projectPath, device, bundleId: bundleIdOverride, mainActivity: mainActivityOverride, projectName, projectConfig } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string' 
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Auto-boot device if it's shutdown (skip for desktop)
  if (platform !== 'desktop') {
    const deviceState = await getDeviceState(deviceObj);
    if (deviceState.state === 'shutdown') {
      await bootDevice({ device: deviceObj, waitForBoot: false });
    }
  }
  
  // Detect project type
  const platformInfo = await detectPlatform(projectPath);
  
  // Handle KMP projects - they can be multi-target (both android and desktop)
  // Use device type to determine which target to launch
  if (platformInfo === 'kmp-android' || platformInfo === 'kmp-desktop') {
    if (platform === 'desktop') {
      return await startKMPApp(projectPath);
    } else if (platform === 'android') {
      // For KMP Android, install the app first, then use standard Android launch
      const gradle = await findGradle(projectPath);
      console.log(`Installing KMP Android app via gradle task: installDebug`);
      await execFileAsync(gradle, ['installDebug'], {
        cwd: projectPath,
      });
      
      // Continue to standard Android launch flow below using resolveBundleInfo
      // (don't return here - fall through to use bundleInfo resolution)
    }
  }
  
  // For KMP desktop that already returned above, we won't reach here
  // For KMP Android, we continue to resolve bundle info and launch normally
  const effectiveProjectType = platformInfo === 'kmp-android' ? 'kmp-android' : platformInfo;
  
  // Handle Swift/Xcode projects - build and install to simulator
  if (effectiveProjectType === 'xcode' && platform === 'ios') {
    console.log('Building and installing Swift/Xcode app to iOS simulator...');
    await buildAndInstallXcodeApp(projectPath, deviceObj);
    // Continue to standard iOS launch flow below using resolveBundleInfo
  }
  
  // Check if Expo Go
  const expoGoPlatform = (platform === 'ios' || platform === 'android') ? platform : undefined;
  const isExpoGoApp = effectiveProjectType === 'expo' && isExpoGo(projectPath, expoGoPlatform);
  
  // Resolve bundle IDs if not provided
  let bundleId = bundleIdOverride;
  let mainActivity = mainActivityOverride;
  
  if (!bundleId) {
    if (isExpoGoApp) {
      // For Expo Go, use the Expo Go bundle ID
      bundleId = platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent';
    } else {
      const bundleInfo = await resolveBundleInfo(
        projectPath, 
        effectiveProjectType, 
        projectConfig?.lifecycle,
        projectConfig?.scheme
      );
      bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
      mainActivity = bundleInfo.androidMainActivity || mainActivity;
      
      if (!bundleId) {
        throw new Error(`Bundle ID not found for ${platform}. Configure lifecycle.bundleId in agenteract.config.js or pass bundleId option.`);
      }
    }
  }
  
  // Handle different app types
  if (isExpoGoApp) {
    // Expo Go - use Expo CLI keystroke to launch the app
    // This requires the Expo dev server to be running
    if (!projectName) {
      throw new Error('projectName is required for Expo Go apps. Pass projectName option to startApp().');
    }
    
    const keystroke = platform === 'ios' ? 'i' : 'a';
    const process = await sendExpoCLICommand(projectName, keystroke, projectPath);
    return { process };
    // Wait for the app to start - the Expo CLI will trigger the launch
  } else {
    // Prebuilt apps - use platform commands
    if (platform === 'ios') {
      await startIOSApp(deviceObj, bundleId);
    } else {
      await startAndroidApp(deviceObj, bundleId, mainActivity);
    }
    return {};
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
 *   force: true  // Force kill (Android only, defaults to true)
 * });
 * ```
 */
export async function stopApp(options: AppLifecycleOptions): Promise<void> {
  const { projectPath, device, bundleId: bundleIdOverride, force = true, projectConfig, projectName } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Detect project type and resolve bundle ID
  const platformInfo = await detectPlatform(projectPath);
  
  // Check if Flutter app - if so, try to quit gracefully via 'q' command first
  if (platformInfo === 'flutter' && projectName && projectConfig) {
    try {
      // Get PTY port from projectConfig
      const ptyPort = projectConfig.devServer?.port || projectConfig.ptyPort || 8792;
      
      console.log('Sending quit command to Flutter dev server...');
      await sendFlutterCommand(projectName, 'q', projectPath);
      
      // Wait for the PTY server to actually shut down
      console.log('Waiting for Flutter PTY server to shut down...');
      const maxWaitTime = 10000; // 10 seconds max
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if PTY server is still running by trying to fetch logs
        try {
          const response = await fetch(`http://localhost:${ptyPort}/logs?since=0`);
          if (!response.ok) {
            // Server responded but with error - it's still running
            continue;
          }
          // Server is still running
        } catch (error: any) {
          // ECONNREFUSED means server has shut down
          if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
            console.log('✓ Flutter PTY server has shut down');
            return; // Flutter PTY and app have terminated
          }
          // Other errors - keep waiting
        }
      }
      
      console.warn(`Flutter PTY server did not shut down within ${maxWaitTime}ms, falling back to platform termination...`);
      // Fall through to platform-specific termination
    } catch (error: any) {
      console.warn(`Failed to send Flutter quit command: ${error.message}`);
      console.warn('Falling back to platform-specific termination...');
      // Fall through to platform-specific termination below
    }
  }
  
  // Check if Expo Go
  const expoGoPlatform = (platform === 'ios' || platform === 'android') ? platform : undefined;
  const isExpoGoApp = platformInfo === 'expo' && isExpoGo(projectPath, expoGoPlatform);
  
  let bundleId = bundleIdOverride;
  if (!bundleId) {
    if (isExpoGoApp) {
      // For Expo Go, use the Expo Go bundle ID
      bundleId = platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent';
    } else {
      const bundleInfo = await resolveBundleInfo(
        projectPath, 
        platformInfo, 
        projectConfig?.lifecycle,
        projectConfig?.scheme
      );
      bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
      
      if (!bundleId) {
        throw new Error(`Bundle ID not found for ${platform}. Configure lifecycle.bundleId in agenteract.config.js or pass bundleId option.`);
      }
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
    // Error messages can be:
    // - "No matching processes" (older error format)
    // - "found nothing to terminate" (newer error format)
    if (!error.message?.includes('No matching processes') && 
        !error.message?.includes('nothing to terminate')) {
      throw new Error(`Failed to stop iOS app ${bundleId} on device ${deviceId}: ${error.message}`);
    }
    // App is not running, which is fine
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
  
  // Auto-boot device if shutdown (only if device is not 'booted' identifier)
  if (deviceId !== 'booted') {
    const deviceObj = typeof device === 'string' 
      ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
      : device;
    
    const deviceState = await getDeviceState(deviceObj);
    if (deviceState.state === 'shutdown') {
      await bootDevice({ device: deviceObj, waitForBoot: false });
    }
  }
  
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
 * @param force - If true, use force-stop (immediate); if false, use kill (graceful). Default: true
 * @throws Error if adb command fails
 * 
 * Note: `am kill` only stops background/cached processes. For foreground apps, you must use force-stop.
 * Since most test scenarios involve stopping a foreground app, force defaults to true.
 */
export async function stopAndroidApp(
  device: Device | string, 
  bundleId: string, 
  force: boolean = true
): Promise<void> {
  const deviceId = typeof device === 'string' ? device : device.id;
  
  const command = force ? 'force-stop' : 'kill';
  await execFileAsync('adb', ['-s', deviceId, 'shell', 'am', command, bundleId], {
    timeout: 10000,
  });
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
  
  // Auto-boot device if shutdown
  const deviceObj = typeof device === 'string' 
    ? { id: device, type: 'android' as const, name: device, state: 'unknown' as const }
    : device;
  
  const deviceState = await getDeviceState(deviceObj);
  if (deviceState.state === 'shutdown') {
    await bootDevice({ device: deviceObj, waitForBoot: false });
  }
  
  try {
    if (mainActivity) {
      // Launch specific activity
      // If activity starts with '.', it's relative to the package
      // Otherwise, use it as-is (could be fully qualified)
      const activityPath = mainActivity.startsWith('.') 
        ? mainActivity  // Keep the dot, e.g., '.MainActivity'
        : mainActivity; // Use as-is, e.g., 'com.example.CustomActivity'
      
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
 * @param bundleId - App package name (e.g., 'com.example.myapp')
 * @param mainActivity - Optional main activity name (defaults to 'MainActivity')
 * @param force - Use force-stop instead of graceful kill (default: false)
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

/**
 * Start (launch) a KMP app via gradle
 * 
 * Uses gradle to run KMP apps for both desktop and Android targets.
 * For desktop: Uses the 'run' task from Compose desktop tasks
 * For Android: Uses 'installDebug' task followed by launching via adb
 * 
 * @param projectPath - Path to KMP project root
 * @param target - Target platform ('desktop' or 'android')
 * @param device - Android device (required for android target)
 * @returns StartAppResult with process handle
 * @throws Error if gradle tasks fail or run task not found
 */
/**
 * Start a KMP desktop app using gradle
 * 
 * For KMP Android apps, use startApp() which handles installation and launch properly.
 * 
 * @param projectPath - Path to KMP project root
 * @returns StartAppResult with process handle
 */
export async function startKMPApp(projectPath: string): Promise<StartAppResult> {
  try {
    const gradle = await findGradle(projectPath);
    
    // Desktop: Use 'run' task from Compose desktop tasks
    const { stdout } = await execFileAsync(gradle, ['tasks'], { cwd: projectPath });
    const tasks = parseGradleTasks(stdout).get('Compose desktop tasks');

    if (!tasks) {
      throw Error('No "Compose desktop tasks" section found in gradle tasks output');
    }

    if (!tasks.some(t => t.name === 'run')) {
      throw Error('No "run" task found in Compose desktop tasks');
    }
    
    console.log(`Launching KMP desktop app with gradle task: run`);
    const process = spawn(gradle, ['run', '--quiet'], {
      cwd: projectPath,
      stdio: 'inherit',
    });
    
    return { process };
  } catch (error) {
    throw new Error(`Failed to launch KMP desktop app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * @deprecated Use startKMPApp instead
 */
export async function startKMPDesktopApp(projectPath: string): Promise<StartAppResult> {
  return startKMPApp(projectPath);
}

//
// Install/Uninstall/Reinstall operations - Platform and framework agnostic
//

/**
 * Install an app on a device - platform and framework agnostic
 * 
 * Automatically detects app type and platform, then installs appropriately.
 * - iOS: NOOP (apps auto-install during development via Xcode)
 * - Android: Uses gradle installDebug/installRelease or adb install
 * - Expo Go: NOOP (cannot install Expo Go via this method)
 * 
 * @param options - Install options including projectPath, device, and optional configuration
 * @example
 * ```typescript
 * // Install Android app in debug mode
 * await installApp({
 *   projectPath: '/path/to/flutter-app',
 *   device: androidEmulator
 * });
 * 
 * // Install from APK file
 * await installApp({
 *   projectPath: '/path/to/app',
 *   device: androidEmulator,
 *   apkPath: '/path/to/app-release.apk'
 * });
 * ```
 */
export async function installApp(options: InstallOptions): Promise<void> {
  const { projectPath, device, apkPath, configuration = 'debug' } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'android' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Detect project type first
  const platformInfo = await detectPlatform(projectPath);
  
  // Check if Expo Go
  const expoGoPlatform = (platform === 'ios' || platform === 'android') ? platform : undefined;
  if (platformInfo === 'expo' && isExpoGo(projectPath, expoGoPlatform)) {
    console.log('ℹ️  Cannot install Expo Go apps via this method (NOOP)');
    return;
  }
  
  // iOS installation
  if (platform === 'ios') {
    // For prebuilt Expo apps, we need to install the built .app
    if (platformInfo === 'expo') {
      console.log('📦 Installing prebuilt Expo iOS app...');
      const iosPath = join(projectPath, 'ios');
      const buildPath = join(iosPath, 'build', 'Build', 'Products', 
        configuration === 'release' ? 'Release-iphonesimulator' : 'Debug-iphonesimulator');
      
      // Find the .app bundle
      const { readdir } = await import('fs/promises');
      const files = await readdir(buildPath);
      const appBundle = files.find(f => f.endsWith('.app'));
      
      if (!appBundle) {
        throw new Error(`No .app bundle found in ${buildPath}. Did the build complete successfully?`);
      }
      
      const appPath = join(buildPath, appBundle);
      console.log(`Installing ${appBundle} to simulator...`);
      
      await execFileAsync('xcrun', ['simctl', 'install', deviceObj.id, appPath], {
        timeout: 60000,
      });
      console.log('✓ Prebuilt Expo app installed successfully');
    } else {
      // Flutter/Swift apps auto-install during xcodebuild
      console.log('ℹ️  iOS apps auto-install during xcodebuild (NOOP)');
    }
    return;
  }
  
  // Android installation
  if (apkPath) {
    // Install from APK file
    console.log(`📦 Installing APK: ${apkPath}`);
    await execFileAsync('adb', ['-s', deviceObj.id, 'install', '-r', apkPath], {
      timeout: 60000,
    });
    console.log('✓ APK installed successfully');
  } else {
    // Install via gradle
    const androidPath = platformInfo === 'flutter' 
      ? join(projectPath, 'android')
      : projectPath;
    
    const gradle = await findGradle(androidPath);
    const task = configuration === 'release' ? 'installRelease' : 'installDebug';
    
    console.log(`📦 Installing Android app via gradle (${task})`);
    await execFileAsync(gradle, [task], {
      cwd: androidPath,
      timeout: 120000,
    });
    console.log(`✓ App installed successfully via ${task}`);
  }
}

/**
 * Uninstall an app from a device - platform and framework agnostic
 * 
 * Removes the app completely from the device.
 * - iOS: Uses xcrun simctl uninstall
 * - Android: Uses adb uninstall
 * - Expo Go: NOOP (cannot uninstall Expo Go via this method)
 * 
 * @param options - Lifecycle options
 * @example
 * ```typescript
 * await uninstallApp({
 *   projectPath: '/path/to/app',
 *   device: myDevice
 * });
 * ```
 */
export async function uninstallApp(options: AppLifecycleOptions): Promise<void> {
  const { projectPath, device, bundleId: bundleIdOverride, projectConfig } = options;
  
  // Get device info
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'ios' as const, name: device, state: 'unknown' as const }
    : device;
  
  const platform = deviceObj.type;
  
  // Detect project type
  const platformInfo = await detectPlatform(projectPath);
  
  // Check if Expo Go
  const expoGoPlatform = (platform === 'ios' || platform === 'android') ? platform : undefined;
  const isExpoGoApp = platformInfo === 'expo' && isExpoGo(projectPath, expoGoPlatform);
  
  if (isExpoGoApp) {
    console.log('ℹ️  Cannot uninstall Expo Go apps via this method (NOOP)');
    return;
  }
  
  // Resolve bundle ID
  let bundleId = bundleIdOverride;
  if (!bundleId) {
    const bundleInfo = await resolveBundleInfo(
      projectPath, 
      platformInfo, 
      projectConfig?.lifecycle,
      projectConfig?.scheme
    );
    bundleId = platform === 'ios' ? bundleInfo.ios : bundleInfo.android;
    
    if (!bundleId) {
      throw new Error(`Bundle ID not found for ${platform}. Configure lifecycle.bundleId in agenteract.config.js or pass bundleId option.`);
    }
  }
  
  try {
    if (platform === 'ios') {
      console.log(`🗑️  Uninstalling ${bundleId} from iOS simulator`);
      await execFileAsync('xcrun', ['simctl', 'uninstall', deviceObj.id, bundleId], {
        timeout: 30000,
      });
      console.log(`✓ Uninstalled ${bundleId}`);
    } else {
      console.log(`🗑️  Uninstalling ${bundleId} from Android device`);
      await execFileAsync('adb', ['-s', deviceObj.id, 'uninstall', bundleId], {
        timeout: 30000,
      });
      console.log(`✓ Uninstalled ${bundleId}`);
    }
  } catch (error: any) {
    // Gracefully handle app not installed
    if (error.message?.includes('No such file') || 
        error.message?.includes('not installed') ||
        error.message?.includes('Unknown package')) {
      console.log(`ℹ️  App ${bundleId} not installed (already clean)`);
    } else {
      throw error;
    }
  }
}

/**
 * Reinstall an app (uninstall then install) - platform and framework agnostic
 * 
 * Useful for getting a completely fresh app state during testing.
 * Combines uninstall + delay + install operations.
 * 
 * @param options - Install options
 * @example
 * ```typescript
 * await reinstallApp({
 *   projectPath: '/path/to/app',
 *   device: myDevice,
 *   configuration: 'debug'
 * });
 * ```
 */
export async function reinstallApp(options: InstallOptions): Promise<void> {
  console.log('🔄 Reinstalling app (uninstall + install)...');
  
  // Uninstall first
  await uninstallApp(options);
  
  // Small delay to ensure clean state
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Then install
  await installApp(options);
  
  console.log('✓ App reinstalled successfully');
}

//
// Build operations - Platform and framework agnostic
//

/**
 * Build an app - platform and framework agnostic
 * 
 * Automatically detects project type and builds appropriately.
 * Supports silent mode to suppress build output (default: true).
 * 
 * - **Flutter**: Uses `flutter build` or gradle
 * - **Prebuilt Expo**: Uses xcodebuild or gradle
 * - **KMP**: Uses gradle tasks
 * - **Swift**: Uses xcodebuild
 * - **Vite**: Uses npm run build
 * - **Expo Go**: NOOP (uses OTA updates)
 * 
 * @param options - Build options
 * @example
 * ```typescript
 * // Build in silent mode (default)
 * await buildApp({
 *   projectPath: '/path/to/flutter-app',
 *   device: androidDevice,
 *   configuration: 'debug'
 * });
 * 
 * // Build with full output
 * await buildApp({
 *   projectPath: '/path/to/app',
 *   device: iosDevice,
 *   configuration: 'release',
 *   silent: false
 * });
 * ```
 */
export async function buildApp(options: BuildOptions): Promise<void> {
  const { projectPath, device, configuration = 'debug', platform: platformOverride, silent = true } = options;
  
  // Get device info to determine platform
  const deviceObj = typeof device === 'string'
    ? { id: device, type: 'android' as const, name: device, state: 'unknown' as const }
    : device;
  
  const targetPlatform = platformOverride || deviceObj.type;
  
  // Detect project type
  const platformInfo = await detectPlatform(projectPath);
  
  // Check if Expo Go
  const expoGoPlatform = (targetPlatform === 'ios' || targetPlatform === 'android') ? targetPlatform : undefined;
  if (platformInfo === 'expo' && isExpoGo(projectPath, expoGoPlatform)) {
    console.log('ℹ️  Expo Go apps use OTA updates, no build required (NOOP)');
    return;
  }
  
  // Build based on project type
  const buildMessage = `🔨 Building ${platformInfo} ${targetPlatform} app (${configuration})...`;
  if (!silent) {
    console.log(buildMessage);
  }
  
  try {
    switch (platformInfo) {
      case 'flutter':
        await buildFlutterApp(projectPath, targetPlatform, configuration, silent);
        break;
      
      case 'expo':
        // Prebuilt Expo
        await buildPrebuiltExpoApp(projectPath, targetPlatform, configuration, silent);
        break;
      
      case 'kmp-android':
        await buildKMPAndroidApp(projectPath, configuration, silent);
        break;
      
      case 'kmp-desktop':
        await buildKMPDesktopApp(projectPath, configuration, silent);
        break;
      
      case 'xcode':
        await buildSwiftApp(projectPath, configuration, silent);
        break;
      
      case 'vite':
        await buildViteApp(projectPath, silent);
        break;
      
      default:
        throw new Error(`Build not supported for platform: ${platformInfo}`);
    }
    
    console.log(`✓ Build completed successfully`);
  } catch (error: any) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

/**
 * Build Flutter app
 */
async function buildFlutterApp(
  projectPath: string,
  platform: 'ios' | 'android' | 'desktop',
  configuration: string,
  silent: boolean
): Promise<void> {
  if (platform === 'android') {
    const androidPath = join(projectPath, 'android');
    const gradle = await findGradle(androidPath);
    const task = configuration === 'release' ? 'assembleRelease' : 'assembleDebug';
    
    const execOptions: any = { cwd: androidPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
    if (silent) {
      execOptions.stdio = 'ignore';
    } else {
      execOptions.stdio = 'inherit';
    }
    
    await execFileAsync(gradle, [task], execOptions);
  } else if (platform === 'ios') {
    const args = ['build', 'ios'];
    if (configuration === 'release') {
      args.push('--release');
    } else {
      args.push('--debug');
    }
    
    const execOptions: any = { cwd: projectPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
    if (silent) {
      execOptions.stdio = 'ignore';
    } else {
      execOptions.stdio = 'inherit';
    }
    
    await execFileAsync('flutter', args, execOptions);
  }
}

/**
 * Build prebuilt Expo app
 */
async function buildPrebuiltExpoApp(
  projectPath: string,
  platform: 'ios' | 'android' | 'desktop',
  configuration: string,
  silent: boolean
): Promise<void> {
  if (platform === 'android') {
    const androidPath = join(projectPath, 'android');
    const gradle = await findGradle(androidPath);
    const task = configuration === 'release' ? 'assembleRelease' : 'assembleDebug';
    
    const execOptions: any = { cwd: androidPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
    if (silent) {
      execOptions.stdio = 'ignore';
    } else {
      execOptions.stdio = 'inherit';
    }
    
    await execFileAsync(gradle, [task], execOptions);
  } else if (platform === 'ios') {
    // For Expo iOS, we need to use xcodebuild
    const iosPath = join(projectPath, 'ios');
    const { readdir } = await import('fs/promises');
    const files = await readdir(iosPath);
    
    const workspace = files.find(f => f.endsWith('.xcworkspace'));
    const project = files.find(f => f.endsWith('.xcodeproj'));
    
    if (!workspace && !project) {
      throw new Error('No Xcode project or workspace found in ios/');
    }
    
    const args = [
      '-scheme', workspace ? workspace.replace('.xcworkspace', '') : project!.replace('.xcodeproj', ''),
      '-configuration', configuration === 'release' ? 'Release' : 'Debug',
      '-sdk', 'iphonesimulator',
      '-derivedDataPath', join(iosPath, 'build'),
      'build',
    ];
    
    if (workspace) {
      args.unshift('-workspace', workspace);
    } else if (project) {
      args.unshift('-project', project);
    }
    
    const execOptions: any = { cwd: iosPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
    if (silent) {
      execOptions.stdio = 'ignore';
    } else {
      execOptions.stdio = 'inherit';
    }
    
    await execFileAsync('xcodebuild', args, execOptions);
  }
}

/**
 * Build KMP Android app
 */
async function buildKMPAndroidApp(
  projectPath: string,
  configuration: string,
  silent: boolean
): Promise<void> {
  const gradle = await findGradle(projectPath);
  const task = configuration === 'release' ? 'assembleRelease' : 
               configuration === 'debug' ? 'assembleDebug' : configuration;
  
  const execOptions: any = { cwd: projectPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
  if (silent) {
    execOptions.stdio = 'ignore';
  } else {
    execOptions.stdio = 'inherit';
  }
  
  await execFileAsync(gradle, [task], execOptions);
}

/**
 * Build KMP Desktop app
 */
async function buildKMPDesktopApp(
  projectPath: string,
  configuration: string,
  silent: boolean
): Promise<void> {
  const gradle = await findGradle(projectPath);
  const task = configuration === 'release' ? 'packageDistributionForCurrentOS' : 'build';
  
  const execOptions: any = { cwd: projectPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
  if (silent) {
    execOptions.stdio = 'ignore';
  } else {
    execOptions.stdio = 'inherit';
  }
  
  await execFileAsync(gradle, [task], execOptions);
}

/**
 * Build Swift app using xcodebuild
 */
async function buildSwiftApp(
  projectPath: string,
  configuration: string,
  silent: boolean
): Promise<void> {
  const { readdir } = await import('fs/promises');
  const files = await readdir(projectPath);
  
  const workspace = files.find(f => f.endsWith('.xcworkspace'));
  const project = files.find(f => f.endsWith('.xcodeproj'));
  
  if (!workspace && !project) {
    throw new Error('No Xcode project or workspace found');
  }
  
  const args = [
    '-scheme', workspace ? workspace.replace('.xcworkspace', '') : project!.replace('.xcodeproj', ''),
    '-configuration', configuration === 'release' ? 'Release' : 'Debug',
    '-sdk', 'iphonesimulator',
    'build',
  ];
  
  if (workspace) {
    args.unshift('-workspace', workspace);
  } else if (project) {
    args.unshift('-project', project);
  }
  
  const execOptions: any = { cwd: projectPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
  if (silent) {
    execOptions.stdio = 'ignore';
  } else {
    execOptions.stdio = 'inherit';
  }
  
  await execFileAsync('xcodebuild', args, execOptions);
}

/**
 * Build and install Swift/Xcode app to iOS simulator
 * This uses xcodebuild with -destination to build and automatically install to the simulator
 */
async function buildAndInstallXcodeApp(
  projectPath: string,
  device: Device
): Promise<void> {
  const { glob } = await import('glob');
  const path = await import('path');
  
  // Search for .xcworkspace files (they take precedence over .xcodeproj)
  // Exclude project.xcworkspace files that are inside .xcodeproj directories
  const workspaces = await glob('**/*.xcworkspace', {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/build/**', '**/DerivedData/**', '**/.build/**', '**/*.xcodeproj/**']
  });
  
  // Search for .xcodeproj files
  const projects = await glob('**/*.xcodeproj', {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/build/**', '**/DerivedData/**', '**/.build/**']
  });
  
  if (workspaces.length === 0 && projects.length === 0) {
    throw new Error('No Xcode project or workspace found');
  }
  
  // Use workspace if available, otherwise use project
  const workspaceOrProject = workspaces[0] || projects[0];
  const isWorkspace = workspaceOrProject.endsWith('.xcworkspace');
  
  // Extract scheme name from the .xcworkspace or .xcodeproj filename
  const fileName = path.basename(workspaceOrProject);
  const baseName = fileName.replace(isWorkspace ? '.xcworkspace' : '.xcodeproj', '');
  const workingDir = path.dirname(workspaceOrProject);
  
  const args = [
    isWorkspace ? '-workspace' : '-project',
    path.basename(workspaceOrProject),
    '-scheme', baseName,
    '-configuration', 'Debug',
    '-sdk', 'iphonesimulator',
    '-destination', `id=${device.id}`,
    'build',
  ];
  
  console.log(`Building and installing Swift app: ${baseName}`);
  console.log(`Target device: ${device.name} (${device.id})`);
  console.log(`Working directory: ${workingDir}`);
  
  const execOptions: any = { 
    cwd: workingDir, 
    maxBuffer: 50 * 1024 * 1024,
    stdio: 'inherit'
  };
  
  await execFileAsync('xcodebuild', args, execOptions);
  console.log('✓ Swift app built and installed successfully');
}

/**
 * Build Vite app
 */
async function buildViteApp(projectPath: string, silent: boolean): Promise<void> {
  const execOptions: any = { cwd: projectPath, timeout: 300000, maxBuffer: 50 * 1024 * 1024 };
  if (silent) {
    execOptions.stdio = 'ignore';
  } else {
    execOptions.stdio = 'inherit';
  }
  
  await execFileAsync('npm', ['run', 'build'], execOptions);
}

//
// Helper functions
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
/**
 * Send a keystroke command to the Expo CLI
 * This triggers the Expo dev server to perform an action (e.g., 'i' to open iOS, 'a' to open Android)
 * 
 * @param projectName - Project name from agenteract.config.js
 * @param keystroke - Single character command ('i' for iOS, 'a' for Android, etc.)
 * @param projectPath - Path to the Expo project directory (where .agenteract-runtime.json is located)
 */
async function sendExpoCLICommand(projectName: string | undefined, keystroke: string, projectPath: string): Promise<ChildProcess> {
  // The Expo CLI is typically running in the background via the PTY server
  // We need to send the keystroke through the PTY interface
  // This is handled by the agent-server's PTY functionality
  
  if (!projectName) {
    throw new Error('projectName is required for Expo Go apps. Pass projectName option to startApp().');
  }
  
  if (!projectPath) {
    throw new Error('projectPath is required for Expo Go apps. Pass projectPath option to startApp().');
  }
  
  try {
    const { detectInvoker } = await import('../index.js');
    
    // Detect if we're running in pnpm monorepo (same logic as dev.ts)
    const { pkgManager } = detectInvoker();
    
    // If we're in the agenteract monorepo, use pnpm with the local package name
    // Otherwise use npx with the published package name
    const spawnBin = pkgManager === 'pnpm' ? 'pnpm' : 'npx';
    const agentsPackage = pkgManager === 'pnpm' ? 'agenteract-agents' : '@agenteract/agents';
    
    // Call the agents CLI to send the command
    // Format: pnpm agenteract-agents cmd [project-name] [keystroke]
    // or: npx @agenteract/agents cmd [project-name] [keystroke]
    // Run from the project directory to ensure correct .agenteract-runtime.json token is used
    const childProcess = spawn(spawnBin, [agentsPackage, 'cmd', projectName, keystroke], {
      cwd: projectPath,
      stdio: 'inherit', // Inherit stdio to see any error output
    });
    
    return childProcess;
  } catch (error: any) {
    // Propagate the error with context
    throw new Error(`Failed to send Expo CLI command '${keystroke}' to project '${projectName}' at ${projectPath}: ${error.message}`);
  }
}

/**
 * Send a command to Flutter dev server via the PTY interface
 * Similar to Expo, Flutter runs in a PTY and accepts keyboard commands (r, R, q, etc.)
 */
async function sendFlutterCommand(projectName: string | undefined, keystroke: string, projectPath: string): Promise<void> {
  // The Flutter dev server is running in the background via the PTY server
  // We send the keystroke through the PTY interface (e.g., 'q' to quit, 'r' to hot reload)
  
  if (!projectName) {
    throw new Error('projectName is required for Flutter apps. Pass projectName option.');
  }
  
  if (!projectPath) {
    throw new Error('projectPath is required for Flutter apps. Pass projectPath option.');
  }
  
  try {
    const { detectInvoker } = await import('../index.js');
    
    // Detect if we're running in pnpm monorepo (same logic as dev.ts)
    const { pkgManager } = detectInvoker();
    
    // If we're in the agenteract monorepo, use pnpm with the local package name
    // Otherwise use npx with the published package name
    const spawnBin = pkgManager === 'pnpm' ? 'pnpm' : 'npx';
    const agentsPackage = pkgManager === 'pnpm' ? 'agenteract-agents' : '@agenteract/agents';
    
    // Call the agents CLI to send the command
    // Format: pnpm agenteract-agents cmd [project-name] [keystroke]
    // or: npx @agenteract/agents cmd [project-name] [keystroke]
    // Run from the project directory to ensure correct .agenteract-runtime.json token is used
    const childProcess = spawn(spawnBin, [agentsPackage, 'cmd', projectName, keystroke], {
      cwd: projectPath,
      stdio: 'pipe', // Capture output to detect errors
    });
    
    // Wait for the command to complete
    await new Promise<void>((resolve, reject) => {
      let stderr = '';
      
      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}. ${stderr ? 'Error: ' + stderr : ''}`));
        }
      });
      
      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error: any) {
    // Propagate the error with context
    throw new Error(`Failed to send Flutter command '${keystroke}' to project '${projectName}' at ${projectPath}: ${error.message}`);
  }
}
