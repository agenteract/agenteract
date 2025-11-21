#!/usr/bin/env node
import yargs from 'yargs';

import { hideBin } from 'yargs/helpers';
import axios from 'axios';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findConfigRoot,
  loadConfig,
  getAgentServerUrl,
  getDevServerUrlByType,
  MissingConfigError,
  normalizeProjectConfig,
  type AgenteractConfig
} from './config.js';

// Cache for loaded config
let cachedConfig: AgenteractConfig | null = null;

/**
 * Load config with caching
 */
async function getConfig(): Promise<AgenteractConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configRoot = await findConfigRoot();
  if (!configRoot) {
    throw new MissingConfigError(
      'Could not find agenteract.config.js. Please run this command from within an Agenteract project.'
    );
  }

  cachedConfig = await loadConfig(configRoot);
  return cachedConfig;
}

/**
 * Get server URLs from config with fallback to defaults
 */
async function getServerUrls() {
  try {
    const config = await getConfig();
    return {
      agentServerUrl: getAgentServerUrl(config),
      expoServerUrl: getDevServerUrlByType(config, 'expo') || 'http://localhost:8790',
      viteServerUrl: getDevServerUrlByType(config, 'vite') || 'http://localhost:8791',
      flutterServerUrl: getDevServerUrlByType(config, 'flutter') || 'http://localhost:8792',
    };
  } catch (error) {
    // Fallback to default URLs if config can't be loaded
    if (error instanceof MissingConfigError) {
      console.warn('Warning: Using default server URLs. Config file not found.');
    }
    return {
      agentServerUrl: 'http://localhost:8766',
      expoServerUrl: 'http://localhost:8790',
      viteServerUrl: 'http://localhost:8791',
      flutterServerUrl: 'http://localhost:8792',
    };
  }
}

/**
 * Get list of projects that have dev servers (PTY)
 * Returns array of project names with dev servers configured
 */
async function getDevServerProjects(): Promise<string[]> {
  try {
    const config = await getConfig();
    const configRoot = await findConfigRoot();
    if (!configRoot) return [];

    const devServerProjects = config.projects
      .map(p => normalizeProjectConfig(p, configRoot))
      .filter(p => p.devServer || (p.type && p.type !== 'native'))
      .map(p => p.name);

    return devServerProjects;
  } catch (error) {
    return [];
  }
}

/**
 * Get dev server URL for a specific project name
 */
async function getDevServerUrlByProject(projectName: string): Promise<string | null> {
  try {
    const config = await getConfig();
    const configRoot = await findConfigRoot();
    if (!configRoot) return null;

    const project = config.projects.find(p => p.name === projectName);
    if (!project) return null;

    const normalized = normalizeProjectConfig(project, configRoot);

    // New format: devServer.port
    if (normalized.devServer) {
      return `http://localhost:${normalized.devServer.port}`;
    }

    // Legacy format: ptyPort
    if (normalized.ptyPort) {
      return `http://localhost:${normalized.ptyPort}`;
    }

    return null;
  } catch (error) {
    return null;
  }
}

const handleRequestError = (error: any) => {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      console.error('Error getting logs:', error.message);
    } else {
      console.error('An unknown error occurred');
    }
    return;
  }

  if (error.code === 'ECONNREFUSED') {
    console.error('Could not connect to the agent server. Please run npx @agenteract/cli dev to start the development environment.');
  } else if (error.response?.status === 503) {
    const responseData = error.response.data;
    let errorMessage = `Error: ${responseData.error}`;
    if (responseData.availableProjects && responseData.availableProjects.length > 0) {
      errorMessage += `\nAvailable projects: ${responseData.availableProjects.join(', ')}`;
    } else {
      errorMessage += '\nNo projects are currently connected to the agent server.';
    }
    console.error(errorMessage);
  } else {
    console.error(`Error connecting to the agent server: ${error.code}`);
  }
}

const waitAndFetchLogs = async (agentServerUrl: string, project: string, waitMs: number, logCount: number) => {
  await new Promise(resolve => setTimeout(resolve, waitMs));
  try {
    const response = await axios.get(`${agentServerUrl}/logs?project=${project}&since=${logCount}`);
    return response.data;
  } catch (error) {
    // Return empty string if we can't fetch logs, but don't fail the whole operation
    return '';
  }
}

