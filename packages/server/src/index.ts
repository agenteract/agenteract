#!/usr/bin/env node
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import url from 'url';
import { spawn, ChildProcess } from 'child_process';

import { generateAuthToken, saveRuntimeConfig, loadRuntimeConfig, DeviceInfoSummary } from '@agenteract/core/node';
import { runTest } from './test-runner.js';
import type { TestDefinition } from './test-types.js';

const isLogServer = process.argv.includes('--log-only');

const args = {
  port: 8766,
  cwd: process.cwd(),
}

for (let x = 0; x < process.argv.length; x++) {
  const arg = process.argv[x];
  if (arg == '--port' && x + 1 < process.argv.length) {
    args.port = parseInt(process.argv[x + 1]);
  }
  if (arg == '--cwd' && x + 1 < process.argv.length) {
    args.cwd = process.argv[x + 1];
  }
}

process.chdir(args.cwd);

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

    // Mask token for logging - show only last 4 chars
    function maskToken(token: string): string {
        if (token.length <= 4) return '****';
        return `****-${token.slice(-4)}`;
    }

    // Save known device info to runtime config for CLI access
    async function updateKnownDevice(deviceId: string, info: DeviceInfoSummary): Promise<void> {
        try {
            const config = await loadRuntimeConfig();
            if (config) {
                if (!config.knownDevices) config.knownDevices = {};
                config.knownDevices[deviceId] = info;
                await saveRuntimeConfig(config);
                log(`Saved device info for ${deviceId} to runtime config`);
            }
        } catch (e) {
            console.error('[Device] Failed to save device info to runtime config:', e);
        }
    }

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

    // --- Helper: Generate stable device identifier ---
    function getDeviceIdentifier(deviceInfo?: DeviceInfo): string {
        if (!deviceInfo) return 'unknown';

        // For simulators, use UDID if available
        if (deviceInfo.isSimulator && deviceInfo.deviceId) {
            return deviceInfo.deviceId;
        }

        // For physical devices, create stable ID from device properties
        // Format: deviceName-deviceModel-osVersionMajor
        const osVersion = deviceInfo.osVersion.split('.')[0]; // e.g., "17.0" -> "17"
        return `${deviceInfo.deviceName}-${deviceInfo.deviceModel}-${osVersion}`;
    }

    // --- Helper: Resolve device for a project ---
    // Returns the connection key for a connected device, falling back to any available device
    async function resolveDeviceConnection(
        projectName: string,
        requestedDevice?: string
    ): Promise<{ connectionKey: string; connection: ProjectConnection } | { error: string; status: number; availableDevices?: any[]; availableProjects?: string[] }> {
        // Determine which device to use
        let targetDeviceId: string | undefined = requestedDevice;

        // If no device specified, try to use default
        if (!targetDeviceId) {
            const config = await loadRuntimeConfig();
            targetDeviceId = config?.defaultDevices?.[projectName];
        }

        // Build connection key and check if device is actually connected
        let connectionKey: string | undefined;
        if (targetDeviceId) {
            const proposedKey = `${projectName}:${targetDeviceId}`;
            if (projectConnections.has(proposedKey)) {
                // Default device is connected
                connectionKey = proposedKey;
            } else {
                // Default device is not connected - fall back to any available device
                console.log(`[Device] Default device "${targetDeviceId}" for "${projectName}" is not connected, falling back to available device`);
                targetDeviceId = undefined; // Clear to trigger fallback logic below
            }
        }

        if (!connectionKey) {
            // No device specified or default not connected - try to find any connected device for this project
            const projectKeys = Array.from(projectConnections.keys())
                .filter(key => key.startsWith(`${projectName}:`));

            if (projectKeys.length === 0) {
                const availableProjects = Array.from(projectConnections.keys());
                return {
                    error: `Project "${projectName}" has no connected devices.`,
                    status: 503,
                    availableProjects
                };
            }

            // Use the first available device
            connectionKey = projectKeys[0];
            console.log(`[Device] No default device for "${projectName}", using ${connectionKey}`);
        }

        const connection = projectConnections.get(connectionKey);
        if (!connection) {
            const availableDevices = Array.from(projectConnections.entries())
                .filter(([key]) => key.startsWith(`${projectName}:`))
                .map(([key, conn]) => ({
                    key,
                    deviceId: key.split(':')[1],
                    deviceInfo: conn.deviceInfo
                }));

            return {
                error: `Device "${targetDeviceId}" not connected for project "${projectName}".`,
                status: 503,
                availableDevices
            };
        }

        return { connectionKey, connection };
    }

    // --- WebSocket Server (for multiple Apps) ---
    const WS_PORT = 8765;
    // Use a Map to store connections and device info, keyed by project:device
    const projectConnections = new Map<string, ProjectConnection>();

    // Track pending device info for connections that haven't sent deviceInfo yet
    const pendingDeviceInfo = new Map<string, WebSocket>();

    // Track assigned device IDs for connections without device info (keyed by socket)
    const socketToDeviceId = new Map<WebSocket, string>();

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
                `processImagePath CONTAINS "${bundleId}"`, // Corrected escaping for quotes within the string
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

    // --- Wrap startup in async function ---
    (async () => {
        // --- Security & Token Generation ---
        let AUTH_TOKEN: string;

        try {
            const existingConfig = await loadRuntimeConfig();
            
            if (existingConfig && existingConfig.token) {
                AUTH_TOKEN = existingConfig.token;
                console.log(`[Security] Loaded existing Auth Token: ${maskToken(AUTH_TOKEN)}`);
                log(`Loaded existing Security Token: ${maskToken(AUTH_TOKEN)}`);
            } else {
                AUTH_TOKEN = generateAuthToken();
                console.log(`[Security] Generated NEW Auth Token: ${maskToken(AUTH_TOKEN)}`);
                log(`Generated NEW Security Token: ${maskToken(AUTH_TOKEN)}`);
            }

            // Always save to ensure the file exists and is up to date
            await saveRuntimeConfig({
                host: '0.0.0.0',
                port: WS_PORT,
                token: AUTH_TOKEN
            });

        } catch (e) {
            console.error('Failed to handle runtime config:', e);
            // Fallback if file operations fail
            if (!AUTH_TOKEN!) AUTH_TOKEN = generateAuthToken();
        }

        log(`Security Token: ${maskToken(AUTH_TOKEN)}`);
        console.log(`[Security] Auth Token: ${maskToken(AUTH_TOKEN)}`);

        const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
        log(`WebSocket server for apps listening on port ${WS_PORT}`);

        wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
            const parsedUrl = url.parse(req.url || '', true);
            const projectName = parsedUrl.pathname?.substring(1);
            const clientToken = parsedUrl.query.token as string;
            const clientDeviceId = parsedUrl.query.deviceId as string;

            if (!projectName) {
                log('Connection attempt rejected: No project name provided in URL.');
                ws.close(1008, 'Project name required');
                return;
            }

            // Check if connection is from localhost
            const remoteAddress = req.socket.remoteAddress;
            const hostname = req.headers.host?.split(':')[0];

            const isLocalhost = remoteAddress === '127.0.0.1' ||
                               remoteAddress === '::1' ||
                               remoteAddress === '::ffff:127.0.0.1' ||
                               hostname === 'localhost' ||
                               hostname === '127.0.0.1' ||
                               hostname === '[::1]';

            // Enforce Authentication (skip for localhost connections)
            if (!isLocalhost && clientToken !== AUTH_TOKEN) {
                log(`Connection attempt rejected for "${projectName}": Invalid or missing token from ${remoteAddress} (host: ${hostname}).`);
                console.log(`[Security] Rejected connection from ${projectName} on ${remoteAddress} (host: ${hostname})`);
                console.log(`  Remote address: ${remoteAddress}`);
                console.log(`  Host header: ${hostname}`);
                console.log(`  Token provided: ${clientToken ? 'yes (invalid)' : 'no'}`);
                ws.close(4001, 'Authentication failed: Invalid token');
                return;
            }

            if (isLocalhost && !clientToken) {
                log(`Project "${projectName}" connected from localhost (no token required).`);
                console.log(`[DEBUG] Project "${projectName}" connected via WebSocket from localhost`);
            } else if (isLocalhost && clientToken === AUTH_TOKEN) {
                log(`Project "${projectName}" connected from localhost with valid token.`);
                console.log(`[DEBUG] Project "${projectName}" connected via WebSocket from localhost with token`);
            } else {
                log(`Project "${projectName}" connected with valid token.`);
                console.log(`[DEBUG] Project "${projectName}" connected via WebSocket with authentication`);
            }

            console.log(`  Remote address: ${remoteAddress}`);
            console.log(`  Host header: ${hostname}`);

            // Determine device ID: use client-provided ID or generate new one
            let deviceId: string;
            let isNewDevice = false;

            if (clientDeviceId) {
                // Client provided existing device ID
                deviceId = clientDeviceId;
                console.log(`[Device] Client reconnecting with device ID "${deviceId}"`);
            } else {
                // Generate new persistent device ID for this client (8-char prefix for readability)
                deviceId = `device-${uuidv4().split('-')[0]}`;
                isNewDevice = true;
                console.log(`[Device] Generated new device ID "${deviceId}" for "${projectName}"`);
            }

            socketToDeviceId.set(ws, deviceId);

            const connectionKey = `${projectName}:${deviceId}`;

            // Preserve existing deviceInfo if this is a reconnection
            const existingConnection = projectConnections.get(connectionKey);
            projectConnections.set(connectionKey, {
                socket: ws,
                deviceInfo: existingConnection?.deviceInfo
            });

            console.log(`[Device] Registered: ${connectionKey}`);

            // Send device ID to client so it can store it
            if (isNewDevice) {
                const welcomeMessage = {
                    status: 'connected',
                    deviceId: deviceId,
                    message: 'Store this deviceId and include it in future connections via ?deviceId= parameter'
                };
                ws.send(JSON.stringify(welcomeMessage));
            }

            // Set as default device for this project (will be updated if device info arrives)
            (async () => {
                try {
                    const config = await loadRuntimeConfig();
                    if (config) {
                        if (!config.defaultDevices) {
                            config.defaultDevices = {};
                        }
                        // Only set if no default exists yet (don't override user's choice)
                        if (!config.defaultDevices[projectName]) {
                            config.defaultDevices[projectName] = deviceId;
                            await saveRuntimeConfig(config);
                            console.log(`[Device] Set "${deviceId}" as default for project "${projectName}"`);
                        }
                    }
                } catch (e) {
                    console.error('[Device] Failed to set default device:', e);
                }
            })();

            // Also track in pending so we can update when device info arrives
            pendingDeviceInfo.set(projectName, ws);

            ws.on('message', (message: Buffer) => {
                try {
                    const response = JSON.parse(message.toString());
                    
                    // Only log non-hierarchy messages to reduce spam
                    // Hierarchy responses are typically very large (>10KB), so skip logging them
                    const isHierarchyResponse = response.hierarchy !== undefined;
                    const isLargeMessage = message.length > 10000;
                    if (!isHierarchyResponse && !isLargeMessage) {
                        console.log(`[DEBUG] Received raw message from "${projectName}": ${message.toString()}`);
                        log(`Received message from "${projectName}": ${message.toString()}`);
                    } else {
                        console.log(`[DEBUG] Received hierarchy response from "${projectName}" (${message.length} bytes, SUPPRESSED)`);
                    }

                    // Check if this is device info
                    if (response.status === 'deviceInfo' && response.deviceInfo) {
                        const deviceInfo: DeviceInfo = response.deviceInfo;

                        console.log(`[Device] Received device info from "${projectName}"`);
                        console.log(`  Device: ${deviceInfo.deviceName} (${deviceInfo.deviceModel})`);
                        console.log(`  OS: ${deviceInfo.osVersion}`);
                        console.log(`  Simulator: ${deviceInfo.isSimulator}`);

                        // Update existing connection with device info (don't change the device ID)
                        if (pendingDeviceInfo.has(projectName)) {
                            const socket = pendingDeviceInfo.get(projectName)!;

                            // Get the existing device ID for this socket
                            const existingDeviceId = socketToDeviceId.get(socket);
                            if (existingDeviceId) {
                                const connectionKey = `${projectName}:${existingDeviceId}`;

                                // Update the connection with device info
                                const existingConnection = projectConnections.get(connectionKey);
                                if (existingConnection) {
                                    existingConnection.deviceInfo = deviceInfo;
                                    console.log(`[Device] Added device info to: ${connectionKey}`);

                                    // Save to runtime config for CLI access
                                    updateKnownDevice(existingDeviceId, {
                                        deviceName: deviceInfo.deviceName,
                                        deviceModel: deviceInfo.deviceModel,
                                        osVersion: deviceInfo.osVersion,
                                        isSimulator: deviceInfo.isSimulator
                                    });
                                }
                            }

                            pendingDeviceInfo.delete(projectName);
                            log(`Device info received for: ${projectName}`);
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
                        // Only log non-hierarchy responses to reduce spam
                        const isHierarchyResponse = response.hierarchy !== undefined;
                        if (!isHierarchyResponse) {
                            console.log(`[DEBUG] Received response from ${projectName}, id: ${response.id}, status: ${response.status}`);
                        }
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

                // Remove from pending if still there
                if (pendingDeviceInfo.has(projectName)) {
                    pendingDeviceInfo.delete(projectName);
                }

                // Remove from socket tracking
                socketToDeviceId.delete(ws);

                // Find and remove from projectConnections
                for (const [key, conn] of projectConnections.entries()) {
                    if (conn.socket === ws) {
                        projectConnections.delete(key);
                        console.log(`[Device] Disconnected: ${key}`);
                        break;
                    }
                }
            });

            ws.on('error', (error: Error) => {
                log(`WebSocket error for "${projectName}": ${error.message}`);

                // Remove from pending if still there
                if (pendingDeviceInfo.has(projectName)) {
                    pendingDeviceInfo.delete(projectName);
                }

                // Remove from socket tracking
                socketToDeviceId.delete(ws);

                // Find and remove from projectConnections
                for (const [key, conn] of projectConnections.entries()) {
                    if (conn.socket === ws) {
                        projectConnections.delete(key);
                        break;
                    }
                }
            });
        });

        // --- HTTP Server (for the Agent) ---
        const HTTP_PORT = args.port;

        // Update runtime config with HTTP port
        try {
            const config = await loadRuntimeConfig();
            if (config) {
                config.httpPort = HTTP_PORT;
                await saveRuntimeConfig(config);
            }
        } catch (e) {
            console.error('Failed to update runtime config with HTTP port:', e);
        }

        app.post('/gemini-agent', async (req, res) => {
            const command = req.body;
            const { project: projectName, device: requestedDevice } = command;

            if (!projectName) {
                return res.status(400).json({ error: 'Request body must include a "project" field.' });
            }

            log(`Received command for project "${projectName}": ${JSON.stringify(command)}`);

            // Resolve device connection
            const result = await resolveDeviceConnection(projectName, requestedDevice);
            if ('error' in result) {
                return res.status(result.status).json({
                    error: result.error,
                    ...(result.availableDevices && { availableDevices: result.availableDevices }),
                    ...(result.availableProjects && { availableProjects: result.availableProjects }),
                    ...(result.availableDevices && result.availableDevices.length > 0 && {
                        hint: `Use --device flag to target specific device, or run 'agenteract set-current-device ${projectName} <device-id>' to set default`
                    })
                });
            }

            const { connectionKey, connection } = result;

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

        app.get('/logs', async (req, res) => {
            const projectName = req.query.project as string;
            const requestedDevice = req.query.device as string;
            const sinceLines = parseInt(req.query.since as string) || 50;

            if (!projectName) {
                return res.status(400).json({ error: 'Request must include a "project" query parameter.' });
            }

            // Resolve device connection
            const result = await resolveDeviceConnection(projectName, requestedDevice);
            if ('error' in result) {
                return res.status(result.status).json({
                    error: result.error,
                    ...(result.availableDevices && { availableDevices: result.availableDevices }),
                    ...(result.availableProjects && { availableProjects: result.availableProjects })
                });
            }

            const { connectionKey, connection } = result;

            // Prefer in-app logs via WebSocket (cleaner, only app logs)
            // Use simctl as fallback if the app doesn't respond
            const id = uuidv4();
            const command = { action: 'getConsoleLogs', id };
            console.log(`[DEBUG] Requesting logs from ${connectionKey} via WebSocket, id: ${id}`);
            connection.socket.send(JSON.stringify(command));

            pendingRequests.set(id, res);

            setTimeout(async () => {
                if (pendingRequests.has(id)) {
                    // Timeout waiting for app response, try simctl as fallback for simulators
                    console.log(`[DEBUG] Timeout waiting for logs from ${connectionKey}, id: ${id}`);
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

        app.get('/devices', async (req, res) => {
            const projectName = req.query.project as string;

            if (!projectName) {
                return res.status(400).json({ error: 'Request must include a "project" query parameter.' });
            }

            // Get all devices for this project
            const devices = Array.from(projectConnections.entries())
                .filter(([key]) => key.startsWith(`${projectName}:`))
                .map(([key, conn]) => {
                    const deviceId = key.split(':')[1];
                    return {
                        deviceId,
                        connectionKey: key,
                        deviceInfo: conn.deviceInfo
                    };
                });

            // Get default device
            const config = await loadRuntimeConfig();
            const defaultDeviceId = config?.defaultDevices?.[projectName];

            res.json({
                project: projectName,
                devices,
                defaultDevice: defaultDeviceId,
                totalConnected: devices.length
            });
        });

        // --- Test Runner Endpoint ---
        app.post('/test-run', async (req, res) => {
            const testDefinition = req.body as TestDefinition;

            if (!testDefinition.project) {
                return res.status(400).json({ error: 'Test definition must include a "project" field.' });
            }

            if (!testDefinition.steps || !Array.isArray(testDefinition.steps)) {
                return res.status(400).json({ error: 'Test definition must include a "steps" array.' });
            }

            log(`Starting test run for project "${testDefinition.project}" with ${testDefinition.steps.length} steps`);

            // Helper to send command and wait for response
            const sendCommand = async (command: Record<string, unknown>): Promise<Record<string, unknown>> => {
                const projectName = command.project as string;
                const requestedDevice = command.device as string | undefined;

                const result = await resolveDeviceConnection(projectName, requestedDevice);
                if ('error' in result) {
                    throw new Error(result.error);
                }

                const { connection } = result;
                const id = uuidv4();
                command.id = id;

                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        pendingRequests.delete(id);
                        reject(new Error('Timed out waiting for response from app'));
                    }, 10000);

                    // Create a fake response object to capture the result
                    const fakeRes = {
                        writeHead: () => {},
                        end: (data: string) => {
                            clearTimeout(timeout);
                            pendingRequests.delete(id);
                            try {
                                resolve(JSON.parse(data));
                            } catch {
                                resolve({ status: 'ok' });
                            }
                        }
                    } as unknown as http.ServerResponse;

                    pendingRequests.set(id, fakeRes);
                    connection.socket.send(JSON.stringify(command));
                });
            };

            // Helper to get hierarchy
            const getHierarchy = async () => {
                const response = await sendCommand({
                    project: testDefinition.project,
                    action: 'getViewHierarchy',
                    device: testDefinition.device,
                });
                return response.hierarchy as any || null;
            };

            // Helper to get logs
            const getLogs = async (since: number = 50) => {
                try {
                    const response = await sendCommand({
                        project: testDefinition.project,
                        action: 'getConsoleLogs',
                        device: testDefinition.device,
                    });
                    const logs = (response.logs as any[]) || [];
                    // Log the retrieved logs to server console for CI visibility
                    console.log(`[Test] Retrieved ${logs.length} logs from app`);
                    if (logs.length > 0) {
                        console.log(`[Test] Latest log from app: ${logs[logs.length - 1].message}`);
                    }
                    return logs;
                } catch (e) {
                    console.error(`[Test] Failed to get logs: ${e}`);
                    return [];
                }
            };

            try {
                const result = await runTest(testDefinition, {
                    sendCommand,
                    getHierarchy,
                    getLogs,
                    log: (message: string) => {
                        console.log(`[Test] ${message}`);
                    },
                });

                res.json(result);
            } catch (error) {
                res.status(500).json({
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });

        app.listen(HTTP_PORT, '0.0.0.0', () => {
            log(`HTTP server for commands listening on port ${HTTP_PORT}`);
            console.log(`Agenteract server running. Apps connect to ws://localhost:${WS_PORT}/{projectName}. Press Ctrl+C to stop.`);
        });

    })(); // End async IIFE
}