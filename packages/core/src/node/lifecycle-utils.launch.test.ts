/**
 * @jest-environment node
 *
 * Tests for startIOSApp, startAndroidApp, startApp (PTY restart selectivity), and startApp launchOnly.
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
jest.mock('./device-manager.js', () => ({
  getDefaultDeviceInfo: jest.fn(),
}));

import { startApp, startIOSApp, startAndroidApp } from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils - Launch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost = jest.requireMock('axios').default.post;
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // startIOSApp / startAndroidApp
  // ---------------------------------------------------------------------------

  describe('startIOSApp', () => {
    it('should launch iOS app on booted device', async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startIOSApp('booted', 'com.test.app');

      expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'booted', 'com.test.app'],
        expect.any(Object)
      );
    });
  });

  describe('startAndroidApp', () => {
    it('should start with custom main activity', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await startAndroidApp(device, 'com.test.app', '.CustomActivity');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'com.test.app/.CustomActivity'],
        expect.any(Object)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // startApp - PTY restart selectivity
  // ---------------------------------------------------------------------------

  describe('startApp - PTY restart selectivity', () => {
    // Note: Testing positive PTY restart cases (Expo Go, Flutter, Vite) is complex
    // because startApp() uses dynamic import() for config/axios, which bypasses Jest mocks.
    // These cases are covered by E2E tests instead. Here we focus on testing that
    // PTY restart is correctly SKIPPED for Expo prebuild and native apps.

    it('should skip PTY restart for Expo prebuild apps (iOS)', async () => {
      const device: Device = { id: 'ABC123', name: 'iPhone 14', type: 'ios', state: 'booted' };

      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.test.app', android: 'com.test.app' });
      mockFindConfigRoot.mockResolvedValue('/path/to');
      mockLoadConfig.mockResolvedValue({
        projects: [{ name: 'test-app', path: '/path/to/app' }],
      });
      mockNormalizeProjectConfig.mockReturnValue({
        name: 'test-app',
        path: '/path/to/app',
        devServer: { command: 'npx expo start', port: 8081 },
      });
      mockGetAgentServerUrl.mockReturnValue('http://localhost:3000');

      await startApp({
        projectName: 'test-app',
        projectPath: '/path/to/app',
        device,
        prebuild: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npx',
        ['expo', 'run:ios', '--no-bundler'],
        expect.any(Object)
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should skip PTY restart when skipPtyRestart flag is true', async () => {
      const device: Device = { id: 'ABC123', name: 'iPhone 14', type: 'ios', state: 'booted' };

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('/.agenteract')) return false;
        return true;
      });
      mockGlob
        .mockResolvedValueOnce(['/path/to/app/MyApp.xcworkspace'])
        .mockResolvedValueOnce([]);
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'BUILD SUCCEEDED', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockDetectPlatform.mockResolvedValue('xcode');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.test.app', android: null });

      await startApp({ projectPath: '/path/to/app', device, skipPtyRestart: true });

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC123', 'com.test.app'],
        expect.any(Object)
      );
    });

    it('should skip PTY restart for native Swift apps without dev server', async () => {
      const device: Device = { id: 'ABC123', name: 'iPhone 14', type: 'ios', state: 'booted' };

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('/.agenteract')) return false;
        return true;
      });
      mockGlob
        .mockResolvedValueOnce(['/path/to/app/MyApp.xcworkspace'])
        .mockResolvedValueOnce([]);
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'BUILD SUCCEEDED', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockDetectPlatform.mockResolvedValue('xcode');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.test.app', android: null });

      await startApp({ projectPath: '/path/to/app', device });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC123', 'com.test.app'],
        expect.any(Object)
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should skip PTY restart for native Kotlin apps without dev server', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('/.agenteract')) return false;
        return true;
      });
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'BUILD SUCCESSFUL', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'BUILD SUCCESSFUL', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'BUILD SUCCESSFUL', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({ ios: null, android: 'com.test.app' });

      await startApp({ projectPath: '/path/to/app', device });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        [
          '-s', 'emulator-5554', 'shell', 'monkey',
          '-p', 'com.test.app',
          '-c', 'android.intent.category.LAUNCHER', '1',
        ],
        expect.any(Object)
      );
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // startApp - launchOnly
  // ---------------------------------------------------------------------------

  describe('startApp - launchOnly', () => {
    const iosDevice: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };
    const androidDevice: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

    it('should launch prebuilt Expo iOS app directly from app.json bundle ID without building', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
        androidMainActivity: '.MainActivity',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/expo-app',
        device: iosDevice,
        launchOnly: true,
        prebuild: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.example.myapp'],
        expect.any(Object)
      );
      // resolveBundleInfo must receive argv so resolveExpoBundleInfo uses app.json (not Expo Go bundle ID)
      expect(mockResolveBundleInfo).toHaveBeenCalledWith(
        '/path/to/expo-app',
        expect.any(String),
        undefined,
        undefined,
        expect.objectContaining({ prebuild: true })
      );
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['expo', 'run:ios']),
        expect.any(Object)
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should launch prebuilt Expo Android app directly from app.json bundle ID without building', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({
        ios: 'com.example.myapp',
        android: 'com.example.myapp',
        androidMainActivity: '.MainActivity',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/expo-app',
        device: androidDevice,
        launchOnly: true,
        prebuild: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'com.example.myapp/.MainActivity'],
        expect.any(Object)
      );
      // resolveBundleInfo must receive argv so resolveExpoBundleInfo uses app.json (not Expo Go bundle ID)
      expect(mockResolveBundleInfo).toHaveBeenCalledWith(
        '/path/to/expo-app',
        expect.any(String),
        undefined,
        undefined,
        expect.objectContaining({ prebuild: true })
      );
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['expo', 'run:android']),
        expect.any(Object)
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should use bundleId override when provided for launchOnly prebuild', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/expo-app',
        device: iosDevice,
        launchOnly: true,
        prebuild: true,
        bundleId: 'com.override.bundle',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.override.bundle'],
        expect.any(Object)
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });

    it('should throw if bundle ID cannot be resolved for launchOnly prebuild', async () => {
      mockDetectPlatform.mockResolvedValue('expo');
      mockResolveBundleInfo.mockResolvedValue({ ios: undefined, android: undefined });

      await expect(
        startApp({
          projectPath: '/path/to/expo-app',
          device: iosDevice,
          launchOnly: true,
          prebuild: true,
        })
      ).rejects.toThrow('Bundle ID not found for ios');
    });

    it('should send Expo Go keystroke for launchOnly without prebuild (iOS)', async () => {
      mockDetectPlatform.mockResolvedValue('expo');

      const mockChildProcess = { pid: 123 } as any;
      mockSpawn.mockReturnValue(mockChildProcess);

      jest.doMock('../index.js', () => ({
        detectInvoker: () => ({ pkgManager: 'npm' }),
      }));

      await startApp({
        projectPath: '/path/to/expo-app',
        device: iosDevice,
        projectName: 'my-expo-app',
        launchOnly: true,
        // no prebuild flag → Expo Go path
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['cmd', 'my-expo-app', 'i']),
        expect.any(Object)
      );
      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should send Expo Go keystroke for launchOnly without prebuild (Android)', async () => {
      mockDetectPlatform.mockResolvedValue('expo');

      const mockChildProcess = { pid: 456 } as any;
      mockSpawn.mockReturnValue(mockChildProcess);

      await startApp({
        projectPath: '/path/to/expo-app',
        device: androidDevice,
        projectName: 'my-expo-app',
        launchOnly: true,
        // no prebuild flag → Expo Go path
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['cmd', 'my-expo-app', 'a']),
        expect.any(Object)
      );
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should throw when launchOnly Expo Go is used without projectName', async () => {
      mockDetectPlatform.mockResolvedValue('expo');

      await expect(
        startApp({
          projectPath: '/path/to/expo-app',
          device: iosDevice,
          launchOnly: true,
          // no projectName, no prebuild → Expo Go requires projectName
        })
      ).rejects.toThrow('projectName is required for Expo Go launch-only');
    });

    // --- KMP Android launchOnly ---

    it('should launch KMP Android app directly via adb without building', async () => {
      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({
        android: 'io.agenteract.kmp_example',
        androidMainActivity: '.MainActivity',
      });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/kmp-app',
        device: androidDevice,
        launchOnly: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'io.agenteract.kmp_example/.MainActivity'],
        expect.any(Object)
      );
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('gradle'),
        expect.anything(),
        expect.anything()
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should use bundleId override for launchOnly KMP Android', async () => {
      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/kmp-app',
        device: androidDevice,
        launchOnly: true,
        bundleId: 'io.override.bundle',
        mainActivity: '.MainActivity',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'io.override.bundle/.MainActivity'],
        expect.any(Object)
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });

    it('should throw if bundle ID cannot be resolved for launchOnly KMP Android', async () => {
      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({ android: undefined });

      await expect(
        startApp({ projectPath: '/path/to/kmp-app', device: androidDevice, launchOnly: true })
      ).rejects.toThrow('Bundle ID not found for android');
    });

    // --- Xcode (Swift/iOS) launchOnly ---

    it('should launch Xcode iOS app directly via xcrun simctl without building', async () => {
      mockDetectPlatform.mockResolvedValue('xcode');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.swiftapp' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/swift-app',
        device: iosDevice,
        launchOnly: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.example.swiftapp'],
        expect.any(Object)
      );
      expect(mockExecFileAsync).not.toHaveBeenCalledWith(
        'xcodebuild',
        expect.anything(),
        expect.anything()
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should use bundleId override for launchOnly Xcode iOS', async () => {
      mockDetectPlatform.mockResolvedValue('xcode');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await startApp({
        projectPath: '/path/to/swift-app',
        device: iosDevice,
        launchOnly: true,
        bundleId: 'com.override.swiftapp',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.override.swiftapp'],
        expect.any(Object)
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });

    it('should throw if bundle ID cannot be resolved for launchOnly Xcode iOS', async () => {
      mockDetectPlatform.mockResolvedValue('xcode');
      mockResolveBundleInfo.mockResolvedValue({ ios: undefined });

      await expect(
        startApp({ projectPath: '/path/to/swift-app', device: iosDevice, launchOnly: true })
      ).rejects.toThrow('Bundle ID not found for ios');
    });
  });
});
