import { useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { getFilteredHierarchy } from './getFilteredHierarchy';
import { getNode } from './utils/AgentRegistry';
import { AgentCommand } from '@agenteract/core';

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

const AGENT_SERVER_URL = getPlatform() === 'android' 
  ? 'ws://10.0.2.2:8765' 
  : 'ws://127.0.0.1:8765';

// --- Simulation Functions ---
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

// ... (other simulation functions remain the same)
export function simulateScroll(id: string, direction: 'up' | 'down' | 'left' | 'right', amount: number) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }
  if (!node.ref?.current?.scrollTo) {
    console.log('Node cannot be scrolled with ID:', id);
    return false;
  }

  const scrollOptions = {
    y: direction === 'down' ? amount : direction === 'up' ? -amount : 0,
    x: direction === 'right' ? amount : direction === 'left' ? -amount : 0,
    animated: true,
  };

  node.ref.current.scrollTo(scrollOptions);
  return true;
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


// --- Command Handler ---
const handleCommand = async (cmd: AgentCommand, socket: WebSocket) => {
  // ... (handleCommand logic remains the same)
  if (typeof cmd !== 'object' || !('testID' in cmd)) {
    console.log(`Warning: non testID command not handled: ${JSON.stringify(cmd)}`)
    return;

  }
  let target = cmd.testID;
  switch (cmd.action) {
    case "tap":
      simulateTap(target);
      break;
    case "input":
      simulateInput(target, cmd.value);
      break;
    case "scroll":
      simulateScroll(target, cmd.direction, cmd.amount);
      break;
    case "longPress":
      simulateLongPress(target);
      break;
    default:
      socket.send(JSON.stringify({ status: "error", error: `Unknown action ${cmd.action}` }));
      return;
  }
  socket.send(JSON.stringify({ status: "ok", action: cmd.action }));
};

// --- AgentDebugBridge Component ---
export const AgentDebugBridge = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<number | null>(null);

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

    const socket = new WebSocket(AGENT_SERVER_URL);
    socketRef.current = socket;

    socket.onopen = () => console.log('Connected to agent');

    socket.onmessage = async (event) => {
      try {
        const command = JSON.parse(event.data);
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
  }, []);

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