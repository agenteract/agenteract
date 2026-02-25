#!/usr/bin/env node
import { resetPNPMWorkspaceCWD } from '@agenteract/core/node';
resetPNPMWorkspaceCWD();

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { runDevCommand } from './commands/dev.js';
import { runConnectCommand } from './commands/connect.js';
import { runHierarchyCommand } from './commands/hierarchy.js';
import { addConfig } from './config.js';

yargs(hideBin(process.argv))
  .command(
    'dev',
    'Start the Agenteract development environment',
    (yargs) => {
      return yargs.option('config', {
        alias: 'c',
        type: 'string',
        description: 'Path to the agenteract.config.js file',
        default: './agenteract.config.js',
      });
    },
    (argv) => {
      runDevCommand(argv);
    }
  )
  .command(
    'connect [scheme]',
    'Pair a device/simulator with the running server via Deep Link',
    (yargs) => {
      return yargs
        .positional('scheme', {
          describe: 'The URL scheme of your app (e.g. "expo-app" or "myapp"). Optional if configured via add-config --scheme.',
          type: 'string',
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device ID (UDID/serial) to send the link to (skips interactive menu)',
        })
        .option('all', {
          alias: 'a',
          type: 'boolean',
          description: 'Send the deep link to all detected devices',
          default: false,
        })
        .option('qr-only', {
          alias: 'q',
          type: 'boolean',
          description: 'Only display the QR code without attempting to open on devices',
          default: false,
        });
    },
    (argv) => {
      runConnectCommand({
        scheme: argv.scheme,
        device: argv.device,
        all: argv.all,
        qrOnly: argv.qrOnly,
      }).catch(console.error);
    }
  )
  .command(
    'add-config <path> <name> <typeOrCommand> [port]',
    'Add a config file to the current project',
    (yargs) => {
      return yargs.positional('path', {
        describe: 'project path',
        type: 'string',
      }).positional('name', {
        describe: 'project name: used as AgentDebugBridge projectName prop/param.',
        type: 'string',
      }).positional('typeOrCommand', {
        describe: 'Legacy: project type (expo/vite/flutter/native) OR New: dev server command (e.g., "npm run dev")',
        type: 'string',
      }).positional('port', {
        describe: 'PTY bridge port (optional, defaults to 8790+)',
        type: 'number',
      }).option('scheme', {
        alias: 's',
        type: 'string',
        description: 'URL scheme for deep linking (e.g., "myapp")',
      }).option('wait-log-timeout', {
        alias: 'w',
        type: 'number',
        description: 'Default wait time for logs after agent commands (-1: no fetch, 0: immediate, >0: ms)',
        default: -1,
      });
    },
    (argv) => {
      console.log(`[cli] add-config argv:`, JSON.stringify(argv));
      const waitLogTimeout = argv['wait-log-timeout'] as number | undefined;
      addConfig(process.cwd(), argv.path!, argv.name!, argv.typeOrCommand!, argv.port, argv.scheme, waitLogTimeout).catch((error) => {
        console.error(error);
      });
    }
  )
  .command(
    'hierarchy <project> <subcommand> [arg]',
    'Query the live view hierarchy of a running project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name (matches the name in agenteract.config.js)',
          type: 'string',
          demandOption: true,
        })
        .positional('subcommand', {
          describe: 'Subcommand: texts | testids | find-text | find-name | find-testid | path | dump',
          type: 'string',
          demandOption: true,
          choices: ['texts', 'testids', 'find-text', 'find-name', 'find-testid', 'path', 'dump'],
        })
        .positional('arg', {
          describe: 'Pattern or testID argument (required for find-text, find-name, find-testid, path)',
          type: 'string',
        })
        .option('port', {
          alias: 'p',
          type: 'number',
          description: 'WebSocket port of the Agenteract server (default: from runtime config or 8765)',
        })
        .option('include-numbers', {
          type: 'boolean',
          description: 'Include pure numeric text values (used with "texts" subcommand)',
          default: false,
        })
        .option('include-object-strings', {
          type: 'boolean',
          description: 'Include "[object Object]" noise strings (used with "texts" subcommand)',
          default: false,
        });
    },
    (argv) => {
      const subcommand = argv.subcommand as string;
      const arg = argv.arg as string | undefined;

      // Determine whether arg is a pattern or a testID based on subcommand
      const isTestIDCommand = subcommand === 'find-testid' || subcommand === 'path';

      runHierarchyCommand({
        project: argv.project as string,
        command: subcommand,
        pattern: isTestIDCommand ? undefined : arg,
        testID: isTestIDCommand ? arg : undefined,
        port: argv.port,
        includeNumbers: argv['include-numbers'] as boolean,
        includeObjectStrings: argv['include-object-strings'] as boolean,
      }).catch(console.error);
    }
  )
  .strictCommands()
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();
