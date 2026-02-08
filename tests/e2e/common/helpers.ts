#!/usr/bin/env node
/**
 * Common helper functions for E2E tests
 */

import { spawn, exec, execSync, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { tmpdir, homedir } from 'os';
import { realpathSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

export function success(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

export function error(message: string) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

export function info(message: string) {
  console.log(`${colors.yellow}ℹ️  ${message}${colors.reset}`);
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
  checkFn: () => Promise<boolean>,
  description: string,
  timeoutMs: number = 30000,
  intervalMs: number = 1000
): Promise<void> {
  info(`Waiting for: ${description} (timeout: ${timeoutMs / 1000}s)`);

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await checkFn()) {
      success(description);
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timeout waiting for: ${description}`);
}

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if Verdaccio is running (either via Docker or as a service)
 */
export async function isVerdaccioRunning(): Promise<boolean> {
  // First check if Verdaccio is accessible via HTTP
  try {
    await execAsync('curl -s http://localhost:4873/-/ping');
    return true;
  } catch {
    // Fall back to checking Docker
    try {
      const { stdout } = await execAsync('docker ps');
      return stdout.includes('agenteract-verdaccio');
    } catch {
      return false;
    }
  }
}

/**
 * Start Verdaccio if not already running
 */
export async function startVerdaccio(): Promise<void> {
  if (await isVerdaccioRunning()) {
    info('Verdaccio already running');
    return;
  }

  info('Starting Verdaccio...');

  // Use spawn with inherited stdio to stream output in real-time
  const result = await new Promise<void>((resolve, reject) => {
    const proc = spawn('pnpm', ['verdaccio:start'], {
      stdio: 'inherit', // Stream output directly to console
      shell: true,
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`verdaccio:start exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });

  // Wait for Verdaccio to be ready
  await waitFor(
    async () => {
      try {
        await execAsync('curl -s http://localhost:4873/-/ping');
        return true;
      } catch {
        return false;
      }
    },
    'Verdaccio to start',
    30000
  );
}

/**
 * Stop Verdaccio
 */
export async function stopVerdaccio(): Promise<void> {
  if (await isVerdaccioRunning()) {
    info('Stopping Verdaccio...');
    await execAsync('pnpm verdaccio:stop');
  }
}

/**
 * Publish packages to Verdaccio
 */
export async function publishPackages(): Promise<void> {
  info('Publishing packages to Verdaccio...');
  try {
    await execAsync('pnpm verdaccio:publish');
    success('Packages published');
  } catch (err) {
    error('Failed to publish packages');
    throw err;
  }
}

/**
 * Escape a shell argument for safe use in shell commands
 * Wraps arguments containing spaces or special characters in single quotes
 */
function escapeShellArg(arg: string): string {
  // If the argument doesn't contain spaces or special characters, return as-is
  // Allow: letters, numbers, underscore, dash, dot, forward slash, colon, at sign
  if (/^[a-zA-Z0-9_\-\.\/:\@=]+$/.test(arg)) {
    return arg;
  }

  // For arguments with spaces or special chars, wrap in single quotes
  // and escape any single quotes within the argument
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Run a shell command and return output
 */
export async function runCommand(command: string): Promise<string> {
  if (process.platform === 'win32' && command.startsWith('cd')) {
    // on window, use /d to change drive letter
    command = command.replace(/^cd /g, 'cd /d ');
  }
  info(`Running: ${command}`);
  const { stdout, stderr } = await execAsync(command);
  return stdout + stderr;
}

/**
 * Take a screenshot of the iOS simulator (for debugging failed tests)
 * @param outputPath Path where screenshot should be saved (e.g., '/tmp/screenshot.png')
 * @param deviceId Optional specific device ID. If not provided, uses booted device.
 */
export async function takeSimulatorScreenshot(
  outputPath: string,
  deviceId?: string
): Promise<void> {
  try {
    const device = deviceId || 'booted';
    await execAsync(`xcrun simctl io ${device} screenshot "${outputPath}"`);
    success(`Screenshot saved to ${outputPath}`);
  } catch (err) {
    info(`Failed to take screenshot: ${err}`);
  }
}

/**
 * Take a screenshot of an Android device/emulator (for debugging failed tests)
 * @param outputPath Path where screenshot should be saved (e.g., '/tmp/screenshot.png')
 * @param deviceId Optional specific device ID. If not provided, uses the first available device.
 */
export async function takeAndroidScreenshot(
  outputPath: string,
  deviceId?: string
): Promise<void> {
  try {
    const deviceArg = deviceId ? `-s ${deviceId}` : '';
    // Use exec-out to avoid line ending issues and get raw binary data
    await execAsync(`adb ${deviceArg} exec-out screencap -p > "${outputPath}"`);
    success(`Screenshot saved to ${outputPath}`);
  } catch (err) {
    info(`Failed to take screenshot: ${err}`);
  }
}

/**
 * Take a screenshot of a device (works for both iOS and Android)
 * @param outputPath Path where screenshot should be saved
 * @param deviceType Platform type ('ios' or 'android')
 * @param deviceId Optional device ID
 */
export async function takeScreenshot(
  outputPath: string,
  deviceType: 'ios' | 'android',
  deviceId?: string
): Promise<void> {
  if (deviceType === 'ios') {
    await takeSimulatorScreenshot(outputPath, deviceId);
  } else {
    await takeAndroidScreenshot(outputPath, deviceId);
  }
}

/**
 * Run agenteract-agents command
 */
export async function runAgentCommand(...args: string[]): Promise<string> {
  // Check if first arg is a cwd option (starts with 'cwd:')
  let commandArgs = args;
  let cwd: string | undefined;

  if (args[0]?.startsWith('cwd:')) {
    cwd = args[0].substring(4);
    commandArgs = args.slice(1);
  }

  // Escape all arguments for safe shell usage
  const escapedArgs = commandArgs.map(escapeShellArg);

  // Run from the specified directory using the locally installed package
  const command = `npx @agenteract/agents ${escapedArgs.join(' ')}`;
  const { stdout, stderr } = await execAsync(command, { cwd });
  if (stderr.includes('Debugger attached'))
    return stdout;
  return stdout + stderr;

}

/**
 * Check if output contains expected string
 */
export function assertContains(
  output: string,
  expected: string,
  description: string
): void {
  if (output.includes(expected)) {
    success(description);
  } else {
    error(description);
    error(`Expected to find: ${expected}`);
    error(`Got output:\n${output}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

/**
 * Spawn a process in the background
 */
export function spawnBackground(
  command: string,
  args: string[],
  name: string,
  options?: { cwd?: string }
): ChildProcess {
  info(`Starting ${name}: ${command} ${args.join(' ')}`);

  // Clear pnpm environment variables so npx is detected correctly
  const env = { ...process.env };
  delete env.npm_config_user_agent;
  delete env.npm_execpath;

  if (process.platform === 'win32') {
    args.unshift(command);;
    args.unshift('/C');
    command = 'cmd.exe'
  }

  const proc = spawn(command, args, {
    stdio: 'pipe',
    detached: false,
    cwd: options?.cwd,
    env,
  });

  // Log output for debugging
  proc.stdout?.on('data', (data) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });

  proc.stderr?.on('data', (data) => {
    console.error(`[${name} ERR] ${data.toString().trim()}`);
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      error(`${name} exited with code ${code}`);
    }
  });

  return proc;
}

/**
 * Kill a process gracefully
 */
export async function killProcess(
  proc: ChildProcess,
  name: string,
  timeoutMs: number = 5000
): Promise<void> {
  if (!proc.pid) {
    return;
  }

  info(`Stopping ${name}...`);

  // Try graceful shutdown first
  proc.kill('SIGTERM');

  // Wait for process to exit
  const exitPromise = new Promise<void>((resolve) => {
    proc.on('exit', () => resolve());
  });

  const timeoutPromise = sleep(timeoutMs);

  const result = await Promise.race([
    exitPromise.then(() => 'exited'),
    timeoutPromise.then(() => 'timeout'),
  ]);

  // Force kill if timeout
  if (result === 'timeout') {
    info(`Force killing ${name}...`);
    proc.kill('SIGKILL');
  }

  success(`${name} stopped`);
}

/**
 * Get temporary directory with 8.3 paths expanded on Windows
 * On Windows CI, tmpdir() may return 8.3 short paths (e.g., "RUNNER~1")
 * which can cause issues with node-pty. This function expands them to full paths.
 */
export function getTmpDir(): string {
  const tmp = tmpdir();

  // On Windows, expand 8.3 short paths to full paths
  if (process.platform === 'win32') {
    try {
      // realpathSync expands 8.3 paths to full paths on Windows
      return realpathSync(tmp);
    } catch (err) {
      // If realpathSync fails (e.g., path doesn't exist), try Windows command
      try {
        // Use PowerShell to expand the path
        const expanded = execSync(
          `powershell -Command "(Get-Item '${tmp}').FullName"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        ).trim();
        return expanded;
      } catch {
        // Fallback to original path if expansion fails
        return tmp;
      }
    }
  }

  return tmp;
}

