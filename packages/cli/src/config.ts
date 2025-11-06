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

export interface ProjectConfig {
  name: string;
  path: string;
  type: 'expo' | 'vite' | 'flutter' | 'native' | 'auto';
  ptyPort: number;
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

export async function addConfig(rootDir: string, projectPath: string, name: string, type: string) {
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

  // if the project already exists, update it
  if (update) {
    update.path = projectPath;
    update.name = name;
    update.type = type;
  } else {
    let ptyPort = 8790;
  
    while (config.projects.some((p: any) => p.ptyPort === ptyPort)) {
      ptyPort++;
    }
    config.projects.push({ name, path: projectPath, type, ptyPort });
  }
  await fs.writeFile(configPath, `export default ${JSON.stringify(config, null, 2)};`);
}
