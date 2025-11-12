// packages/cli/src/config.ts
// todo(mribbons): combine with ../packages/agents/src/config.ts
import fs from 'fs/promises';
import path from 'path';

export class MissingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingConfigError';
  }
}

export interface DevServerConfig {
  command: string;        // e.g., 'npm run dev', 'flutter run', 'pnpm expo start'
  port: number;           // PTY bridge port
  cwd?: string;           // Override working directory (absolute or relative to project path)
  env?: Record<string, string>;  // Additional environment variables
  validation?: {
    fileExists?: string[];      // Pre-flight check: require files like ['pubspec.yaml']
    commandInPath?: string;     // Pre-flight check: require command in PATH like 'flutter'
    errorHints?: Record<string, string>;  // Custom error messages for common issues
  };
  keyCommands?: Record<string, string>;  // Interactive commands, e.g., { reload: 'r', restart: 'R' }
}

export interface ProjectConfig {
  name: string;
  path: string;
  // Deprecated: use devServer instead. Kept for backward compatibility.
  type?: 'expo' | 'vite' | 'flutter' | 'native' | 'auto';
  // Deprecated: use devServer.port instead. Kept for backward compatibility.
  ptyPort?: number;
  // New generic dev server configuration
  devServer?: DevServerConfig;
}

export interface AgenteractConfig {
  port: number;
  projects: ProjectConfig[];
}

export async function loadConfig(rootDir: string): Promise<AgenteractConfig> {
  const configPath = path.join(rootDir, 'agenteract.config.js');

  try {
    await fs.access(configPath);
  } catch (error) {
    throw new MissingConfigError('Agenteract config file not found');
  }

  // In a Jest environment, dynamic import() of file URLs can be tricky.
  // A simple and effective workaround is to read the file and evaluate it.
  // This avoids the module resolution issues within the test runner.
  const configContent = await fs.readFile(configPath, 'utf-8');

  // A simple regex to extract the default export object.
  // This is not a full parser, but it's robust enough for our config file format.
  const match = configContent.match(/export default (\{[\s\S]*\});/);
  if (!match) {
    console.error(`configContent: ${configContent}`);
    throw new Error('Could not parse agenteract.config.js. Make sure it has a default export.');
  }

  // We can use Function to evaluate the object literal.
  // It's safer than eval() because it doesn't have access to the outer scope.
  return new Function(`return ${match[1]}`)() as AgenteractConfig;
}

/**
 * Find the root directory containing agenteract.config.js
 * Searches upward from the current working directory
 */
export async function findConfigRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, 'agenteract.config.js');
    try {
      await fs.access(configPath);
      return currentDir;
    } catch {
      currentDir = path.dirname(currentDir);
    }
  }

  return null;
}

/**
 * Get the URL for the agent server
 */
export function getAgentServerUrl(config: AgenteractConfig): string {
  return `http://localhost:${config.port}`;
}

/**
 * Get the URL for a project's dev server
 */
export function getProjectServerUrl(config: AgenteractConfig, projectName: string): string | null {
  const project = config.projects.find(p => p.name === projectName);
  if (!project || !project.ptyPort) {
    return null;
  }
  return `http://localhost:${project.ptyPort}`;
}

/**
 * Get the URL for a dev server by type
 */
export function getDevServerUrlByType(config: AgenteractConfig, type: 'expo' | 'vite' | 'flutter'): string | null {
  const project = config.projects.find(p => p.type === type && p.ptyPort);
  if (!project) {
    return null;
  }
  return `http://localhost:${project.ptyPort}`;
}

