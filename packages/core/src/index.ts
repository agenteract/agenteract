export interface AgentCommand {
  action: string;
  [key: string]: any;
}

export interface AgentResponse {
  status: 'success' | 'error' | 'received';
  [key: string]: any;
}

export const AGENTERACT_PROTOCOL_VERSION = '1.0.0';

export function encodeMessage(obj: object): string {
  return JSON.stringify({ ...obj, _v: AGENTERACT_PROTOCOL_VERSION });
}

export function decodeMessage<T>(json: string): T {
  return JSON.parse(json) as unknown as T;
}

export function sendCommand(command: AgentCommand): Promise<AgentResponse> {
  return Promise.resolve({ status: 'success', response: 'Command sent' });
}

export function receiveResponse(response: AgentResponse): Promise<AgentCommand> {
  return Promise.resolve({ action: 'response', response: response });
}
