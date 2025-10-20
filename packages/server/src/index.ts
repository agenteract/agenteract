#!/usr/bin/env node
import http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';

let log: (message: string) => void;
const logFilePath = path.join(process.cwd(), 'agent-server.log');
if (process.env.AGENTERACT_SERVER_LOG) {
    log = (message: string): void => {
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
    };
    fs.writeFileSync(logFilePath, `[${new Date().toISOString()}] Agent server started.\n`);
} else {
    log = (_: string): void => {};
}

const app = express();
app.use(express.json());

const pendingRequests = new Map<string, http.ServerResponse>();

// --- WebSocket Server (for the App) ---
const WS_PORT = 8765;
let activeSocket: WebSocket | null = null;
const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
log(`WebSocket server for app listening on port ${WS_PORT}`);

wss.on('connection', (ws: WebSocket) => {
  log('React Native app connected.');
  activeSocket = ws;

  ws.on('message', (message: RawData) => {
    log(`Received message from app: ${message.toString()}`);
    try {
      const response = JSON.parse(message.toString());
      if (response.id && pendingRequests.has(response.id)) {
        const res = pendingRequests.get(response.id)!;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        pendingRequests.delete(response.id);
      }
    } catch (e) {
      log(`Error parsing message from app: ${e}`);
    }
  });

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

app.post('/gemini-agent', (req, res) => {
  const command = req.body;
  log(`Received command via HTTP: ${JSON.stringify(command)}`);
  if (!activeSocket) {
    res.status(503).json({ error: 'React Native app is not connected.' });
    return;
  }

  const id = uuidv4();
  command.id = id;
  activeSocket.send(JSON.stringify(command));

  pendingRequests.set(id, res);

  setTimeout(() => {
    if (pendingRequests.has(id)) {
      res.status(504).json({ error: 'Timed out waiting for response from app.' });
      pendingRequests.delete(id);
    }
  }, 10000);
});

app.get('/logs', (req, res) => {
    if (!activeSocket) {
        res.status(503).json({ error: 'React Native app is not connected.' });
        return;
    }

    const id = uuidv4();
    const command = { action: 'getConsoleLogs', id };
    activeSocket.send(JSON.stringify(command));

    pendingRequests.set(id, res);

    setTimeout(() => {
        if (pendingRequests.has(id)) {
            res.status(504).json({ error: 'Timed out waiting for response from app.' });
            pendingRequests.delete(id);
        }
    }, 10000);
});

app.listen(HTTP_PORT, '127.0.0.1', () => {
  log(`HTTP server for commands listening on port ${HTTP_PORT}`);
  console.log(`React Native Agent server running. App connects to ws://localhost:8765. Press Ctrl+C to stop.`);
});
