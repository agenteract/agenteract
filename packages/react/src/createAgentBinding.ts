// this should be moved to utils/createAgentBinding.ts - It's not a hook now
import { createRef } from 'react';
import { registerNode } from './utils/AgentRegistry';

export function createAgentBinding<T extends object>({
  testID,
  onPress,
  onLongPress,
  onChangeText,
}: {
  testID: string;
  onPress?: (...args: any[]) => void;
  onLongPress?: (...args: any[]) => void;
  onChangeText?: (text: string) => void;
}) {
  const ref = createRef<T>();
  registerNode(testID, { ref, onPress, onLongPress, onChangeText });

  return {
    ref,
    testID,
    onPress,
    onLongPress,
    onChangeText,
    accessible: true,
  };
}
