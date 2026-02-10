import { WebSocket } from 'ws';

export interface AgentCommand {
  action: string;
  project?: string;
  [key: string]: any;
}

export interface AgentResponse {
  status: 'success' | 'error' | 'log';
  [key: string]: any;
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private url: string;
  private pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();
  private logListeners = new Map<string, ((log: string) => void)[]>();
  private isConnected = false;

  constructor(url: string = 'ws://localhost:8765') {
    this.url = url;
  }

  async connect(role: string = 'agent', token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connect to the main server port with role=agent
      // Note: Server needs to handle this query param
      const wsUrl = `${this.url}?role=${role}${token ? `&token=${token}` : ''}`;
      console.log(`Connecting to ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        resolve();
      });

      this.ws.on('error', (err) => {
        if (!this.isConnected) {
          reject(err);
        } else {
            console.error('AgentClient WebSocket error:', err);
        }
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.ws = null;
      });
    });
  }

  disconnect() {
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }
  }

  private handleMessage(message: any) {
    // Unwrap response wrapper if present
    if (message.type === 'response' && message.payload) {
        message = message.payload;
    }

    // Handle command responses
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      if (message.status === 'error') {
        reject(new Error(message.error || 'Unknown error'));
      } else {
        resolve(message);
      }
      this.pendingRequests.delete(message.id);
      return;
    }

    // Handle streamed logs
    if (message.status === 'log' && message.project && message.log) {
        const listeners = this.logListeners.get(message.project);
        if (listeners) {
            listeners.forEach(listener => listener(message.log));
        }
    }
  }

  async sendCommand(project: string, action: string, payload: any = {}, timeoutMs: number = 10000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('AgentClient is not connected');
    }

    // Generate simple ID
    const id = Math.random().toString(36).substring(7);
    
    const command = {
      id,
      project,
      action,
      ...payload
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      try {
          this.ws!.send(JSON.stringify(command));
      } catch (e) {
          this.pendingRequests.delete(id);
          reject(e);
          return;
      }
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Command ${action} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });
  }

  // --- Interaction Primitives ---

  async tap(project: string, testId: string): Promise<any> {
    return this.sendCommand(project, 'tap', { testID: testId });
  }

  async input(project: string, testId: string, text: string): Promise<any> {
    return this.sendCommand(project, 'input', { testID: testId, value: text });
  }

  async scroll(project: string, testId: string, direction: 'up' | 'down' | 'left' | 'right', amount: number = 100): Promise<any> {
    return this.sendCommand(project, 'scroll', { testID: testId, direction, amount });
  }

  async swipe(project: string, testId: string, direction: 'up' | 'down' | 'left' | 'right', velocity: 'slow' | 'medium' | 'fast' = 'medium'): Promise<any> {
    return this.sendCommand(project, 'swipe', { testID: testId, direction, velocity });
  }

  async longPress(project: string, testId: string, duration: number = 1000): Promise<any> {
    return this.sendCommand(project, 'longPress', { testID: testId, duration });
  }

  async getViewHierarchy(project: string): Promise<any> {
    return this.sendCommand(project, 'getViewHierarchy');
  }

  async agentLink(project: string, url: string): Promise<any> {
    return this.sendCommand(project, 'agentLink', { payload: url });
  }

  async getLogs(project: string): Promise<any> {
    return this.sendCommand(project, 'getConsoleLogs');
  }

  /**
   * Subscribes to logs for a specific project.
   * Requires the server to support log streaming to agents.
   */
  async subscribeLogs(project: string, listener: (log: string) => void): Promise<void> {
      if (!this.logListeners.has(project)) {
          this.logListeners.set(project, []);
          
          // Tell server we want logs for this project
          // The server must handle this action and map this socket to the project's log stream
          await this.sendCommand(project, 'subscribeLogs').catch(err => {
              console.warn(`Server might not support subscribeLogs: ${err.message}`);
          });
      }
      this.logListeners.get(project)!.push(listener);
  }

  /**
   * Waits for a log message matching the pattern.
   */
  async waitForLog(project: string, pattern: string | RegExp, timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
        let timer: NodeJS.Timeout;
        let pollInterval: NodeJS.Timeout;
        let resolved = false;
        
        const checkLog = (log: string) => {
            if (resolved) return;
            const match = typeof pattern === 'string' ? log.includes(pattern) : pattern.test(log);
            if (match) {
                cleanup();
                resolve();
            }
        };

        // Define listener for streaming logs
        const listener = (log: string) => checkLog(log);

        const cleanup = () => {
             resolved = true;
             clearTimeout(timer);
             clearInterval(pollInterval);
             const listeners = this.logListeners.get(project);
             if (listeners) {
                 const idx = listeners.indexOf(listener);
                 if (idx !== -1) listeners.splice(idx, 1);
             }
        };

        // Subscribe to streaming logs
        this.subscribeLogs(project, listener);

        // Also poll for logs (for apps that don't stream)
        pollInterval = setInterval(async () => {
            if (resolved) return;
            try {
                const response = await this.getLogs(project);
                if (response && response.logs && Array.isArray(response.logs)) {
                    for (const logEntry of response.logs) {
                        const logMsg = typeof logEntry === 'string' ? logEntry : (logEntry.message || JSON.stringify(logEntry));
                        checkLog(logMsg);
                        if (resolved) break;
                    }
                }
            } catch (e) {
                // Ignore polling errors
            }
        }, 1000);

        // Set timeout
        timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout waiting for log pattern: ${pattern}`));
        }, timeout);
    });
  }

  async waitForElement(project: string, testId: string, timeout: number = 30000): Promise<void> {
      return this.waitForCondition(project, (h) => {
          // simple BFS to find testID
          const queue = [h];
          while (queue.length > 0) {
              const node = queue.shift();
              if (!node) continue;
              if (node.testID === testId) return true;
              if (node.children) queue.push(...node.children);
          }
          return false;
      }, timeout);
  }

  async waitForCondition(project: string, check: (hierarchy: any) => boolean, timeout: number = 30000): Promise<void> {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
          try {
              const response = await this.getViewHierarchy(project);
              // response might be wrapped or just the hierarchy depending on server response
              // The server returns { status: 'success', hierarchy: { ... } }
              const hierarchy = response.hierarchy;
              if (hierarchy && check(hierarchy)) {
                  return;
              }
          } catch (e) {
              // ignore errors during poll
          }
          await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }
}

export function createAgentClient(url?: string) {
    return new AgentClient(url);
}
