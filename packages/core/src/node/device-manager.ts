import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const execFileAsync = promisify(execFile);

export interface Device {
  id: string;           // Device identifier (UUID for iOS, emulator-5554 for Android)
  name: string;         // Human-readable name (e.g., "iPhone 15 Pro", "Pixel 5")
  type: 'ios' | 'android' | 'desktop';
  state?: 'booted' | 'shutdown' | 'unknown';
  platform?: string;    // e.g., 'iOS 17.0', 'Android 14'
}

interface RuntimeConfig {
  defaultDevices?: {
    [projectName: string]: string; // projectName -> deviceId
  };
}

const RUNTIME_CONFIG_PATH = path.join(homedir(), '.agenteract-runtime.json');

/**
 * Load runtime configuration
 */
async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    if (!existsSync(RUNTIME_CONFIG_PATH)) {
      return {};
    }
    const content = await readFile(RUNTIME_CONFIG_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

/**
 * Save runtime configuration
 */
async function saveRuntimeConfig(config: RuntimeConfig): Promise<void> {
  const dir = path.dirname(RUNTIME_CONFIG_PATH);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(RUNTIME_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * List available iOS simulators
 */
export async function listIOSDevices(): Promise<Device[]> {
  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '--json']);
    const data = JSON.parse(stdout);
    
    const devices: Device[] = [];
    
    // Parse device list from simctl output
    for (const [runtime, deviceList] of Object.entries(data.devices)) {
      if (!Array.isArray(deviceList)) continue;
      
      // Extract platform version from runtime string (e.g., "iOS 17.0")
      const platformMatch = runtime.match(/iOS [\d.]+/);
      const platform = platformMatch ? platformMatch[0] : undefined;
      
      for (const device of deviceList as any[]) {
        // Skip unavailable devices (missing runtime, etc.)
        if (device.isAvailable === false) {
          continue;
        }
        
        devices.push({
          id: device.udid,
          name: device.name,
          type: 'ios',
          state: device.state === 'Booted' ? 'booted' : 'shutdown',
          platform,
        });
      }
    }
    
    return devices;
  } catch (error) {
    throw new Error(`Failed to list iOS devices: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List available Android devices and emulators
 */
export async function listAndroidDevices(): Promise<Device[]> {
  try {
    const { stdout } = await execFileAsync('adb', ['devices', '-l']);
    
    const devices: Device[] = [];
    const lines = stdout.split('\n').slice(1); // Skip header line
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse line: "emulator-5554  device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a"
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      
      const id = parts[0];
      const state = parts[1];
      
      if (state !== 'device' && state !== 'offline') continue;
      
      // Extract model name from properties
      let name = id;
      const modelMatch = line.match(/model:([^\s]+)/);
      if (modelMatch) {
        name = modelMatch[1].replace(/_/g, ' ');
      }
      
      // Try to get Android version
      let platform: string | undefined;
      try {
        const { stdout: propOutput } = await execFileAsync('adb', [
          '-s', id, 'shell', 'getprop', 'ro.build.version.release'
        ]);
        platform = `Android ${propOutput.trim()}`;
      } catch {
        // Ignore if we can't get version
      }
      
      devices.push({
        id,
        name,
        type: 'android',
        state: state === 'device' ? 'booted' : 'unknown',
        platform,
      });
    }
    
    return devices;
  } catch (error) {
    throw new Error(`Failed to list Android devices: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List all available devices for a given platform
 */
export async function listDevices(platform: 'ios' | 'android'): Promise<Device[]> {
  if (platform === 'ios') {
    return listIOSDevices();
  } else {
    return listAndroidDevices();
  }
}

/**
 * Get the default device object for a project (resolves from stored ID)
 * Note: Use getDefaultDevice() from config.ts to get just the device ID string
 */
export async function getDefaultDeviceInfo(projectName: string): Promise<Device | null> {
  const config = await loadRuntimeConfig();
  const deviceId = config.defaultDevices?.[projectName];
  
  if (!deviceId) {
    return null;
  }
  
  // Try to find the device in both iOS and Android lists
  try {
    const iosDevices = await listIOSDevices();
    const device = iosDevices.find(d => d.id === deviceId);
    if (device) return device;
  } catch {
    // Ignore iOS errors
  }
  
  try {
    const androidDevices = await listAndroidDevices();
    const device = androidDevices.find(d => d.id === deviceId);
    if (device) return device;
  } catch {
    // Ignore Android errors
  }
  
  return null;
}

/**
 * Find a booted device (prefers the default device if booted)
 */
export async function findBootedDevice(projectName: string, platform: 'ios' | 'android'): Promise<Device | null> {
  // First try to get the default device
  const defaultDevice = await getDefaultDeviceInfo(projectName);
  if (defaultDevice && defaultDevice.type === platform && defaultDevice.state === 'booted') {
    return defaultDevice;
  }
  
  // Otherwise, find any booted device
  const devices = await listDevices(platform);
  return devices.find(d => d.state === 'booted') || null;
}
