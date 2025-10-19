const mockHttpServer = {
  listen: jest.fn(),
  on: jest.fn(),
};

const mockWebSocketServer = {
  on: jest.fn(),
};

jest.mock('http', () => ({
  createServer: jest.fn(() => mockHttpServer),
}));

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => mockWebSocketServer),
}));

import http from 'http';
import { WebSocketServer } from 'ws';

describe('Server Setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create an HTTP server', () => {
    jest.isolateModules(() => {
      require('../src/index');
    });
    expect(http.createServer).toHaveBeenCalledTimes(1);
  });

  test('should start listening on the correct HTTP port', () => {
    jest.isolateModules(() => {
      require('../src/index');
    });
    expect(mockHttpServer.listen).toHaveBeenCalledWith(8766, '127.0.0.1', expect.any(Function));
  });

  test('should create a WebSocket server on the correct port', () => {
    jest.isolateModules(() => {
      require('../src/index');
    });
    expect(WebSocketServer).toHaveBeenCalledWith({ port: 8765, host: '0.0.0.0' });
  });

  test('should handle new WebSocket connections', () => {
    jest.isolateModules(() => {
      require('../src/index');
    });
    expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });
});
