import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PlatformType } from './platform-detector';

export interface BundleInfo {
  ios?: string;
  android?: string;
  androidMainActivity?: string;
}

/**
 * Extract bundle IDs for the given platform
 */
export async function resolveBundleIds(
  projectPath: string,
  platformType: PlatformType,
  overrides?: { bundleId?: { ios?: string; android?: string }; mainActivity?: string }
): Promise<BundleInfo> {
  const result: BundleInfo = {};

  switch (platformType) {
    case 'flutter':
      await resolveFlutterBundleIds(projectPath, result);
      break;
    case 'expo':
      await resolveExpoBundleIds(projectPath, result);
      break;
    case 'kmp-android':
      await resolveKmpAndroidBundleIds(projectPath, result);
      break;
    case 'kmp-desktop':
      // Desktop doesn't need bundle IDs
      break;
    case 'swiftui':
      await resolveSwiftUIBundleIds(projectPath, result);
      break;
    case 'vite':
      // Web doesn't need bundle IDs
      break;
  }

  // Apply overrides (they take precedence over detected values)
  if (overrides?.bundleId?.ios) {
    result.ios = overrides.bundleId.ios;
  }
  if (overrides?.bundleId?.android) {
    result.android = overrides.bundleId.android;
  }

  // Generate MainActivity if we have an Android bundle ID
  if (result.android && !result.androidMainActivity) {
    result.androidMainActivity = overrides?.mainActivity || `${result.android}.MainActivity`;
  }

  return result;
}

async function resolveFlutterBundleIds(projectPath: string, result: BundleInfo) {
  // Android: check both .kts and .gradle files
  const androidBuildKts = join(projectPath, 'android/app/build.gradle.kts');
  const androidBuildGradle = join(projectPath, 'android/app/build.gradle');

  if (existsSync(androidBuildKts)) {
    const content = readFileSync(androidBuildKts, 'utf-8');
    const match = content.match(/applicationId\s*=\s*"([^"]+)"/);
    if (match) {
      result.android = match[1];
    }
  } else if (existsSync(androidBuildGradle)) {
    const content = readFileSync(androidBuildGradle, 'utf-8');
    const match = content.match(/applicationId\s+["']([^"']+)["']/);
    if (match) {
      result.android = match[1];
    }
  }

  // iOS: try xcodeproj first, then fallback to xcodebuild
  const xcodeProj = join(projectPath, 'ios/Runner.xcodeproj/project.pbxproj');
  if (existsSync(xcodeProj)) {
    const content = readFileSync(xcodeProj, 'utf-8');
    const match = content.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/);
    if (match) {
      result.ios = match[1].trim();
    }
  }

  // Fallback to xcodebuild if no match
  if (!result.ios && existsSync(join(projectPath, 'ios'))) {
    try {
      const output = execSync(
        'xcodebuild -showBuildSettings | grep PRODUCT_BUNDLE_IDENTIFIER',
        {
          cwd: join(projectPath, 'ios'),
          encoding: 'utf-8',
          timeout: 10000,
        }
      );
      const match = output.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*(.+)/);
      if (match) {
        result.ios = match[1].trim();
      }
    } catch (error) {
      console.warn('Could not determine iOS bundle ID from xcodebuild:', error);
    }
  }
}

async function resolveExpoBundleIds(projectPath: string, result: BundleInfo) {
  const appJsonPath = join(projectPath, 'app.json');
  if (!existsSync(appJsonPath)) {
    return;
  }

  try {
    const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
    if (appJson.expo) {
      result.ios = appJson.expo.ios?.bundleIdentifier;
      result.android = appJson.expo.android?.package;
    }
  } catch (error) {
    console.warn('Could not parse app.json:', error);
  }
}

async function resolveKmpAndroidBundleIds(projectPath: string, result: BundleInfo) {
  const composeAppBuild = join(projectPath, 'composeApp/build.gradle.kts');
  if (existsSync(composeAppBuild)) {
    const content = readFileSync(composeAppBuild, 'utf-8');
    const match = content.match(/applicationId\s*=\s*"([^"]+)"/);
    if (match) {
      result.android = match[1];
    }
  }
}

async function resolveSwiftUIBundleIds(projectPath: string, result: BundleInfo) {
  // Find xcodeproj
  const files = readdirSync(projectPath);
  const xcodeProject = files.find((f: string) => f.endsWith('.xcodeproj'));

  if (xcodeProject) {
    const pbxprojPath = join(projectPath, xcodeProject, 'project.pbxproj');
    if (existsSync(pbxprojPath)) {
      const content = readFileSync(pbxprojPath, 'utf-8');
      const match = content.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/);
      if (match) {
        result.ios = match[1].trim();
      }
    }
  }

  // Fallback to xcodebuild
  if (!result.ios) {
    try {
      const output = execSync(
        'xcodebuild -showBuildSettings | grep PRODUCT_BUNDLE_IDENTIFIER',
        {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10000,
        }
      );
      const match = output.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*(.+)/);
      if (match) {
        result.ios = match[1].trim();
      }
    } catch (error) {
      console.warn('Could not determine bundle ID from xcodebuild:', error);
    }
  }
}
