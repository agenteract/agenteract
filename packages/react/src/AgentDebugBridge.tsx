import { useEffect, useRef, useCallback, useState } from 'react';
import { getFilteredHierarchy } from './getFilteredHierarchy';
import { getNode } from './utils/AgentRegistry';
import { AgentCommand } from '@agenteract/core';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

// --- New Type Definition ---
type ServerCommand = AgentCommand & { id: string };

// --- Log Capturing ---
const logBuffer: { level: string; message: string; timestamp: number }[] = [];
const MAX_LOG_LINES = 2000;

function addLog(level: string, message: string) {
  logBuffer.push({ level, message, timestamp: Date.now() });
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.shift();
  }
}

// --- Platform Detection ---
const getPlatform = (): 'android' | 'ios' | 'web' => {
  return Platform.OS as 'android' | 'ios' | 'web';
};

// --- Platform & Device Detection ---
function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') return false;

  // Check various indicators that this is an emulator
  const constants = (Platform as any).constants || {};

  // Method 1: Check Brand (emulators often have 'google' or 'generic')
  const brand = constants.Brand || '';
  const model = constants.Model || '';
  const fingerprint = constants.Fingerprint || '';

  // Debug logging
  console.log('[Agenteract] Android device info:', {
    brand,
    model,
    fingerprint: fingerprint.substring(0, 50)
  });

  // Emulator indicators
  const isEmulator =
    brand.toLowerCase().includes('generic') ||
    model.toLowerCase().includes('emulator') ||
    model.toLowerCase().includes('sdk') ||
    fingerprint.toLowerCase().includes('generic') ||
    fingerprint.toLowerCase().includes('emulator');

  console.log('[Agenteract] Is emulator:', isEmulator);
  return isEmulator;
}

function getDefaultServerUrl(): string {
  const platform = getPlatform();

  // Only use emulator IP if on Android emulator
  if (platform === 'android' && isAndroidEmulator()) {
    console.log('[Agenteract] Using emulator default: ws://10.0.2.2:8765');
    return 'ws://10.0.2.2:8765';
  }

  console.log('[Agenteract] Using localhost default: ws://127.0.0.1:8765');
  return 'ws://127.0.0.1:8765';
}

// --- Config Storage ---
interface AgenteractConfig {
  host: string;
  port: number;
  token?: string;
  deviceId?: string;
}

const STORAGE_KEY = '@agenteract:config';

// Sanitize config for logging - mask token and omit undefined fields
function sanitizeForLog(config: AgenteractConfig): object {
  const result: Record<string, unknown> = { host: config.host, port: config.port };
  if (config.token) result.token = '****';
  if (config.deviceId) result.deviceId = config.deviceId;
  return result;
}

async function saveConfig(config: AgenteractConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    console.log('[Agenteract] Config saved:', sanitizeForLog(config));
  } catch (error) {
    console.warn('[Agenteract] Failed to save config:', error);
  }
}

async function loadConfig(): Promise<AgenteractConfig | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      console.log('[Agenteract] Loaded config:', sanitizeForLog(config));
      return config;
    }
  } catch (error) {
    console.warn('[Agenteract] Failed to load config:', error);
  }
  return null;
}

// --- Simulation Functions ---
// ... (Simulation functions remain the same)
export function simulateTap(id: string) {
  const node = getNode(id);
  if (node?.onPress) {
    node.onPress();
    return true;
  }
  console.warn(`simulateTap: No node or onPress handler found for testID "${id}"`);
  return false;
}

export function simulateInput(id: string, value: string) {
  const node = getNode(id);
  if (node?.onChangeText) {
    node.onChangeText(value);
    return true;
  }
  console.warn(`simulateInput: No node or onChangeText handler found for testID "${id}"`);
  return false;
}

