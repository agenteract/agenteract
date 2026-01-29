import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export type PlatformType =
  | 'flutter'
  | 'expo'
  | 'kmp-android'
  | 'kmp-desktop'
  | 'swiftui'
  | 'vite';

export interface PlatformInfo {
  type: PlatformType;
  projectRoot: string;
  bundleIdFiles: string[];
  buildFiles: string[];
  gradleTasks?: string[];
}

/**
 * Auto-detect project platform from file structure
 */
export async function detectPlatform(projectPath: string): Promise<PlatformInfo> {
  if (!projectPath) {
    throw new Error('Project path is required for platform detection');
  }

  // Flutter: pubspec.yaml exists
  if (existsSync(join(projectPath, 'pubspec.yaml'))) {
    return {
      type: 'flutter',
      projectRoot: projectPath,
      bundleIdFiles: [
        'ios/Runner.xcodeproj/project.pbxproj',
        'android/app/build.gradle.kts',
        'android/app/build.gradle',
      ],
      buildFiles: ['android/app/build.gradle.kts', 'android/app/build.gradle'],
    };
  }

  // Expo: app.json with expo key
  const appJsonPath = join(projectPath, 'app.json');
  if (existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
      if (appJson.expo) {
        return {
          type: 'expo',
          projectRoot: projectPath,
          bundleIdFiles: ['app.json'],
          buildFiles: ['app.json'],
        };
      }
    } catch (error) {
      // Not valid JSON or doesn't have expo key, continue detection
    }
  }

  // KMP: build.gradle.kts with kotlin multiplatform plugin
  const kmpBuildFile = join(projectPath, 'build.gradle.kts');
  const composeAppBuildFile = join(projectPath, 'composeApp/build.gradle.kts');

  if (existsSync(kmpBuildFile) || existsSync(composeAppBuildFile)) {
    try {
      // Check for kotlin multiplatform plugin
      const buildContent = existsSync(kmpBuildFile)
        ? readFileSync(kmpBuildFile, 'utf-8')
        : '';
      const composeContent = existsSync(composeAppBuildFile)
        ? readFileSync(composeAppBuildFile, 'utf-8')
        : '';

      const isKmp = buildContent.includes('kotlin("multiplatform")') ||
                    composeContent.includes('kotlin("multiplatform")');

      if (isKmp) {
        // Detect gradle tasks
        let gradleTasks: string[] = [];
        try {
          const tasksOutput = execSync('./gradlew tasks --console=plain', {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 30000,
          });

          // Parse task names from output  
          const taskLines = tasksOutput.split('\n');
          gradleTasks = taskLines
            .filter(line => line.includes('run') || line.includes('Run') || line.includes('install'))
            .map(line => line.split(' ')[0].trim())
            .filter(task => task.length > 0);
        } catch (error) {
          console.warn('Could not detect gradle tasks:', error);
        }

        // Determine if android or desktop based on targets
        const hasAndroid = buildContent.includes('android()') || composeContent.includes('android()');
        const hasDesktop = buildContent.includes('jvm()') ||
                          composeContent.includes('jvm()') ||
                          buildContent.includes('desktop') ||
                          composeContent.includes('desktop');

        // Default to android if both or neither detected
        const type: PlatformType = hasDesktop && !hasAndroid ? 'kmp-desktop' : 'kmp-android';

        return {
          type,
          projectRoot: projectPath,
          bundleIdFiles: type === 'kmp-android' ? ['composeApp/build.gradle.kts'] : [],
          buildFiles: ['composeApp/build.gradle.kts', 'build.gradle.kts'],
          gradleTasks,
        };
      }
    } catch (error) {
      console.warn('Error checking KMP configuration:', error);
    }
  }

  // SwiftUI: *.xcodeproj or *.xcworkspace exists
  try {
    const files = readdirSync(projectPath);
    const hasXcodeProj = files.some((f: string) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'));

    if (hasXcodeProj) {
      const xcodeProject = files.find((f: string) => f.endsWith('.xcodeproj'));
      return {
        type: 'swiftui',
        projectRoot: projectPath,
        bundleIdFiles: [join(xcodeProject!, 'project.pbxproj')],
        buildFiles: [join(xcodeProject!, 'project.pbxproj')],
      };
    }
  } catch (error) {
    // Continue detection
  }

  // Vite: vite.config.ts/js exists
  if (existsSync(join(projectPath, 'vite.config.ts')) ||
      existsSync(join(projectPath, 'vite.config.js'))) {
    return {
      type: 'vite',
      projectRoot: projectPath,
      bundleIdFiles: [],
      buildFiles: ['vite.config.ts', 'vite.config.js'],
    };
  }

  throw new Error(`Could not detect platform type for project at ${projectPath}`);
}
