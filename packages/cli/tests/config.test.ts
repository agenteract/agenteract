// packages/cli/tests/config.test.ts
import { loadConfig } from '../src/config';
import path from 'path';

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
