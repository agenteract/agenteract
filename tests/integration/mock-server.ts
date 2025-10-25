import http from 'http';
import { URL } from 'url';

function createServer(port: number, handler: http.RequestListener) {
  const server = http.createServer(handler);
  server.listen(port, () => {
  });
  return server;
}

const servers: http.Server[] = [];

// Agent Server
servers.push(
  createServer(8766, (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/logs') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('agent log line 1\nagent log line 2');
    } else if (req.method === 'POST' && url.pathname === '/gemini-agent') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.action === 'getViewHierarchy') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hierarchy: 'mock' }, null, 2));
          } else if (data.action === 'tap') {
            res.writeHead(200);
            res.end();
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (e) {
          res.writeHead(400);
          res.end();
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  })
);

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
  servers.forEach((server) => server.close());
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

