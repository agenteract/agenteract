const mockExecFileAsync = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: jest.fn(() => mockExecFileAsync),
}));

import { listIOSDevices, listAndroidDevices, selectDevice } from './device-manager';

describe('device-manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listIOSDevices', () => {
    it('should return empty array on non-macOS platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const devices = await listIOSDevices();

      expect(devices).toEqual([]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return empty array if xcrun not available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          throw new Error('Command not found');
        }
        return { stdout: '', stderr: '' };
      });

      const devices = await listIOSDevices();

      expect(devices).toEqual([]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should parse iOS simulator list correctly', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/xcrun', stderr: '' };
        }
        if (cmd === 'xcrun' && args?.[0] === 'simctl') {
          return {
            stdout: JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                  {
                    udid: 'ABC-123',
                    name: 'iPhone 15 Pro',
                    state: 'Booted',
                  },
                  {
                    udid: 'DEF-456',
                    name: 'iPhone 15',
                    state: 'Shutdown',
                  },
                ],
              },
            }),
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const devices = await listIOSDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({
        id: 'ABC-123',
        name: expect.stringContaining('iPhone 15 Pro'),
        type: 'ios',
        state: 'booted',
      });
      expect(devices[1]).toEqual({
        id: 'DEF-456',
        name: expect.stringContaining('iPhone 15'),
        type: 'ios',
        state: 'shutdown',
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle xcrun simctl errors gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/xcrun', stderr: '' };
        }
        throw new Error('simctl error');
      });

      const devices = await listIOSDevices();

      expect(devices).toEqual([]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('listAndroidDevices', () => {
    it('should return empty array if adb not available', async () => {
      mockExecFileAsync.mockImplementation(async () => {
        throw new Error('Command not found');
      });

      const devices = await listAndroidDevices();

      expect(devices).toEqual([]);
    });

    it('should parse adb devices list correctly', async () => {
      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/adb', stderr: '' };
        }
        if (cmd === 'adb' && args?.[0] === 'devices') {
          return {
            stdout: 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\tdevice\n',
            stderr: '',
          };
        }
        if (cmd === 'adb' && args?.includes('getprop')) {
          return {
            stdout: args[1] === 'emulator-5554' ? 'Pixel 5' : 'Pixel 6',
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const devices = await listAndroidDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('emulator-5554');
      expect(devices[0].type).toBe('android');
      expect(devices[0].state).toBe('booted');
    });

    it('should handle device name fetch errors', async () => {
      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/adb', stderr: '' };
        }
        if (cmd === 'adb' && args?.[0] === 'devices') {
          return {
            stdout: 'List of devices attached\nemulator-5554\tdevice\n',
            stderr: '',
          };
        }
        if (cmd === 'adb' && args?.includes('getprop')) {
          throw new Error('getprop failed');
        }
        return { stdout: '', stderr: '' };
      });

      const devices = await listAndroidDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('emulator-5554');
      expect(devices[0].name).toContain('emulator-5554');
    });

    it('should handle adb command errors gracefully', async () => {
      mockExecFileAsync.mockImplementation(async (cmd: string) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/adb', stderr: '' };
        }
        throw new Error('adb error');
      });

      const devices = await listAndroidDevices();

      expect(devices).toEqual([]);
    });
  });

  describe('selectDevice', () => {
    beforeEach(() => {
      mockExecFileAsync.mockImplementation(async () => {
        throw new Error('No devices');
      });
    });

    it('should return desktop device for desktop platform', async () => {
      const device = await selectDevice(undefined, 'desktop');

      expect(device).toEqual({
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
        state: 'available',
      });
    });

    it('should return desktop device for desktop request', async () => {
      const device = await selectDevice('desktop', undefined);

      expect(device).toEqual({
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
        state: 'available',
      });
    });

    it('should return requested device if available', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/xcrun', stderr: '' };
        }
        if (cmd === 'xcrun') {
          return {
            stdout: JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                  {
                    udid: 'REQUESTED-ID',
                    name: 'iPhone 15',
                    state: 'Shutdown',
                  },
                ],
              },
            }),
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const device = await selectDevice('REQUESTED-ID', 'ios');

      expect(device?.id).toBe('REQUESTED-ID');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return first booted device if no specific device requested', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/xcrun', stderr: '' };
        }
        if (cmd === 'xcrun') {
          return {
            stdout: JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                  {
                    udid: 'SHUTDOWN-ID',
                    name: 'iPhone 14',
                    state: 'Shutdown',
                  },
                  {
                    udid: 'BOOTED-ID',
                    name: 'iPhone 15',
                    state: 'Booted',
                  },
                ],
              },
            }),
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const device = await selectDevice(undefined, 'ios');

      expect(device?.id).toBe('BOOTED-ID');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return first available device if none booted', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/xcrun', stderr: '' };
        }
        if (cmd === 'xcrun') {
          return {
            stdout: JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                  {
                    udid: 'FIRST-ID',
                    name: 'iPhone 14',
                    state: 'Shutdown',
                  },
                  {
                    udid: 'SECOND-ID',
                    name: 'iPhone 15',
                    state: 'Shutdown',
                  },
                ],
              },
            }),
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const device = await selectDevice(undefined, 'ios');

      expect(device?.id).toBe('FIRST-ID');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return null if no devices available', async () => {
      const device = await selectDevice(undefined, 'ios');

      expect(device).toBeNull();
    });

    it('should check both iOS and Android if no platform specified', async () => {
      mockExecFileAsync.mockImplementation(async (cmd: string, args?: any[]) => {
        if (cmd === 'which' || cmd === 'where') {
          return { stdout: '/usr/bin/adb', stderr: '' };
        }
        if (cmd === 'adb' && args?.[0] === 'devices') {
          return {
            stdout: 'List of devices attached\nemulator-5554\tdevice\n',
            stderr: '',
          };
        }
        if (cmd === 'adb' && args?.includes('getprop')) {
          return { stdout: 'Pixel 5', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      const device = await selectDevice(undefined, undefined);

      expect(device?.type).toBe('android');
    });
  });
});
