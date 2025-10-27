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
  onScroll?: (event: any) => void;
  onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', velocity: 'slow' | 'medium' | 'fast') => void;
};

type WebProps = BaseProps & {
  onClick?: (...args: any[]) => void;
  onContextMenu?: (...args: any[]) => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onScroll?: (event: any) => void;
  onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', velocity: 'slow' | 'medium' | 'fast') => void;
};

export function createAgentBinding<T extends object>(props: NativeProps | WebProps) {
  const { testID } = props;
  const ref = createRef<T>();
  const platform = getPlatform();
  const returnProps: { [key: string]: any } = { ref };

  if (platform === 'web') {
    const webProps = props as WebProps;
    const node = {
      ref,
      onPress: webProps.onClick,
      onLongPress: webProps.onContextMenu,
      onChangeText: webProps.onChange
        ? (text: string) => {
            const event = { target: { value: text } } as ChangeEvent<HTMLInputElement>;
            webProps.onChange?.(event);
          }
        : undefined,
      onSwipe: webProps.onSwipe,
    };
    registerNode(testID, node);

    returnProps['data-testid'] = testID;
    if (webProps.onClick) returnProps.onClick = webProps.onClick;
    if (webProps.onContextMenu) returnProps.onContextMenu = webProps.onContextMenu;
    if (webProps.onChange) returnProps.onChange = webProps.onChange;
    if (webProps.onScroll) returnProps.onScroll = webProps.onScroll;
  } else {
    const nativeProps = props as NativeProps;
    const node = {
      ref,
      onPress: nativeProps.onPress,
      onLongPress: nativeProps.onLongPress,
      onChangeText: nativeProps.onChangeText,
      onSwipe: nativeProps.onSwipe,
      scrollPosition: { x: 0, y: 0 },
    };
    registerNode(testID, node);

    returnProps.testID = testID;
    returnProps.accessible = true;
    if (nativeProps.onPress) returnProps.onPress = nativeProps.onPress;
    if (nativeProps.onLongPress) returnProps.onLongPress = nativeProps.onLongPress;
    if (nativeProps.onChangeText) returnProps.onChangeText = nativeProps.onChangeText;

    // For React Native, wrap onScroll to track position for relative scrolling
    if (nativeProps.onScroll) {
      returnProps.onScroll = (event: any) => {
        // Track scroll position for agent commands
        if (event?.nativeEvent?.contentOffset) {
          node.scrollPosition = {
            x: event.nativeEvent.contentOffset.x || 0,
            y: event.nativeEvent.contentOffset.y || 0,
          };
        }
        // Call the original handler
        nativeProps.onScroll?.(event);
      };
    } else {
      // Even without a user-provided onScroll, track position for agent commands
      returnProps.onScroll = (event: any) => {
        if (event?.nativeEvent?.contentOffset) {
          node.scrollPosition = {
            x: event.nativeEvent.contentOffset.x || 0,
            y: event.nativeEvent.contentOffset.y || 0,
          };
        }
      };
    }
  }

  return returnProps;
}
