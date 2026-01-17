// packages/cli/tests/wait-log-timeout.test.ts
import { loadConfig, addConfig } from '../src/config';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('waitLogTimeout configuration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteract-timeout-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('addConfig with waitLogTimeout', () => {
    it('should set waitLogTimeout to 0 when passed as parameter', async () => {
      await addConfig(tempDir, './test-app', 'test-app', 'vite', undefined, undefined, 0);
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(0);
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].name).toBe('test-app');
    });

    it('should set waitLogTimeout to 500 when passed as parameter', async () => {
      await addConfig(tempDir, './test-app', 'test-app', 'expo', undefined, undefined, 500);
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(500);
    });

    it('should set waitLogTimeout to -1 when passed as parameter', async () => {
      await addConfig(tempDir, './test-app', 'test-app', 'native', undefined, undefined, -1);
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(-1);
    });

    it('should not set waitLogTimeout when undefined is passed', async () => {
      await addConfig(tempDir, './test-app', 'test-app', 'vite', undefined, undefined, undefined);
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBeUndefined();
    });

    it('should update waitLogTimeout when adding a new project to existing config', async () => {
      // Create initial config without waitLogTimeout
      const initialConfig = {
        port: 8766,
        projects: [
          { name: 'existing-app', path: './existing', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(initialConfig, null, 2)};`
      );

      // Add new project with waitLogTimeout
      await addConfig(tempDir, './new-app', 'new-app', 'expo', undefined, undefined, 0);
      const config = await loadConfig(tempDir);

      expect(config.waitLogTimeout).toBe(0);
      expect(config.projects).toHaveLength(2);
    });

    it('should override existing waitLogTimeout when adding project with new timeout', async () => {
      // Create initial config with waitLogTimeout: 500
      const initialConfig = {
        port: 8766,
        waitLogTimeout: 500,
        projects: [
          { name: 'existing-app', path: './existing', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(initialConfig, null, 2)};`
      );

      // Add new project with waitLogTimeout: 0
      await addConfig(tempDir, './new-app', 'new-app', 'expo', undefined, undefined, 0);
      const config = await loadConfig(tempDir);

      expect(config.waitLogTimeout).toBe(0); // Should be overridden
      expect(config.projects).toHaveLength(2);
    });

    it('should preserve existing waitLogTimeout when adding project without timeout parameter', async () => {
      // Create initial config with waitLogTimeout: 500
      const initialConfig = {
        port: 8766,
        waitLogTimeout: 500,
        projects: [
          { name: 'existing-app', path: './existing', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(initialConfig, null, 2)};`
      );

      // Add new project without waitLogTimeout parameter
      await addConfig(tempDir, './new-app', 'new-app', 'expo', undefined, undefined, undefined);
      const config = await loadConfig(tempDir);

      expect(config.waitLogTimeout).toBe(500); // Should be preserved
      expect(config.projects).toHaveLength(2);
    });

    it('should handle updating existing project while setting waitLogTimeout', async () => {
      // Create initial config
      const initialConfig = {
        port: 8766,
        projects: [
          { name: 'my-app', path: './my-app', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(initialConfig, null, 2)};`
      );

      // Update the project and set waitLogTimeout
      await addConfig(tempDir, './my-app', 'my-app', 'expo', undefined, undefined, 0);
      const config = await loadConfig(tempDir);

      expect(config.waitLogTimeout).toBe(0);
      expect(config.projects).toHaveLength(1); // Still only one project
      expect(config.projects[0].name).toBe('my-app');
    });

    it('should accept custom dev command with waitLogTimeout', async () => {
      await addConfig(
        tempDir,
        './custom-app',
        'custom-app',
        'npm run custom-dev',
        undefined,
        undefined,
        250
      );
      const config = await loadConfig(tempDir);

      expect(config.waitLogTimeout).toBe(250);
      expect(config.projects[0].devServer?.command).toBe('npm run custom-dev');
    });
  });

  describe('loadConfig with waitLogTimeout', () => {
    it('should load waitLogTimeout from existing config file', async () => {
      const configWithTimeout = {
        port: 8766,
        waitLogTimeout: 100,
        projects: [
          { name: 'test-app', path: './test-app', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(configWithTimeout, null, 2)};`
      );

      const config = await loadConfig(tempDir);
      expect(config.waitLogTimeout).toBe(100);
    });

    it('should return undefined waitLogTimeout if not present in config', async () => {
      const configWithoutTimeout = {
        port: 8766,
        projects: [
          { name: 'test-app', path: './test-app', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(configWithoutTimeout, null, 2)};`
      );

      const config = await loadConfig(tempDir);
      expect(config.waitLogTimeout).toBeUndefined();
    });

    it('should handle waitLogTimeout: 0 correctly (not falsy)', async () => {
      const configWithZeroTimeout = {
        port: 8766,
        waitLogTimeout: 0,
        projects: [
          { name: 'test-app', path: './test-app', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(configWithZeroTimeout, null, 2)};`
      );

      const config = await loadConfig(tempDir);
      expect(config.waitLogTimeout).toBe(0);
      expect(config.waitLogTimeout).not.toBeUndefined();
    });

    it('should handle waitLogTimeout: -1 correctly', async () => {
      const configWithNegativeTimeout = {
        port: 8766,
        waitLogTimeout: -1,
        projects: [
          { name: 'test-app', path: './test-app', type: 'vite', ptyPort: 8790 },
        ],
      };
      await fs.writeFile(
        path.join(tempDir, 'agenteract.config.js'),
        `export default ${JSON.stringify(configWithNegativeTimeout, null, 2)};`
      );

      const config = await loadConfig(tempDir);
      expect(config.waitLogTimeout).toBe(-1);
    });
  });

  describe('edge cases', () => {
    it('should handle very large timeout values', async () => {
      await addConfig(tempDir, './test-app', 'test-app', 'vite', undefined, undefined, 999999);
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(999999);
    });

    it('should handle timeout with scheme parameter', async () => {
      await addConfig(
        tempDir,
        './test-app',
        'test-app',
        'expo',
        undefined,
        'myapp',
        300
      );
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(300);
      expect(config.projects[0].scheme).toBe('myapp');
    });

    it('should handle timeout with port parameter', async () => {
      await addConfig(
        tempDir,
        './test-app',
        'test-app',
        'vite',
        8800,
        undefined,
        150
      );
      const config = await loadConfig(tempDir);
      
      expect(config.waitLogTimeout).toBe(150);
      expect(config.projects[0].devServer?.port).toBe(8800);
    });
  });
});
