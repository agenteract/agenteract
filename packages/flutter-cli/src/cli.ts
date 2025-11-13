#!/usr/bin/env node
import { startPty } from '@agenteract/pty';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// DEPRECATION WARNING
console.warn('\n⚠️  DEPRECATION WARNING ⚠️');
console.warn('@agenteract/flutter-cli is deprecated and will be removed in a future version.');
console.warn('Please migrate to the generic PTY configuration in agenteract.config.js:');
console.warn('');
console.warn('  devServer: {');
console.warn('    command: "flutter run",');
console.warn('    port: 8792,');
console.warn('    validation: {');
console.warn('      fileExists: ["pubspec.yaml"],');
console.warn('      commandInPath: "flutter"');
console.warn('    }');
console.warn('  }');
console.warn('');
console.warn('See docs/MIGRATION_V2.md for details.');
console.warn('');

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
  .parseSync();

const workingDir = argv.cwd || process.cwd();

// Use new generic PTY API with Flutter validation
startPty({
  command: 'flutter run',
  port: argv.port,
  cwd: workingDir,
  validation: {
    fileExists: ['pubspec.yaml'],
    commandInPath: 'flutter',
    errorHints: {
      'command not found': 'Install Flutter: https://docs.flutter.dev/get-started/install',
      'No pubspec.yaml': 'Flutter projects require a pubspec.yaml file in the project directory'
    }
  }
});
