#!/usr/bin/env node
import { startPty, PtyOptions } from './index.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface CliArgs {
    command: string;
    port: number;
    cwd?: string;
    validate?: string;  // JSON string of validation config
    env?: string;       // JSON string of env vars
}

const argv = yargs(hideBin(process.argv))
    .option('command', {
        alias: 'c',
        type: 'string',
        demandOption: true,
        description: 'Command to run in PTY (e.g., "npm run dev", "flutter run")'
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        demandOption: true,
        description: 'HTTP bridge port for /logs and /cmd endpoints'
    })
    .option('cwd', {
        type: 'string',
        description: 'Working directory (defaults to current directory)'
    })
    .option('validate', {
        type: 'string',
        description: 'JSON validation config (e.g., \'{"fileExists":["pubspec.yaml"]}\')'
    })
    .option('env', {
        type: 'string',
        description: 'JSON environment variables (e.g., \'{"NODE_ENV":"production"}\')'
    })
    .help()
    .parseSync() as CliArgs;

const options: PtyOptions = {
    command: argv.command,
    port: argv.port,
    cwd: argv.cwd
};

// Parse JSON options if provided
if (argv.validate) {
    try {
        options.validation = JSON.parse(argv.validate);
    } catch (error) {
        console.error('Failed to parse --validate JSON:', error);
        process.exit(1);
    }
}

if (argv.env) {
    try {
        options.env = JSON.parse(argv.env);
    } catch (error) {
        console.error('Failed to parse --env JSON:', error);
        process.exit(1);
    }
}

startPty(options);
