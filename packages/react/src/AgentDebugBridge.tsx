import { useEffect, useRef, useCallback, useState } from 'react';
import { getFilteredHierarchy } from './getFilteredHierarchy';
import { getNode } from './utils/AgentRegistry';
import { AgentCommand } from '@agenteract/core';

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
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return 'web';
  try {
    const RN = require('react-native');
    return RN.Platform.OS;
  } catch {
    return 'web';
  }
};

const DEFAULT_AGENT_SERVER_URL = getPlatform() === 'android'
  ? 'ws://10.0.2.2:8765'
  : 'ws://127.0.0.1:8765';

// --- Config Storage ---
interface AgenteractConfig {
  host: string;
  port: number;
  token?: string;
}

const STORAGE_KEY = '@agenteract:config';

async function saveConfig(config: AgenteractConfig): Promise<void> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    console.log('[Agenteract] Config saved:', config);
  } catch (error) {
    console.warn('[Agenteract] Failed to save config:', error);
  }
}

async function loadConfig(): Promise<AgenteractConfig | null> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      console.log('[Agenteract] Loaded config:', config);
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
const handleCommand = async (cmd: ServerCommand, socket: WebSocket) => {
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
    default:
      socket.send(JSON.stringify({ status: "error", error: `Unknown action ${cmd.action}`, id: cmd.id }));
      return;
  }
  
  socket.send(JSON.stringify({ status: success ? "ok" : "error", action: cmd.action, id: cmd.id }));
};

// --- AgentDebugBridge Component ---
export const AgentDebugBridge = ({ projectName }: { projectName: string }) => {
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_AGENT_SERVER_URL);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);

  // --- Load Config on Mount ---
  useEffect(() => {
    loadConfig().then(config => {
      if (config) {
        const protocol = config.host.includes('localhost') || config.host.includes('127.0.0.1') ? 'ws' : 'ws';
        const url = `${protocol}://${config.host}:${config.port}`;
        setServerUrl(url);
        setAuthToken(config.token);
        console.log('[Agenteract] Using saved config:', url);
      }
    });
  }, []);

  // --- Deep Link Handler ---
  useEffect(() => {
    if (getPlatform() === 'web') return; // Skip for web

    try {
      const Linking = require('expo-linking');

      // Handle initial URL (app opened via deep link)
      Linking.getInitialURL().then((url: string | null) => {
        if (url) handleDeepLink(url);
      });

      // Handle URL when app is already open
      const subscription = Linking.addEventListener('url', (event: { url: string }) => {
        handleDeepLink(event.url);
      });

      return () => subscription?.remove();
    } catch (error) {
      console.warn('[Agenteract] expo-linking not available, deep linking disabled');
    }
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

      if (!isAgenteractConfig) return;

      const params = new URLSearchParams(parsed.search);
      const host = params.get('host');
      const port = params.get('port');
      const token = params.get('token');

      if (host && port) {
        const config: AgenteractConfig = {
          host,
          port: parseInt(port, 10),
          token: token || undefined,
        };

        await saveConfig(config);

        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'ws' : 'ws';
        const newUrl = `${protocol}://${host}:${port}`;
        setServerUrl(newUrl);
        setAuthToken(token || undefined);

        console.log('[Agenteract] Config updated from deep link:', config);

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

    // Add token to URL if available
    const wsUrl = authToken
      ? `${serverUrl}/${projectName}?token=${authToken}`
      : `${serverUrl}/${projectName}`;

    console.log('[Agenteract] Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***'));
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => console.log('Connected to agent');

    socket.onmessage = async (event) => {
      try {
        const command: ServerCommand = JSON.parse(event.data);
        console.log('Received command from agent:', command);

        if (command.action === 'getViewHierarchy') {
          const hierarchy = getFilteredHierarchy();
          socket.send(JSON.stringify({ status: 'success', hierarchy, id: command.id }));
        } else if (command.action === 'getConsoleLogs') {
          socket.send(JSON.stringify({ status: 'success', logs: logBuffer, id: command.id }));
        } else {
          await handleCommand(command, socket);
        }
      } catch (error) {
        socket.send(JSON.stringify({ status: 'error', error: (error as Error).message }));
      }
    };

    socket.onerror = (error: any) => {
      console.error('Agent Bridge WebSocket error:', error.message || 'Unknown error');
    };

    socket.onclose = (event: any) => {
      console.log(`Disconnected from agent: ${event.reason || `code ${event.code}`}. Reconnecting...`);
      socketRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // @ts-ignore
      timeoutRef.current = setTimeout(connect, 3000);
    };
  }, [projectName, serverUrl, authToken]); // Add dependencies

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
