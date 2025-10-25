#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runDevCommand } from './commands/dev.js';

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
  .strictCommands()
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();
