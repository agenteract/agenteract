#!/usr/bin/env node
import { startFlutterPty } from './flutter-pty.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to run the PTY bridge on',
    default: 8792,
  })
  .option('cwd', {
    alias: 'c',
    type: 'string',
    description: 'Working directory (defaults to process.cwd())',
  })
  .argv;

// @ts-ignore - yargs argv types
const workingDir = argv.cwd || process.cwd();
// @ts-ignore
startFlutterPty(argv.port, workingDir);
