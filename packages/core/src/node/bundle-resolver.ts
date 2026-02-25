import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { ProjectType } from './platform-detector.js';
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
  projectType: ProjectType,
  lifecycleConfig?: ProjectConfig['lifecycle'],
  scheme?: string,
  options?: { prebuild?: boolean }
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
  const needsIos = !bundleInfo.ios && (projectType === 'flutter' || projectType === 'expo' || projectType === 'xcode');
  const needsAndroid = !bundleInfo.android && (projectType === 'flutter' || projectType === 'expo' || projectType === 'kmp-android');
  
  if (!needsIos && !needsAndroid) {
    return bundleInfo;
  }
  
  // Resolve from platform files
  switch (projectType) {
    case 'flutter':
      return resolveFlutterBundleInfo(projectPath, bundleInfo);
    case 'expo':
      return resolveExpoBundleInfo(projectPath, bundleInfo, options);
    case 'kmp-android':
      return resolveKMPBundleInfo(projectPath, bundleInfo);
    case 'xcode':
      return resolveSwiftBundleInfo(projectPath, bundleInfo, scheme);
    default:
      return bundleInfo;
  }
}

/**
 * Resolve Flutter bundle info from Android Gradle and iOS Xcode project files
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
        console.error(`Failed to resolve Android bundle ID from ${buildGradlePath}: ${error}`);
      }
    }
  }

  // iOS: Read bundle identifier from Xcode project (Runner.xcodeproj/project.pbxproj)
  if (!result.ios) {
    const pbxprojPath = path.join(projectPath, 'ios', 'Runner.xcodeproj', 'project.pbxproj');
    if (existsSync(pbxprojPath)) {
      try {
        const content = await readFile(pbxprojPath, 'utf8');

        // Look for PRODUCT_BUNDLE_IDENTIFIER = com.example.app;
        const match = content.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/);
        if (match) {
          const raw = match[1].trim();
          // Strip any surrounding quotes
          result.ios = raw.replace(/^"|"$/g, '').trim();
        }
      } catch (error) {
        console.error(`Failed to resolve iOS bundle ID from Xcode project: ${error}`);
      }
    }
  }

  // Fallback iOS: Read from ios/Runner/Info.plist when it contains a literal identifier
  if (!result.ios) {
    const infoPlistPath = path.join(projectPath, 'ios', 'Runner', 'Info.plist');
    if (existsSync(infoPlistPath)) {
      try {
        const content = await readFile(infoPlistPath, 'utf8');
        
        // Look for CFBundleIdentifier
        const match = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
        if (match) {
          const raw = match[1].trim();
          // If the value is a literal bundle id, use it as-is; otherwise leave undefined
          if (!/\$\(.*\)/.test(raw)) {
            result.ios = raw;
          }
        }
      } catch (error) {
        console.error(`Failed to resolve iOS bundle ID from Info.plist: ${error}`);
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
async function resolveExpoBundleInfo(projectPath: string, bundleInfo: BundleInfo, options?: { prebuild?: boolean }): Promise<BundleInfo> {
  const result = { ...bundleInfo };

  const prebuild = options?.prebuild || false;

  // If using Expo Go (no ios/android dirs), set Expo Go bundle IDs
  if (!prebuild) {
    result.ios = 'host.exp.Exponent';
    result.android = 'host.exp.exponent';
  }
  
  const appJsonPath = path.join(projectPath, 'app.json');
  if (!existsSync(appJsonPath)) {
    return result;
  }
  
  const appJsonContent = await readFile(appJsonPath, 'utf8');
  const appJson = JSON.parse(appJsonContent);
  const expo = appJson.expo || {};
  
  if (!result.ios && expo.ios?.bundleIdentifier) {
    result.ios = expo.ios.bundleIdentifier;
  }
  
  if (!result.android && expo.android?.package) {
    result.android = expo.android.package;
  }
  
  // Default main activity for Expo (relative to package)
  if (!result.androidMainActivity) {
    result.androidMainActivity = '.MainActivity';
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
      console.error(`Failed to resolve Android bundle ID from ${gradleFile}: ${error}`);
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
        console.error(`Failed to resolve Android bundle ID from ${gradlePropsPath}: ${error}`);
      }
    }
  }
  
  // Default main activity (with dot prefix for relative class name)
  if (!result.androidMainActivity) {
    result.androidMainActivity = '.MainActivity';
  }
  
  return result;
}

/**
 * Resolve Swift bundle info from Info.plist or Xcode project
 * 
 * Strategy:
 * 1. If scheme is provided, search for Info.plist containing that URL scheme
 * 2. Look in the same directory for the Xcode project to get PRODUCT_BUNDLE_IDENTIFIER
 * 3. Fallback to common Info.plist locations
 */
