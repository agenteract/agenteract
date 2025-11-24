// Mock the actual http module but preserve its prototype chain for Express
const actualHttp = jest.requireActual('http');

const mockHttpServer: any = {
  listen: jest.fn((port: number, host: string, callback?: () => void): any => {
    if (callback) callback();
    return mockHttpServer;
  }),
  on: jest.fn(),
};

const mockWebSocketServer = {
  on: jest.fn(),
};

jest.mock('http', () => ({
  ...actualHttp,
  createServer: jest.fn(() => mockHttpServer),
}));

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => mockWebSocketServer),
}));

// Mock file system operations to prevent actual log file creation
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

// Mock the config loading functions
jest.mock('@agenteract/core/node', () => ({
  ...jest.requireActual('@agenteract/core/node'),
  loadRuntimeConfig: jest.fn().mockResolvedValue(null),
  saveRuntimeConfig: jest.fn().mockResolvedValue(undefined),
  deleteRuntimeConfig: jest.fn().mockResolvedValue(undefined),
  generateAuthToken: jest.fn().mockReturnValue('test-token-123'),
  resetPNPMWorkspaceCWD: jest.fn(),
}));

import { WebSocketServer } from 'ws';

describe('Server Setup', () => {
  // Suppress console.log during tests
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockClear();
    // Clear environment variables
    delete process.env.AGENTERACT_SERVER_LOG;
  });

  test('should create a WebSocket server on the correct port', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('./index');
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    expect(WebSocketServer).toHaveBeenCalledWith({ port: 8765, host: '0.0.0.0' });
  });

  test('should handle new WebSocket connections', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('./index');
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });
});
