/**
 * @jest-environment node
 *
 * Tests for bootDevice, clearAppData, and setupPortForwarding.
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

// Mock axios
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

// Mock glob (used by buildSwiftApp)
const mockGlob = jest.fn();
jest.mock('glob', () => ({
  glob: mockGlob,
}));

// Mock config module
jest.mock('./config.js', () => ({
  findConfigRoot: jest.fn(),
  loadConfig: jest.fn(),
  getAgentServerUrl: jest.fn(),
  normalizeProjectConfig: jest.fn(),
  getRuntimeConfigPath: jest.fn(() => '/mock/config.json'),
}));

// Mock device-manager
jest.mock('./device-manager.js', () => ({
  getDefaultDeviceInfo: jest.fn(),
}));

import { bootDevice, clearAppData, setupPortForwarding } from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils - Device Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('bootDevice', () => {
    it('should boot shutdown iOS simulator', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'shutdown' };

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
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

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

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('ℹ️  Device ABC-123 is already booted (NOOP)');
    });

    it('should wait for boot completion when waitForBoot=true', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'shutdown' };

      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Shutdown' }] },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // boot command
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Booting' }] },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Booted' }] },
          }),
          stderr: '',
        });

      await bootDevice({ device, waitForBoot: true, timeout: 5000 });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC-123'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith('✓ Device ABC-123 booted successfully');
    });

    it('should not wait when waitForBoot=false', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'shutdown' };

      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Shutdown' }] },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await bootDevice({ device, waitForBoot: false });

      expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith('✓ Boot initiated for device ABC-123');
    });

    it('should timeout if boot exceeds timeout value', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'shutdown' };

      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Shutdown' }] },
          }),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValue({
          stdout: JSON.stringify({
            devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [{ udid: 'ABC-123', state: 'Booting' }] },
          }),
          stderr: '',
        });

      await expect(
        bootDevice({ device, waitForBoot: true, timeout: 100 })
      ).rejects.toThrow('Device ABC-123 boot timed out after 100ms');
    });

    it('should handle Android as NOOP', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'unknown' };

      mockExecFileAsync.mockResolvedValueOnce({
        stdout: 'List of devices attached\nemulator-5554    device\n',
        stderr: '',
      });

      await bootDevice({ device });

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync).toHaveBeenCalledWith('adb', ['devices', '-l'], { timeout: 10000 });
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Android emulators boot automatically when accessed (NOOP)'
      );
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = { id: 'desktop', name: 'Desktop', type: 'desktop' };

      await bootDevice({ device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('ℹ️  Not applicable for desktop platform (NOOP)');
    });
  });

  describe('clearAppData', () => {
    it('should clear Android app data using pm clear', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockResolvedValue({ stdout: 'Success', stderr: '' });

      await clearAppData({ projectPath: '/test/project', device, bundleId: 'com.example.app' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'pm', 'clear', 'com.example.app'],
        { timeout: 30000 }
      );
      expect(console.log).toHaveBeenCalledWith('✓ Cleared app data for com.example.app');
    });

    it('should uninstall iOS app to clear data', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await clearAppData({ projectPath: '/test/project', device, bundleId: 'com.example.app' });

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
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockRejectedValue(new Error('Unknown package: com.example.app'));

      await clearAppData({ projectPath: '/test/project', device, bundleId: 'com.example.app' });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  App com.example.app not installed, data already clear (NOOP)'
      );
    });

    it('should handle app not installed gracefully (iOS)', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockExecFileAsync.mockRejectedValue(
        new Error('The app is not installed on the specified device')
      );

      await clearAppData({ projectPath: '/test/project', device, bundleId: 'com.example.app' });

      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  App com.example.app not installed, data already clear (NOOP)'
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false);

      await clearAppData({
        projectPath: '/test/expo-go-project',
        device,
        bundleId: 'host.exp.Exponent',
      });

      expect(console.log).toHaveBeenCalledWith('ℹ️  Cannot clear data for Expo Go apps (NOOP)');
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = { id: 'desktop', name: 'Desktop', type: 'desktop' };

      await clearAppData({ projectPath: '/test/project', device, bundleId: 'com.example.app' });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('ℹ️  Not applicable for desktop platform (NOOP)');
    });
  });

  describe('setupPortForwarding', () => {
    it('should setup Android port forwarding', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await setupPortForwarding({ device, port: 8081 });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'reverse', 'tcp:8081', 'tcp:8081'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith('✓ Port forwarding setup: device:8081 -> host:8081');
    });

    it('should setup Android port forwarding with custom host port', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await setupPortForwarding({ device, port: 8081, hostPort: 3000 });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'reverse', 'tcp:8081', 'tcp:3000'],
        { timeout: 10000 }
      );
      expect(console.log).toHaveBeenCalledWith('✓ Port forwarding setup: device:8081 -> host:3000');
    });

    it('should handle already forwarded port gracefully', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockRejectedValue(new Error('already reversed'));

      await setupPortForwarding({ device, port: 8081 });

      expect(console.log).toHaveBeenCalledWith('ℹ️  Port 8081 already forwarded (NOOP)');
    });

    it('should handle iOS as NOOP', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      await setupPortForwarding({ device, port: 8081 });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('ℹ️  iOS simulators share localhost with host (NOOP)');
    });

    it('should handle desktop as NOOP', async () => {
      const device: Device = { id: 'desktop', name: 'Desktop', type: 'desktop' };

      await setupPortForwarding({ device, port: 8081 });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('ℹ️  Not applicable for desktop platform (NOOP)');
    });
  });
});
