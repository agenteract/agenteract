import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import * as path from 'path';
import { ProjectType } from './platform-detector.js';
import { BundleInfo } from './bundle-resolver.js';
import { Device } from './device-manager.js';
import { 
  stopIOSApp as stopIOSAppUtil, 
  stopAndroidApp as stopAndroidAppUtil 
} from './lifecycle-utils.js';
import { parseGradleTasks } from './gradle.js';

const execFileAsync = promisify(execFile);

export interface StartAppResult {
  browser?: any;      // Puppeteer Browser instance (for web apps)
  process?: ChildProcess; // For desktop apps
}

export interface BuildOptions {
  configuration?: 'debug' | 'release' | string;
  platform?: 'ios' | 'android';
}

export interface SetupOptions {
  action: 'install' | 'reinstall' | 'clearData';
  platform?: 'ios' | 'android'; // Filter by platform
}

const DEFAULT_LAUNCH_TIMEOUT = 60000; // 60 seconds

/**
 * Find gradle wrapper or fall back to global gradle
 */
async function findGradle(projectPath: string): Promise<string> {
  const gradlew = path.join(projectPath, 'gradlew');
  if (existsSync(gradlew)) {
    return './gradlew';
  }
  
  // Check if global gradle exists
  try {
    await execFileAsync('which', ['gradle']);
    return 'gradle';
  } catch {
    throw new Error('Gradle not found. Please ensure ./gradlew exists or gradle is installed globally.');
  }
}

/**
 * Launch an app on a device or simulator
 */
export async function launchApp(
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo,
  projectPath: string,
  launchTimeout: number = DEFAULT_LAUNCH_TIMEOUT
): Promise<StartAppResult> {
  isValidAppControlDevice(device);
  switch (projectType) {
    case 'vite':
      return launchViteApp(projectPath);
    
    case 'flutter':
    case 'expo':
      if (!device) {
        throw new Error('No device available for mobile app launch');
      }
      return device.type === 'ios' 
        ? launchIOSApp(device, bundleInfo, launchTimeout)
        : launchAndroidApp(device, bundleInfo, launchTimeout);
    
    case 'kmp-android':
      if (!device) {
        throw new Error('No device available for Android app launch');
      }
      return launchAndroidApp(device, bundleInfo, launchTimeout);
    
    case 'kmp-desktop':
      return launchKMPDesktopApp(projectPath);
    
    case 'xcode':
      if (!device) {
        throw new Error('No device available for iOS app launch');
      }
      return launchIOSApp(device, bundleInfo, launchTimeout);
    
    default:
      throw new Error(`Unsupported project type: ${projectType}`);
  }
}

/**
 * Launch Vite web app with Puppeteer
 */
