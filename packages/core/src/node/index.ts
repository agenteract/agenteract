export * from './config.js';
export * from './pnpm.js';
export * from './device-manager.js';
export * from './platform-detector.js';
export * from './bundle-resolver.js';
export * from './agent-client.js';

// Re-export from app-launcher (internal - used by CLI/server)
export { 
  launchApp, 
  stopApp as stopAppInternal,
  buildApp, 
  performSetup,
  type StartAppResult,
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
  
  // Device utilities
  bootDevice,
  getDeviceState,
  
  // Data management
  clearAppData,
  
  // Installation
  installApp,
  uninstallApp,
  reinstallApp,
  
  // Build operations (note: buildApp from app-launcher is also exported above)
  // The buildApp from lifecycle-utils is the newer implementation
  
  // Port forwarding
  setupPortForwarding,
  
  // Low-level platform-specific utilities
  stopIOSApp,
  startIOSApp,
  restartIOSApp,
  stopAndroidApp,
  startAndroidApp,
  restartAndroidApp,
  startKMPApp,
  startKMPDesktopApp, // deprecated, use startKMPApp
  
  // Utilities
  findGradle,
  
  // Types
  type AppLifecycleOptions,
  type DeviceState,
  type DeviceBootOptions,
  type PortForwardingOptions,
  type InstallOptions,
  // Note: BuildOptions and StartAppResult are exported from app-launcher above
} from './lifecycle-utils.js';
