/**
 * Tests for the unified version management script
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Helper to create a test repository
function createTestRepo(dir: string) {
  // Initialize git repo
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
}

// Helper to create root package.json
function createRootPackageJson(dir: string, version: string = '0.0.1') {
  const packageJson = {
    name: 'test-monorepo',
    version,
    private: true,
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson, null, 2));
}

// Helper to create an NPM package
function createNpmPackage(dir: string, name: string, shortName: string, version: string = '0.0.1') {
  const packageDir = join(dir, 'packages', shortName);
  mkdirSync(packageDir, { recursive: true });

  const packageJson = {
    name,
    version,
  };
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
}

// Helper to create a Dart package
function createDartPackage(dir: string, name: string, shortName: string, version: string = '0.0.1') {
  const packageDir = join(dir, 'packages', shortName);
  mkdirSync(packageDir, { recursive: true });

  const pubspec = `name: ${name}
description: Test Dart package
version: ${version}
environment:
  sdk: ^3.0.0
`;
  writeFileSync(join(packageDir, 'pubspec.yaml'), pubspec);
}

// Helper to read package version
function readNpmVersion(dir: string, shortName: string): string {
  const packageJson = JSON.parse(
    readFileSync(join(dir, 'packages', shortName, 'package.json'), 'utf-8')
  );
  return packageJson.version;
}

function readDartVersion(dir: string, shortName: string): string {
  const pubspec = readFileSync(join(dir, 'packages', shortName, 'pubspec.yaml'), 'utf-8');
  const match = pubspec.match(/^version:\s*(.+)$/m);
  if (!match) throw new Error('Version not found in pubspec.yaml');
  return match[1].trim();
}

function readRootVersion(dir: string): string {
  const packageJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  return packageJson.version;
}

// Helper to commit all changes
function commitChanges(dir: string, message: string = 'test commit') {
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'pipe' });
}

// Helper to run version script
function runVersionScript(
  dir: string,
  versionType: string,
  packages?: string,
  expectError: boolean = false
): { stdout: string; stderr: string; exitCode: number } {
  const scriptPath = join(__dirname, 'version.ts');
  const args = packages ? `${versionType} ${packages}` : versionType;

  try {
    // Use VERSION_SCRIPT_RESPONSES env var to provide predefined responses
    const response = expectError ? 'n' : 'y';
    const stdout = execSync(`npx tsx "${scriptPath}" ${args}`, {
      cwd: dir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        VERSION_SCRIPT_RESPONSES: response,
      },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
      exitCode: error.status || 1,
    };
  }
}

describe('Version Script', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'version-test-'));
    createTestRepo(testDir);
    createRootPackageJson(testDir, '0.0.1');

    // Create test packages
    createNpmPackage(testDir, '@test/core', 'core', '0.0.1');
    createNpmPackage(testDir, '@test/react', 'react', '0.0.1');
    createDartPackage(testDir, 'flutter_test', 'flutter', '0.0.1');

    // Initial commit
    commitChanges(testDir, 'Initial commit');
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Semver Bumping', () => {
    it('should bump patch version for NPM package', () => {
      runVersionScript(testDir, 'patch', 'core');

      expect(readNpmVersion(testDir, 'core')).toBe('0.0.2');
      expect(readRootVersion(testDir)).toBe('0.0.2');
    });

    it('should bump patch version for Dart package', () => {
      runVersionScript(testDir, 'patch', 'flutter');

      expect(readDartVersion(testDir, 'flutter')).toBe('0.0.2');
      expect(readRootVersion(testDir)).toBe('0.0.2');
    });
  });

  describe('Multiple Packages', () => {
    it('should bump all packages when no package specified', () => {
      runVersionScript(testDir, 'patch');

      expect(readNpmVersion(testDir, 'core')).toBe('0.0.2');
      expect(readNpmVersion(testDir, 'react')).toBe('0.0.2');
      expect(readDartVersion(testDir, 'flutter')).toBe('0.0.2');
      expect(readRootVersion(testDir)).toBe('0.0.2');
    });
  });

  describe('Prerelease Versions', () => {
    it('should create alpha prerelease', () => {
      runVersionScript(testDir, 'alpha', 'core');

      const version = readNpmVersion(testDir, 'core');
      expect(version).toMatch(/^0\.0\.2-alpha\.[a-f0-9]+$/);
    });
  });


  describe('Git Integration', () => {
    it('should create a git commit and tag', () => {
      const beforeCommit = execSync('git rev-list --count HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      runVersionScript(testDir, 'patch', 'core');

      const afterCommit = execSync('git rev-list --count HEAD', {
        cwd: testDir,
        encoding: 'utf-8',
      }).trim();

      expect(parseInt(afterCommit)).toBe(parseInt(beforeCommit) + 1);

      const tags = execSync('git tag', { cwd: testDir, encoding: 'utf-8' }).trim();
      expect(tags).toContain('v0.0.2');
    });

    it('should fail if working directory is not clean', () => {
      // Create an uncommitted file
      writeFileSync(join(testDir, 'test.txt'), 'test');

      const result = runVersionScript(testDir, 'patch', 'core', true);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('not clean');
    });
  });

  describe('Error Handling', () => {
    it('should fail for non-existent package', () => {
      const result = runVersionScript(testDir, 'patch', 'nonexistent', true);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('not found');
    });
  });
});
