/**
 * @jest-environment node
 *
 * Tests for stopApp.
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

// Mock axios for HTTP POST requests
let mockAxiosPost: jest.Mock;
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
const mockFindConfigRoot = jest.fn();
const mockLoadConfig = jest.fn();
const mockGetAgentServerUrl = jest.fn();
const mockNormalizeProjectConfig = jest.fn();
jest.mock('./config.js', () => ({
  findConfigRoot: mockFindConfigRoot,
  loadConfig: mockLoadConfig,
  getAgentServerUrl: mockGetAgentServerUrl,
  normalizeProjectConfig: mockNormalizeProjectConfig,
  getRuntimeConfigPath: jest.fn(() => '/mock/config.json'),
}));

// Mock device-manager
const mockGetDefaultDeviceInfo = jest.fn();
jest.mock('./device-manager.js', () => ({
  getDefaultDeviceInfo: mockGetDefaultDeviceInfo,
}));

import { stopApp } from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils - stopApp', () => {
  const iosDevice: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };
  const androidDevice: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost = jest.requireMock('axios').default.post;
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Expo Go', () => {
    it('should stop Expo Go on iOS using host.exp.Exponent bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: iosDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'host.exp.Exponent'],
        { timeout: 10000 }
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });

    it('should stop Expo Go on Android using host.exp.exponent bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: androidDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'host.exp.exponent'],
        { timeout: 10000 }
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });

    it('should not treat non-expo projects as Expo Go even without prebuild flag', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.flutter',
        android: 'com.example.flutter',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/flutter-app', device: iosDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.flutter'],
        { timeout: 10000 }
      );
    });
  });

  describe('Expo prebuild', () => {
    it('should stop prebuilt Expo iOS app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: iosDevice, prebuild: true });

      expect(mockResolveBundleInfo).toHaveBeenCalledWith(
        '/path/to/expo-app',
        'expo',
        undefined,
        undefined,
        { prebuild: true }
      );
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.myapp'],
        { timeout: 10000 }
      );
    });

    it('should stop prebuilt Expo Android app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: androidDevice, prebuild: true });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.example.myapp'],
        { timeout: 10000 }
      );
    });

    it('should throw if bundle ID cannot be resolved for prebuild app', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({ ios: undefined, android: undefined });

      await expect(
        stopApp({ projectPath: '/path/to/expo-app', device: iosDevice, prebuild: true })
      ).rejects.toThrow('Bundle ID not found for ios');
    });

    it('should NOT use Expo Go bundle ID for prebuild (regression test for the bug)', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.mycompany.myapp',
        android: 'com.mycompany.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: iosDevice, prebuild: true });

      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'host.exp.Exponent'],
        expect.anything()
      );
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.mycompany.myapp'],
        expect.anything()
      );
    });

    it('should forward prebuild to resolveBundleInfo so prebuild flag reaches bundle resolver', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: iosDevice, prebuild: true });

      expect(mockResolveBundleInfo).toHaveBeenCalledWith(
        '/path/to/expo-app',
        'expo',
        undefined,
        undefined,
        { prebuild: true }
      );
    });

    it('should not crash when stopApp is called without prebuild (regression: optional prebuild flag)', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await expect(
        stopApp({ projectPath: '/path/to/expo-app', device: iosDevice })
      ).resolves.not.toThrow();
    });
  });

  describe('native apps (Flutter, Swift, KMP)', () => {
    it('should stop Flutter iOS app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.flutter', android: 'com.example.flutter' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/flutter-app', device: iosDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.flutter'],
        { timeout: 10000 }
      );
    });

    it('should stop Flutter Android app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.flutter', android: 'com.example.flutter' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/flutter-app', device: androidDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.example.flutter'],
        { timeout: 10000 }
      );
    });

    it('should stop Swift (xcode) iOS app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('xcode');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.swiftapp', android: undefined });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/swift-app', device: iosDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.swiftapp'],
        { timeout: 10000 }
      );
    });

    it('should stop KMP Android app using resolved bundle ID', async () => {
      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({ ios: undefined, android: 'com.example.kmp' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/kmp-app', device: androidDevice });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.example.kmp'],
        { timeout: 10000 }
      );
    });
  });

  describe('bundleId override', () => {
    it('should use provided bundleId and skip resolution', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/app', device: iosDevice, bundleId: 'com.custom.override' });

      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.custom.override'],
        { timeout: 10000 }
      );
    });

    it('should use provided bundleId even for Expo Go projects', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/expo-app', device: iosDevice, bundleId: 'com.custom.override' });

      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.custom.override'],
        { timeout: 10000 }
      );
    });
  });

  describe('graceful errors', () => {
    it('should not throw when app is already stopped on iOS (no matching processes)', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.app', android: 'com.example.app' });
      mockExecFileAsync.mockRejectedValue(
        new Error('No matching processes belonging to you were found')
      );

      await expect(
        stopApp({ projectPath: '/path/to/app', device: iosDevice })
      ).resolves.not.toThrow();
    });

    it('should throw for unexpected iOS termination errors', async () => {
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.app', android: 'com.example.app' });
      mockExecFileAsync.mockRejectedValue(new Error('Device not found'));

      await expect(
        stopApp({ projectPath: '/path/to/app', device: iosDevice })
      ).rejects.toThrow('Failed to stop iOS app');
    });
  });

  describe('device fallback', () => {
    it('should fall back to desktop when no device and no projectName', async () => {
      mockDetectPlatform.mockResolvedValue('vite');
      mockFindConfigRoot.mockResolvedValue('/path/to');
      mockLoadConfig.mockResolvedValue({ projects: [] });
      mockGetAgentServerUrl.mockReturnValue('http://localhost:3000');
      mockAxiosPost.mockResolvedValue({});

      const projectConfig = { devServer: { command: 'vite', port: 3000 } };

      await stopApp({ projectPath: '/path/to/app', projectConfig: projectConfig as any });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/stop-browser',
        expect.anything(),
        expect.anything()
      );
    });

    it('should use device from getDefaultDeviceInfo when projectName is provided', async () => {
      const resolvedDevice: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockGetDefaultDeviceInfo.mockResolvedValue(resolvedDevice);
      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.app', android: 'com.example.app' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await stopApp({ projectPath: '/path/to/app', projectName: 'my-project' });

      expect(mockGetDefaultDeviceInfo).toHaveBeenCalledWith('my-project');
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.app'],
        { timeout: 10000 }
      );
    });
  });

  describe('web apps', () => {
    it('should call /stop-browser via axios for vite apps', async () => {
      mockDetectPlatform.mockResolvedValue('vite');
      mockFindConfigRoot.mockResolvedValue('/path/to');
      mockLoadConfig.mockResolvedValue({ projects: [] });
      mockGetAgentServerUrl.mockReturnValue('http://localhost:3000');
      mockAxiosPost.mockResolvedValue({});

      const projectConfig = { devServer: { command: 'vite', port: 3000 } };

      await stopApp({
        projectPath: '/path/to/web-app',
        device: { id: 'desktop', type: 'desktop', name: 'Desktop', state: 'booted' },
        projectConfig: projectConfig as any,
        projectName: 'my-web-app',
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/stop-browser',
        { projectName: 'my-web-app' },
        { timeout: 5000 }
      );
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should handle server not running gracefully (ECONNREFUSED)', async () => {
      mockDetectPlatform.mockResolvedValue('vite');
      mockFindConfigRoot.mockResolvedValue('/path/to');
      mockLoadConfig.mockResolvedValue({ projects: [] });
      mockGetAgentServerUrl.mockReturnValue('http://localhost:3000');
      const connError: any = new Error('Connection refused');
      connError.code = 'ECONNREFUSED';
      mockAxiosPost.mockRejectedValue(connError);

      const projectConfig = { devServer: { command: 'vite', port: 3000 } };

      await expect(
        stopApp({
          projectPath: '/path/to/web-app',
          device: { id: 'desktop', type: 'desktop', name: 'Desktop', state: 'booted' },
          projectConfig: projectConfig as any,
        })
      ).resolves.not.toThrow();

      expect(console.log).toHaveBeenCalledWith(
        'Agenteract server not running (browser may already be closed)'
      );
    });
  });
});
