#!/usr/bin/env tsx
/**
 * Helper script to authenticate with Verdaccio
 * Replaces the bash/expect version to avoid needing to install expect in CI
 * Usage: npx tsx scripts/verdaccio-auth.ts
 */

import { spawn } from 'child_process';

const VERDACCIO_URL = process.env.VERDACCIO_URL || 'http://localhost:4873';
const VERDACCIO_USER = process.env.VERDACCIO_USER || 'test';
const VERDACCIO_PASS = process.env.VERDACCIO_PASS || 'test';
const VERDACCIO_EMAIL = process.env.VERDACCIO_EMAIL || 'test@test.com';

const TIMEOUT_MS = 30000;

async function authenticate(): Promise<void> {
  return new Promise((resolve, reject) => {
    const npmProcess = spawn('npm', ['adduser', '--registry', VERDACCIO_URL], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      npmProcess.kill();
      reject(new Error('❌ Authentication timed out'));
    }, TIMEOUT_MS);

    npmProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;

      if (text.includes('Username:')) {
        npmProcess.stdin?.write(`${VERDACCIO_USER}\n`);
      } else if (text.includes('Password:')) {
        npmProcess.stdin?.write(`${VERDACCIO_PASS}\n`);
      } else if (text.includes('Email:')) {
        npmProcess.stdin?.write(`${VERDACCIO_EMAIL}\n`);
      }
    });

    npmProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;

      if (text.includes('Username:')) {
        npmProcess.stdin?.write(`${VERDACCIO_USER}\n`);
      } else if (text.includes('Password:')) {
        npmProcess.stdin?.write(`${VERDACCIO_PASS}\n`);
      } else if (text.includes('Email:')) {
        npmProcess.stdin?.write(`${VERDACCIO_EMAIL}\n`);
      }
    });

    npmProcess.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        return;
      }

      if (code === 0 || output.includes('Logged in')) {
        console.log('✓ Authentication successful');
        resolve();
      } else if (output.includes('user registration disabled')) {
        reject(new Error('❌ User registration is disabled'));
      } else {
        reject(new Error(`❌ Authentication failed with code ${code}\n${output}`));
      }
    });

    npmProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`❌ Failed to spawn npm: ${error.message}`));
    });
  });
}

authenticate()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