const filterHierarchy = (node: any, key: string, value: string): any[] => {
  const matches: any[] = [];

  const traverse = (current: any): boolean => {
    if (!current || typeof current !== 'object') {
      return false;
    }

    // Check if current node matches the filter
    if (current[key] === value) {
      matches.push(current);
      return true;
    }

    // If this is an array, check each element
    if (Array.isArray(current)) {
      for (const item of current) {
        traverse(item);
      }
      return false;
    }

    // Traverse all properties of the object
    for (const prop in current) {
      if (current.hasOwnProperty(prop)) {
        traverse(current[prop]);
      }
    }

    return false;
  };

  traverse(node);
  return matches;
}

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
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.get(`${agentServerUrl}/logs?project=${argv.project}&since=${argv.since}`);
        console.log(JSON.stringify(response.data));
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'dev-logs <project>',
    'Get logs from a dev server (PTY logs, not app runtime logs)',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name (from agenteract.config.js)',
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
        const url = await getDevServerUrlByProject(argv.project);

        if (!url) {
          console.error(`Project '${argv.project}' not found or has no dev server configured.`);
          console.error('Available projects with dev servers:');
          const projects = await getDevServerProjects();
          projects.forEach(p => console.error(`  - ${p}`));
          process.exit(1);
        }

        const response = await axios.get(`${url}/logs?since=${argv.since}`);
        console.log(response.data);
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'cmd <project> <command>',
    'Send a command (keystroke) to a dev server PTY',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name (from agenteract.config.js)',
          type: 'string',
          demandOption: true,
        })
        .positional('command', {
          describe: 'Command to send (e.g., "r" for reload)',
          type: 'string',
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        const url = await getDevServerUrlByProject(argv.project);

        if (!url) {
          console.error(`Project '${argv.project}' not found or has no dev server configured.`);
          console.error('Available projects with dev servers:');
          const projects = await getDevServerProjects();
          projects.forEach(p => console.error(`  - ${p}`));
          process.exit(1);
        }

        await axios.post(`${url}/cmd`, { cmd: argv.command });
        console.log(`✓ Sent command '${argv.command}' to ${argv.project}`);
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'hierarchy <project>',
    'Get the view hierarchy of a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('filter-key', {
          alias: 'k',
          type: 'string',
          description: 'Filter hierarchy by key (e.g., testID, type)',
        })
        .option('filter-value', {
          alias: 'v',
          type: 'string',
          description: 'Filter hierarchy by value (used with filter-key)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'getViewHierarchy',
        });

        let outputData = response.data;

        // Apply client-side filtering if both key and value are provided
        if (argv.filterKey && argv.filterValue) {
          const matches = filterHierarchy(outputData, argv.filterKey, argv.filterValue);
          if (matches.length > 0) {
            outputData = matches.length === 1 ? matches[0] : matches;
          } else {
            console.log(`No matches found for ${argv.filterKey}=${argv.filterValue}`);
            return;
          }
        }

        // don't pretty print the response, keep it small
        // Note: tried yaml but it is less compact due to spaces
        console.log(JSON.stringify(outputData));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
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
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'tap',
          testID: argv.testID,
        });
        console.log(JSON.stringify(response.data));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'input <project> <testID> <value>',
    'Input text into a component in a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('testID', {
          describe: 'The testID of the input component',
          type: 'string',
          demandOption: true,
        })
        .positional('value', {
          describe: 'The text value to input',
          type: 'string',
          demandOption: true,
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'input',
          testID: argv.testID,
          value: argv.value,
        });
        console.log(JSON.stringify(response.data));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'scroll <project> <testID> <direction> [amount]',
    'Scroll a component in a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('testID', {
          describe: 'The testID of the scrollable component',
          type: 'string',
          demandOption: true,
        })
        .positional('direction', {
          describe: 'Scroll direction',
          type: 'string',
          choices: ['up', 'down', 'left', 'right'],
          demandOption: true,
        })
        .positional('amount', {
          describe: 'Amount to scroll in pixels',
          type: 'number',
          default: 100,
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'scroll',
          testID: argv.testID,
          direction: argv.direction,
          amount: argv.amount,
        });
        console.log(JSON.stringify(response.data));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'swipe <project> <testID> <direction> [velocity]',
    'Swipe gesture on a component in a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('testID', {
          describe: 'The testID of the component to swipe on',
          type: 'string',
          demandOption: true,
        })
        .positional('direction', {
          describe: 'Swipe direction',
          type: 'string',
          choices: ['up', 'down', 'left', 'right'],
          demandOption: true,
        })
        .positional('velocity', {
          describe: 'Swipe velocity',
          type: 'string',
          choices: ['slow', 'medium', 'fast'],
          default: 'medium',
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'swipe',
          testID: argv.testID,
          direction: argv.direction,
          velocity: argv.velocity,
        });
        console.log(JSON.stringify(response.data));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'longPress <project> <testID>',
    'Long press a component in a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('testID', {
          describe: 'The testID of the component to long press',
          type: 'string',
          demandOption: true,
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
          default: 500,
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, {
          project: argv.project,
          action: 'longPress',
          testID: argv.testID,
        });
        console.log(JSON.stringify(response.data));

        // Wait and fetch logs
        const logs = await waitAndFetchLogs(agentServerUrl, argv.project, argv.wait, argv.logCount);
        if (logs) {
          console.log('\n--- Console Logs ---');
          console.log(logs);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'md [dest]',
    'Generate agent instructions',
    (yargs) => {
      return yargs
        .positional('dest', {
          describe: 'Destination file',
          type: 'string',
          default: 'AGENTS.md',
        });
    },
    async (argv) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // This path is relative to the dist/cli.js file after compilation
      const sourcePath = path.resolve(__dirname, 'AGENTS.md');
      const destPath = path.join(process.cwd(), argv.dest);

      try {
        if (!fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, fs.readFileSync(sourcePath, 'utf8'));
        } else {
          console.log(`${argv.dest} already exists, appending to it.`);
          fs.appendFileSync(destPath, '\n' + fs.readFileSync(sourcePath, 'utf8'));
        }
        console.log(`${argv.dest} has been created in your project root.`);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error generating agent instructions:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    }
  )
  .strictCommands()
  .demandCommand(1, 'You must provide a valid command.')
  .help()
  .parse();
