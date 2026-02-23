/**
 * @jest-environment node
 *
 * Tests for getDeviceState and findGradle shared helpers.
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

import { getDeviceState, findGradle } from './lifecycle-utils';
import { Device } from './device-manager';

describe('lifecycle-utils - Shared Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getDeviceState', () => {
    it('should get iOS device state (booted)', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            { udid: 'ABC-123', name: 'iPhone 15', state: 'Booted' },
          ],
        },
      };

      mockExecFileAsync.mockResolvedValue({
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const result = await getDeviceState('ABC-123');

      expect(result).toEqual({ id: 'ABC-123', state: 'booted', platform: 'ios' });
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
            { udid: 'ABC-123', name: 'iPhone 15', state: 'Shutdown' },
          ],
        },
      };

      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(mockOutput), stderr: '' });

      const result = await getDeviceState('ABC-123');

      expect(result).toEqual({ id: 'ABC-123', state: 'shutdown', platform: 'ios' });
    });

    it('should handle "booted" identifier when device is booted', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            { udid: 'ABC-123', name: 'iPhone 15', state: 'Booted' },
          ],
        },
      };

      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(mockOutput), stderr: '' });

      const result = await getDeviceState('booted');

      expect(result).toEqual({ id: 'ABC-123', state: 'booted', platform: 'ios' });
    });

    it('should handle "booted" identifier when no device is booted', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            { udid: 'ABC-123', name: 'iPhone 15', state: 'Shutdown' },
          ],
        },
      };

      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(mockOutput), stderr: '' });

      const result = await getDeviceState('booted');

      expect(result).toEqual({ id: 'booted', state: 'shutdown', platform: 'ios' });
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

      expect(result).toEqual({ id: 'emulator-5554', state: 'booted', platform: 'android' });
      expect(mockExecFileAsync).toHaveBeenCalledWith('adb', ['devices', '-l'], { timeout: 10000 });
    });

    it('should return unknown for invalid device', async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: JSON.stringify({ devices: {} }),
        stderr: '',
      });

      const result = await getDeviceState('invalid-device');

      expect(result).toEqual({ id: 'invalid-device', state: 'unknown', platform: 'ios' });
    });

    it('should handle desktop as always booted', async () => {
      const desktopDevice: Device = { id: 'desktop', name: 'Desktop', type: 'desktop' };

      const result = await getDeviceState(desktopDevice);

      expect(result).toEqual({ id: 'desktop', state: 'booted', platform: 'desktop' });
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
      expect(mockExecFileAsync).toHaveBeenCalledWith('which', ['gradle'], { timeout: 5000 });
    });

    it('should throw if gradle not found', async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileAsync.mockRejectedValue(new Error('not found'));

      await expect(findGradle('/test/project')).rejects.toThrow(
        "Gradle not found. Please install gradle or run 'gradle wrapper' to generate gradlew in /test/project"
      );
    });

    it('should check correct project path', async () => {
      mockExistsSync.mockReturnValue(true);

      await findGradle('/custom/path');

      expect(mockExistsSync).toHaveBeenCalledWith('/custom/path/gradlew');
    });
  });
});
