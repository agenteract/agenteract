import { detectPlatform } from './platform-detector';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('platform-detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectPlatform', () => {
    it('should detect Flutter platform when pubspec.yaml exists', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('pubspec.yaml');
      });

      const result = await detectPlatform('/test/flutter-project');

      expect(result.type).toBe('flutter');
      expect(result.projectRoot).toBe('/test/flutter-project');
      expect(result.bundleIdFiles).toContain('ios/Runner.xcodeproj/project.pbxproj');
      expect(result.bundleIdFiles).toContain('android/app/build.gradle.kts');
    });

    it('should detect Expo platform when app.json with expo key exists', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('app.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ expo: { name: 'test' } }));

      const result = await detectPlatform('/test/expo-project');

      expect(result.type).toBe('expo');
      expect(result.bundleIdFiles).toContain('app.json');
    });

    it('should detect KMP Android platform', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('build.gradle.kts') ||
               path.toString().includes('composeApp/build.gradle.kts');
      });
      mockReadFileSync.mockReturnValue('kotlin("multiplatform")\nandroid()');
      mockExecSync.mockReturnValue('installDebug - Install debug build\nrunDebug - Run debug build');

      const result = await detectPlatform('/test/kmp-project');

      expect(result.type).toBe('kmp-android');
      expect(result.gradleTasks).toContain('installDebug');
      expect(result.gradleTasks).toContain('runDebug');
    });

    it('should detect KMP Desktop platform when only jvm target exists', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('build.gradle.kts') ||
               path.toString().includes('composeApp/build.gradle.kts');
      });
      mockReadFileSync.mockReturnValue('kotlin("multiplatform")\njvm()\ndesktop');
      mockExecSync.mockReturnValue('desktopRun - Run desktop app');

      const result = await detectPlatform('/test/kmp-desktop');

      expect(result.type).toBe('kmp-desktop');
      expect(result.gradleTasks).toContain('desktopRun');
    });

    it('should detect SwiftUI platform', async () => {
      mockExistsSync.mockReturnValue(false);
      mockReaddirSync.mockReturnValue(['MyApp.xcodeproj', 'Sources'] as any);

      const result = await detectPlatform('/test/swiftui-project');

      expect(result.type).toBe('swiftui');
      expect(result.bundleIdFiles[0]).toContain('MyApp.xcodeproj/project.pbxproj');
    });

    it('should detect Vite platform', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('vite.config.ts');
      });
      mockReaddirSync.mockReturnValue([] as any);

      const result = await detectPlatform('/test/vite-project');

      expect(result.type).toBe('vite');
      expect(result.buildFiles).toContain('vite.config.ts');
    });

    it('should throw error if no platform detected', async () => {
      mockExistsSync.mockReturnValue(false);
      mockReaddirSync.mockReturnValue([] as any);

      await expect(detectPlatform('/test/unknown')).rejects.toThrow(
        'Could not detect platform type'
      );
    });

    it('should handle gradle task detection errors gracefully', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('build.gradle.kts');
      });
      mockReadFileSync.mockReturnValue('kotlin("multiplatform")\nandroid()');
      mockExecSync.mockImplementation(() => {
        throw new Error('Gradle not found');
      });

      const result = await detectPlatform('/test/kmp-project');

      expect(result.type).toBe('kmp-android');
      expect(result.gradleTasks).toEqual([]);
    });

    it('should not throw if projectPath is missing', async () => {
      await expect(detectPlatform('')).rejects.toThrow(
        'Project path is required for platform detection'
      );
    });
  });
});
