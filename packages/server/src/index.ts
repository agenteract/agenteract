#!/usr/bin/env node
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import url from 'url';
import { spawn, ChildProcess } from 'child_process';

import { generateAuthToken, saveRuntimeConfig, deleteRuntimeConfig, resetPNPMWorkspaceCWD } from '@agenteract/core/node';

const isLogServer = process.argv.includes('--log-only');

resetPNPMWorkspaceCWD();

if (isLogServer) {
    const LOG_WS_PORT = 8767;
    const logWss = new WebSocketServer({ port: LOG_WS_PORT, host: '0.0.0.0' });
    console.log(`[Agenteract] Log streaming server listening on ws://0.0.0.0:${LOG_WS_PORT}`);

    logWss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        const projectName = url.parse(req.url || '').pathname?.substring(1) || 'unknown';
        console.log(`[Agenteract] Log stream connected for project: ${projectName}`);

        ws.on('message', (message: Buffer) => {
            try {
                const response = JSON.parse(message.toString());
                if (response.status === 'log' && response.logs) {
                    response.logs.forEach((logEntry: any) => {
                        // Just print the message, maybe with level
                        console.log(`[${projectName}] [${logEntry.level}] ${logEntry.message}`);
                    });
                }
            } catch (e) {
                // Fallback for non-JSON messages
                console.log(`[${projectName}] ${message.toString()}`);
            }
        });

        ws.on('close', () => {
            console.log(`[Agenteract] Log stream disconnected for project: ${projectName}`);
        });

        ws.on('error', (error: Error) => {
            console.error(`[Agenteract] Log stream error for ${projectName}: ${error.message}`);
        });
    });

} else {
// --- Logging Setup ---
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

// --- Device Info Storage ---
interface DeviceInfo {
  isSimulator: boolean;
  deviceId?: string;
  bundleId: string;
  deviceName: string;
  osVersion: string;
  deviceModel: string;
}

interface ProjectConnection {
  socket: WebSocket;
  deviceInfo?: DeviceInfo;
}

// --- WebSocket Server (for multiple Apps) ---
const WS_PORT = 8765;
// Use a Map to store connections and device info, keyed by project name
const projectConnections = new Map<string, ProjectConnection>();

// --- Security & Token Generation ---
const AUTH_TOKEN = generateAuthToken();

// Save runtime config for CLI to use
(async () => {
  try {
    await saveRuntimeConfig({
      host: '0.0.0.0',
      port: WS_PORT,
      token: AUTH_TOKEN
    });
    
    const cleanupRuntimeConfig = () => {
       deleteRuntimeConfig().catch(() => {});
    };
    process.on('exit', cleanupRuntimeConfig);
    process.on('SIGINT', () => { cleanupRuntimeConfig(); process.exit(); });
    process.on('SIGTERM', () => { cleanupRuntimeConfig(); process.exit(); });
  } catch (e) {
    console.error('Failed to write runtime config:', e);
  }
})();

log(`Security Token: ${AUTH_TOKEN}`);
console.log(`[Security] Auth Token generated: ${AUTH_TOKEN}`);


const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
log(`WebSocket server for apps listening on port ${WS_PORT}`);

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const parsedUrl = url.parse(req.url || '', true);
  const projectName = parsedUrl.pathname?.substring(1);
  const clientToken = parsedUrl.query.token as string;

  if (!projectName) {
    log('Connection attempt rejected: No project name provided in URL.');
    ws.close(1008, 'Project name required');
    return;
  }

  // Enforce Authentication
  if (clientToken !== AUTH_TOKEN) {
    log(`Connection attempt rejected for "${projectName}": Invalid or missing token.`);
    console.log(`[Security] Rejected connection from ${projectName} (Invalid token)`);
    ws.close(4001, 'Authentication failed: Invalid token');
    return;
  }

  log(`Project "${projectName}" connected.`);
  console.log(`[DEBUG] Project "${projectName}" connected via WebSocket`);
  projectConnections.set(projectName, { socket: ws });

  ws.on('message', (message: Buffer) => {
    console.log(`[DEBUG] Received raw message from "${projectName}": ${message.toString()}`);
    log(`Received message from "${projectName}": ${message.toString()}`);
    try {
      const response = JSON.parse(message.toString());

      // Check if this is device info
      if (response.status === 'deviceInfo' && response.deviceInfo) {
        const connection = projectConnections.get(projectName);
        if (connection) {
          connection.deviceInfo = response.deviceInfo;
          log(`Received device info from "${projectName}": ${JSON.stringify(response.deviceInfo)}`);
        }
        return;
      }

      // Check if this is a streaming log message
      if (response.status === 'log' && response.logs) {
        // Print streaming logs to stdout (shows in dev command)
        response.logs.forEach((logEntry: any) => {
          const logPayload = {
            project: projectName,
            log: `[${logEntry.level}] ${logEntry.message}`
          };
          process.stdout.write(`AGENT_LOG::${JSON.stringify(logPayload)}\n`);
        });
        return;
      }

      // Handle command responses
      if (response.id && pendingRequests.has(response.id)) {
        console.log(`[DEBUG] Received response from ${projectName}, id: ${response.id}, status: ${response.status}`);
        const res = pendingRequests.get(response.id)!;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        pendingRequests.delete(response.id);
      } else if (response.id) {
        console.log(`[DEBUG] Received response with unknown id: ${response.id} from ${projectName}`);
      }
    } catch (e) {
      log(`Error parsing message from app: ${e}`);
    }
  });

  ws.on('close', () => {
    log(`Project "${projectName}" disconnected.`);
    projectConnections.delete(projectName);
  });

  ws.on('error', (error: Error) => {
    log(`WebSocket error for "${projectName}": ${error.message}`);
    projectConnections.delete(projectName);
  });
});

