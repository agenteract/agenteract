// Platform
export const Platform = { OS: 'web' } as const;

// Components
export const View = (props: any) => null;
export const Text = (props: any) => null;
export const Pressable = (props: any) => null;

// Native Modules & Registry
export const NativeModules = {};

export const TurboModuleRegistry = {
  get: (name: string) => null,
  getEnforcing: (name: string) => null,
};

// Event Emitter
export class NativeEventEmitter {
  constructor(module?: any) {}
  addListener(eventType: string, listener: Function) {
    return { remove: () => {} };
  }
  removeListener(eventType: string, listener: Function) {}
  removeAllListeners(eventType?: string) {}
}

// Linking
export const Linking = {
  getInitialURL: () => Promise.resolve(null),
  addEventListener: (type: string, handler: Function) => ({ remove: () => {} }),
  openURL: (url: string) => Promise.resolve(true),
  canOpenURL: (url: string) => Promise.resolve(true),
};

export default {
  Platform,
  View,
  Text,
  Pressable,
  NativeModules,
  TurboModuleRegistry,
  NativeEventEmitter,
  Linking,
};


