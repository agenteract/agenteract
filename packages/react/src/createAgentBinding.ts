// this should be moved to utils/createAgentBinding.ts - It's not a hook now
import { createRef } from 'react';
import { registerNode } from './utils/AgentRegistry';

export function createAgentBinding<T extends object>({
  testID,
  onPress,
  onChangeText,
}: {
  testID: string;
  onPress?: (...args: any[]) => void;
  onChangeText?: (text: string) => void;
}) {
  const ref = createRef<T>();
  registerNode(testID, { ref, onPress, onChangeText });

  return {
    ref,
    testID,
    onPress,
    onChangeText,
    accessible: true,
  };
}
