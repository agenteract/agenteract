#!/usr/bin/env tsx
/**
 * Script to stop and clean up Verdaccio process
 * Usage: tsx scripts/stop-verdaccio.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PID_FILE = join(PROJECT_ROOT, '.verdaccio', 'verdaccio.pid');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessToDie(pid: number, maxWaitSeconds: number = 10): Promise<boolean> {
  for (let i = 0; i < maxWaitSeconds; i++) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

function findAndKillVerdaccio(): void {
  // Find and kill any verdaccio processes
  try {
    if (process.platform === 'win32') {
      // On Windows, use taskkill
      execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq verdaccio*"', { stdio: 'ignore' });
    } else {
      // On Unix, use pkill
      execSync('pkill -f verdaccio', { stdio: 'ignore' });
    }
    console.log('✅ Verdaccio processes stopped');
  } catch {
    // No processes found or error killing
  }
}

function resetNpmRegistry(): void {
  console.log('Resetting npm registry to default...');
  try {
    execSync('npm config delete registry', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
  try {
    execSync('pnpm config delete registry', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
}

async function main(): Promise<void> {
  console.log('🛑 Stopping Verdaccio...');

  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());

    if (isProcessRunning(pid)) {
      console.log(`   Killing process ${pid}...`);
      killProcess(pid, 'SIGTERM');

      // Wait for process to die
      const died = await waitForProcessToDie(pid, 10);

      if (!died && isProcessRunning(pid)) {
        console.log(`   Force killing process ${pid}...`);
        killProcess(pid, 'SIGKILL');
      }

      console.log(`✅ Verdaccio stopped (PID: ${pid})`);
    } else {
      console.log(`ℹ️  Process ${pid} not running`);
    }

    rmSync(PID_FILE, { force: true });
  } else {
    console.log('ℹ️  PID file not found');

    // Try to find and kill any running verdaccio processes
    findAndKillVerdaccio();
  }

  // Reset npm registry to default
  resetNpmRegistry();

  console.log('✅ Done!');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
