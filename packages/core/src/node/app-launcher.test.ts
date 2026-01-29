const mockExecFileAsync = jest.fn();
const mockSpawn = jest.fn();

// Mock modules before imports
jest.mock('child_process', () => ({
  execFile: jest.fn(),
  spawn: mockSpawn,
}));

jest.mock('util', () => ({
  promisify: jest.fn(() => mockExecFileAsync),
}));

// Use manual mock for puppeteer (in __mocks__/puppeteer.js)
jest.mock('puppeteer');

import {
  launchApp,
  stopApp,
  buildApp,
  performSetup,
} from './app-launcher';

describe('app-launcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('launchApp', () => {
    it('should launch Vite web app with Puppeteer', async () => {
      const puppeteer = require('puppeteer');
      const mockLaunch = puppeteer.default.launch as jest.Mock;
      const result = await launchApp('vite', null, {}, '/test/vite-app');

      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          args: expect.arrayContaining(['--no-sandbox']),
        })
      );
      expect(result.browser).toBeDefined();
    });

    it('should launch iOS app on simulator', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios' as const,
        state: 'booted' as const,
      };
      const bundleInfo = { ios: 'com.example.app' };

      const result = await launchApp('flutter', device, bundleInfo, '/test/flutter-app');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.example.app'],
        expect.any(Object)
      );
      expect(result).toEqual({});
    });

    it('should boot iOS simulator if not booted', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = {
        id: 'ABC-123',
        name: 'iPhone 15',
        type: 'ios' as const,
        state: 'shutdown' as const,
      };
      const bundleInfo = { ios: 'com.example.app' };

      await launchApp('flutter', device, bundleInfo, '/test/flutter-app');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'boot', 'ABC-123']
      );
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'ABC-123', 'com.example.app'],
        expect.objectContaining({ timeout: 60000 })
      );
    }, 10000);

    it('should launch Android app with port forwarding', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android' as const,
        state: 'booted' as const,
      };
      const bundleInfo = {
        android: 'com.example.app',
        androidMainActivity: 'MainActivity',
      };

      await launchApp('flutter', device, bundleInfo, '/test/flutter-app');

      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        1,
        'adb',
        ['-s', 'emulator-5554', 'reverse', 'tcp:8765', 'tcp:8765']
      );
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        2,
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'start', '-n', 'com.example.app/.MainActivity', '-W'],
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should handle port forwarding failure gracefully', async () => {
      mockExecFileAsync
        .mockRejectedValueOnce(new Error('Port forwarding failed'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' } as any);

      const device = {
        id: 'emulator-5554',
        name: 'Pixel 5',
        type: 'android' as const,
        state: 'booted' as const,
      };
      const bundleInfo = {
        android: 'com.example.app',
        androidMainActivity: 'MainActivity',
      };

      await launchApp('flutter', device, bundleInfo, '/test/flutter-app');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['shell', 'am', 'start']),
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should launch KMP desktop app via gradle', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'run - Run app\nrunDebug - Run debug', stderr: '' } as any);
      mockSpawn.mockReturnValue({
        on: jest.fn(),
        kill: jest.fn(),
      } as any);

      const result = await launchApp('kmp-desktop', null, {}, '/test/kmp-app');

      expect(mockSpawn).toHaveBeenCalledWith(
        './gradlew',
        ['run', '--quiet'],
        expect.objectContaining({ cwd: '/test/kmp-app' })
      );
      expect(result.process).toBeDefined();
    });

    it('should use default run task if gradle task detection fails', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('Gradle failed'));
      mockSpawn.mockReturnValue({
        on: jest.fn(),
        kill: jest.fn(),
      } as any);

      await launchApp('kmp-desktop', null, {}, '/test/kmp-app');

      expect(mockSpawn).toHaveBeenCalledWith(
        './gradlew',
        ['run', '--quiet'],
        expect.any(Object)
      );
    });

    it('should throw error if no device available for mobile platform', async () => {
      await expect(
        launchApp('flutter', null, {}, '/test/flutter-app')
      ).rejects.toThrow('No device available');
    });

    it('should throw error for unsupported platform', async () => {
      await expect(
        launchApp('unsupported' as any, null, {}, '/test/app')
      ).rejects.toThrow('Unsupported platform');
    });
  });

  describe('stopApp', () => {
    it('should close Puppeteer browser for Vite', async () => {
      const puppeteer = require('puppeteer');
      const mockLaunch = puppeteer.default.launch as jest.Mock;
      const mockBrowser = await mockLaunch();
      const launchResult = { browser: mockBrowser };

      await stopApp('vite', null, {}, launchResult, false);

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should terminate iOS app gracefully', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios' as const };
      const bundleInfo = { ios: 'com.example.app' };

      await stopApp('flutter', device, bundleInfo, {}, false);

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'terminate', 'ABC-123', 'com.example.app']
      );
    });

    it('should stop Android app gracefully', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };
      const bundleInfo = { android: 'com.example.app' };

      await stopApp('kmp-android', device, bundleInfo, {}, false);

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'stop', 'com.example.app']
      );
    });

    it('should force stop Android app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };
      const bundleInfo = { android: 'com.example.app' };

      await stopApp('kmp-android', device, bundleInfo, {}, true);

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.example.app']
      );
    });

    it('should kill desktop app process', async () => {
      const mockProcess = { kill: jest.fn() };
      const launchResult = { process: mockProcess as any };

      await stopApp('kmp-desktop', null, {}, launchResult, false);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should force kill desktop app process', async () => {
      const mockProcess = { kill: jest.fn() };
      const launchResult = { process: mockProcess as any };

      await stopApp('kmp-desktop', null, {}, launchResult, true);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should handle stop errors gracefully', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('Stop failed'));

      const device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios' as const };
      const bundleInfo = { ios: 'com.example.app' };

      await expect(
        stopApp('flutter', device, bundleInfo, {}, false)
      ).resolves.not.toThrow();
    });
  });

  describe('buildApp', () => {
    it('should build Flutter Android app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await buildApp('/test/flutter-app', 'flutter', {
        configuration: 'debug',
        platform: 'android',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleDebug'],
        expect.objectContaining({ cwd: '/test/flutter-app/android' })
      );
    });

    it('should build Flutter iOS app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await buildApp('/test/flutter-app', 'flutter', {
        configuration: 'release',
        platform: 'ios',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'flutter',
        ['build', 'ios', '--release'],
        expect.objectContaining({ cwd: '/test/flutter-app' })
      );
    });

    it('should build KMP Android app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await buildApp('/test/kmp-app', 'kmp-android', {
        configuration: 'release',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['assembleRelease'],
        expect.objectContaining({ cwd: '/test/kmp-app' })
      );
    });

    it('should run custom build task for KMP', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await buildApp('/test/kmp-app', 'kmp-desktop', {
        configuration: 'customBuildTask',
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['customBuildTask'],
        expect.any(Object)
      );
    });

    it('should build Vite app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await buildApp('/test/vite-app', 'vite', { configuration: 'debug' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npm',
        ['run', 'build'],
        expect.objectContaining({ cwd: '/test/vite-app' })
      );
    });

    it('should throw error for unsupported Expo builds', async () => {
      await expect(
        buildApp('/test/expo-app', 'expo', { configuration: 'debug' })
      ).rejects.toThrow('Expo builds not yet supported');
    });
  });

  describe('performSetup', () => {
    it('should install Android app via gradle', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };

      await performSetup('/test/flutter-app', 'flutter', device, {}, { action: 'install' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/test/flutter-app/android' })
      );
    });

    it('should install KMP Android app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };

      await performSetup('/test/kmp-app', 'kmp-android', device, {}, { action: 'install' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/test/kmp-app' })
      );
    });

    it('should skip install for iOS (handled by dev build)', async () => {
      const device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios' as const };

      await expect(
        performSetup('/test/flutter-app', 'flutter', device, {}, { action: 'install' })
      ).resolves.not.toThrow();
    });

    it('should reinstall Android app', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };
      const bundleInfo = { android: 'com.example.app' };

      await performSetup('/test/flutter-app', 'flutter', device, bundleInfo, { action: 'reinstall' });

      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        1,
        'adb',
        ['-s', 'emulator-5554', 'uninstall', 'com.example.app']
      );
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        2,
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/test/flutter-app/android' })
      );
    });

    it('should clear Android app data', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };
      const bundleInfo = { android: 'com.example.app' };

      await performSetup('/test/flutter-app', 'flutter', device, bundleInfo, { action: 'clearData' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'pm', 'clear', 'com.example.app']
      );
    });

    it('should clear iOS app data by uninstalling', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios' as const };
      const bundleInfo = { ios: 'com.example.app' };

      await performSetup('/test/flutter-app', 'flutter', device, bundleInfo, { action: 'clearData' });

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'uninstall', 'ABC-123', 'com.example.app']
      );
    });

    it('should skip setup if platform filter does not match', async () => {
      const device = { id: 'ABC-123', name: 'iPhone 15', type: 'ios' as const };

      await performSetup('/test/flutter-app', 'flutter', device, {}, {
        action: 'install',
        platform: 'android',
      });

      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should handle uninstall errors gracefully (app not installed)', async () => {
      mockExecFileAsync
        .mockRejectedValueOnce(new Error('App not installed'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' } as any);

      const device = { id: 'emulator-5554', name: 'Pixel 5', type: 'android' as const };
      const bundleInfo = { android: 'com.example.app' };

      await expect(
        performSetup('/test/flutter-app', 'flutter', device, bundleInfo, { action: 'reinstall' })
      ).resolves.not.toThrow();

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        './gradlew',
        ['installDebug'],
        expect.objectContaining({ cwd: '/test/flutter-app/android' })
      );
    });
  });
});
