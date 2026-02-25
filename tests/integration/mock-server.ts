import http from 'http';
import { URL } from 'url';
import WebSocket from 'ws';

function createServer(port: number, handler: http.RequestListener) {
  const server = http.createServer(handler);
  server.listen(port, () => {
  });
  return server;
}

const servers: http.Server[] = [];
const websockets: WebSocket[] = [];

// --- Mock Agent Console Logs (stored in memory) ---
const consoleLogs = [
  { level: 'log', message: 'agent log line 1', timestamp: Date.now() },
  { level: 'log', message: 'agent log line 2', timestamp: Date.now() },
];

// --- Connect to Agent Server via WebSocket ---
// This simulates an app connecting to register itself as available
function connectToAgentServer(projectName: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    console.log(`[Mock] Attempting to connect to ws://127.0.0.1:8765/${projectName}...`);
    const ws = new WebSocket(`ws://127.0.0.1:8765/${projectName}`);

    let connectionTimeout = setTimeout(() => {
      console.error(`[Mock] Connection timeout for ${projectName}`);
      ws.close();
      reject(new Error('Connection timeout'));
    }, 10000);

    ws.on('open', () => {
      clearTimeout(connectionTimeout);
      console.log(`[Mock] ✓ Connected to agent server as ${projectName}`);
      resolve(ws);
    });

    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[Mock] Received message:`, message);

        // Handle server messages
        if (message.status === 'connected' && message.deviceId) {
          console.log(`[Mock] Assigned device ID: ${message.deviceId}`);
          return;
        }

        // Handle commands from the agent server
        if (message.action === 'getViewHierarchy') {
          console.log(`[Mock] Responding to getViewHierarchy command`);
          ws.send(JSON.stringify({
            status: 'success',
            hierarchy: {
              name: 'App',
              children: [
                {
                  name: 'HomeScreen',
                  testID: 'home-screen',
                  children: [
                    {
                      name: 'Header',
                      text: 'Welcome Home',
                      testID: 'home-header',
                      children: [],
                    },
                    {
                      name: 'FlatList',
                      testID: 'item-list',
                      children: [
                        {
                          name: 'Pressable',
                          testID: 'item-1',
                          children: [
                            { name: 'Text', text: 'First Item', children: [] },
                          ],
                        },
                        {
                          name: 'Pressable',
                          testID: 'item-2',
                          children: [
                            { name: 'Text', text: 'Second Item', children: [] },
                          ],
                        },
                      ],
                    },
                    {
                      name: 'Button',
                      testID: 'back-button',
                      children: [
                        { name: 'Text', text: 'Back', children: [] },
                      ],
                    },
                  ],
                },
              ],
            },
            id: message.id
          }));
        } else if (message.action === 'getConsoleLogs') {
          console.log(`[Mock] Responding to getConsoleLogs command`);
          ws.send(JSON.stringify({
            status: 'success',
            logs: consoleLogs,
            id: message.id
          }));
        } else if (message.action === 'tap') {
          console.log(`[Mock] Responding to tap command`);
          ws.send(JSON.stringify({
            status: 'ok',
            action: 'tap',
            id: message.id
          }));
        }
      } catch (e) {
        console.error('[Mock] Error handling message:', e);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(connectionTimeout);
      console.error(`[Mock] WebSocket error for ${projectName}:`, error.message);
      console.error(`[Mock] Full error:`, error);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      console.log(`[Mock] Disconnected from agent server for ${projectName} (code: ${code}, reason: ${reason})`);
    });

    websockets.push(ws);
  });
}

// Connect mock app to agent server and wait for connection
console.log('[Mock] Starting mock server...');
connectToAgentServer('my-project')
  .then(() => {
    console.log('[Mock] Mock app registered successfully');
  })
  .catch((error) => {
    console.error('[Mock] Failed to connect mock app:', error);
    process.exit(1);
  });

// Expo Server
servers.push(
  createServer(8790, (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/logs') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('expo log line 1');
    } else if (req.method === 'POST' && url.pathname === '/cmd') {
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  })
);

// Vite Server
servers.push(
  createServer(8791, (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/logs') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('vite log line 1');
    } else if (req.method === 'POST' && url.pathname === '/cmd') {
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  })
);

function shutdown() {
  // console.log('Shutting down mock servers...');
  websockets.forEach((ws) => {
    try {
      ws.close();
    } catch (e) {
      // Ignore close errors
    }
  });
  servers.forEach((server) => server.close());
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