async function resolveSwiftBundleInfo(projectPath: string, bundleInfo: BundleInfo, scheme?: string): Promise<BundleInfo> {
  const result = { ...bundleInfo };
  
  if (result.ios) {
    console.log(`[bundle-resolver] iOS bundle ID already provided: ${result.ios}`);
    return result; // Already have iOS bundle ID from config
  }
  
  // Strategy 1: If scheme is provided, find Info.plist containing that scheme
  if (scheme) {
    console.log(`[bundle-resolver] Searching for Info.plist with URL scheme: ${scheme}`);
    try {
      const { glob } = await import('glob');
      const infoPlistFiles = await glob('**/Info.plist', { 
        cwd: projectPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/build/**', '**/DerivedData/**', '**/.build/**']
      });
      
      for (const plistPath of infoPlistFiles) {
        try {
          const content = await readFile(plistPath, 'utf8');
          
          // Check if this Info.plist contains the matching URL scheme
          if (content.includes(`<string>${scheme}</string>`)) {
            console.log(`[bundle-resolver] ✓ Found Info.plist with scheme "${scheme}": ${plistPath}`);
            
            // Try to find the associated Xcode project to get PRODUCT_BUNDLE_IDENTIFIER
            const plistDir = path.dirname(plistPath);
            
            // Look for .xcodeproj in parent directories (up to 3 levels)
            let searchDir = plistDir;
            for (let i = 0; i < 3; i++) {
              const xcodeProjects = await glob('*.xcodeproj', {
                cwd: searchDir,
                absolute: true
              });
              
              if (xcodeProjects.length > 0) {
                // Try to read PRODUCT_BUNDLE_IDENTIFIER from project.pbxproj
                const pbxprojPath = path.join(xcodeProjects[0], 'project.pbxproj');
                if (existsSync(pbxprojPath)) {
                  try {
                    const pbxContent = await readFile(pbxprojPath, 'utf8');
                    const match = pbxContent.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/);
                    if (match) {
                      const raw = match[1].trim();
                      result.ios = raw.replace(/^"|"$/g, '').trim();
                      console.log(`[bundle-resolver] ✓ Resolved iOS bundle ID from Xcode project: ${result.ios}`);
                      return result;
                    }
                  } catch (error) {
                    console.error(`Failed to read ${pbxprojPath}: ${error}`);
                  }
                }
                break;
              }
              
              searchDir = path.dirname(searchDir);
            }
            
            // If we didn't find the Xcode project, fall back to reading CFBundleIdentifier from Info.plist
            // (but only if it's a literal value, not a variable like $(PRODUCT_BUNDLE_IDENTIFIER))
            const bundleIdMatch = content.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
            if (bundleIdMatch) {
              const raw = bundleIdMatch[1].trim();
              // Only use if it's not a variable reference
              if (!/\$\(.*\)/.test(raw)) {
                result.ios = raw;
                console.log(`[bundle-resolver] ✓ Resolved iOS bundle ID from Info.plist: ${result.ios}`);
                return result;
              }
            }
          }
        } catch (error) {
          // Ignore individual file read errors, continue searching
        }
      }
    } catch (error) {
      console.error(`Failed to search for Info.plist with scheme "${scheme}": ${error}`);
    }
  }
  
  // Strategy 2: Fallback to common Info.plist locations (original behavior)
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
          const raw = match[1].trim();
          // Only use if it's not a variable reference
          if (!/\$\(.*\)/.test(raw)) {
            result.ios = raw;
            break;
          }
        }
      } catch (error) {
        console.error(`Failed to resolve iOS bundle ID from ${plistPath}: ${error}`);
      }
    }
  }
  
  return result;
}
