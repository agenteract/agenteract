export * from './config.js';
export * from './pnpm.js';
export * from './device-manager.js';
export * from './platform-detector.js';
export * from './bundle-resolver.js';

// Re-export from app-launcher (internal - used by CLI/server)
export { 
  launchApp, 
  stopApp as stopAppInternal,
  buildApp, 
  performSetup,
  type LaunchResult,
  type BuildOptions,
  type SetupOptions
} from './app-launcher.js';

// Re-export from lifecycle-utils (public API)
export {
  // Platform-agnostic API
  startApp,
  stopApp,
  restartApp,
  isExpoGo,
  
  // Low-level utilities
  stopIOSApp,
  startIOSApp,
  restartIOSApp,
  stopAndroidApp,
  startAndroidApp,
  restartAndroidApp,
  
  // Types
  type AppLifecycleOptions,
} from './lifecycle-utils.js';
