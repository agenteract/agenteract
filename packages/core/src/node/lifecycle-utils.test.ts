/**
 * @jest-environment node
 */

// Mock child_process before imports
const mockExecFileAsync = jest.fn();
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
  spawn: mockSpawn,
}));

jest.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

// Mock fs
const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

import {
  getDeviceState,
  findGradle,
  bootDevice,
  // Phase 2-4 functions not yet implemented:
  // clearAppData,
  // setupPortForwarding,
  // installApp,
  // uninstallApp,
  // reinstallApp,
  // buildApp,
  startApp,
} from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Shared Helpers', () => {
    describe('getDeviceState', () => {
      it('should get iOS device state (booted)', async () => {
        const mockOutput = {
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
              {
                udid: 'ABC-123',
                name: 'iPhone 15',
                state: 'Booted',
              },
            ],
          },
        };

        mockExecFileAsync.mockResolvedValue({
          stdout: JSON.stringify(mockOutput),
          stderr: '',
        });

        const result = await getDeviceState('ABC-123');

        expect(result).toEqual({
          id: 'ABC-123',
          state: 'booted',
          platform: 'ios',
        });
        expect(mockExecFileAsync).toHaveBeenCalledWith(
          'xcrun',
          ['simctl', 'list', 'devices', '--json'],
          { timeout: 10000 }
        );
      });

      it('should get iOS device state (shutdown)', async () => {
        const mockOutput = {
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
              {
                udid: 'ABC-123',
                name: 'iPhone 15',
                state: 'Shutdown',
              },
            ],
          },
        };

        mockExecFileAsync.mockResolvedValue({
          stdout: JSON.stringify(mockOutput),
          stderr: '',
        });

        const result = await getDeviceState('ABC-123');

        expect(result).toEqual({
          id: 'ABC-123',
          state: 'shutdown',
          platform: 'ios',
        });
      });

      it('should get Android device state', async () => {
        const device: Device = {
          id: 'emulator-5554',
          name: 'Pixel 5',
          type: 'android',
          state: 'unknown',
        };

        mockExecFileAsync.mockResolvedValue({
          stdout: 'List of devices attached\nemulator-5554    device\n',
          stderr: '',
        });

        const result = await getDeviceState(device);

        expect(result).toEqual({
          id: 'emulator-5554',
          state: 'booted',
          platform: 'android',
        });
        expect(mockExecFileAsync).toHaveBeenCalledWith('adb', ['devices', '-l'], {
          timeout: 10000,
        });
      });

      it('should return unknown for invalid device', async () => {
        mockExecFileAsync.mockResolvedValue({
          stdout: JSON.stringify({ devices: {} }),
          stderr: '',
        });

        const result = await getDeviceState('invalid-device');

        expect(result).toEqual({
          id: 'invalid-device',
          state: 'unknown',
          platform: 'ios',
        });
      });

      it('should handle desktop as always booted', async () => {
        const desktopDevice: Device = {
          id: 'desktop',
          name: 'Desktop',
          type: 'desktop',
        };

        const result = await getDeviceState(desktopDevice);

        expect(result).toEqual({
          id: 'desktop',
          state: 'booted',
          platform: 'desktop',
        });
        expect(mockExecFileAsync).not.toHaveBeenCalled();
      });
    });

    describe('findGradle', () => {
      it('should find gradle wrapper (./gradlew)', async () => {
        mockExistsSync.mockReturnValue(true);

        const result = await findGradle('/test/project');

        expect(result).toBe('./gradlew');
        expect(mockExistsSync).toHaveBeenCalledWith('/test/project/gradlew');
      });

      it('should fallback to global gradle', async () => {
        mockExistsSync.mockReturnValue(false);
        mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/gradle\n', stderr: '' });

        const result = await findGradle('/test/project');

        expect(result).toBe('gradle');
        expect(mockExecFileAsync).toHaveBeenCalledWith('which', ['gradle'], {
          timeout: 5000,
        });
      });

      it('should throw if gradle not found', async () => {
        mockExistsSync.mockReturnValue(false);
        mockExecFileAsync.mockRejectedValue(new Error('not found'));

        await expect(findGradle('/test/project')).rejects.toThrow(
          'Gradle not found. Please install gradle or run \'gradle wrapper\' to generate gradlew in /test/project'
        );
      });

      it('should check correct project path', async () => {
        mockExistsSync.mockReturnValue(true);

        await findGradle('/custom/path');

        expect(mockExistsSync).toHaveBeenCalledWith('/custom/path/gradlew');
      });
    });
  });

  describe('bootDevice', () => {
    it('should boot shutdown iOS simulator', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'shutdown',
      };

      // Mock getDeviceState call (returns shutdown initially)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Shutdown' },
              ],
            },
          }),
          stderr: '',
        })
        // Mock boot command
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await bootDevice({ device, waitForBoot: false });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC-123'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith('🔄 Booting device ABC-123...');
      expect(console.log).toHaveBeenCalledWith('✓ Boot initiated for device ABC-123');
    });

    it('should skip if already booted (NOOP)', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      // Mock getDeviceState call (returns booted)
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
              { udid: 'ABC-123', state: 'Booted' },
            ],
          },
        }),
        stderr: '',
      });

      await bootDevice({ device });

      // Only getDeviceState is called, not boot
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('ℹ️  Device ABC-123 is already booted (NOOP)');
    });

    it('should wait for boot completion when waitForBoot=true', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'shutdown',
      };

      // Mock sequence:
      // 1. getDeviceState (shutdown)
      // 2. boot command
      // 3. getDeviceState check #1 (booting)
      // 4. getDeviceState check #2 (booted)
      mockExecFileAsync
        .mockResolvedValueOnce({
          // Initial state check
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Shutdown' },
              ],
            },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // boot command
        .mockResolvedValueOnce({
          // first state check - booting
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Booting' },
              ],
            },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          // second state check - booted
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Booted' },
              ],
            },
          }),
          stderr: '',
        });

      await bootDevice({ device, waitForBoot: true, timeout: 5000 });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC-123'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith('🔄 Booting device ABC-123...');
      expect(console.log).toHaveBeenCalledWith('✓ Device ABC-123 booted successfully');
    });

    it('should not wait when waitForBoot=false', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'shutdown',
      };

      mockExecFileAsync
        .mockResolvedValueOnce({
          // getDeviceState
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Shutdown' },
              ],
            },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // boot command

      await bootDevice({ device, waitForBoot: false });

      // getDeviceState + boot command only, no state checks after
      expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith('✓ Boot initiated for device ABC-123');
    });

    it('should timeout if boot exceeds timeout value', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'shutdown',
      };

      mockExecFileAsync
        .mockResolvedValueOnce({
          // getDeviceState (initial)
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Shutdown' },
              ],
            },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // boot command
        .mockResolvedValue({
          // all subsequent calls - always return booting state
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
                { udid: 'ABC-123', state: 'Booting' },
              ],
            },
          }),
          stderr: '',
        });

      await expect(
        bootDevice({ device, waitForBoot: true, timeout: 100 })
      ).rejects.toThrow('Device ABC-123 boot timed out after 100ms');
    });

    it('should handle Android as NOOP', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'unknown',
      };

      // Mock getDeviceState for Android
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'List of devices attached\nemulator-5554    device\n',
        stderr: '',
      });

      await bootDevice({ device });

      // Only getDeviceState is called (adb devices), no boot command
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync).toHaveBeenCalledWith('adb', ['devices', '-l'], {
        timeout: 10000,
      });
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Android emulators boot automatically when accessed (NOOP)'
      );
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
      };

      await bootDevice({ device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(
          'ℹ️  Not applicable for desktop platform (NOOP)'
        );
    });
  });

  // More tests will be added in subsequent implementations
});
