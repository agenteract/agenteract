/**
 * @agenteract/agents
 * 
 * Programmatic API for Agenteract agent tools
 */

// Re-export lifecycle utilities from core
export {
  // Platform-agnostic API (recommended)
  startApp,
  stopApp,
  restartApp,
  isExpoGo,
  
  // Low-level platform commands (for advanced use)
  stopIOSApp,
  startIOSApp,
  restartIOSApp,
  stopAndroidApp,
  startAndroidApp,
  restartAndroidApp,
  
  // Types
  type Device,
  type AppLifecycleOptions,
} from '@agenteract/core/node';
