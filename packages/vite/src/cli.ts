#!/usr/bin/env node
import { startPty } from '@agenteract/pty';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv)).option('port', {
  alias: 'p',
  type: 'number',
  description: 'Port to run the PTY bridge on',
  default: 8791,
}).argv;

// Let startPty handle the invoker detection
// Just pass the actual command to run
// Pass process.cwd() explicitly to ensure it runs in the correct directory
// @ts-ignore - yargs argv is not strictly a number, but we know it is.
startPty('vite', [], argv.port, process.cwd());