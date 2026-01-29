import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { PlatformType } from './platform-detector';
import { BundleInfo } from './bundle-resolver';
import { Device } from './device-manager';

const execFileAsync = promisify(execFile);

export interface LaunchResult {
  browser?: any; // Puppeteer Browser instance for web
  process?: ChildProcess; // Process for desktop apps
}

export interface LaunchOptions {
  timeout?: number;
  waitForReady?: boolean;
}

export interface BuildOptions {
  configuration: 'debug' | 'release' | string;
  platform?: 'ios' | 'android' | 'desktop' | 'web';
}

export interface SetupOptions {
  action: 'install' | 'reinstall' | 'clearData';
  platform?: 'ios' | 'android';
}

/**
 * Launch an app on the target platform
 */
export async function launchApp(
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo,
  projectPath: string,
  options: LaunchOptions = {}
): Promise<LaunchResult> {
  switch (platformType) {
    case 'vite':
      return launchWebApp(projectPath, options);
    case 'flutter':
    case 'expo':
    case 'swiftui':
      if (device?.type === 'ios') {
        return launchIOSApp(device, bundleInfo.ios!, options);
      } else if (device?.type === 'android') {
        return launchAndroidApp(device, bundleInfo.android!, bundleInfo.androidMainActivity!, options);
      }
      throw new Error(`No device available for platform ${platformType}`);
    case 'kmp-android':
      if (!device || device.type !== 'android') {
        throw new Error('Android device required for kmp-android platform');
      }
      return launchAndroidApp(device, bundleInfo.android!, bundleInfo.androidMainActivity!, options);
    case 'kmp-desktop':
      return launchDesktopApp(projectPath, options);
    default:
      throw new Error(`Unsupported platform: ${platformType}`);
  }
}

/**
 * Stop a running app
 */
export async function stopApp(
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo,
  launchResult: LaunchResult | undefined,
  force: boolean = false
): Promise<void> {
  switch (platformType) {
    case 'vite':
      if (launchResult?.browser) {
        await launchResult.browser.close();
      }
      break;
    case 'flutter':
    case 'expo':
    case 'swiftui':
      if (device?.type === 'ios' && bundleInfo.ios) {
        await stopIOSApp(device, bundleInfo.ios);
      } else if (device?.type === 'android' && bundleInfo.android) {
        await stopAndroidApp(device, bundleInfo.android, force);
      }
      break;
    case 'kmp-android':
      if (device && bundleInfo.android) {
        await stopAndroidApp(device, bundleInfo.android, force);
      }
      break;
    case 'kmp-desktop':
      if (launchResult?.process) {
        launchResult.process.kill(force ? 'SIGKILL' : 'SIGTERM');
      }
      break;
  }
}

/**
 * Build an app
 */
export async function buildApp(
  projectPath: string,
  platformType: PlatformType,
  options: BuildOptions
): Promise<void> {
  const { configuration, platform } = options;

  switch (platformType) {
    case 'flutter':
      if (platform === 'android') {
        await execFileAsync('./gradlew', [`assemble${capitalize(configuration)}`], {
          cwd: `${projectPath}/android`,
          timeout: 300000,
        });
      } else if (platform === 'ios') {
        // Flutter iOS builds typically done via flutter build ios
        await execFileAsync('flutter', ['build', 'ios', '--' + configuration.toLowerCase()], {
          cwd: projectPath,
          timeout: 300000,
        });
      }
      break;
    case 'kmp-android':
    case 'kmp-desktop':
      if (configuration === 'debug' || configuration === 'release') {
        await execFileAsync('./gradlew', [`assemble${capitalize(configuration)}`], {
          cwd: projectPath,
          timeout: 300000,
        });
      } else {
        // Custom build task
        await execFileAsync('./gradlew', [configuration], {
          cwd: projectPath,
          timeout: 300000,
        });
      }
      break;
    case 'expo':
      // Expo builds are typically done via eas-cli or expo build
      throw new Error('Expo builds not yet supported in app-launcher');
    case 'vite':
      // Vite builds typically via npm run build
      await execFileAsync('npm', ['run', 'build'], {
        cwd: projectPath,
        timeout: 300000,
      });
      break;
    default:
      throw new Error(`Build not supported for platform: ${platformType}`);
  }
}

/**
 * Perform setup actions (install, reinstall, clearData)
 */
export async function performSetup(
  projectPath: string,
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo,
  options: SetupOptions
): Promise<void> {
  const { action, platform } = options;

  // Skip if platform filter doesn't match
  if (platform && device?.type !== platform) {
    return;
  }

  switch (action) {
    case 'install':
      await installApp(projectPath, platformType, device, bundleInfo);
      break;
    case 'reinstall':
      await uninstallApp(platformType, device, bundleInfo);
      await installApp(projectPath, platformType, device, bundleInfo);
      break;
    case 'clearData':
      await clearAppData(platformType, device, bundleInfo);
      break;
  }
}

// --- Platform-specific implementations ---

