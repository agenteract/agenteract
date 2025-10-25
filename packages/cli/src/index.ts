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
    'add-config <path> <name> <type>',
    'Add a config file to the current project',
    (yargs) => {
      return yargs.positional('path', {
        describe: 'project path',
        type: 'string',
      }).positional('name', {
        describe: 'project name: used as AgentDebugBridge projectName prop/param.',
        type: 'string',
      }).positional('type', {
        describe: 'project type',
        type: 'string',
      });
    },
    (argv) => {
      addConfig(process.cwd(), argv.path!, argv.name!, argv.type!).catch((error) => {
        console.error(error);
      });
    }
  )
  .strictCommands()
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();
