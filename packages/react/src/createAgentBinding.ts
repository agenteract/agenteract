import { createRef, ChangeEvent } from 'react';
import { registerNode } from './utils/AgentRegistry';

const getPlatform = (): 'android' | 'ios' | 'web' => {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'web';
  }
  try {
    const RN = require('react-native');
    return RN.Platform.OS;
  } catch {
    return 'web';
  }
};

type BaseProps = {
  testID: string;
};

type NativeProps = BaseProps & {
  onPress?: (...args: any[]) => void;
  onLongPress?: (...args: any[]) => void;
  onChangeText?: (text: string) => void;
};

type WebProps = BaseProps & {
  onClick?: (...args: any[]) => void;
  onContextMenu?: (...args: any[]) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function createAgentBinding<T extends object>(props: NativeProps | WebProps) {
  const { testID } = props;
  const ref = createRef<T>();
  const platform = getPlatform();
  const returnProps: { [key: string]: any } = { ref };

  if (platform === 'web') {
    const webProps = props as WebProps;
    registerNode(testID, {
      ref,
      onPress: webProps.onClick,
      onLongPress: webProps.onContextMenu,
      onChangeText: webProps.onChange
        ? (text: string) => {
            const event = { target: { value: text } } as ChangeEvent<HTMLInputElement>;
            webProps.onChange?.(event);
          }
        : undefined,
    });

    returnProps['data-testid'] = testID;
    if (webProps.onClick) returnProps.onClick = webProps.onClick;
    if (webProps.onContextMenu) returnProps.onContextMenu = webProps.onContextMenu;
    if (webProps.onChange) returnProps.onChange = webProps.onChange;
  } else {
    const nativeProps = props as NativeProps;
    registerNode(testID, {
      ref,
      onPress: nativeProps.onPress,
      onLongPress: nativeProps.onLongPress,
      onChangeText: nativeProps.onChangeText,
    });

    returnProps.testID = testID;
    returnProps.accessible = true;
    if (nativeProps.onPress) returnProps.onPress = nativeProps.onPress;
    if (nativeProps.onLongPress) returnProps.onLongPress = nativeProps.onLongPress;
    if (nativeProps.onChangeText) returnProps.onChangeText = nativeProps.onChangeText;
  }

  return returnProps;
}