export function simulateScroll(id: string, direction: 'up' | 'down' | 'left' | 'right', amount: number) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }

  const element = node.ref?.current;
  if (!element) {
    console.log('Node has no ref with ID:', id);
    return false;
  }

  const platform = getPlatform();

  // Calculate relative scroll offset
  const deltaX = direction === 'right' ? amount : direction === 'left' ? -amount : 0;
  const deltaY = direction === 'down' ? amount : direction === 'up' ? -amount : 0;

  if (platform === 'web') {
    // For web, use scrollBy for relative scrolling
    if (typeof element.scrollBy === 'function') {
      element.scrollBy({
        left: deltaX,
        top: deltaY,
        behavior: 'smooth',
      });
      return true;
    } else {
      console.log('Element does not support scrollBy with ID:', id);
      return false;
    }
  } else {
    // For React Native, we need to track position and use scrollTo with calculated absolute position
    if (typeof element.scrollTo !== 'function') {
      console.log('Element does not support scrollTo with ID:', id);
      return false;
    }

    // Initialize scroll position if not tracked
    if (!node.scrollPosition) {
      node.scrollPosition = { x: 0, y: 0 };
    }

    // Calculate new absolute position
    const newX = Math.max(0, node.scrollPosition.x + deltaX);
    const newY = Math.max(0, node.scrollPosition.y + deltaY);

    // Update tracked position
    node.scrollPosition.x = newX;
    node.scrollPosition.y = newY;

    // Scroll to new position
    element.scrollTo({
      x: newX,
      y: newY,
      animated: true,
    });

    return true;
  }
}

export function simulateLongPress(id: string) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }
  if (!node?.onLongPress) {
    console.log('Node has no onLongPress prop with ID:', id);
    return false;
  }
  if (node && node?.onLongPress) {
    node?.onLongPress();
    return true;
  }
  return false;
}

export function simulateSwipe(
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
  velocity: 'slow' | 'medium' | 'fast' = 'medium'
) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }

  // First check if there's an explicit onSwipe handler registered
  if (node.onSwipe) {
    node.onSwipe(direction, velocity);
    return true;
  }

  // Otherwise fall back to dispatching events
  const element = node.ref?.current;
  if (!element) {
    console.log('Node has no ref with ID:', id);
    return false;
  }

  const platform = getPlatform();

  // Velocity presets in pixels
  const velocityMap = { slow: 300, medium: 600, fast: 1200 };
  const distance = velocityMap[velocity];

  if (platform === 'web') {
    // For web, we'll dispatch touch events to simulate a swipe gesture
    const rect = element.getBoundingClientRect?.();
    if (!rect) {
      console.log('Cannot get element bounds for swipe with ID:', id);
      return false;
    }

    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    let endX = startX;
    let endY = startY;

    switch (direction) {
      case 'up':
        endY = startY - distance;
        break;
      case 'down':
        endY = startY + distance;
        break;
      case 'left':
        endX = startX - distance;
        break;
      case 'right':
        endX = startX + distance;
        break;
    }

    // Dispatch touch events
    const touchStart = new TouchEvent('touchstart', {
      touches: [{
        clientX: startX,
        clientY: startY,
        identifier: 0,
        target: element,
      } as Touch],
      bubbles: true,
      cancelable: true,
    });

    const touchMove = new TouchEvent('touchmove', {
      touches: [{
        clientX: endX,
        clientY: endY,
        identifier: 0,
        target: element,
      } as Touch],
      bubbles: true,
      cancelable: true,
    });

    const touchEnd = new TouchEvent('touchend', {
      changedTouches: [{
        clientX: endX,
        clientY: endY,
        identifier: 0,
        target: element,
      } as Touch],
      bubbles: true,
      cancelable: true,
    });

    element.dispatchEvent(touchStart);
    // Small delay to simulate gesture
    setTimeout(() => {
      element.dispatchEvent(touchMove);
      setTimeout(() => {
        element.dispatchEvent(touchEnd);
      }, 50);
    }, 50);

    return true;
  } else {
    // For React Native without explicit handler, try ScrollView horizontal swipe
    if (element.scrollTo && typeof element.scrollTo === 'function') {
      // If it's a scrollable element, use scroll for swipe
      const scrollAmount = distance;
      const deltaX = direction === 'right' ? -scrollAmount : direction === 'left' ? scrollAmount : 0;
      const deltaY = direction === 'down' ? -scrollAmount : direction === 'up' ? scrollAmount : 0;

      if (!node.scrollPosition) {
        node.scrollPosition = { x: 0, y: 0 };
      }

      const newX = Math.max(0, node.scrollPosition.x + deltaX);
      const newY = Math.max(0, node.scrollPosition.y + deltaY);

      node.scrollPosition.x = newX;
      node.scrollPosition.y = newY;

      element.scrollTo({
        x: newX,
        y: newY,
        animated: true,
      });

      return true;
    }

    console.log('No swipe handler or scrollable element found with ID:', id);
    return false;
  }
}


