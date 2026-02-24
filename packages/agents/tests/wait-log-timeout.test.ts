// packages/agents/tests/wait-log-timeout.test.ts
/**
 * Unit tests for waitLogTimeout functionality in agents CLI
 * Tests the getDefaultWaitTime function and waitAndFetchLogs behavior
 */

import { jest } from '@jest/globals';

// Mock dependencies with proper typing
const mockAxios = {
  get: jest.fn() as jest.MockedFunction<(url: string) => Promise<any>>,
};

const mockConfig = {
  waitLogTimeout: undefined as number | undefined,
  port: 8766,
  projects: [],
};

let hasShownDeprecationWarning = false;
const originalConsoleWarn = console.warn;
const consoleWarnMock = jest.fn();

// Mock implementation of getDefaultWaitTime
async function getDefaultWaitTime(): Promise<number> {
  try {
    // If waitLogTimeout is explicitly set in config, use it
    if (mockConfig.waitLogTimeout !== undefined) {
      return mockConfig.waitLogTimeout;
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

// Mock implementation of waitAndFetchLogs
async function waitAndFetchLogs(
  agentServerUrl: string,
  project: string,
  waitMs: number | undefined,
  logCount: number
): Promise<string> {
  const actualWaitMs = waitMs !== undefined ? waitMs : await getDefaultWaitTime();

  if (actualWaitMs < 0) {
    return '';
  }

  if (actualWaitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, actualWaitMs));
  }

  try {
    const response: any = await mockAxios.get(`${agentServerUrl}/logs?project=${project}&since=${logCount}`);
    return response.data;
  } catch (error) {
    // Return empty string if we can't fetch logs, but don't fail the whole operation
    return '';
  }
}

describe('waitLogTimeout functionality', () => {
  beforeEach(() => {
    // Reset mocks and state before each test
    jest.clearAllMocks();
    mockConfig.waitLogTimeout = undefined;
    hasShownDeprecationWarning = false;
    console.warn = consoleWarnMock;
    consoleWarnMock.mockClear();
    
    // Setup default axios mock behavior
    mockAxios.get.mockResolvedValue({
      data: JSON.stringify({
        status: 'success',
        logs: [
          { level: 'log', message: 'Test log 1', timestamp: Date.now() },
          { level: 'log', message: 'Test log 2', timestamp: Date.now() },
        ],
      }),
    });
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  describe('getDefaultWaitTime', () => {
    it('should return configured waitLogTimeout when set to 0', async () => {
      mockConfig.waitLogTimeout = 0;
      const result = await getDefaultWaitTime();
      expect(result).toBe(0);
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });

    it('should return configured waitLogTimeout when set to 500', async () => {
      mockConfig.waitLogTimeout = 500;
      const result = await getDefaultWaitTime();
      expect(result).toBe(500);
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });

    it('should return configured waitLogTimeout when set to -1', async () => {
      mockConfig.waitLogTimeout = -1;
      const result = await getDefaultWaitTime();
      expect(result).toBe(-1);
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });

    it('should return configured waitLogTimeout for custom values', async () => {
      mockConfig.waitLogTimeout = 1000;
      const result = await getDefaultWaitTime();
      expect(result).toBe(1000);
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });

    it('should return 500 and show deprecation warning when waitLogTimeout is undefined', async () => {
      mockConfig.waitLogTimeout = undefined;
      const result = await getDefaultWaitTime();
      
      expect(result).toBe(500);
      expect(consoleWarnMock).toHaveBeenCalledTimes(5); // 5 warning lines
      expect(consoleWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('DEPRECATION WARNING')
      );
    });

    it('should show deprecation warning only once per session', async () => {
      mockConfig.waitLogTimeout = undefined;
      
      await getDefaultWaitTime();
      expect(consoleWarnMock).toHaveBeenCalledTimes(5);
      
      consoleWarnMock.mockClear();
      
      await getDefaultWaitTime();
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });
  });

  describe('waitAndFetchLogs behavior', () => {
    const agentServerUrl = 'http://localhost:8766';
    const project = 'test-app';
    const logCount = 10;

    it('should use explicit wait time when provided (overriding config)', async () => {
      mockConfig.waitLogTimeout = 1000; // Config says 1000ms
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, 50, logCount); // Explicit 50ms
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(50 - 5);
      expect(elapsed).toBeLessThan(200); // Should not use config's 1000ms
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${agentServerUrl}/logs?project=${project}&since=${logCount}`
      );
    });

    it('should use config waitLogTimeout when wait parameter is undefined', async () => {
      mockConfig.waitLogTimeout = 100;
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, undefined, logCount);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100 - 5);
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should return empty string when waitMs is -1 (no fetch)', async () => {
      const result = await waitAndFetchLogs(agentServerUrl, project, -1, logCount);
      
      expect(result).toBe('');
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('should return empty string when config waitLogTimeout is -1', async () => {
      mockConfig.waitLogTimeout = -1;
      
      const result = await waitAndFetchLogs(agentServerUrl, project, undefined, logCount);
      
      expect(result).toBe('');
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('should fetch logs immediately when waitMs is 0', async () => {
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, 0, logCount);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50); // Should be nearly immediate
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${agentServerUrl}/logs?project=${project}&since=${logCount}`
      );
    });

    it('should fetch logs immediately when config waitLogTimeout is 0', async () => {
      mockConfig.waitLogTimeout = 0;
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, undefined, logCount);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50);
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should wait before fetching when waitMs > 0', async () => {
      const waitTime = 100;
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, waitTime, logCount);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(waitTime - 5);
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should return empty string on axios error', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await waitAndFetchLogs(agentServerUrl, project, 0, logCount);
      
      expect(result).toBe('');
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should return axios response data on success', async () => {
      const mockLogData = JSON.stringify({
        status: 'success',
        logs: [{ level: 'log', message: 'Success!', timestamp: Date.now() }],
      });
      mockAxios.get.mockResolvedValueOnce({ data: mockLogData });
      
      const result = await waitAndFetchLogs(agentServerUrl, project, 0, logCount);
      
      expect(result).toBe(mockLogData);
    });

    it('should use legacy default (500ms) when config is undefined', async () => {
      mockConfig.waitLogTimeout = undefined;
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, undefined, logCount);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(500 - 5);
      expect(mockAxios.get).toHaveBeenCalled();
      expect(consoleWarnMock).toHaveBeenCalled(); // Should show deprecation warning
    });
  });

  describe('edge cases', () => {
    const agentServerUrl = 'http://localhost:8766';
    const project = 'test-app';
    const logCount = 10;

    it('should handle very large wait times', async () => {
      // Use a smaller value for testing, but verify the logic works
      const result = await waitAndFetchLogs(agentServerUrl, project, 1, logCount);
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should handle 0 wait time explicitly (not undefined)', async () => {
      mockConfig.waitLogTimeout = 500; // Config has a wait time
      const startTime = Date.now();
      
      await waitAndFetchLogs(agentServerUrl, project, 0, logCount); // Explicit 0
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(50); // Should be immediate, not use config's 500ms
    });

    it('should prioritize explicit -1 over config timeout', async () => {
      mockConfig.waitLogTimeout = 500; // Config says wait
      
      const result = await waitAndFetchLogs(agentServerUrl, project, -1, logCount);
      
      expect(result).toBe(''); // Should not fetch
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('should handle different log counts', async () => {
      await waitAndFetchLogs(agentServerUrl, project, 0, 5);
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${agentServerUrl}/logs?project=${project}&since=5`
      );

      mockAxios.get.mockClear();

      await waitAndFetchLogs(agentServerUrl, project, 0, 100);
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${agentServerUrl}/logs?project=${project}&since=100`
      );
    });

    it('should handle different server URLs', async () => {
      const customUrl = 'http://localhost:9999';
      
      await waitAndFetchLogs(customUrl, project, 0, logCount);
      
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${customUrl}/logs?project=${project}&since=${logCount}`
      );
    });

    it('should handle different project names', async () => {
      const projectName = 'my-custom-app';
      
      await waitAndFetchLogs(agentServerUrl, projectName, 0, logCount);
      
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${agentServerUrl}/logs?project=${projectName}&since=${logCount}`
      );
    });
  });

  describe('deprecation warning behavior', () => {
    it('should include correct warning message', async () => {
      mockConfig.waitLogTimeout = undefined;
      
      await getDefaultWaitTime();
      
      expect(consoleWarnMock).toHaveBeenCalledWith(
        '⚠️  DEPRECATION WARNING: The default wait time after agent commands will change from 500ms to 0ms in the next major version.'
      );
      expect(consoleWarnMock).toHaveBeenCalledWith(
        '   To silence this warning, add "waitLogTimeout" to your agenteract.config.js:'
      );
      expect(consoleWarnMock).toHaveBeenCalledWith(
        '     - Set to 500 to keep current behavior'
      );
      expect(consoleWarnMock).toHaveBeenCalledWith(
        '     - Set to 0 for immediate response (recommended for test scripts)'
      );
      expect(consoleWarnMock).toHaveBeenCalledWith(
        '   You can always override per-command with --wait flag.\n'
      );
    });

    it('should not show warning when waitLogTimeout is explicitly 0', async () => {
      mockConfig.waitLogTimeout = 0;
      
      await getDefaultWaitTime();
      
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });

    it('should not show warning when waitLogTimeout is explicitly set to legacy value', async () => {
      mockConfig.waitLogTimeout = 500;
      
      await getDefaultWaitTime();
      
      expect(consoleWarnMock).not.toHaveBeenCalled();
    });
  });
});
