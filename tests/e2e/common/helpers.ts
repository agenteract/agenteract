#!/usr/bin/env node
/**
 * Common helper functions for E2E tests
 */

import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

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
  await execAsync('pnpm verdaccio:start');

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
 * Run a shell command and return output
 */
export async function runCommand(command: string): Promise<string> {
  info(`Running: ${command}`);
  const { stdout, stderr } = await execAsync(command);
  return stdout + stderr;
}

/**
 * Run agenteract-agents command
 */
export async function runAgentCommand(...args: string[]): Promise<string> {
  const command = `pnpm agenteract-agents ${args.join(' ')}`;
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
  const proc = spawn(command, args, {
    stdio: 'pipe',
    detached: false,
    cwd: options?.cwd,
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
 * Cleanup function to be called on exit
 */
export function setupCleanup(cleanupFn: () => Promise<void>): void {
  const handleExit = async () => {
    try {
      await cleanupFn();
    } catch (err) {
      error(`Cleanup error: ${err}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
  process.on('uncaughtException', async (err) => {
    error(`Uncaught exception: ${err}`);
    await handleExit();
  });
}