// --- Command Handler ---
const handleCommand = async (cmd: ServerCommand, socket: WebSocket, onAgentLink?: (url: string) => Promise<boolean> | boolean) => {
  if (typeof cmd !== 'object' || !('action' in cmd)) {
    console.log(`Warning: command missing 'action' field: ${JSON.stringify(cmd)}`);
    // Send a generic error back if the command is malformed
    socket.send(JSON.stringify({ status: 'error', error: "Invalid command format" }));
    return;
  }

  let success = false;
  switch (cmd.action) {
    case "tap":
      success = simulateTap(cmd.testID);
      break;
    case "input":
      success = simulateInput(cmd.testID, cmd.value);
      break;
    case "scroll":
      success = simulateScroll(cmd.testID, cmd.direction, cmd.amount);
      break;
    case "longPress":
      success = simulateLongPress(cmd.testID);
      break;
    case "swipe":
      success = simulateSwipe(cmd.testID, cmd.direction, cmd.velocity);
      break;
    case "agentLink":
      if (cmd.payload) {
        if (onAgentLink) {
          try {
            const handled = await onAgentLink(cmd.payload);
            success = handled;
            if (handled) {
              console.log('[Agenteract] agentLink handled by app');
            } else {
              console.log('[Agenteract] agentLink not handled by app');
            }
          } catch (error) {
            console.error('[Agenteract] Error in agentLink handler:', error);
            socket.send(JSON.stringify({ status: "error", error: `agentLink handler error: ${error}`, id: cmd.id }));
            return;
          }
        } else {
          console.log('[Agenteract] No agentLink handler configured');
          socket.send(JSON.stringify({ status: "error", error: "No agentLink handler configured", id: cmd.id }));
          return;
        }
      } else {
        socket.send(JSON.stringify({ status: "error", error: "Missing payload for agentLink", id: cmd.id }));
        return;
      }
      break;
    default:
      socket.send(JSON.stringify({ status: "error", error: `Unknown action ${cmd.action}`, id: cmd.id }));
      return;
  }
  
  socket.send(JSON.stringify({ status: success ? "ok" : "error", action: cmd.action, id: cmd.id }));
};