/**
 * Cleanup function to be called on exit
 */
export function setupCleanup(cleanupFn: () => Promise<void>): void {
  let cleanupCalled = false;

  const handleExit = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;

    try {
      await cleanupFn();
    } catch (err) {
      error(`Cleanup error: ${err}`);
    }
  };

  const handleExitSync = () => {
    if (cleanupCalled) return;
    cleanupCalled = true;

    // Note: The 'exit' event cannot run async operations
    // This is a best-effort synchronous cleanup
    info('Process exiting, attempting synchronous cleanup...');
    // The actual cleanup will be handled by the test's catch/finally blocks
  };

  // Register async handlers for signals
  process.on('SIGINT', async () => {
    await handleExit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await handleExit();
    process.exit(0);
  });

  process.on('uncaughtException', async (err) => {
    error(`Uncaught exception: ${err}`);
    await handleExit();
    process.exit(1);
  });

  // Register synchronous handler for explicit process.exit() calls
  // This serves as a reminder that cleanup should happen before exit
  process.on('exit', handleExitSync);
}

/**
 * Prepare package.json for Verdaccio by replacing workspace:* dependencies
 * with actual published versions and creating .npmrc
 * 
 * This function:
 * 1. Fetches published versions from Verdaccio for all @agenteract/* dependencies
 * 2. Replaces workspace:* with exact versions (needed for npm prerelease matching)
 * 3. Creates .npmrc with Verdaccio registry and auth token
 * 
 * @param packageDir - Directory containing package.json to update
 * @param verdaccioUrl - Verdaccio URL (default: http://localhost:4873)
 * @returns Object with authToken and count of replaced dependencies
 */