export async function addConfig(
  rootDir: string,
  projectPath: string,
  name: string,
  typeOrCommand: string,
  port?: number
) {
  const configPath = path.join(rootDir, 'agenteract.config.js');
  let config: any;

  try {
    config = await loadConfig(rootDir);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      config = { port: 8766, projects: [] };
    } else {
      // For other errors (like parsing), we should not proceed.
      throw error;
    }
  }

  config.projects = config.projects || [];

  let nameExists = config.projects.find((p: any) => p.name === name);
  let pathExists = config.projects.find((p: any) => p.path === projectPath);

  if ((nameExists || pathExists) && nameExists !== pathExists) {
    console.error('project name and path exist across multiple projects. Please use a different name or path.');
    console.error(`name: ${name}, path: ${projectPath}`);
    return;
  }

  let update = nameExists || pathExists;

  // Determine if this is legacy format (type) or new format (command)
  const LEGACY_TYPES = ['expo', 'vite', 'flutter', 'native'];
  const isLegacyFormat = LEGACY_TYPES.includes(typeOrCommand);

  // Allocate a port if not provided
  let ptyPort: number;
  if (port) {
    // Explicit port provided
    ptyPort = port;
  } else if (update) {
    // Reuse existing port when updating
    ptyPort = (update as any).ptyPort || (update as any).devServer?.port || 8790;
  } else {
    // Find next available port for new project
    ptyPort = 8790;
    while (config.projects.some((p: any) =>
      (p.ptyPort === ptyPort) || (p.devServer?.port === ptyPort)
    )) {
      ptyPort++;
    }
  }

  let newProjectConfig: any;

  if (isLegacyFormat) {
    // Legacy format: use old 'type' field for backwards compatibility
    // Native apps don't have dev servers
    if (typeOrCommand === 'native') {
      newProjectConfig = {
        name,
        path: projectPath,
        type: 'native'
      };
    } else {
      // For non-native legacy types, create with new devServer format
      const preset = TYPE_PRESETS[typeOrCommand];
      if (!preset) {
        console.error(`Unknown type '${typeOrCommand}'`);
        return;
      }

      newProjectConfig = {
        name,
        path: projectPath,
        devServer: {
          ...preset,
          port: ptyPort
        }
      };

      console.log(`ℹ️  Creating config with new devServer format (migrated from legacy type '${typeOrCommand}')`);
    }
  } else {
    // New format: generic dev server command
    newProjectConfig = {
      name,
      path: projectPath,
      devServer: {
        command: typeOrCommand,
        port: ptyPort
      }
    };
  }

  // If the project already exists, replace it completely
  if (update) {
    // Find the index and replace the entire object to avoid keeping old fields
    const index = config.projects.indexOf(update);
    config.projects[index] = newProjectConfig;
  } else {
    config.projects.push(newProjectConfig);
  }

  await fs.writeFile(configPath, `export default ${JSON.stringify(config, null, 2)};`);

  console.log(`✅ Config updated: ${name} at ${projectPath}`);
  if (newProjectConfig.devServer) {
    console.log(`   Dev server: ${newProjectConfig.devServer.command} (port: ${newProjectConfig.devServer.port})`);
  }
}

/**
 * Type presets for backward compatibility
 * Maps old 'type' field to new devServer configuration
 */
export const TYPE_PRESETS: Record<string, Omit<DevServerConfig, 'port'>> = {
  expo: {
    command: 'npx expo start',
    keyCommands: { reload: 'r', ios: 'i', android: 'a' }
  },
  vite: {
    command: 'npx vite',
    keyCommands: { reload: 'r', quit: 'q' }
  },
  flutter: {
    command: 'flutter run',
    validation: {
      fileExists: ['pubspec.yaml'],
      commandInPath: 'flutter',
      errorHints: {
        'command not found': 'Install Flutter: https://flutter.dev/docs/get-started/install',
        'No pubspec.yaml': 'Flutter projects require a pubspec.yaml file in the project directory'
      }
    },
    keyCommands: { reload: 'r', restart: 'R', quit: 'q', help: 'h' }
  }
};

/**
 * Get default PTY port for a given type
 */
function getDefaultPortForType(type: string): number {
  const defaults: Record<string, number> = {
    expo: 8790,
    vite: 8791,
    flutter: 8792
  };
  return defaults[type] || 8790;
}

/**
 * Normalize project config: migrate old format to new format
 * Logs deprecation warnings when using old 'type' field
 */
export function normalizeProjectConfig(project: ProjectConfig, rootDir: string): ProjectConfig {
  // Already using new format
  if (project.devServer) {
    return project;
  }

  // Native type has no dev server
  if (project.type === 'native') {
    return project;
  }

  // Auto-migrate from old type-based format
  if (project.type && project.type !== 'auto') {
    console.warn(
      `⚠️  [${project.name}] Using deprecated 'type' field. ` +
      `Migrate to 'devServer' config. See docs/MIGRATION_V2.md`
    );

    const preset = TYPE_PRESETS[project.type];
    if (!preset) {
      console.error(`Unknown type '${project.type}' for project '${project.name}'`);
      return project;
    }

    return {
      ...project,
      devServer: {
        ...preset,
        port: project.ptyPort || getDefaultPortForType(project.type)
      }
    };
  }

  return project;
}
