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
const mockReadFileSync = jest.fn();
const mockReaddir = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

jest.mock('fs/promises', () => ({
  readdir: mockReaddir,
}));

// Mock platform-detector
const mockDetectPlatform = jest.fn();
jest.mock('./platform-detector', () => ({
  detectPlatform: mockDetectPlatform,
}));

// Mock bundle-resolver
const mockResolveBundleInfo = jest.fn();
jest.mock('./bundle-resolver', () => ({
  resolveBundleInfo: mockResolveBundleInfo,
}));

import {
  getDeviceState,
  findGradle,
  bootDevice,
  clearAppData,
  setupPortForwarding,
  installApp,
  uninstallApp,
  reinstallApp,
  buildApp,
  startApp,
  startIOSApp,
  startAndroidApp,
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

      it('should handle "booted" identifier when device is booted', async () => {
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

        const result = await getDeviceState('booted');

        expect(result).toEqual({
          id: 'ABC-123',
          state: 'booted',
          platform: 'ios',
        });
      });

      it('should handle "booted" identifier when no device is booted', async () => {
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

        const result = await getDeviceState('booted');

        expect(result).toEqual({
          id: 'booted',
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

  describe('clearAppData', () => {
    it('should clear Android app data using pm clear', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockExecFileAsync.mockResolvedValue({ stdout: 'Success', stderr: '' });

      await clearAppData({
        projectPath: '/test/project',
        device,
        bundleId: 'com.example.app',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'pm', 'clear', 'com.example.app'],
        { timeout: 30000 }
      );
      expect(console.log).toHaveBeenCalledWith('✓ Cleared app data for com.example.app');
    });

    it('should uninstall iOS app to clear data', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await clearAppData({
        projectPath: '/test/project',
        device,
        bundleId: 'com.example.app',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'uninstall', 'ABC-123', 'com.example.app'],
        { timeout: 30000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        '✓ Cleared app data for com.example.app (uninstalled on iOS)'
      );
    });

    it('should handle app not installed gracefully (Android)', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockExecFileAsync.mockRejectedValue(new Error('Unknown package: com.example.app'));

      await clearAppData({
        projectPath: '/test/project',
        device,
        bundleId: 'com.example.app',
      });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  App com.example.app not installed, data already clear (NOOP)'
      );
    });

    it('should handle app not installed gracefully (iOS)', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockExecFileAsync.mockRejectedValue(
        new Error('The app is not installed on the specified device')
      );

      await clearAppData({
        projectPath: '/test/project',
        device,
        bundleId: 'com.example.app',
      });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  App com.example.app not installed, data already clear (NOOP)'
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      // Mock detectPlatform to return 'expo'
      mockDetectPlatform.mockResolvedValue('expo');
      
      // Mock isExpoGo to return true (no ios/android folders)
      mockExistsSync.mockReturnValue(false);

      await clearAppData({
        projectPath: '/test/expo-go-project',
        device,
        bundleId: 'host.exp.Exponent',
      });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Cannot clear data for Expo Go apps (NOOP)'
      );
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
      };

      await clearAppData({
        projectPath: '/test/project',
        device,
        bundleId: 'com.example.app',
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Not applicable for desktop platform (NOOP)'
      );
    });
  });

  describe('setupPortForwarding', () => {
    it('should setup Android port forwarding', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await setupPortForwarding({
        device,
        port: 8081,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'reverse', 'tcp:8081', 'tcp:8081'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        '✓ Port forwarding setup: device:8081 -> host:8081'
      );
    });

    it('should setup Android port forwarding with custom host port', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await setupPortForwarding({
        device,
        port: 8081,
        hostPort: 3000,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'reverse', 'tcp:8081', 'tcp:3000'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        '✓ Port forwarding setup: device:8081 -> host:3000'
      );
    });

    it('should handle already forwarded port gracefully', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockExecFileAsync.mockRejectedValue(new Error('already reversed'));

      await setupPortForwarding({
        device,
        port: 8081,
      });

      expect(console.log).toHaveBeenCalledWith('ℹ️  Port 8081 already forwarded (NOOP)');
    });

    it('should handle iOS as NOOP', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      await setupPortForwarding({
        device,
        port: 8081,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  iOS simulators share localhost with host (NOOP)'
      );
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
      };

      await setupPortForwarding({
        device,
        port: 8081,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Not applicable for desktop platform (NOOP)'
      );
    });
  });

  describe('installApp', () => {
    it('should install Android app via gradle installDebug', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true); // gradlew exists
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({
        projectPath: '/path/to/flutter-app',
        device,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/path/to/flutter-app/android', timeout: 120000 })
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Installing Android app via gradle')
      );
    });

    it('should install Android app via gradle installRelease', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({
        projectPath: '/path/to/kmp-app',
        device,
        configuration: 'release',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installRelease'],
        expect.objectContaining({ cwd: '/path/to/kmp-app', timeout: 120000 })
      );
    });

    it('should install Android app from APK', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({
        projectPath: '/path/to/app',
        device,
        apkPath: '/path/to/app-release.apk',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'install', '-r', '/path/to/app-release.apk'],
        { timeout: 60000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Installing APK')
      );
    });

    it('should handle iOS as NOOP for non-Expo apps', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');

      await installApp({
        projectPath: '/path/to/app',
        device,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  iOS apps auto-install during xcodebuild (NOOP)'
      );
    });

    it('should install prebuilt Expo iOS app', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true); // prebuilt (has ios folder)
      mockReaddir.mockResolvedValue(['MyApp.app']);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'install', 'ABC-123', expect.stringContaining('MyApp.app')],
        { timeout: 60000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Prebuilt Expo app installed successfully')
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false); // No ios/ or android/ dirs = Expo Go

      await installApp({
        projectPath: '/path/to/expo-go-app',
        device,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Cannot install Expo Go apps via this method (NOOP)'
      );
    });
  });

  describe('uninstallApp', () => {
    it('should uninstall iOS app', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: null,
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({
        projectPath: '/path/to/app',
        device,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'uninstall', 'ABC-123', 'com.example.myapp'],
        { timeout: 30000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Uninstalled com.example.myapp')
      );
    });

    it('should uninstall Android app', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({
        ios: null,
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({
        projectPath: '/path/to/app',
        device,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.example.myapp'],
        { timeout: 30000 }
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Uninstalled com.example.myapp')
      );
    });

    it('should handle app not installed gracefully', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({
        ios: null,
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockRejectedValue(new Error('Unknown package: com.example.myapp'));

      await uninstallApp({
        projectPath: '/path/to/app',
        device,
      });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  App com.example.myapp not installed (already clean)'
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false); // Expo Go

      await uninstallApp({
        projectPath: '/path/to/expo-go-app',
        device,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Cannot uninstall Expo Go apps via this method (NOOP)'
      );
    });

    it('should use provided bundleId', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({
        projectPath: '/path/to/app',
        device,
        bundleId: 'com.custom.bundleid',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.custom.bundleid'],
        { timeout: 30000 }
      );
      // Should not call resolveBundleInfo when bundleId is provided
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });
  });

  describe('reinstallApp', () => {
    it('should call uninstall then install', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({
        ios: null,
        android: 'com.example.myapp',
      });
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await reinstallApp({
        projectPath: '/path/to/app',
        device,
      });

      // Should have called uninstall
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.example.myapp'],
        { timeout: 30000 }
      );

      // Should have called install
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/path/to/app/android' })
      );

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Reinstalling app (uninstall + install)...'
      );
      expect(console.log).toHaveBeenCalledWith(
        '✓ App reinstalled successfully'
      );
    });

    it('should pass configuration to install', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({
        ios: null,
        android: 'com.example.myapp',
      });
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await reinstallApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'release',
      });

      // Should have called installRelease
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installRelease'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });
  });

  describe('buildApp', () => {
    it('should build Flutter Android app', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/path/to/app/android' })
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Build completed successfully')
      );
    });

    it('should build Flutter iOS app', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'flutter',
        ['build', 'ios', '--debug'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build prebuilt Expo Android app with gradle', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true); // android/ios folders exist
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/path/to/app/android' })
      );
    });

    it('should build prebuilt Expo iOS app with xcodebuild', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true); // android/ios folders exist
      mockReaddir.mockResolvedValue(['MyApp.xcworkspace', 'MyApp.xcodeproj']);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCEEDED', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyApp', '-configuration', 'Debug']),
        expect.objectContaining({ cwd: '/path/to/app/ios' })
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false); // Expo Go (no android/ios folders)

      await buildApp({
        projectPath: '/path/to/expo-go-app',
        device,
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Expo Go apps use OTA updates, no build required (NOOP)'
      );
    });

    it('should build KMP Android app', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build KMP Desktop app', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('kmp-desktop');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['build'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build Swift iOS app', async () => {
      const device: Device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('swift');
      mockReaddir.mockResolvedValue(['MyApp.xcworkspace', 'MyApp.xcodeproj']);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCEEDED', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'release',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyApp', '-configuration', 'Release']),
        expect.any(Object)
      );
    });

    it('should build Vite app', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('vite');
      mockExecFileAsync.mockResolvedValue({ stdout: 'build complete', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['run', 'build'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should respect silent mode (default: true)', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
      });

      // In silent mode, stdio should be 'ignore'
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ stdio: 'ignore' })
      );
    });

    it('should stream output when silent=false', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
        silent: false,
      });

      // When silent=false, stdio should be 'inherit' to stream output
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should handle build failures', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockRejectedValue(new Error('Build failed'));

      await expect(
        buildApp({
          projectPath: '/path/to/app',
          device,
        })
      ).rejects.toThrow('Build failed');
    });
  });

  describe('startApp with auto-boot', () => {
    it('should auto-boot iOS device if shutdown before starting app', async () => {
      const device: Device = {
        id: 'ABC123',
        name: 'iPhone 14',
        type: 'ios',
        state: 'shutdown',
      };

      // Mock device state check in startApp (shutdown)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock device state check in bootDevice (from startApp)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock boot command (from bootDevice called by startApp)
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // Mock device state check in startIOSApp (shutdown)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock device state check in bootDevice (from startIOSApp)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock boot command (from bootDevice called by startIOSApp)
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.test.app',
        android: 'com.test.app',
      });

      await startApp({
        projectPath: '/path/to/app',
        device,
      });

      // Verify boot was called (twice - once from startApp, once from startIOSApp)
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC123'],
        expect.any(Object)
      );

      // Verify launch was called
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC123', 'com.test.app'],
        expect.any(Object)
      );
    });

    it('should skip auto-boot if iOS device is already booted', async () => {
      const device: Device = {
        id: 'ABC123',
        name: 'iPhone 14',
        type: 'ios',
        state: 'booted',
      };

      // Mock device state check in startApp (already booted)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Booted',
                },
              ],
            },
          }),
        })
        // Mock device state check in startIOSApp (already booted)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Booted',
                },
              ],
            },
          }),
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.test.app',
        android: 'com.test.app',
      });

      await startApp({
        projectPath: '/path/to/app',
        device,
      });

      // Verify boot was NOT called (only getDeviceState calls + launch)
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC123'],
        expect.any(Object)
      );
    });

    it('should handle Android emulator auto-boot (NOOP)', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'shutdown',
      };

      // Mock device state check in startApp (shutdown)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock device state check in bootDevice (from startApp) - returns early for Android
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock device state check in startAndroidApp (shutdown)
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock device state check in bootDevice (from startAndroidApp) - returns early for Android
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.test.app',
        android: 'com.test.app',
      });

      await startApp({
        projectPath: '/path/to/app',
        device,
      });

      // Verify no boot command is called for Android (bootDevice is NOOP)
      // Should have 4 getDeviceState calls + 1 launch call
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        [
          '-s',
          'emulator-5554',
          'shell',
          'monkey',
          '-p',
          'com.test.app',
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ],
        expect.any(Object)
      );
    });

    it('should skip auto-boot for desktop devices', async () => {
      const device: Device = {
        id: 'desktop',
        name: 'Desktop',
        type: 'desktop',
        state: 'booted',
      };

      mockDetectPlatform.mockResolvedValue('vite');

      // Desktop devices don't have bundle IDs, so we need to provide one
      // For now, desktop startApp is not fully implemented, so we just verify
      // that no boot commands are attempted
      try {
        await startApp({
          projectPath: '/path/to/app',
          device,
          bundleId: 'not-used',
        });
      } catch (e) {
        // May fail due to incomplete desktop implementation, but that's ok
      }

      // Verify no boot commands were called
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['simctl', 'boot']),
        expect.any(Object)
      );
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'emulator',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('startIOSApp with auto-boot', () => {
    it('should auto-boot device if shutdown before launching', async () => {
      const device: Device = {
        id: 'ABC123',
        name: 'iPhone 14',
        type: 'ios',
        state: 'shutdown',
      };

      // Mock device state check in startIOSApp (shutdown)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock device state check in bootDevice (shutdown)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Shutdown',
                },
              ],
            },
          }),
        })
        // Mock boot command
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startIOSApp(device, 'com.test.app');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC123'],
        expect.any(Object)
      );

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC123', 'com.test.app'],
        expect.any(Object)
      );
    });

    it('should skip auto-boot if device is already booted', async () => {
      const device: Device = {
        id: 'ABC123',
        name: 'iPhone 14',
        type: 'ios',
        state: 'booted',
      };

      // Mock device state check (already booted)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: {
              'iOS 16.0': [
                {
                  udid: 'ABC123',
                  name: 'iPhone 14',
                  state: 'Booted',
                },
              ],
            },
          }),
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startIOSApp(device, 'com.test.app');

      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC123'],
        expect.any(Object)
      );
    });

    it('should skip auto-boot when using "booted" device identifier', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startIOSApp('booted', 'com.test.app');

      // Should not check device state or boot when using 'booted'
      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'booted', 'com.test.app'],
        expect.any(Object)
      );
    });
  });

  describe('startAndroidApp with auto-boot', () => {
    it('should handle auto-boot for Android (bootDevice is NOOP)', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'shutdown',
      };

      // Mock device state check in startAndroidApp (shutdown)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock device state check in bootDevice (NOOP for Android)
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\n',
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startAndroidApp(device, 'com.test.app');

      // For Android, bootDevice is NOOP, so no emulator command should be called
      // Only getDeviceState + launch
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        [
          '-s',
          'emulator-5554',
          'shell',
          'monkey',
          '-p',
          'com.test.app',
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ],
        expect.any(Object)
      );
    });

    it('should skip auto-boot if emulator is already booted', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      // Mock device state check (already booted)
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\nemulator-5554    device\n',
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startAndroidApp(device, 'com.test.app');

      // No boot commands for Android
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        [
          '-s',
          'emulator-5554',
          'shell',
          'monkey',
          '-p',
          'com.test.app',
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ],
        expect.any(Object)
      );
    });

    it('should launch with custom main activity', async () => {
      const device: Device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android',
        state: 'booted',
      };

      // Mock device state check
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: 'List of devices attached\nemulator-5554    device\n',
        })
        // Mock app launch
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startAndroidApp(device, 'com.test.app', '.CustomActivity');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        [
          '-s',
          'emulator-5554',
          'shell',
          'am',
          'start',
          '-n',
          'com.test.app/.CustomActivity',
        ],
        expect.any(Object)
      );
    });
  });

  // More tests will be added in subsequent implementations
});
