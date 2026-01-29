import { resolveBundleIds } from './bundle-resolver';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('bundle-resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveBundleIds', () => {
    it('should resolve Flutter bundle IDs from gradle.kts', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        return pathStr.includes('build.gradle.kts') || pathStr.includes('project.pbxproj');
      });
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().includes('android')) {
          return 'applicationId = "com.example.flutter"';
        }
        if (path.toString().includes('project.pbxproj')) {
          return 'PRODUCT_BUNDLE_IDENTIFIER = com.example.flutter.ios;';
        }
        return '';
      });

      const result = await resolveBundleIds('/test/flutter-app', 'flutter');

      expect(result.android).toBe('com.example.flutter');
      expect(result.ios).toBe('com.example.flutter.ios');
      expect(result.androidMainActivity).toBe('com.example.flutter.MainActivity');
    });

    it('should resolve Flutter bundle IDs from build.gradle (groovy)', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('build.gradle') && !path.toString().includes('.kts');
      });
      mockReadFileSync.mockImplementation((path: any) => {
        if (path.toString().includes('android')) {
          return 'applicationId "com.example.flutter"';
        }
        return '';
      });

      const result = await resolveBundleIds('/test/flutter-app', 'flutter');

      expect(result.android).toBe('com.example.flutter');
    });

    it('should fallback to xcodebuild for iOS bundle ID', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        return path.toString().includes('ios');
      });
      mockReadFileSync.mockReturnValue('// no bundle ID here');
      mockExecSync.mockReturnValue('    PRODUCT_BUNDLE_IDENTIFIER = com.fallback.ios\n');

      const result = await resolveBundleIds('/test/flutter-app', 'flutter');

      expect(result.ios).toBe('com.fallback.ios');
    });

    it('should resolve Expo bundle IDs from app.json', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          expo: {
            ios: { bundleIdentifier: 'com.example.expo.ios' },
            android: { package: 'com.example.expo' },
          },
        })
      );

      const result = await resolveBundleIds('/test/expo-app', 'expo');

      expect(result.ios).toBe('com.example.expo.ios');
      expect(result.android).toBe('com.example.expo');
      expect(result.androidMainActivity).toBe('com.example.expo.MainActivity');
    });

    it('should resolve KMP Android bundle ID', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('applicationId = "io.agenteract.kmp"');

      const result = await resolveBundleIds('/test/kmp-app', 'kmp-android');

      expect(result.android).toBe('io.agenteract.kmp');
      expect(result.androidMainActivity).toBe('io.agenteract.kmp.MainActivity');
    });

    it('should return empty for KMP Desktop (no bundle ID needed)', async () => {
      const result = await resolveBundleIds('/test/kmp-app', 'kmp-desktop');

      expect(result).toEqual({ androidMainActivity: undefined });
    });

    it('should return empty for Vite (web app)', async () => {
      const result = await resolveBundleIds('/test/vite-app', 'vite');

      expect(result).toEqual({ androidMainActivity: undefined });
    });

    it('should apply bundle ID overrides from config', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('applicationId = "com.example.old"');

      const result = await resolveBundleIds('/test/flutter-app', 'flutter', {
        bundleId: {
          ios: 'com.override.ios',
          android: 'com.override.android',
        },
      });

      expect(result.ios).toBe('com.override.ios');
      expect(result.android).toBe('com.override.android');
    });

    it('should apply mainActivity override from config', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('applicationId = "com.example.app"');

      const result = await resolveBundleIds('/test/flutter-app', 'flutter', {
        mainActivity: 'com.custom.CustomActivity',
      });

      expect(result.androidMainActivity).toBe('com.custom.CustomActivity');
    });

    it('should handle missing app.json gracefully', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await resolveBundleIds('/test/expo-app', 'expo');

      expect(result).toEqual({ androidMainActivity: undefined });
    });

    it('should handle malformed JSON gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      const result = await resolveBundleIds('/test/expo-app', 'expo');

      expect(result).toEqual({ androidMainActivity: undefined });
    });

    it('should handle xcodebuild command failure', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('// no bundle ID');
      mockExecSync.mockImplementation(() => {
        throw new Error('xcodebuild not found');
      });

      const result = await resolveBundleIds('/test/flutter-app', 'flutter');

      expect(result.ios).toBeUndefined();
    });
  });
});
