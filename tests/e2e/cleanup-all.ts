#!/usr/bin/env tsx
/**
 * Script to clean up ALL orphaned E2E test processes (Vite, Flutter, Expo)
 */

import { execSync } from 'child_process';
import { readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function killProcesses(pattern: string): void {
  try {
    if (process.platform === 'win32') {
      // On Windows, use taskkill with window title filtering
      // Note: This is a simplified approach - may need refinement for Windows
      execSync(`taskkill /F /FI "WINDOWTITLE eq *${pattern}*"`, { stdio: 'ignore' });
    } else {
      // On Unix, use pkill
      execSync(`pkill -f "${pattern}"`, { stdio: 'ignore' });
    }
  } catch {
    // Ignore errors (process might not exist)
  }
}

async function main() {
  console.log('🧹 Cleaning up ALL orphaned E2E test processes...');

  // Kill all agenteract dev processes from /tmp
  console.log('  Killing agenteract dev processes...');
  killProcesses('agenteract-e2e-test.*agenteract dev');

  // Kill all platform-specific CLI processes
  console.log('  Killing platform CLI processes...');
  killProcesses('@agenteract/vite.*--port');
  killProcesses('@agenteract/flutter-cli.*--port');
  killProcesses('@agenteract/expo.*--port');

  // Kill any remaining flutter run processes
  killProcesses('flutter run');

  // Wait for processes to die
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Clean up temp directories
  console.log('🗑️  Removing temp directories...');

  const tmpDir = tmpdir();
  const patterns = [
    /^agenteract-e2e-test-vite-/,
    /^agenteract-e2e-test-flutter-/,
    /^agenteract-e2e-test-expo-/,
    /^agenteract-e2e-vite-app-/,
    /^agenteract-e2e-flutter-app-/,
    /^agenteract-e2e-expo-app-/,
  ];

  try {
    const entries = readdirSync(tmpDir);
    for (const entry of entries) {
      if (patterns.some((pattern) => pattern.test(entry))) {
        const fullPath = join(tmpDir, entry);
        try {
          rmSync(fullPath, { recursive: true, force: true });
        } catch {
          // Ignore errors
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Also clean up the test directories in current directory
  try {
    const entries = readdirSync('.');
    for (const entry of entries) {
      if (entry.startsWith('.e2e-test-')) {
        try {
          rmSync(entry, { recursive: true, force: true });
        } catch {
          // Ignore errors
        }
      }
    }
  } catch {
    // Ignore errors
  }

  console.log('✅ Cleanup complete!');

  // Show any remaining E2E processes
  try {
    let remaining = '';
    if (process.platform === 'win32') {
      // On Windows, use tasklist
      try {
        const output = execSync(
          'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH',
          { encoding: 'utf-8' }
        );
        // Filter for E2E-related processes
        remaining = output
          .split('\n')
          .filter((line) => line.includes('agenteract-e2e') || line.includes('@agenteract'))
          .join('\n');
      } catch {
        // Ignore
      }
    } else {
      // On Unix, use ps and grep
      try {
        remaining = execSync(
          'ps aux | grep -E "agenteract-e2e|@agenteract/(vite|expo|flutter-cli)" | grep -v grep | grep -v cleanup-all',
          { encoding: 'utf-8' }
        );
      } catch {
        // grep returns non-zero if no matches
      }
    }

    if (remaining && remaining.trim()) {
      console.log('');
      console.log('⚠️  Some E2E processes may still be running:');
      console.log(remaining);
      console.log('');
      console.log('To forcefully kill them, run:');
      if (process.platform === 'win32') {
        console.log('  taskkill /F /IM node.exe');
      } else {
        console.log("  pkill -9 -f 'agenteract-e2e'");
      }
    } else {
      console.log('');
      console.log('✓ No orphaned E2E processes found');
    }
  } catch {
    // Ignore errors
    console.log('');
    console.log('✓ No orphaned E2E processes found');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
