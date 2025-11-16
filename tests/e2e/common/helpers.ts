#!/usr/bin/env node
/**
 * Common helper functions for E2E tests
 */

import { spawn, exec, execSync, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { realpathSync } from 'fs';

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
 * Take a screenshot of the iOS simulator
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

  if (cwd) {
    // Run from the specified directory using the locally installed package
    const command = `npx @agenteract/agents ${escapedArgs.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, { cwd });
    return stdout + stderr;
  }

  const command = `npx @agenteract/agents ${escapedArgs.join(' ')}`;
  return runCommand(command);
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