async function launchViteApp(projectPath: string): Promise<StartAppResult> {
  try {
    // Dynamic import of puppeteer
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    await page.goto('http://localhost:5173'); // Default Vite port
    
    return { browser };
  } catch (error) {
    throw new Error(`Failed to launch Vite app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Launch iOS app on simulator
 */
async function launchIOSApp(
  device: Device,
  bundleInfo: BundleInfo,
  timeout: number
): Promise<StartAppResult> {
  if (!bundleInfo.ios) {
    throw new Error('iOS bundle ID not found. Configure lifecycle.bundleId.ios in agenteract.config.js');
  }
  
  try {
    // Boot simulator if not already booted
    if (device.state !== 'booted') {
      console.log(`Booting iOS simulator: ${device.name}`);
      await execFileAsync('xcrun', ['simctl', 'boot', device.id]);
      // Wait a bit for boot to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Launch the app
    console.log(`Launching ${bundleInfo.ios} on ${device.name}`);
    await execFileAsync(
      'xcrun',
      ['simctl', 'launch', device.id, bundleInfo.ios],
      { timeout }
    );
    
    return {};
  } catch (error) {
    throw new Error(`Failed to launch iOS app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Launch Android app on emulator/device
 */
async function launchAndroidApp(
  device: Device,
  bundleInfo: BundleInfo,
  timeout: number
): Promise<StartAppResult> {
  if (!bundleInfo.android) {
    throw new Error('Android package name not found. Configure lifecycle.bundleId.android in agenteract.config.js');
  }
  
  const mainActivity = bundleInfo.androidMainActivity || 'MainActivity';
  const component = `${bundleInfo.android}/.${mainActivity}`;
  
  try {
    // Set up port forwarding for Agenteract server
    console.log(`Setting up port forwarding for ${device.name}`);
    try {
      await execFileAsync('adb', ['-s', device.id, 'reverse', 'tcp:8765', 'tcp:8765']);
    } catch (error) {
      console.warn('Port forwarding failed (may already be set up):', error instanceof Error ? error.message : String(error));
    }
    
    // Launch the app
    console.log(`Launching ${component} on ${device.name}`);
    await execFileAsync(
      'adb',
      ['-s', device.id, 'shell', 'am', 'start', '-n', component, '-W'],
      { timeout }
    );
    
    return {};
  } catch (error) {
    throw new Error(`Failed to launch Android app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Launch KMP desktop app via gradle
 */
async function launchKMPDesktopApp(projectPath: string): Promise<StartAppResult> {
  try {
    const gradle = await findGradle(projectPath);
    
    // Try to detect the correct run task
    let runTask = 'run';

    const { stdout } = await execFileAsync(gradle, ['tasks'], { cwd: projectPath });
    let tasks = parseGradleTasks(stdout).get('Compose desktop tasks');

    if (!tasks) {
      throw Error('No "Compose desktop tasks" section found in gradle tasks output');
    }

    if (!tasks.some(t => t.name === runTask)) {
      throw Error('No "run" task found in Compose desktop tasks');
    }
    
    console.log(`Launching KMP desktop app with task: ${runTask}`);
    const process = spawn(gradle, [runTask, '--quiet'], {
      cwd: projectPath,
      stdio: 'inherit',
    });
    
    return { process };
  } catch (error) {
    throw new Error(`Failed to launch KMP desktop app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Checks if device !== null && device !== undefined
 * @param device 
 */
export function isValidAppControlDevice(device: Device | null): asserts device is Device {
  if (!device) {
    throw Error('Device required for app control operations.');
  }
}

/**
 * Stop a running app
 */
export async function stopApp(
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo,
  launchResult: StartAppResult,
  force: boolean = false
): Promise<void> {
  isValidAppControlDevice(device);

  switch (projectType) {
    case 'vite':
      if (launchResult.browser) {
        await launchResult.browser.close();
      }
      break;
    
    case 'flutter':
    case 'expo':
      if (!device) return;
      if (device.type === 'ios') {
        await stopIOSApp(device, bundleInfo);
      } else {
        await stopAndroidApp(device, bundleInfo, force);
      }
      break;
    
    case 'kmp-android':
      if (!device) return;
      await stopAndroidApp(device, bundleInfo, force);
      break;
    
    case 'kmp-desktop':
      if (launchResult.process) {
        launchResult.process.kill(force ? 'SIGKILL' : 'SIGTERM');
      }
      break;
    
    case 'xcode':
      if (!device) return;
      await stopIOSApp(device, bundleInfo);
      break;
  }
}

/**
 * Stop iOS app (wrapper for lifecycle utility)
 */
async function stopIOSApp(device: Device, bundleInfo: BundleInfo): Promise<void> {
  if (!bundleInfo.ios) return;
  await stopIOSAppUtil(device, bundleInfo.ios);
}

/**
 * Stop Android app (wrapper for lifecycle utility)
 */
async function stopAndroidApp(device: Device, bundleInfo: BundleInfo, force: boolean): Promise<void> {
  if (!bundleInfo.android) return;
  await stopAndroidAppUtil(device, bundleInfo.android, force);
}

/**
 * Build an app
 */
export async function buildApp(
  projectPath: string,
  projectType: ProjectType,
  options: BuildOptions
): Promise<void> {
  const config = options.configuration || 'debug';
  
  switch (projectType) {
    case 'flutter':
      await buildFlutterApp(projectPath, options);
      break;
    
    case 'kmp-android':
      await buildKMPAndroidApp(projectPath, config);
      break;
    
    case 'kmp-desktop':
      await buildKMPDesktopApp(projectPath, config);
      break;
    
    case 'vite':
      await buildViteApp(projectPath);
      break;
    
    case 'xcode':
      await buildSwiftApp(projectPath, options);
      break;
    
    case 'expo':
      throw new Error('Expo builds not yet supported. Use EAS Build or expo prebuild.');
    
    default:
      throw new Error(`Build not supported for project type: ${projectType}`);
  }
}

/**
 * Build Flutter app
 */
async function buildFlutterApp(projectPath: string, options: BuildOptions): Promise<void> {
  const config = options.configuration || 'debug';
  const platform = options.platform;
  
  if (platform === 'android' || !platform) {
    const gradle = await findGradle(path.join(projectPath, 'android'));
    const task = config === 'release' ? 'assembleRelease' : 'assembleDebug';
    
    console.log(`Building Flutter Android app (${config})`);
    await execFileAsync(gradle, [task], { cwd: path.join(projectPath, 'android') });
  }
  
  if (platform === 'ios' || !platform) {
    console.log(`Building Flutter iOS app (${config})`);
    const args = ['build', 'ios'];
    if (config === 'release') {
      args.push('--release');
    }
    
    await execFileAsync('flutter', args, { cwd: projectPath });
  }
}

/**
 * Build KMP Android app
 */
async function buildKMPAndroidApp(projectPath: string, config: string): Promise<void> {
  const gradle = await findGradle(projectPath);
  const task = config === 'release' ? 'assembleRelease' : 
               config === 'debug' ? 'assembleDebug' : config;
  
  console.log(`Building KMP Android app with task: ${task}`);
  await execFileAsync(gradle, [task], { cwd: projectPath });
}

/**
 * Build KMP Desktop app
 */
async function buildKMPDesktopApp(projectPath: string, config: string): Promise<void> {
  const gradle = await findGradle(projectPath);
  
  console.log(`Building KMP Desktop app with config: ${config}`);
  await execFileAsync(gradle, [config === 'release' ? 'build' : config], { cwd: projectPath });
}

/**
 * Build Vite app
 */
async function buildViteApp(projectPath: string): Promise<void> {
  console.log('Building Vite app');
  await execFileAsync('npm', ['run', 'build'], { cwd: projectPath });
}

/**
 * Build Swift app using xcodebuild
 */
async function buildSwiftApp(projectPath: string, options: BuildOptions): Promise<void> {
  const config = options.configuration || 'Debug';
  
  console.log(`Building Swift app (${config})`);
  
  // Find .xcworkspace (takes precedence) or .xcodeproj, searching recursively
  const { glob } = await import('glob');
  const path = await import('path');

  const workspaces = await glob('**/*.xcworkspace', {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/build/**', '**/DerivedData/**', '**/.build/**', '**/*.xcodeproj/**']
  });

  const projects = await glob('**/*.xcodeproj', {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/build/**', '**/DerivedData/**', '**/.build/**']
  });
  
  if (workspaces.length === 0 && projects.length === 0) {
    throw new Error('No Xcode project or workspace found');
  }

  const workspaceOrProject = workspaces[0] || projects[0];
  const isWorkspace = workspaceOrProject.endsWith('.xcworkspace');
  const fileName = path.basename(workspaceOrProject);
  const baseName = fileName.replace(isWorkspace ? '.xcworkspace' : '.xcodeproj', '');
  const workingDir = path.dirname(workspaceOrProject);
  
  const args = [
    isWorkspace ? '-workspace' : '-project',
    fileName,
    '-scheme', baseName,
    '-configuration', config,
    'build',
  ];
  
  await execFileAsync('xcodebuild', args, { cwd: workingDir });
}

/**
 * Perform setup operations (install, reinstall, clearData)
 */
export async function performSetup(
  projectPath: string,
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo,
  options: SetupOptions
): Promise<void> {
  // Filter by platform if specified
  if (options.platform && device && device.type !== options.platform) {
    console.log(`Skipping setup - device type ${device.type} doesn't match filter ${options.platform}`);
    return;
  }
  
  switch (options.action) {
    case 'install':
      await installApp(projectPath, projectType, device, bundleInfo);
      break;
    
    case 'reinstall':
      await reinstallApp(projectPath, projectType, device, bundleInfo);
      break;
    
    case 'clearData':
      await clearAppData(projectType, device, bundleInfo);
      break;
  }
}

/**
 * Install app on device
 */
async function installApp(
  projectPath: string,
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  isValidAppControlDevice(device);
  
  if (device.type === 'ios') {
    console.log('iOS app installation is handled by Xcode/dev build - skipping');
    return;
  }
  
  // Android installation
  if (projectType === 'flutter') {
    const gradle = await findGradle(path.join(projectPath, 'android'));
    console.log('Installing Flutter Android app');
    await execFileAsync(gradle, ['installDebug'], { cwd: path.join(projectPath, 'android') });
  } else if (projectType === 'kmp-android') {
    const gradle = await findGradle(projectPath);
    console.log('Installing KMP Android app');
    await execFileAsync(gradle, ['installDebug'], { cwd: projectPath });
  }
}

/**
 * Reinstall app (uninstall + install)
 */
async function reinstallApp(
  projectPath: string,
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  isValidAppControlDevice(device);
  
  // Uninstall first
  if (device.type === 'android' && bundleInfo.android) {
    try {
      console.log(`Uninstalling ${bundleInfo.android}`);
      await execFileAsync('adb', ['-s', device.id, 'uninstall', bundleInfo.android]);
    } catch (error) {
      console.warn('App not installed or uninstall failed (continuing)');
    }
  } else if (device.type === 'ios' && bundleInfo.ios) {
    try {
      console.log(`Uninstalling ${bundleInfo.ios}`);
      await execFileAsync('xcrun', ['simctl', 'uninstall', device.id, bundleInfo.ios]);
    } catch (error) {
      console.warn('App not installed or uninstall failed (continuing)');
    }
  }
  
  // Then install
  await installApp(projectPath, projectType, device, bundleInfo);
}

/**
 * Clear app data
 */
async function clearAppData(
  projectType: ProjectType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  isValidAppControlDevice(device);
  
  if (device.type === 'android' && bundleInfo.android) {
    console.log(`Clearing data for ${bundleInfo.android}`);
    await execFileAsync('adb', ['-s', device.id, 'shell', 'pm', 'clear', bundleInfo.android]);
  } else if (device.type === 'ios' && bundleInfo.ios) {
    // iOS doesn't have a direct "clear data" command - we uninstall instead
    console.log(`Clearing data for ${bundleInfo.ios} (via uninstall)`);
    await execFileAsync('xcrun', ['simctl', 'uninstall', device.id, bundleInfo.ios]);
  }
}
