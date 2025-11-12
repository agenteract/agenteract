#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runDevCommand } from './commands/dev.js';
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
      });
    },
    (argv) => {
      addConfig(process.cwd(), argv.path!, argv.name!, argv.typeOrCommand!, argv.port).catch((error) => {
        console.error(error);
      });
    }
  )
  .strictCommands()
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();
