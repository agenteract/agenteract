// packages/agents/src/config.ts
// todo(mribbons): combine with ../packages/cli/src/config.ts
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

  const configContent = await fs.readFile(configPath, 'utf-8');
  const match = configContent.match(/export default (\{[\s\S]*\});/);
  if (!match) {
    console.error(`configContent: ${configContent}`);
    throw new Error('Could not parse agenteract.config.js. Make sure it has a default export.');
  }

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
 * Get the URL for a dev server by type
 */
export function getDevServerUrlByType(config: AgenteractConfig, type: 'expo' | 'vite' | 'flutter'): string | null {
  const project = config.projects.find(p => p.type === type && p.ptyPort);
  if (!project) {
    return null;
  }
  return `http://localhost:${project.ptyPort}`;
}
