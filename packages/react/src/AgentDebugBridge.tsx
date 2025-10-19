import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { getFilteredHierarchy } from './DevToolsHierarchy';
import { getNode } from './utils/AgentRegistry';
import { AgentCommand } from '@agenteract/core';

const AGENT_SERVER_URL = Platform.OS === 'android' ? 'ws://10.0.2.2:8765' : 'ws://127.0.0.1:8765';

export function simulateTap(id: string) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }
  if (!node?.onPress) {
    console.log('Node has no onPress prop with ID:', id);
    return false;
  }
  if (node && node?.onPress) {
    node?.onPress();
    return true;
  }
  return false;
}

export function simulateInput(id: string, value: string) {
  const node = getNode(id);
  if (!node) {
    console.log('Node not found with ID:', id);
    return false;
  }
  if (!node?.onChangeText) {
    console.log('Node has no onChangeText prop with ID:', id);
    return false;
  }
  if (node && node?.onChangeText) {
    node?.onChangeText(value);
    return true;
  }
  return false;
}

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


const handleCommand = async (cmd: AgentCommand, socket: WebSocket) => {
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

export const AgentDebugBridge = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // --- DEBUG LOGGING ---
  // Poll for the DevTools hook until it's available.
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     console.log('--- Attempting to get hierarchy from DevTools hook ---');
  //     const hierarchy = getFilteredHierarchy();
  //     if (hierarchy) {
  //       console.log('--- Hierarchy found! ---');
  //       console.log(hierarchy);
  //       console.log('--------------------------');
  //       clearInterval(interval); // Stop polling once we succeed
  //     }
  //   }, 1000); // Try every second

  //   return () => clearInterval(interval);
  // }, []);
  // --- END DEBUG LOGGING ---

  const connect = useCallback(() => {
    if (socketRef.current) {
      return;
    }

    const socket = new WebSocket(AGENT_SERVER_URL);
    socketRef.current = socket;

    socket.onopen = () => console.log('Connected to agent');

    socket.onmessage = async (event) => {
      try {
        const command = JSON.parse(event.data);
        console.log('Received command from agent:', command);

        if (command.action === 'getViewHierarchy') {
          const hierarchy = getFilteredHierarchy();
          socket.send(JSON.stringify({ status: 'success', hierarchy }));
        } else {
          await handleCommand(command, socket);
          socket.send(JSON.stringify({ status: 'received', command }));
        }
      } catch (error) {
        socket.send(JSON.stringify({ status: 'error', error: (error as Error).message }));
      }
    };

    socket.onerror = (error: any) => {
      const errorMessage = error.message || 'An unknown WebSocket error occurred';
      console.error('Agent Bridge WebSocket error:', errorMessage);
    };

    socket.onclose = (event: any) => {
      const errorMessage = event.reason || `Connection closed (code: ${event.code})`;
      console.log(`Disconnected from agent: ${errorMessage}. Reconnecting in 3s...`);
      socketRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // @ts-ignore - setTimeout returns a number in React Native
      timeoutRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