async function launchWebApp(projectPath: string, options: LaunchOptions): Promise<LaunchResult> {
  // For Vite apps, assume dev server is already running
  // Launch Puppeteer browser
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch (error) {
    throw new Error('Puppeteer not installed. Install with: npm install puppeteer');
  }

  const launcher = puppeteer.default || puppeteer;
  const browser = await launcher.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5173', {
    waitUntil: 'networkidle0',
    timeout: options.timeout || 60000,
  });

  return { browser };
}

async function launchIOSApp(device: Device, bundleId: string, options: LaunchOptions): Promise<LaunchResult> {
  // Boot simulator if needed
  if (device.state !== 'booted') {
    await execFileAsync('xcrun', ['simctl', 'boot', device.id]);
    // Wait a bit for boot to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Launch app
  await execFileAsync('xcrun', ['simctl', 'launch', device.id, bundleId], {
    timeout: options.timeout || 60000,
  });

  return {};
}

async function launchAndroidApp(
  device: Device,
  bundleId: string,
  mainActivity: string,
  options: LaunchOptions
): Promise<LaunchResult> {
  // Set up port forwarding for AgentDebugBridge
  try {
    await execFileAsync('adb', ['-s', device.id, 'reverse', 'tcp:8765', 'tcp:8765']);
  } catch (error) {
    console.warn('Port forwarding failed, app may not connect:', error);
  }

  // Launch app
  // mainActivity can be either a full class name (com.example.MainActivity) or relative (.MainActivity)
  // If it already starts with bundleId, use it as-is; otherwise prefix with '.'
  const activityName = mainActivity.startsWith(bundleId) 
    ? mainActivity 
    : (mainActivity.startsWith('.') ? mainActivity : `.${mainActivity}`);
  const componentName = `${bundleId}/${activityName}`;
  await execFileAsync(
    'adb',
    ['-s', device.id, 'shell', 'am', 'start', '-n', componentName, '-W'],
    { timeout: options.timeout || 60000 }
  );

  return {};
}

async function launchDesktopApp(projectPath: string, options: LaunchOptions): Promise<LaunchResult> {
  // Detect available gradle tasks
  let runTask = 'run';
  try {
    const { stdout } = await execFileAsync('./gradlew', ['tasks', '--console=plain'], {
      cwd: projectPath,
      timeout: 30000,
    });

    // Find first run task
    const taskLines = stdout.split('\n');
    const runTasks = taskLines
      .filter(line => line.match(/^(run|runDebug|desktopRun)\b/))
      .map(line => line.split(' ')[0].trim());

    if (runTasks.length > 0) {
      runTask = runTasks[0];
    }
  } catch (error) {
    console.warn('Could not detect gradle tasks, using default "run":', error);
  }

  // Launch app via gradle
  const process = spawn('./gradlew', [runTask, '--quiet'], {
    cwd: projectPath,
    stdio: 'inherit',
  });

  return { process };
}

async function stopIOSApp(device: Device, bundleId: string): Promise<void> {
  try {
    await execFileAsync('xcrun', ['simctl', 'terminate', device.id, bundleId]);
  } catch (error) {
    console.warn('Could not stop iOS app:', error);
  }
}

async function stopAndroidApp(device: Device, bundleId: string, force: boolean): Promise<void> {
  try {
    const command = force ? 'force-stop' : 'stop';
    await execFileAsync('adb', ['-s', device.id, 'shell', 'am', command, bundleId]);
  } catch (error) {
    console.warn(`Could not stop Android app (${force ? 'force' : 'graceful'}):`, error);
  }
}

async function installApp(
  projectPath: string,
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  if (platformType === 'flutter' || platformType === 'kmp-android') {
    if (device?.type === 'android') {
      const gradleRoot = platformType === 'flutter' ? `${projectPath}/android` : projectPath;
      await execFileAsync('./gradlew', ['installDebug'], {
        cwd: gradleRoot,
        timeout: 300000,
      });
    }
    // iOS apps are installed automatically during development
  } else if (platformType === 'expo') {
    // Expo installation typically handled by expo-cli
    throw new Error('Expo installation not yet supported');
  }
}

async function uninstallApp(
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  if (device?.type === 'android' && bundleInfo.android) {
    try {
      await execFileAsync('adb', ['-s', device.id, 'uninstall', bundleInfo.android]);
    } catch (error) {
      // App might not be installed, ignore error
    }
  } else if (device?.type === 'ios' && bundleInfo.ios) {
    try {
      await execFileAsync('xcrun', ['simctl', 'uninstall', device.id, bundleInfo.ios]);
    } catch (error) {
      // App might not be installed, ignore error
    }
  }
}

async function clearAppData(
  platformType: PlatformType,
  device: Device | null,
  bundleInfo: BundleInfo
): Promise<void> {
  if (device?.type === 'android' && bundleInfo.android) {
    try {
      await execFileAsync('adb', ['-s', device.id, 'shell', 'pm', 'clear', bundleInfo.android]);
    } catch (error) {
      console.warn('Could not clear Android app data:', error);
    }
  } else if (device?.type === 'ios' && bundleInfo.ios) {
    // iOS: uninstall and reinstall to clear data
    await uninstallApp(platformType, device, bundleInfo);
    console.warn('iOS data cleared by uninstalling app. Reinstall required.');
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
