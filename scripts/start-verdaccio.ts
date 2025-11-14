#!/usr/bin/env tsx
/**
 * Script to start Verdaccio using npm for local testing
 * Usage: tsx scripts/start-verdaccio.ts
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const VERDACCIO_PORT = process.env.VERDACCIO_PORT || '4873';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONFIG_PATH = join(PROJECT_ROOT, '.verdaccio', 'config-local.yaml');
const STORAGE_PATH = join(PROJECT_ROOT, '.verdaccio', 'storage');
const PID_FILE = join(PROJECT_ROOT, '.verdaccio', 'verdaccio.pid');
const LOG_FILE = join(PROJECT_ROOT, '.verdaccio', 'verdaccio.log');

function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    // Works on both Windows and Unix
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function checkHealth(url: string, maxRetries: number = 60): Promise<boolean> {
  console.log('⏳ Waiting for Verdaccio to be ready...');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${url}/-/ping`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore fetch errors and retry
    }

    // Check if process is still running
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
      if (!isProcessRunning(pid)) {
        console.log('❌ Verdaccio process died unexpectedly');
        console.log(`Log file: ${LOG_FILE}`);
        if (existsSync(LOG_FILE)) {
          console.log('Full log contents:');
          console.log(readFileSync(LOG_FILE, 'utf-8'));
        } else {
          console.log('Log file does not exist');
        }
        rmSync(PID_FILE, { force: true });
        return false;
      }
    }

    console.log(`Waiting... (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return false;
}

async function main(): Promise<void> {
  console.log('🚀 Starting Verdaccio via npm...');

  // Check if already running
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    if (isProcessRunning(pid)) {
      console.log(`⚠️  Verdaccio is already running (PID: ${pid})`);
      console.log('   Stop it first with: pnpm verdaccio:stop');
      process.exit(1);
    } else {
      console.log('   Removing stale PID file...');
      rmSync(PID_FILE, { force: true });
    }
  }

  // Clean up existing storage
  if (existsSync(STORAGE_PATH)) {
    console.log(`   Removing existing ${STORAGE_PATH}`);
    rmSync(STORAGE_PATH, { recursive: true, force: true });
  }

  // Create directories
  mkdirSync(STORAGE_PATH, { recursive: true });
  mkdirSync(dirname(LOG_FILE), { recursive: true });

  // Check for custom config
  let configArgs: string[] = [];
  if (!existsSync(CONFIG_PATH)) {
    console.log('⚠️  Warning: Custom config not found at', CONFIG_PATH);
    console.log('Using default Verdaccio configuration');
  } else {
    console.log('✓ Using custom configuration from .verdaccio/config-local.yaml');
    configArgs = ['--config', CONFIG_PATH];
  }

  // Start Verdaccio in the background
  console.log(`   Starting Verdaccio on port ${VERDACCIO_PORT}...`);

  const { openSync, closeSync } = require('fs');
  const logFd = openSync(LOG_FILE, 'w');

  const verdaccioProcess = spawn(
    'pnpm',
    ['dlx', 'verdaccio', '--listen', VERDACCIO_PORT, ...configArgs],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      shell: process.platform === 'win32', // Use shell on Windows
    }
  );

  // Close the file descriptor in the parent process
  closeSync(logFd);

  const verdaccioPid = verdaccioProcess.pid!;
  console.log(`   Process ID: ${verdaccioPid}`);

  // Save PID to file
  writeFileSync(PID_FILE, verdaccioPid.toString());

  // Unref so the parent process can exit
  verdaccioProcess.unref();

  // Wait a bit for initial startup
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Health check
  const verdaccioUrl = `http://localhost:${VERDACCIO_PORT}`;
  const isHealthy = await checkHealth(verdaccioUrl);

  if (isHealthy) {
    console.log(`✅ Verdaccio is running at ${verdaccioUrl}`);
    console.log('');
    console.log(`Web UI: ${verdaccioUrl}`);
    console.log('Username: test');
    console.log('Password: test');
    console.log('');
    console.log(`Logs: ${LOG_FILE}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Publish packages: pnpm verdaccio:publish');
    console.log('  2. Run tests: pnpm test:integration');
    console.log('');
    console.log('To stop Verdaccio:');
    console.log('  pnpm verdaccio:stop');
    process.exit(0);
  } else {
    console.log('❌ Failed to start Verdaccio - health check timeout');
    console.log(`Log file: ${LOG_FILE}`);
    if (existsSync(LOG_FILE)) {
      console.log('Full log contents:');
      console.log(readFileSync(LOG_FILE, 'utf-8'));
    } else {
      console.log('Log file does not exist');
    }
    console.log('');
    console.log('Process status:');
    if (isProcessRunning(verdaccioPid)) {
      console.log(`Verdaccio process is still running (PID: ${verdaccioPid})`);
      try {
        process.kill(verdaccioPid);
      } catch {
        // Ignore
      }
    } else {
      console.log('Verdaccio process is not running');
    }
    rmSync(PID_FILE, { force: true });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
