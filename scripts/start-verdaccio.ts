#!/usr/bin/env tsx
/**
 * Script to start Verdaccio using npm for local testing
 * Usage: tsx scripts/start-verdaccio.ts
 */

import { execSync, spawn } from 'child_process';
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
      console.log(`✓ Verdaccio is already running (PID: ${pid})`);
      console.log(`   URL: http://localhost:${VERDACCIO_PORT}`);
      process.exit(0);  // Success, nothing to do
    } else {
      console.log('   Removing stale PID file...');
      rmSync(PID_FILE, { force: true });
    }
  }

  // Clean up existing storage only if --clean flag or CI
  const shouldClean = process.argv.includes('--clean') || process.env.CI;
  if (shouldClean && existsSync(STORAGE_PATH)) {
    console.log(`   Removing existing ${STORAGE_PATH}`);
    rmSync(STORAGE_PATH, { recursive: true, force: true });
  } else if (existsSync(STORAGE_PATH)) {
    console.log(`   Using existing storage at ${STORAGE_PATH}`);
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

  const isWindows = process.platform === 'win32';
  let verdaccioPid: number | undefined;

  if (isWindows) {
    // On Windows, use 'start /B' to run in background without opening a window
    // /B = Start application without creating a new window
    // We'll redirect output to the log file and find the PID afterward
    
    // On Windows, use start /B to run in background without opening a window
    const command = `pnpm dlx verdaccio --listen ${VERDACCIO_PORT} ${configArgs.join(' ')}`;
    // Use start /B directly - with shell: true, execSync will use cmd automatically
    const startCommand = `start /B "" ${command}`;
    
    try {
      // Execute start command using execSync
      // On Windows, execSync automatically uses cmd.exe for shell commands
      const execOptions: any = {
        cwd: PROJECT_ROOT,
        stdio: 'ignore',
      };
      if (isWindows) {
        execOptions.shell = true;
      }
      execSync(startCommand, execOptions);
      
      closeSync(logFd);
      
      // Wait a moment for the process to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Find the PID by checking what's listening on the port
      // Or by finding the verdaccio process
      try {
        // Try to find the process using netstat and tasklist
        const netstatOutput = execSync(
          `netstat -ano | findstr :${VERDACCIO_PORT} | findstr LISTENING`,
          { encoding: 'utf-8' }
        );
        
        if (netstatOutput.trim()) {
          // Extract PID from netstat output (last column)
          const lines = netstatOutput.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) {
              // Verify it's actually a verdaccio process
              try {
                const tasklistOutput = execSync(
                  `tasklist /FI "PID eq ${pid}" /FO CSV`,
                  { encoding: 'utf-8' }
                );
                if (tasklistOutput.includes('node.exe') || tasklistOutput.includes('verdaccio')) {
                  verdaccioPid = parseInt(pid);
                  console.log(`   Process ID: ${verdaccioPid}`);
                  writeFileSync(PID_FILE, verdaccioPid.toString());
                  closeSync(logFd);
                  break;
                }
              } catch {
                // Continue searching
              }
            }
          }
        }
        
        if (verdaccioPid === undefined) {
          // Fallback: try to find by process name
          try {
            const tasklistOutput = execSync(
              `tasklist /FI "IMAGENAME eq node.exe" /FO CSV`,
              { encoding: 'utf-8' }
            );
            // This is a fallback - we'll use the first node process as a guess
            // But ideally we should have found it via netstat
            console.log('⚠️  Could not determine exact PID, but process should be running');
            console.log('   Check logs and verify Verdaccio is accessible');
          } catch {
            // Ignore
          }
        }
      } catch (error: any) {
        console.error('⚠️  Could not determine process PID');
        console.error(`   Error: ${error.message}`);
        console.error('   Verdaccio may still be running - check logs and port');
      }
      
      if (verdaccioPid === undefined) {
        // Don't exit - let health check determine if it's working
        console.log('   Started Verdaccio (PID detection failed, but process should be running)');
        // Set a placeholder so the rest of the code doesn't error
        verdaccioPid = 0;
      }
    } catch (error: any) {
      console.error('❌ Failed to start Verdaccio process');
      console.error(`   Error: ${error.message}`);
      closeSync(logFd);
      process.exit(1);
    }
  } else {
    // On Unix, use regular spawn with detached mode
    const logFd = openSync(LOG_FILE, 'w');
    const spawnOptions: any = {
      stdio: ['ignore', logFd, logFd],
      detached: true,
    };

    const verdaccioProcess = spawn(
      'pnpm',
      ['dlx', 'verdaccio', '--listen', VERDACCIO_PORT, ...configArgs],
      spawnOptions
    );

    verdaccioProcess.on('error', (error) => {
      console.error('❌ Failed to spawn Verdaccio process');
      console.error(`   Error: ${error.message}`);
      closeSync(logFd);
      process.exit(1);
    });

    closeSync(logFd);

    if (!verdaccioProcess.pid) {
      console.error('❌ Failed to spawn Verdaccio process');
      console.error('   Process PID is undefined');
      process.exit(1);
    }

    verdaccioPid = verdaccioProcess.pid;
    console.log(`   Process ID: ${verdaccioPid}`);
    writeFileSync(PID_FILE, verdaccioPid.toString());
    verdaccioProcess.unref();
  }

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
    // Exit so the next command in the chain can run
    // Verdaccio will continue running in the background (detached process)
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
    if (verdaccioPid && verdaccioPid > 0 && isProcessRunning(verdaccioPid)) {
      console.log(`Verdaccio process is still running (PID: ${verdaccioPid})`);
      try {
        process.kill(verdaccioPid);
      } catch {
        // Ignore
      }
    } else {
      console.log('Verdaccio process is not running or PID unknown');
    }
    rmSync(PID_FILE, { force: true });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