// --- AgentDebugBridge Component ---
export const AgentDebugBridge = ({
  projectName,
  autoConnect = true,
  onAgentLink
}: {
  projectName: string;
  autoConnect?: boolean;
  onAgentLink?: (url: string) => Promise<boolean> | boolean;
}) => {
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [shouldConnect, setShouldConnect] = useState<boolean>(false);
  const configLoadedRef = useRef<boolean>(false);
  const onAgentLinkRef = useRef(onAgentLink);

  // --- Load Config on Mount ---
  useEffect(() => {
    // Only load config once to prevent hot reload issues
    if (configLoadedRef.current) return;

    loadConfig().then(config => {
      if (config) {
        const protocol = config.host.includes('localhost') || config.host.includes('127.0.0.1') ? 'ws' : 'ws';
        const url = `${protocol}://${config.host}:${config.port}`;
        setServerUrl(url);
        setAuthToken(config.token);
        setDeviceId(config.deviceId);
        setShouldConnect(true);
        configLoadedRef.current = true;
        console.log('[Agenteract] Using saved config:', url);
        if (config.deviceId) {
          console.log('[Agenteract] Using stored device ID:', config.deviceId);
        }
      } else {
        // No saved config - use default URL
        const defaultUrl = getDefaultServerUrl();
        setServerUrl(defaultUrl);
        const isLocalhost = defaultUrl.includes('127.0.0.1') || defaultUrl.includes('10.0.2.2');
        setShouldConnect(autoConnect && isLocalhost);
        configLoadedRef.current = true;
        if (!isLocalhost) {
          console.log('[Agenteract] Physical device detected. Use "agenteract connect" to pair.');
        }
      }
    }).catch(error => {
      console.warn('[Agenteract] Error loading config:', error);
      const defaultUrl = getDefaultServerUrl();
      setServerUrl(defaultUrl);
      setShouldConnect(false);
      configLoadedRef.current = true;
    });
  }, [autoConnect]);

  // --- Deep Link Handler ---
  useEffect(() => {
    if (getPlatform() === 'web') return; // Skip for web

    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleDeepLink(url);
    });

    // Handle URL when app is already open
    const subscription = Linking.addEventListener('url', (event: { url: string }) => {
      handleDeepLink(event.url);
    });

    return () => subscription?.remove();
  }, []);

  const handleDeepLink = async (url: string) => {
    try {
      console.log('[Agenteract] Received deep link:', url);

      // Parse URL - supports both exp://*/agenteract/config and custom schemes
      // Examples:
      //   exp://192.168.1.5:8081/--/agenteract/config?host=...
      //   myapp://agenteract/config?host=...
      const parsed = new URL(url);

      // Check if this is an agenteract config link
      const isAgenteractConfig = parsed.pathname.includes('agenteract/config') ||
                                 parsed.pathname.includes('/--/agenteract/config');

      // If not a config link, let the custom handler try it
      if (!isAgenteractConfig) {
        if (onAgentLinkRef.current) {
          const handled = await onAgentLinkRef.current(url);
          if (handled) {
            console.log('[Agenteract] agentLink handled by app');
          } else {
            console.log('[Agenteract] agentLink not handled by app');
          }
        }
        return;
      }

      const params = new URLSearchParams(parsed.search);
      const host = params.get('host');
      const port = params.get('port');
      const token = params.get('token');

      if (host && port) {
        // Load existing config to preserve deviceId
        const existingConfig = await loadConfig();

        const config: AgenteractConfig = {
          host,
          port: parseInt(port, 10),
          token: token || undefined,
          deviceId: existingConfig?.deviceId, // Preserve existing device ID
        };

        await saveConfig(config);

        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'ws' : 'ws';
        const newUrl = `${protocol}://${host}:${port}`;
        setServerUrl(newUrl);
        setAuthToken(token || undefined);
        setDeviceId(config.deviceId);
        setShouldConnect(true);
        configLoadedRef.current = true;

        console.log('[Agenteract] Config updated from deep link:', sanitizeForLog(config));

        // Reconnect with new config
        if (socketRef.current) {
          socketRef.current.close();
          socketRef.current = null;
        }
      }
    } catch (error) {
      console.error('[Agenteract] Failed to parse deep link:', error);
    }
  };

  // --- Console Interception ---
  useEffect(() => {
    const originalConsole = { ...console };
    const levels: (keyof Console)[] = ['log', 'warn', 'error', 'info', 'debug'];

    levels.forEach((level) => {
      const originalMethod = originalConsole[level] as (...args: any[]) => void;
      // @ts-ignore
      console[level] = (...args: any[]) => {
        const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
        addLog(level, message);
        originalMethod.apply(console, args);
      };
    });

    return () => {
      levels.forEach(level => {
        // @ts-ignore
        console[level] = originalConsole[level];
      });
    };
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) return;
    if (!shouldConnect) {
      console.log('[Agenteract] Auto-connect disabled. Use deep link to configure.');
      return;
    }
    if (!serverUrl) {
      console.log('[Agenteract] No server URL configured yet. Waiting for config to load...');
      return;
    }

    try {
      // Build URL with token and deviceId if available
      const params: string[] = [];
      if (authToken) params.push(`token=${authToken}`);
      if (deviceId) params.push(`deviceId=${deviceId}`);

      const wsUrl = params.length > 0
        ? `${serverUrl}/${projectName}?${params.join('&')}`
        : `${serverUrl}/${projectName}`;

      console.log('[Agenteract] Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***').replace(/deviceId=[^&]+/, 'deviceId=***'));
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[Agenteract] Connected to agent server');

        // Send device info to server
        const platform = getPlatform();
        const constants = (Platform as any).constants || {};

        // Detect if this is a simulator/emulator
        let isSimulator = platform === 'web';
        if (platform === 'android') {
          isSimulator = isAndroidEmulator();
        } else if (platform === 'ios') {
          // iOS simulators have isDevice: false or utsname.machine contains 'Simulator'
          isSimulator = constants.isDevice === false ||
                       constants.utsname?.machine?.includes('Simulator');
        }

        // Get device name and model based on platform
        let deviceName: string;
        let deviceModel: string;

        if (platform === 'ios') {
          // On iOS, use systemName and utsname.machine or default to 'iPhone'
          const machineName = constants.utsname?.machine || 'iPhone';
          deviceModel = machineName;
          deviceName = machineName;
        } else if (platform === 'android') {
          // On Android, use Brand and Model
          deviceModel = constants.Model || 'Android';
          deviceName = constants.Brand ? `${constants.Brand} ${constants.Model}` : deviceModel;
        } else {
          // Web or other platforms
          deviceModel = platform;
          deviceName = platform;
        }

        const deviceInfo = {
          status: 'deviceInfo',
          deviceInfo: {
            isSimulator,
            deviceId: deviceId,
            bundleId: projectName, // Use project name as bundle identifier
            deviceName,
            osVersion: Platform.Version?.toString() || constants.Release || 'Unknown',
            deviceModel
          }
        };

        socket.send(JSON.stringify(deviceInfo));
        console.log('[Agenteract] Sent device info to server');
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle server-assigned device ID
          if (data.status === 'connected' && data.deviceId) {
            const newDeviceId = data.deviceId as string;
            console.log('[Agenteract] Received device ID from server:', newDeviceId);

            // Load existing config and update with device ID
            const existingConfig = await loadConfig();
            if (existingConfig) {
              const updatedConfig: AgenteractConfig = {
                ...existingConfig,
                deviceId: newDeviceId
              };
              await saveConfig(updatedConfig);
              setDeviceId(newDeviceId);
              console.log('[Agenteract] Stored device ID for future connections');
            }
            return;
          }

          const command: ServerCommand = data;
          console.log('[Agenteract] Received command:', command.action);

          if (command.action === 'getViewHierarchy') {
            const hierarchy = getFilteredHierarchy();
            socket.send(JSON.stringify({ status: 'success', hierarchy, id: command.id }));
          } else if (command.action === 'getConsoleLogs') {
            socket.send(JSON.stringify({ status: 'success', logs: logBuffer, id: command.id }));
          } else {
            await handleCommand(command, socket, onAgentLinkRef.current);
          }
        } catch (error) {
          console.warn('[Agenteract] Command error:', error);
          socket.send(JSON.stringify({ status: 'error', error: (error as Error).message }));
        }
      };

      socket.onerror = (error: any) => {
        // Log but don't throw - prevents red box errors
        const errorMsg = error?.message || 'Connection failed';
        console.log(`[Agenteract] Connection error: ${errorMsg}`);
      };

      socket.onclose = (event: any) => {
        const reason = event.reason || `code ${event.code}`;
        console.log(`[Agenteract] Disconnected: ${reason}. Reconnecting...`);
        socketRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        // @ts-ignore
        timeoutRef.current = setTimeout(connect, 3000);
      };
    } catch (error) {
      console.log('[Agenteract] Failed to create WebSocket:', error);
      socketRef.current = null;
    }
  }, [projectName, serverUrl, authToken, deviceId, shouldConnect]);

  useEffect(() => {
    connect();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return null;
};

export default AgentDebugBridge;
