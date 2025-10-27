import { RefObject } from 'react';

export interface AgentNode {
  ref: RefObject<any>;
  onPress?: (...args: any[]) => void;
  onLongPress?: (...args: any[]) => void;
  onChangeText?: (text: string) => void;
  onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', velocity: 'slow' | 'medium' | 'fast') => void;
  scrollPosition?: { x: number; y: number };
}

export const agentRegistry: Record<string, AgentNode> = {};

export function registerNode(id: string, node: AgentNode) {
  agentRegistry[id] = node;
}

export function unregisterNode(id: string) {
  delete agentRegistry[id];
}

export function getNode(id: string): AgentNode | null {
  return agentRegistry[id] ?? null;
}
