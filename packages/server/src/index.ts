#!/usr/bin/env node
import http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import fs from 'fs';
import path from 'path';

let log: (message: string) => void;
const logFilePath = path.join(process.cwd(), 'agent-server.log');
if (process.env.AGENTERACT_SERVER_LOG) {
    log = (message: string): void => {
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
    };
    // Clear log on start
    fs.writeFileSync(logFilePath, `[${new Date().toISOString()}] Agent server started.\n`);
} else {
    log = (_: string): void => {
    };
}

// --- WebSocket Server (for the App) ---
const WS_PORT = 8765;
let activeSocket: WebSocket | null = null;
const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
log(`WebSocket server for app listening on port ${WS_PORT}`);

wss.on('connection', (ws: WebSocket) => {
  log('React Native app connected.');
  activeSocket = ws;
  ws.on('close', () => {
    log('React Native app disconnected.');
    activeSocket = null;
  });
  ws.on('error', (error: Error) => {
    log(`WebSocket error: ${error.message}`);
    activeSocket = null;
  });
});

// --- HTTP Server (for the Extension Commands) ---
const HTTP_PORT = 8766;
const httpServer = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  if (req.method === 'POST' && req.url === '/gemini-agent') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      log(`Received command via HTTP: ${body}`);
      if (!activeSocket) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'React Native app is not connected.' }));
        return;
      }
      try {
        const command = JSON.parse(body);
        activeSocket.send(JSON.stringify(command));

        const timeout = setTimeout(() => {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Timed out waiting for response from app.' }));
        }, 10000);

        activeSocket.once('message', (message: RawData) => {
          clearTimeout(timeout);
          log(`Relaying app response via HTTP: ${message.toString()}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(message.toString());
        });
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body.' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  log(`HTTP server for commands listening on port ${HTTP_PORT}`);
  console.log(`React Native Agent server running. App connects to ws://localhost:8765. Press Ctrl+C to stop.`);
});