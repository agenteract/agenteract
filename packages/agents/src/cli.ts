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

// Flag to track if we've already shown the deprecation warning
let hasShownDeprecationWarning = false;

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
 * Get the default wait time from config with deprecation warning
 * Returns the configured waitLogTimeout, or shows a warning if using the legacy 500ms default
 */
async function getDefaultWaitTime(): Promise<number> {
  try {
    const config = await getConfig();

    // If waitLogTimeout is explicitly set in config, use it
    if (config.waitLogTimeout !== undefined) {
      return config.waitLogTimeout;
    }

    // Show deprecation warning once per session
    if (!hasShownDeprecationWarning) {
      console.warn('⚠️  DEPRECATION WARNING: The default wait time after agent commands will change from 500ms to 0ms in the next major version.');
      console.warn('   To silence this warning, add "waitLogTimeout" to your agenteract.config.js:');
      console.warn('     - Set to 500 to keep current behavior');
      console.warn('     - Set to 0 for immediate response (recommended for test scripts)');
      console.warn('   You can always override per-command with --wait flag.\n');
      hasShownDeprecationWarning = true;
    }

    // Legacy default
    return 500;
  } catch (error) {
    // If config can't be loaded, use legacy default without warning
    return 500;
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

const waitAndFetchLogs = async (agentServerUrl: string, project: string, waitMs: number | undefined, logCount: number) => {
  const actualWaitMs = waitMs !== undefined ? waitMs : await getDefaultWaitTime();

  if (actualWaitMs < 0) {
    return '';
  }

  if (actualWaitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, actualWaitMs));
  }

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
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const deviceParam = argv.device ? `&device=${encodeURIComponent(argv.device)}` : '';
        const response = await axios.get(`${agentServerUrl}/logs?project=${argv.project}&since=${argv.since}${deviceParam}`);
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
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'getViewHierarchy',
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);

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
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'tap',
          testID: argv.testID,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'input',
          testID: argv.testID,
          value: argv.value,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'scroll',
          testID: argv.testID,
          direction: argv.direction,
          amount: argv.amount,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'swipe',
          testID: argv.testID,
          direction: argv.direction,
          velocity: argv.velocity,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'longPress',
          testID: argv.testID,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
    'devices <project>',
    'List all connected devices for a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const response = await axios.get(`${agentServerUrl}/devices?project=${argv.project}`);
        const data = response.data;

        console.log(`\nConnected devices for '${data.project}':`);

        if (data.devices.length === 0) {
          console.log('  No devices connected');
          console.log('\nUse "agenteract connect" to pair a device');
          return;
        }

        data.devices.forEach((device: any) => {
          const isDefault = device.deviceId === data.defaultDevice;
          const defaultMark = isDefault ? ' (default)' : '';
          const deviceInfo = device.deviceInfo;

          if (deviceInfo) {
            console.log(`  • ${deviceInfo.deviceName} (${deviceInfo.deviceModel}, ${deviceInfo.osVersion}) [${device.deviceId}]${defaultMark}`);
          } else {
            console.log(`  • ${device.deviceId}${defaultMark}`);
          }
        });

        console.log(`\nTotal: ${data.totalConnected} device(s) connected`);

        if (data.totalConnected > 1) {
          console.log('\nUse --device flag to target specific device:');
          console.log(`  agenteract tap ${data.project} my-button --device <device-id>`);
          console.log('\nOr set default device:');
          console.log(`  agenteract set-current-device ${data.project} <device-id>`);
        }
      } catch (error) {
        handleRequestError(error);
      }
    }
  )
  .command(
    'set-current-device <project> <deviceId>',
    'Set the default device for a project',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('deviceId', {
          describe: 'Device identifier to set as default',
          type: 'string',
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        const { setDefaultDevice } = await import('@agenteract/core/node');
        await setDefaultDevice(argv.project, argv.deviceId);
        console.log(`✓ Set "${argv.deviceId}" as default device for project "${argv.project}"`);
      } catch (error: any) {
        console.error(`✗ Failed to set default device: ${error.message}`);
        process.exit(1);
      }
    }
  )
  .command(
    'agent-link <project> <url>',
    'Send an agentLink URL to the app (for app state control, navigation, etc.)',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('url', {
          describe: 'The agentLink URL (e.g., agenteract://reset_state or agenteract://navigate?screen=settings)',
          type: 'string',
          demandOption: true,
        })
        .option('wait', {
          alias: 'w',
          type: 'number',
          description: 'Milliseconds to wait before fetching logs',
        })
        .option('log-count', {
          alias: 'l',
          type: 'number',
          description: 'Number of log entries to fetch',
          default: 10,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device identifier (optional, uses default if not specified)',
        });
    },
    async (argv) => {
      try {
        const { agentServerUrl } = await getServerUrls();
        const requestBody: any = {
          project: argv.project,
          action: 'agentLink',
          payload: argv.url,
        };
        if (argv.device) {
          requestBody.device = argv.device;
        }
        const response = await axios.post(`${agentServerUrl}/gemini-agent`, requestBody);
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
    'launch <project>',
    'Launch an app on a device or simulator',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device ID (uses default device if not specified)',
        })
        .option('platform', {
          alias: 'p',
          type: 'string',
          choices: ['ios', 'android'],
          description: 'Platform filter (for multi-platform projects)',
        })
        .option('headless', {
          type: 'boolean',
          description: 'Run in headless mode (for web apps)',
          default: true,
        });
    },
    async (argv) => {
      try {
        const config = await getConfig();
        const project = config.projects.find(p => p.name === argv.project);
        
        if (!project) {
          console.error(`Project "${argv.project}" not found in config`);
          process.exit(1);
        }
        
        const {
          detectPlatform,
          resolveBundleInfo,
          getDefaultDeviceInfo,
          listDevices,
          launchApp,
        } = await import('@agenteract/core/node');
        
        const projectPath = path.resolve(process.cwd(), project.path);
        const platform = await detectPlatform(projectPath);
        
        console.log(`Detected platform: ${platform}`);
        
        // Resolve device
        let device = null;
        if (argv.device) {
          // Use specified device
          const allDevices = [
            ...(await listDevices('ios').catch(() => [])),
            ...(await listDevices('android').catch(() => [])),
          ];
          device = allDevices.find(d => d.id === argv.device) || null;
          if (!device) {
            console.error(`Device "${argv.device}" not found`);
            process.exit(1);
          }
        } else if (platform !== 'vite' && platform !== 'kmp-desktop') {
          // Get default device for mobile/iOS apps
          device = await getDefaultDeviceInfo(argv.project);
          if (!device) {
            console.error(`No default device set for project "${argv.project}"`);
            console.error('Set a default device with: agenteract-agents set-current-device <project> <deviceId>');
            process.exit(1);
          }
        }
        
        // Filter by platform if specified
        if (argv.platform && device && device.type !== argv.platform) {
          console.error(`Device "${device.name}" is ${device.type}, but platform filter is ${argv.platform}`);
          process.exit(1);
        }
        
        // Resolve bundle info
        const bundleInfo = await resolveBundleInfo(projectPath, platform, project.lifecycle, project.scheme);
        
        console.log(`Launching ${argv.project}...`);
        if (device) {
          console.log(`  Device: ${device.name} (${device.id})`);
        }
        
        const launchTimeout = project.lifecycle?.launchTimeout || 60000;
        const result = await launchApp(platform, device, bundleInfo, projectPath, launchTimeout);
        
        console.log('✓ App launched successfully');
        
        // Note: For web apps, the browser will remain open. User must stop manually.
        if (result.browser) {
          console.log('  Browser is running (use stop command to close)');
        }
        if (result.process) {
          console.log('  Process is running (use stop command to terminate)');
        }
      } catch (error) {
        console.error('✗ Failed to launch app:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  )
  .command(
    'stop <project>',
    'Stop a running app',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device ID (uses default device if not specified)',
        })
        .option('force', {
          alias: 'f',
          type: 'boolean',
          description: 'Force stop/kill the app',
          default: false,
        });
    },
    async (argv) => {
      try {
        const config = await getConfig();
        const project = config.projects.find(p => p.name === argv.project);
        
        if (!project) {
          console.error(`Project "${argv.project}" not found in config`);
          process.exit(1);
        }
        
        const {
          detectPlatform,
          resolveBundleInfo,
          getDefaultDeviceInfo,
          listDevices,
          stopAppInternal,
        } = await import('@agenteract/core/node');
        
        const projectPath = path.resolve(process.cwd(), project.path);
        const platform = await detectPlatform(projectPath);
        
        // Resolve device
        let device = null;
        if (argv.device) {
          const allDevices = [
            ...(await listDevices('ios').catch(() => [])),
            ...(await listDevices('android').catch(() => [])),
          ];
          device = allDevices.find(d => d.id === argv.device) || null;
        } else if (platform !== 'vite' && platform !== 'kmp-desktop') {
          device = await getDefaultDeviceInfo(argv.project);
        }
        
        const bundleInfo = await resolveBundleInfo(projectPath, platform, project.lifecycle, project.scheme);
        
        console.log(`Stopping ${argv.project}...`);
        await stopAppInternal(platform, device, bundleInfo, {}, argv.force);
        
        console.log('✓ App stopped successfully');
      } catch (error) {
        console.error('✗ Failed to stop app:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  )
  .command(
    'build <project>',
    'Build an app',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .option('platform', {
          alias: 'p',
          type: 'string',
          choices: ['ios', 'android'],
          description: 'Target platform (for multi-platform projects)',
        })
        .option('config', {
          alias: 'c',
          type: 'string',
          description: 'Build configuration (debug, release, or custom)',
          default: 'debug',
        });
    },
    async (argv) => {
      try {
        const config = await getConfig();
        const project = config.projects.find(p => p.name === argv.project);
        
        if (!project) {
          console.error(`Project "${argv.project}" not found in config`);
          process.exit(1);
        }
        
        const { detectPlatform, buildApp } = await import('@agenteract/core/node');
        
        const projectPath = path.resolve(process.cwd(), project.path);
        const platform = await detectPlatform(projectPath);
        
        console.log(`Building ${argv.project} (${platform})...`);
        
        await buildApp(projectPath, platform, {
          configuration: argv.config,
          platform: argv.platform as 'ios' | 'android' | undefined,
        });
        
        console.log('✓ Build completed successfully');
      } catch (error) {
        console.error('✗ Build failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  )
  .command(
    'setup <project> <action>',
    'Perform app setup operations (install, reinstall, clearData)',
    (yargs) => {
      return yargs
        .positional('project', {
          describe: 'Project name',
          type: 'string',
          demandOption: true,
        })
        .positional('action', {
          describe: 'Setup action',
          type: 'string',
          choices: ['install', 'reinstall', 'clearData'],
          demandOption: true,
        })
        .option('device', {
          alias: 'd',
          type: 'string',
          description: 'Device ID (uses default device if not specified)',
        })
        .option('platform', {
          alias: 'p',
          type: 'string',
          choices: ['ios', 'android'],
          description: 'Platform filter',
        });
    },
    async (argv) => {
      try {
        const config = await getConfig();
        const project = config.projects.find(p => p.name === argv.project);
        
        if (!project) {
          console.error(`Project "${argv.project}" not found in config`);
          process.exit(1);
        }
        
        const {
          detectPlatform,
          resolveBundleInfo,
          getDefaultDeviceInfo,
          listDevices,
          performSetup,
        } = await import('@agenteract/core/node');
        
        const projectPath = path.resolve(process.cwd(), project.path);
        const platform = await detectPlatform(projectPath);
        
        // Resolve device
        let device = null;
        if (argv.device) {
          const allDevices = [
            ...(await listDevices('ios').catch(() => [])),
            ...(await listDevices('android').catch(() => [])),
          ];
          device = allDevices.find(d => d.id === argv.device) || null;
        } else if (platform !== 'vite' && platform !== 'kmp-desktop') {
          device = await getDefaultDeviceInfo(argv.project);
        }
        
        const bundleInfo = await resolveBundleInfo(projectPath, platform, project.lifecycle, project.scheme);
        
        console.log(`Performing ${argv.action} for ${argv.project}...`);
        
        await performSetup(projectPath, platform, device, bundleInfo, {
          action: argv.action as 'install' | 'reinstall' | 'clearData',
          platform: argv.platform as 'ios' | 'android' | undefined,
        });
        
        console.log(`✓ ${argv.action} completed successfully`);
      } catch (error) {
        console.error(`✗ ${argv.action} failed:`, error instanceof Error ? error.message : String(error));
        process.exit(1);
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
