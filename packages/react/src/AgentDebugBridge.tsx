import { useEffect, useRef, useCallback } from 'react';
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

const AGENT_SERVER_URL = getPlatform() === 'android' 
  ? 'ws://10.0.2.2:8765' 
  : 'ws://127.0.0.1:8765';

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

    const socket = new WebSocket(`${AGENT_SERVER_URL}/${projectName}`);
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
  }, [projectName]); // Add projectName to dependency array

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
