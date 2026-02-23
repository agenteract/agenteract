/**
 * @jest-environment node
 *
 * Tests for installApp, uninstallApp, reinstallApp, and buildApp.
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

import { installApp, uninstallApp, reinstallApp, buildApp } from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils - Install & Build', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('installApp', () => {
    it('should install Android app via gradle installDebug', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({ projectPath: '/path/to/flutter-app', device });

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
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({ projectPath: '/path/to/kmp-app', device, configuration: 'release' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installRelease'],
        expect.objectContaining({ cwd: '/path/to/kmp-app', timeout: 120000 })
      );
    });

    it('should install Android app from APK', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

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
        expect.objectContaining({ timeout: 60000 })
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Installing APK'));
    });

    it('should handle iOS as NOOP for non-Expo apps', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');

      await installApp({ projectPath: '/path/to/app', device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('ℹ️  iOS apps auto-install during xcodebuild (NOOP)');
    });

    it('should install prebuilt Expo iOS app', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['MyApp.app']);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await installApp({
        projectPath: '/path/to/app',
        device,
        configuration: 'debug',
        prebuild: true,
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'install', 'ABC-123', expect.stringContaining('MyApp.app')],
        expect.objectContaining({ timeout: 60000 })
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Prebuilt Expo app installed successfully')
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false);

      await installApp({ projectPath: '/path/to/expo-go-app', device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Cannot install Expo Go apps via this method (NOOP)'
      );
    });
  });

  describe('uninstallApp', () => {
    it('should uninstall iOS app', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: 'com.example.myapp', android: null });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({ projectPath: '/path/to/app', device });

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
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: null, android: 'com.example.myapp' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({ projectPath: '/path/to/app', device });

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
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: null, android: 'com.example.myapp' });
      mockExecFileAsync.mockRejectedValue(new Error('Unknown package: com.example.myapp'));

      await uninstallApp({ projectPath: '/path/to/app', device });

      expect(console.log).toHaveBeenCalledWith('ℹ️  App com.example.myapp not installed (already clean)');
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false);

      await uninstallApp({ projectPath: '/path/to/expo-go-app', device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Cannot uninstall Expo Go apps via this method (NOOP)'
      );
    });

    it('should use provided bundleId', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await uninstallApp({ projectPath: '/path/to/app', device, bundleId: 'com.custom.bundleid' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.custom.bundleid'],
        { timeout: 30000 }
      );
      expect(mockResolveBundleInfo).not.toHaveBeenCalled();
    });
  });

  describe('reinstallApp', () => {
    it('should call uninstall then install', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockResolveBundleInfo.mockResolvedValue({ ios: null, android: 'com.example.myapp' });
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await reinstallApp({ projectPath: '/path/to/app', device });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.example.myapp'],
        { timeout: 30000 }
      );
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/path/to/app/android' })
      );
      expect(console.log).toHaveBeenCalledWith('🔄 Reinstalling app (uninstall + install)...');
      expect(console.log).toHaveBeenCalledWith('✓ App reinstalled successfully');
    });

    it('should pass configuration to install', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockResolveBundleInfo.mockResolvedValue({ ios: null, android: 'com.example.myapp' });
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await reinstallApp({ projectPath: '/path/to/app', device, configuration: 'release' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installRelease'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });
  });

  describe('buildApp', () => {
    it('should build Flutter Android app', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/path/to/app/android' })
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Build completed successfully'));
    });

    it('should build Flutter iOS app', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'flutter',
        ['build', 'ios', '--debug'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build prebuilt Expo Android app with gradle', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug', prebuild: true });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npx',
        ['expo', 'run:android', '--no-bundler'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build prebuilt Expo iOS app with xcodebuild', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCEEDED', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug', prebuild: true });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npx',
        ['expo', 'run:ios', '--no-bundler'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should handle Expo Go as NOOP', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('expo');
      mockExistsSync.mockReturnValue(false);

      await buildApp({ projectPath: '/path/to/expo-go-app', device });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Expo Go apps use OTA updates, no build required (NOOP)'
      );
    });

    it('should build KMP Android app', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('kmp-android');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build KMP Desktop app', async () => {
      const device: Device = { id: 'desktop', name: 'Desktop', type: 'desktop', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('kmp-desktop');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['build'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should build Swift iOS app', async () => {
      const device: Device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('xcode');
      mockGlob
        .mockResolvedValueOnce(['/path/to/app/MyApp.xcworkspace'])
        .mockResolvedValueOnce([]);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCEEDED', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'release' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyApp', '-configuration', 'Release']),
        expect.any(Object)
      );
    });

    it('should build Vite app', async () => {
      const device: Device = { id: 'desktop', name: 'Desktop', type: 'desktop', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('vite');
      mockExecFileAsync.mockResolvedValue({ stdout: 'build complete', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['run', 'build'],
        expect.objectContaining({ cwd: '/path/to/app' })
      );
    });

    it('should stream output by default (silent defaults to false)', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should stream output when silent=false', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExistsSync.mockReturnValue(true);
      mockExecFileAsync.mockResolvedValue({ stdout: 'BUILD SUCCESSFUL', stderr: '' });

      await buildApp({ projectPath: '/path/to/app', device, configuration: 'debug', silent: false });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should handle build failures', async () => {
      const device: Device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android', state: 'booted' };

      mockDetectPlatform.mockResolvedValue('flutter');
      mockExecFileAsync.mockRejectedValue(new Error('Build failed'));

      await expect(buildApp({ projectPath: '/path/to/app', device })).rejects.toThrow('Build failed');
    });
  });
});
