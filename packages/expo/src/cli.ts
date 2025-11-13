#!/usr/bin/env node
import { startPty } from '@agenteract/pty';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// DEPRECATION WARNING
console.warn('\n⚠️  DEPRECATION WARNING ⚠️');
console.warn('@agenteract/expo is deprecated and will be removed in a future version.');
console.warn('Please migrate to the generic PTY configuration in agenteract.config.js:');
console.warn('');
console.warn('  devServer: {');
console.warn('    command: "npx expo start",');
console.warn('    port: 8790');
console.warn('  }');
console.warn('');
console.warn('See docs/MIGRATION_V2.md for details.');
console.warn('');

const argv = yargs(hideBin(process.argv)).option('port', {
  alias: 'p',
  type: 'number',
  description: 'Port to run the PTY bridge on',
  default: 8790,
}).parseSync();

// Use new PTY API
startPty({
  command: 'npx expo start',
  port: argv.port,
  cwd: process.cwd()
});
