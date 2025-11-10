#!/usr/bin/env node
import { startPty } from '@agenteract/pty';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// DEPRECATION WARNING
console.warn('\n⚠️  DEPRECATION WARNING ⚠️');
console.warn('@agenteract/vite is deprecated and will be removed in a future version.');
console.warn('Please migrate to the generic PTY configuration in agenteract.config.js:');
console.warn('');
console.warn('  devServer: {');
console.warn('    command: "npx vite",');
console.warn('    port: 8791');
console.warn('  }');
console.warn('');
console.warn('See docs/MIGRATION_V2.md for details.');
console.warn('');

const argv = yargs(hideBin(process.argv)).option('port', {
  alias: 'p',
  type: 'number',
  description: 'Port to run the PTY bridge on',
  default: 8791,
}).parseSync();

// Use new PTY API
startPty({
  command: 'npx vite',
  port: argv.port,
  cwd: process.cwd()
});