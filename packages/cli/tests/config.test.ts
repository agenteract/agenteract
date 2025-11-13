// packages/cli/tests/config.test.ts
import { loadConfig, addConfig } from '../src/config';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Config Loader', () => {
  it('should throw an error if the config file is not found', async () => {
    // We point it to a directory where we know the file doesn't exist
    const nonExistentPath = path.join(__dirname, 'non-existent-dir');
    await expect(loadConfig(nonExistentPath)).rejects.toThrow(
      'Agenteract config file not found'
    );
  });

  it('should load and parse the config file correctly', async () => {
    const mockConfigDir = path.join(__dirname, 'mocks');
    const config = await loadConfig(mockConfigDir);
    
    expect(config).toBeDefined();
    expect(config.port).toBe(9999);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe('mock-app');
  });
});

describe('addConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteract-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create a new config file if one does not exist', async () => {
    await addConfig(tempDir, './new-project', 'new-project', 'expo');
    const config = await loadConfig(tempDir);
    expect(config.projects).toHaveLength(1);
    // Legacy types are migrated to new devServer format
    expect(config.projects[0]).toEqual({
      name: 'new-project',
      path: './new-project',
      devServer: {
        command: 'npx expo start',
        keyCommands: {
          reload: 'r',
          ios: 'i',
          android: 'a',
        },
        port: 8790,
      },
    });
  });

  it('should add a new project to an existing config file', async () => {
    const initialConfig = {
      projects: [
        { name: 'existing-project', path: './existing', type: 'vite', ptyPort: 8790 },
      ],
    };
    await fs.writeFile(
      path.join(tempDir, 'agenteract.config.js'),
      `export default ${JSON.stringify(initialConfig, null, 2)};`
    );

    await addConfig(tempDir, './new-project', 'new-project', 'expo');
    const config = await loadConfig(tempDir);
    expect(config.projects).toHaveLength(2);
    // New project uses devServer format (migrated from legacy type)
    expect(config.projects[1]).toEqual({
      name: 'new-project',
      path: './new-project',
      devServer: {
        command: 'npx expo start',
        keyCommands: {
          reload: 'r',
          ios: 'i',
          android: 'a',
        },
        port: 8791,
      },
    });
  });

  it('should update an existing project by name', async () => {
    const initialConfig = {
      projects: [
        { name: 'my-app', path: './path', type: 'vite', ptyPort: 8790 },
      ],
    };
    await fs.writeFile(
      path.join(tempDir, 'agenteract.config.js'),
      `export default ${JSON.stringify(initialConfig, null, 2)};`
    );

    await addConfig(tempDir, './path', 'my-app', 'expo');
    const config = await loadConfig(tempDir);
    expect(config.projects).toHaveLength(1);
    // Updated project uses new devServer format
    expect(config.projects[0]).toEqual({
      name: 'my-app',
      path: './path',
      devServer: {
        command: 'npx expo start',
        keyCommands: {
          reload: 'r',
          ios: 'i',
          android: 'a',
        },
        port: 8790,
      },
    });
  });

  it('should assign a unique port in devServer', async () => {
    const initialConfig = {
      projects: [
        { name: 'app1', path: './app1', type: 'vite', ptyPort: 8790 },
        { name: 'app2', path: './app2', type: 'expo', ptyPort: 8791 },
      ],
    };
    await fs.writeFile(
      path.join(tempDir, 'agenteract.config.js'),
      `export default ${JSON.stringify(initialConfig, null, 2)};`
    );

    await addConfig(tempDir, './app3', 'app3', 'vite');
    const config = await loadConfig(tempDir);
    // New format uses devServer.port instead of ptyPort
    expect(config.projects[2].devServer?.port).toBe(8792);
  });

  it('new config file should include the agent server port in the config', async () => {
    await addConfig(tempDir, './app3', 'app3', 'vite');
    const config = await loadConfig(tempDir);
    expect(config.port).toBe(8766);
  });
});
