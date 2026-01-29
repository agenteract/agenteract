import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface Device {
  id: string;
  name: string;
  type: 'ios' | 'android' | 'desktop' | 'web';
  state?: 'booted' | 'shutdown' | 'available';
}

async function checkCommandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [command]);
    return true;
  } catch {
    return false;
  }
}

/**
 * List available iOS simulators
 */
export async function listIOSDevices(): Promise<Device[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  const hasXcrun = await checkCommandExists('xcrun');
  if (!hasXcrun) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
    const data = JSON.parse(stdout);
    const devices: Device[] = [];

    for (const runtime of Object.keys(data.devices)) {
      for (const device of data.devices[runtime]) {
        devices.push({
          id: device.udid,
          name: `${device.name} (${runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').replace(/-/g, ' ')})`,
          type: 'ios',
          state: device.state === 'Booted' ? 'booted' : 'shutdown',
        });
      }
    }

    return devices;
  } catch (error) {
    console.warn('Could not list iOS devices:', (error as Error).message);
    return [];
  }
}

/**
 * List available Android devices/emulators
 */
export async function listAndroidDevices(): Promise<Device[]> {
  const hasAdb = await checkCommandExists('adb');
  if (!hasAdb) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('adb', ['devices']);
    const lines = stdout.split('\n').slice(1); // Skip header
    const devices: Device[] = [];

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+device$/);
      if (match) {
        const id = match[1];
        // Get device name
        try {
          const { stdout: nameStdout } = await execFileAsync('adb', [
            '-s',
            id,
            'shell',
            'getprop',
            'ro.product.model',
          ]);
          const name = nameStdout.trim() || id;
          devices.push({
            id,
            name: `${name} (Android)`,
            type: 'android',
            state: 'booted',
          });
        } catch {
          devices.push({
            id,
            name: `${id} (Android)`,
            type: 'android',
            state: 'booted',
          });
        }
      }
    }

    return devices;
  } catch (error) {
    console.warn('Could not list Android devices:', (error as Error).message);
    return [];
  }
}

/**
 * Select a device based on the selection criteria
 * 1. Try requested device ID
 * 2. Try first booted device
 * 3. Try first available device
 * 4. Return null if none found
 */
export async function selectDevice(
  requestedDeviceId: string | undefined,
  platform: 'ios' | 'android' | 'desktop' | 'web' | undefined
): Promise<Device | null> {
  // Special case for desktop/web platform
  if (platform === 'desktop' || requestedDeviceId === 'desktop') {
    return {
      id: 'desktop',
      name: 'Desktop',
      type: 'desktop',
      state: 'available',
    };
  }

  if (platform === 'web' || requestedDeviceId === 'web') {
    return {
      id: 'web',
      name: 'Web Browser',
      type: 'web',
      state: 'available',
    };
  }

  // Determine which platforms to check
  const checkIOS = !platform || platform === 'ios';
  const checkAndroid = !platform || platform === 'android';

  let allDevices: Device[] = [];

  if (checkIOS) {
    const iosDevices = await listIOSDevices();
    allDevices = allDevices.concat(iosDevices);
  }

  if (checkAndroid) {
    const androidDevices = await listAndroidDevices();
    allDevices = allDevices.concat(androidDevices);
  }

  // 1. Try requested device ID
  if (requestedDeviceId) {
    const requested = allDevices.find((d) => d.id === requestedDeviceId);
    if (requested) {
      return requested;
    }
  }

  // 2. Try first booted device
  const booted = allDevices.find((d) => d.state === 'booted');
  if (booted) {
    return booted;
  }

  // 3. Try first available device
  if (allDevices.length > 0) {
    return allDevices[0];
  }

  // 4. No device found
  return null;
}
