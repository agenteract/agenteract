import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { PlatformType } from './platform-detector.js';
import type { ProjectConfig } from '../config-types.js';

export interface BundleInfo {
  ios?: string;                // iOS bundle ID (e.g., 'com.example.app')
  android?: string;            // Android package name (e.g., 'com.example.app')
  androidMainActivity?: string; // Main activity class name (default: 'MainActivity')
}

/**
 * Resolve bundle information for a project
 * Priority: explicit config > platform files
 */
export async function resolveBundleInfo(
  projectPath: string,
  platform: PlatformType,
  lifecycleConfig?: ProjectConfig['lifecycle']
): Promise<BundleInfo> {
  const bundleInfo: BundleInfo = {};
  
  // Use explicit config if provided
  if (lifecycleConfig?.bundleId?.ios) {
    bundleInfo.ios = lifecycleConfig.bundleId.ios;
  }
  if (lifecycleConfig?.bundleId?.android) {
    bundleInfo.android = lifecycleConfig.bundleId.android;
  }
  if (lifecycleConfig?.mainActivity) {
    bundleInfo.androidMainActivity = lifecycleConfig.mainActivity;
  }
  
  // If we have all the info from config, return early
  const needsIos = !bundleInfo.ios && (platform === 'flutter' || platform === 'expo' || platform === 'swift');
  const needsAndroid = !bundleInfo.android && (platform === 'flutter' || platform === 'expo' || platform === 'kmp-android');
  
  if (!needsIos && !needsAndroid) {
    return bundleInfo;
  }
  
  // Resolve from platform files
  switch (platform) {
    case 'flutter':
      return resolveFlutterBundleInfo(projectPath, bundleInfo);
    case 'expo':
      return resolveExpoBundleInfo(projectPath, bundleInfo);
    case 'kmp-android':
      return resolveKMPBundleInfo(projectPath, bundleInfo);
    case 'swift':
      return resolveSwiftBundleInfo(projectPath, bundleInfo);
    default:
      return bundleInfo;
  }
}

/**
 * Resolve Flutter bundle info from pubspec.yaml and gradle/xcode files
 */
async function resolveFlutterBundleInfo(projectPath: string, bundleInfo: BundleInfo): Promise<BundleInfo> {
  const result = { ...bundleInfo };
  
  // Android: Read from android/app/build.gradle
  if (!result.android) {
    const buildGradlePath = path.join(projectPath, 'android', 'app', 'build.gradle');
    if (existsSync(buildGradlePath)) {
      try {
        const content = await readFile(buildGradlePath, 'utf8');
        
        // Look for applicationId
        const match = content.match(/applicationId\s+["']([^"']+)["']/);
        if (match) {
          result.android = match[1];
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
  
  // iOS: Read from ios/Runner/Info.plist or ios/Runner.xcodeproj
  if (!result.ios) {
    const infoPlistPath = path.join(projectPath, 'ios', 'Runner', 'Info.plist');
    if (existsSync(infoPlistPath)) {
      try {
        const content = await readFile(infoPlistPath, 'utf8');
        
        // Look for CFBundleIdentifier
        const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
        if (match) {
          result.ios = match[1].replace('$(PRODUCT_BUNDLE_IDENTIFIER)', '').trim();
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
  
  // Default main activity
  if (!result.androidMainActivity) {
    result.androidMainActivity = 'MainActivity';
  }
  
  return result;
}

/**
 * Resolve Expo bundle info from app.json
 */
async function resolveExpoBundleInfo(projectPath: string, bundleInfo: BundleInfo): Promise<BundleInfo> {
  const result = { ...bundleInfo };
  
  const appJsonPath = path.join(projectPath, 'app.json');
  if (!existsSync(appJsonPath)) {
    return result;
  }
  
  try {
    const appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));
    const expo = appJson.expo || {};
    
    if (!result.ios && expo.ios?.bundleIdentifier) {
      result.ios = expo.ios.bundleIdentifier;
    }
    
    if (!result.android && expo.android?.package) {
      result.android = expo.android.package;
    }
    
    // Default main activity for Expo
    if (!result.androidMainActivity) {
      result.androidMainActivity = 'MainActivity';
    }
  } catch (error) {
    // Ignore parse errors
  }
  
  return result;
}

/**
 * Resolve KMP bundle info from build.gradle.kts or gradle.properties
 */
async function resolveKMPBundleInfo(projectPath: string, bundleInfo: BundleInfo): Promise<BundleInfo> {
  const result = { ...bundleInfo };
  
  // Try build.gradle.kts
  const buildGradleKts = path.join(projectPath, 'build.gradle.kts');
  const buildGradle = path.join(projectPath, 'build.gradle');
  
  const gradleFile = existsSync(buildGradleKts) ? buildGradleKts : 
                     existsSync(buildGradle) ? buildGradle : null;
  
  if (gradleFile && !result.android) {
    try {
      const content = await readFile(gradleFile, 'utf8');
      
      // Look for applicationId in Kotlin or Groovy syntax
      const kotlinMatch = content.match(/applicationId\s*=\s*"([^"]+)"/);
      const groovyMatch = content.match(/applicationId\s+["']([^"']+)["']/);
      const match = kotlinMatch || groovyMatch;
      
      if (match) {
        result.android = match[1];
      }
    } catch (error) {
      // Ignore read errors
    }
  }
  
  // Try gradle.properties
  if (!result.android) {
    const gradlePropsPath = path.join(projectPath, 'gradle.properties');
    if (existsSync(gradlePropsPath)) {
      try {
        const content = await readFile(gradlePropsPath, 'utf8');
        const match = content.match(/^android\.applicationId\s*=\s*(.+)$/m);
        if (match) {
          result.android = match[1].trim();
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
  
  // Default main activity
  if (!result.androidMainActivity) {
    result.androidMainActivity = 'MainActivity';
  }
  
  return result;
}

/**
 * Resolve Swift bundle info from Info.plist or Package.swift
 */
async function resolveSwiftBundleInfo(projectPath: string, bundleInfo: BundleInfo): Promise<BundleInfo> {
  const result = { ...bundleInfo };
  
  if (result.ios) {
    return result; // Already have iOS bundle ID from config
  }
  
  // Look for Info.plist in common locations
  const infoPlistLocations = [
    path.join(projectPath, 'Info.plist'),
    path.join(projectPath, 'Resources', 'Info.plist'),
    path.join(projectPath, 'Supporting Files', 'Info.plist'),
  ];
  
  for (const plistPath of infoPlistLocations) {
    if (existsSync(plistPath)) {
      try {
        const content = await readFile(plistPath, 'utf8');
        
        // Look for CFBundleIdentifier
        const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
        if (match) {
          result.ios = match[1].replace('$(PRODUCT_BUNDLE_IDENTIFIER)', '').trim();
          break;
        }
      } catch (error) {
        // Ignore read errors
      }
    }
  }
  
  return result;
}
