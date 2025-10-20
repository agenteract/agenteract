#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import axios from 'axios';

const agentServerUrl = 'http://localhost:8766/gemini-agent';
const expoServerUrl = 'http://localhost:8790';
const viteServerUrl = 'http://localhost:8791';

yargs(hideBin(process.argv))
  .command(
    'logs <project>',
    'Get logs from a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .option('since', {
          alias: 's',
          type: 'number',
          description: 'Number of lines to tail',
          default: 20,
        });
    },
    async (argv) => {
      try {
        const response = await axios.get(`${agentServerUrl}/logs?project=${argv.project}&since=${argv.since}`);
        console.log(response.data);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error getting logs:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .command(
    'dev-logs <type>',
    'Get logs from a dev server',
    (yargs) => {
      return yargs
        .positional('type', {
          describe: 'Dev server type (expo or vite)',
          type: 'string',
          demandOption: true,
          choices: ['expo', 'vite'],
        })
        .option('since', {
          alias: 's',
          type: 'number',
          description: 'Number of lines to tail',
          default: 20,
        });
    },
    async (argv) => {
      try {
        const url = argv.type === 'expo' ? expoServerUrl : viteServerUrl;
        const response = await axios.get(`${url}/logs?since=${argv.since}`);
        console.log(response.data);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error getting dev logs:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .command(
    'cmd <type> <command>',
    'Send a command to a dev server',
    (yargs) => {
      return yargs
        .positional('type', {
          describe: 'Dev server type (expo or vite)',
          type: 'string',
          demandOption: true,
          choices: ['expo', 'vite'],
        })
        .positional('command', {
          describe: 'Command to send',
          type: 'string',
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        const url = argv.type === 'expo' ? expoServerUrl : viteServerUrl;
        await axios.post(`${url}/cmd`, { cmd: argv.command });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error sending command:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .command(
    'hierarchy <project>',
    'Get the view hierarchy of a project',
    (yargs) => {
      return yargs.positional('project', {
        describe: 'Project name',
        type: 'string',
        demandOption: true,
      });
    },
    async (argv) => {
      try {
        const response = await axios.post(agentServerUrl, {
          project: argv.project,
          action: 'getViewHierarchy',
        });
        console.log(JSON.stringify(response.data, null, 2));
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error getting view hierarchy:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .command(
    'tap <project> <testID>',
    'Tap a component in a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('testID', {
          describe: 'The testID of the component to tap',
          type: 'string',
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        await axios.post(agentServerUrl, {
          project: argv.project,
          action: 'tap',
          testID: argv.testID,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error tapping component:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();