export async function preparePackageForVerdaccio(
  packageDir: string,
  verdaccioUrl: string = 'http://localhost:4873'
): Promise<{ authToken: string; replacedCount: number }> {
  const pkgJsonPath = join(packageDir, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

  // Get auth token from global .npmrc
  const homeNpmrcPath = join(homedir(), '.npmrc');
  let authToken = '';
  if (existsSync(homeNpmrcPath)) {
    const homeNpmrc = readFileSync(homeNpmrcPath, 'utf8');
    const tokenMatch = homeNpmrc.match(/\/\/localhost:4873\/:_authToken=(.+)/);
    if (tokenMatch) {
      authToken = tokenMatch[1];
    }
  }

  // Replace workspace:* dependencies with actual published versions from Verdaccio
  // npm doesn't match prerelease versions (e.g., 0.1.2-e2e.0) with ranges like * or >=0.0.0
  // We need to fetch the actual published versions
  info('Fetching published versions from Verdaccio...');
  const publishedVersions: Record<string, string> = {};
  
  // Collect all @agenteract/* dependencies
  const agenteractDeps = new Set<string>();
  ['dependencies', 'devDependencies'].forEach(depType => {
    if (pkgJson[depType]) {
      Object.keys(pkgJson[depType]).forEach(key => {
        if (key.startsWith('@agenteract/') && pkgJson[depType][key] === 'workspace:*') {
          agenteractDeps.add(key);
        }
      });
    }
  });
  
  // Fetch version for each package from Verdaccio
  for (const pkgName of agenteractDeps) {
    try {
      const response = await fetch(`${verdaccioUrl}/${pkgName}`, {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        const versions = Object.keys(data.versions || {});
        // Use the latest version (last in array after sort)
        if (versions.length > 0) {
          versions.sort();
          publishedVersions[pkgName] = versions[versions.length - 1];
          info(`   ${pkgName}: ${publishedVersions[pkgName]}`);
        }
      }
    } catch (err) {
      error(`Failed to fetch version for ${pkgName}: ${err}`);
    }
  }

  info('Replacing workspace:* dependencies...');

  let replacedCount = 0;
  ['dependencies', 'devDependencies'].forEach(depType => {
    if (pkgJson[depType]) {
      Object.keys(pkgJson[depType]).forEach(key => {
        if (pkgJson[depType][key] === 'workspace:*') {
          const version = publishedVersions[key];
          if (version) {
            pkgJson[depType][key] = version;
            replacedCount++;
          } else {
            throw new Error(`No published version found for ${key}`);
          }
        }
      });
    }
  });

  // Write the file with explicit encoding
  const newContent = JSON.stringify(pkgJson, null, 2) + '\n';
  writeFileSync(pkgJsonPath, newContent, 'utf8');

  // Verify the file was written correctly
  await sleep(200); // Small delay to ensure file system sync on Windows
  const verifyContent = readFileSync(pkgJsonPath, 'utf8');
  if (verifyContent.includes('workspace:')) {
    throw new Error('Failed to replace workspace dependencies');
  }
  success(`Workspace dependencies replaced (${replacedCount} replacements)`);

  // Create .npmrc to ensure all packages are fetched from Verdaccio
  info('Creating .npmrc for Verdaccio...');
  const npmrcPath = join(packageDir, '.npmrc');
  const npmrcContent = `registry=${verdaccioUrl}\n${authToken ? `//localhost:4873/:_authToken=${authToken}\n` : ''}`;
  writeFileSync(npmrcPath, npmrcContent);
  success('.npmrc created');

  return { authToken, replacedCount };
}

/**
 * Install CLI packages from Verdaccio in a config directory
 * Creates the directory, initializes npm, creates .npmrc, and installs packages
 * 
 * @param configDir - Directory to create and install packages in
 * @param packages - Array of package names to install (e.g., ['@agenteract/cli', '@agenteract/agents'])
 * @param verdaccioUrl - Verdaccio URL (default: http://localhost:4873)
 */
export async function installCLIPackages(
  configDir: string,
  packages: string[],
  verdaccioUrl: string = 'http://localhost:4873'
): Promise<void> {
  // Create directory
  await runCommand(`mkdir -p ${configDir}`);
  
  // Initialize npm
  await runCommand(`cd ${configDir} && npm init -y`);
  
  // Get auth token from global .npmrc
  const homeNpmrcPath = join(homedir(), '.npmrc');
  let authToken = '';
  if (existsSync(homeNpmrcPath)) {
    const homeNpmrc = readFileSync(homeNpmrcPath, 'utf8');
    const tokenMatch = homeNpmrc.match(/\/\/localhost:4873\/:_authToken=(.+)/);
    if (tokenMatch) {
      authToken = tokenMatch[1];
    }
  }
  
  // Create .npmrc with registry and auth
  const npmrcPath = join(configDir, '.npmrc');
  const npmrcContent = `registry=${verdaccioUrl}\n${authToken ? `//localhost:4873/:_authToken=${authToken}\n` : ''}`;
  writeFileSync(npmrcPath, npmrcContent);
  
  // Fetch published versions for the packages
  const packageVersions: string[] = [];
  for (const pkgName of packages) {
    try {
      const response = await fetch(`${verdaccioUrl}/${pkgName}`, {
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        const versions = Object.keys(data.versions || {});
        if (versions.length > 0) {
          versions.sort();
          const latestVersion = versions[versions.length - 1];
          packageVersions.push(`${pkgName}@${latestVersion}`);
        } else {
          throw new Error(`No versions found for ${pkgName}`);
        }
      } else {
        throw new Error(`Failed to fetch ${pkgName}: ${response.statusText}`);
      }
    } catch (err) {
      throw new Error(`Failed to fetch version for ${pkgName}: ${err}`);
    }
  }
  
  // Install packages with explicit versions
  const installCmd = `cd ${configDir} && npm install ${packageVersions.join(' ')} --registry ${verdaccioUrl}`;
  await runCommand(installCmd);
}

/**
 * Check if we're running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI
  );
}

/**
 * Get the cache directory for node_modules
 */
export function getNodeModulesCacheDir(): string {
  return join(homedir(), '.cache', 'agenteract', 'node_modules');
}

/**
 * Restore node_modules from cache if available
 * @param targetDir - Directory where node_modules should be restored
 * @param cacheKey - Cache key (e.g., 'agenteract-e2e-vite-app')
 * @returns true if cache was restored, false otherwise
 */
export async function restoreNodeModulesCache(
  targetDir: string,
  cacheKey: string
): Promise<boolean> {
  // Skip caching in CI
  if (isCI()) {
    return false;
  }

  const cacheDir = getNodeModulesCacheDir();
  const cachedNodeModules = join(cacheDir, cacheKey, 'node_modules');
  const targetNodeModules = join(targetDir, 'node_modules');

  if (!existsSync(cachedNodeModules)) {
    return false;
  }

  try {
    info(`Restoring node_modules from cache: ${cacheKey}`);
    await runCommand(`mkdir -p ${targetDir}`);
    await runCommand(`cp -Rp ${cachedNodeModules} ${targetNodeModules}`);
    success('node_modules restored from cache');
    return true;
  } catch (err) {
    error(`Failed to restore node_modules from cache: ${err}`);
    return false;
  }
}

/**
 * Save node_modules to cache
 * @param sourceDir - Directory containing node_modules to cache
 * @param cacheKey - Cache key (e.g., 'agenteract-e2e-vite-app')
 */
export async function saveNodeModulesCache(
  sourceDir: string,
  cacheKey: string
): Promise<void> {
  // Skip caching in CI
  if (isCI()) {
    return;
  }

  const sourceNodeModules = join(sourceDir, 'node_modules');
  if (!existsSync(sourceNodeModules)) {
    return;
  }

  const cacheDir = getNodeModulesCacheDir();
  const cachedNodeModules = join(cacheDir, cacheKey, 'node_modules');

  try {
    info(`Saving node_modules to cache: ${cacheKey}`);
    await runCommand(`mkdir -p ${join(cacheDir, cacheKey)}`);
    await runCommand(`rm -rf ${cachedNodeModules}`);
    await runCommand(`cp -Rp ${sourceNodeModules} ${cachedNodeModules}`);
    success('node_modules saved to cache');
  } catch (err) {
    error(`Failed to save node_modules to cache: ${err}`);
  }
}