// --- HTTP Server (for the Agent) ---
const HTTP_PORT = 8766;

app.post('/gemini-agent', (req, res) => {
  const command = req.body;
  const { project: projectName } = command;

  if (!projectName) {
    return res.status(400).json({ error: 'Request body must include a "project" field.' });
  }

  log(`Received command for project "${projectName}": ${JSON.stringify(command)}`);
  const connection = projectConnections.get(projectName);

  if (!connection) {
    const availableProjects = Array.from(projectConnections.keys());
    return res.status(503).json({
      error: `Project "${projectName}" is not connected.`,
      availableProjects
    });
  }

  const id = uuidv4();
  command.id = id;
  connection.socket.send(JSON.stringify(command));

  pendingRequests.set(id, res);

  setTimeout(() => {
    if (pendingRequests.has(id)) {
      res.status(504).json({ error: 'Timed out waiting for response from app.' });
      pendingRequests.delete(id);
    }
  }, 10000);
});

// --- Simctl Log Streaming ---
function captureSimulatorLogs(deviceId: string, bundleId: string, sinceLines: number = 50): Promise<string[]> {
    return new Promise((resolve, reject) => {
        // Use simctl to stream logs from the simulator
        const process = spawn('xcrun', [
            'simctl',
            'spawn',
            deviceId,
            'log',
            'stream',
            '--predicate',
            `processImagePath CONTAINS "${bundleId}"`,
            '--style',
            'compact',
            '--level',
            'debug'
        ]);

        const logs: string[] = [];
        let timeoutId: NodeJS.Timeout;

        process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter((line: string) => line.trim());
            logs.push(...lines);

            // Keep only the last N lines
            if (logs.length > sinceLines) {
                logs.splice(0, logs.length - sinceLines);
            }
        });

        process.stderr.on('data', (data) => {
            log(`simctl stderr: ${data.toString()}`);
        });

        // Collect logs for 1 second, then return what we have
        timeoutId = setTimeout(() => {
            process.kill();
            resolve(logs);
        }, 1000);

        process.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}

app.get('/logs', async (req, res) => {
    const projectName = req.query.project as string;
    const sinceLines = parseInt(req.query.since as string) || 50;

    if (!projectName) {
        return res.status(400).json({ error: 'Request must include a "project" query parameter.' });
    }

    const connection = projectConnections.get(projectName);
    if (!connection) {
        const availableProjects = Array.from(projectConnections.keys());
        return res.status(503).json({
            error: `Project "${projectName}" is not connected.`,
            availableProjects
        });
    }

    // Prefer in-app logs via WebSocket (cleaner, only app logs)
    // Use simctl as fallback if the app doesn't respond
    const id = uuidv4();
    const command = { action: 'getConsoleLogs', id };
    console.log(`[DEBUG] Requesting logs from ${projectName} via WebSocket, id: ${id}`);
    connection.socket.send(JSON.stringify(command));

    pendingRequests.set(id, res);

    setTimeout(async () => {
        if (pendingRequests.has(id)) {
            // Timeout waiting for app response, try simctl as fallback for simulators
            console.log(`[DEBUG] Timeout waiting for logs from ${projectName}, id: ${id}`);
            pendingRequests.delete(id);

            if (connection.deviceInfo?.isSimulator && connection.deviceInfo.deviceId) {
                log(`App didn't respond, falling back to simctl for "${connection.deviceInfo.deviceId}"`);

                try {
                    const logs = await captureSimulatorLogs(
                        connection.deviceInfo.deviceId,
                        connection.deviceInfo.bundleId,
                        sinceLines
                    );

                    return res.json({
                        status: 'success',
                        logs: logs.map(line => ({
                            level: 'log',
                            message: line,
                            timestamp: Date.now()
                        })),
                        source: 'simctl-fallback'
                    });
                } catch (error) {
                    log(`Error capturing simctl logs: ${error}`);
                    return res.status(504).json({ error: 'Timed out waiting for response from app and simctl failed.' });
                }
            }

            res.status(504).json({ error: 'Timed out waiting for response from app.' });
        }
    }, 10000);
});

app.listen(HTTP_PORT, '127.0.0.1', () => {
  log(`HTTP server for commands listening on port ${HTTP_PORT}`);
  console.log(`Agenteract server running. Apps connect to ws://localhost:${WS_PORT}/{projectName}. Press Ctrl+C to stop.`);
});
}
