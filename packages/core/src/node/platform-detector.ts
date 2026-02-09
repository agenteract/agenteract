import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

export type PlatformType = 
  | 'vite'           // Vite/React web app
  | 'expo'           // Expo/React Native app
  | 'flutter'        // Flutter app
  | 'kmp-android'    // Kotlin Multiplatform Android
  | 'kmp-desktop'    // Kotlin Multiplatform Desktop (JVM)
  | 'xcode';         // Xcode project (iOS/macOS, Swift/Objective-C)

/**
 * Detect the platform type from a project directory
 */
export async function detectPlatform(projectPath: string): Promise<PlatformType> {
  // Check for Flutter
  if (existsSync(path.join(projectPath, 'pubspec.yaml'))) {
    return 'flutter';
  }
  
  // Check for Xcode projects (Swift/Objective-C/iOS/macOS) - look for Package.swift or .xcodeproj
  if (existsSync(path.join(projectPath, 'Package.swift'))) {
    return 'xcode';
  }
  
  // Check for Xcode project (Swift/iOS apps using Xcode)
  try {
    const { glob } = await import('glob');
    const xcodeProjects = await glob('*.xcodeproj', { 
      cwd: projectPath,
      absolute: false
    });
    if (xcodeProjects.length > 0) {
      return 'xcode';
    }
    
    // Also check one level deep for Xcode projects
    const nestedXcodeProjects = await glob('*/*.xcodeproj', { 
      cwd: projectPath,
      absolute: false
    });
    if (nestedXcodeProjects.length > 0) {
      return 'xcode';
    }
  } catch {
    // Ignore glob errors
  }
  
  // Check for Kotlin Multiplatform
  const buildGradleKts = path.join(projectPath, 'build.gradle.kts');
  const buildGradle = path.join(projectPath, 'build.gradle');
  
  if (existsSync(buildGradleKts) || existsSync(buildGradle)) {
    try {
      const gradleFile = existsSync(buildGradleKts) ? buildGradleKts : buildGradle;
      const content = await readFile(gradleFile, 'utf8');
      
      // Check if it's a Kotlin Multiplatform project
      if (content.includes('kotlin("multiplatform")') || content.includes('kotlin-multiplatform')) {
        // Determine if it's Android or Desktop based on targets
        if (content.includes('android()') || content.includes('android {')) {
          return 'kmp-android';
        } else if (content.includes('jvm()') || content.includes('desktop()')) {
          return 'kmp-desktop';
        }
        // Default to desktop for KMP
        return 'kmp-desktop';
      }
    } catch {
      // Ignore read errors
    }
  }
  
  // Check for Expo or React Native
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      
      // Check for Expo
      if (packageJson.dependencies?.expo || packageJson.devDependencies?.expo) {
        return 'expo';
      }
      
      // Check for app.json (Expo marker)
      if (existsSync(path.join(projectPath, 'app.json'))) {
        try {
          const appJson = JSON.parse(await readFile(path.join(projectPath, 'app.json'), 'utf8'));
          if (appJson.expo) {
            return 'expo';
          }
        } catch {
          // Ignore app.json parse errors
        }
      }
      
      // Check for Vite
      if (packageJson.dependencies?.vite || packageJson.devDependencies?.vite) {
        return 'vite';
      }
      
      // Check for vite.config file
      const viteConfigs = [
        'vite.config.ts',
        'vite.config.js',
        'vite.config.mts',
        'vite.config.mjs',
      ];
      
      for (const config of viteConfigs) {
        if (existsSync(path.join(projectPath, config))) {
          return 'vite';
        }
      }
    } catch {
      // Ignore package.json parse errors
    }
  }
  
  throw new Error(
    `Unable to detect platform type for project at ${projectPath}. ` +
    `Please ensure the project contains platform-specific files (pubspec.yaml, Package.swift, build.gradle.kts, package.json, etc.)`
  );
}

/**
 * Detect platform from dev server command hint
 * This is a fallback when file-based detection isn't sufficient
 */
export function detectPlatformFromCommand(command: string): PlatformType | null {
  const lowerCommand = command.toLowerCase();
  
  if (lowerCommand.includes('expo')) {
    return 'expo';
  }
  if (lowerCommand.includes('vite') || lowerCommand.includes('npm run dev') || lowerCommand.includes('pnpm dev')) {
    return 'vite';
  }
  if (lowerCommand.includes('flutter')) {
    return 'flutter';
  }
  if (lowerCommand.includes('gradle')) {
    return 'kmp-desktop'; // Default to desktop for gradle
  }
  if (lowerCommand.includes('xcodebuild')) {
    return 'xcode';
  }
  
  return null;
}
