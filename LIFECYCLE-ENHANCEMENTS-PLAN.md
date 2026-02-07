# 🎯 App Lifecycle Enhancements - Implementation Plan

**Date**: 2026-02-07  
**Status**: APPROVED - Ready for Implementation  
**Scope**: All Phase 1-3 operations (boot, build, install, uninstall, reinstall, clear data, port forwarding)

---

## 📊 Plan Summary

**Goal**: Extend lifecycle utilities with complete app lifecycle management  
**Scope**: All Phase 1-3 operations (boot, build, install, uninstall, reinstall, clear data, port forwarding)  
**API Style**: Platform-agnostic with graceful NOOP handling  
**Breaking Changes**: None - pure additions  
**Estimated New Functions**: 11 (11 existing → 22 total)  
**Estimated New Lines**: ~600 lines code + ~800 lines tests  

---

## ✅ Decisions Confirmed

1. ✅ **Device State Detection**: Add `getDeviceState()` helper function
2. ✅ **Gradle Sharing**: Extract `findGradle()` to shared helper (avoid duplication)
3. ✅ **Boot Timeout**: Configurable via `DeviceBootOptions.timeout` (default 30s)
4. ✅ **Build Output**: Add `silent` option to all build operations (default: true)
5. ✅ **Config Priority**: `options > lifecycle config > auto-detected`

---

## 📁 Files to Modify/Create

### **Modified Files**

1. **`/packages/core/src/node/lifecycle-utils.ts`**
   - Current: 366 lines, 11 exported functions
   - After: ~966 lines (+600), 22 exported functions (+11)
   - Add new lifecycle operations
   - Add shared helpers (`findGradle`, `getDeviceState`)

2. **`/packages/core/src/node/index.ts`**
   - Add exports for new functions and types

3. **`/packages/agents/src/index.ts`**
   - Re-export new public API

### **New Files**

4. **`/packages/core/src/node/lifecycle-utils.test.ts`** (NEW)
   - ~800 lines of comprehensive unit tests
   - Mock all system commands
   - Test all platforms, edge cases, NOOPs

### **Verification Files**

5. **`/packages/agents/package.json`** (VERIFY)
   - Ensure exports field correct

---

## 🔧 New Functions (11 Total)

### **Shared Helpers** (2 functions)

#### 1. `getDeviceState(device: Device | string): Promise<DeviceState>`
```typescript
interface DeviceState {
  id: string;
  state: 'booted' | 'shutdown' | 'unknown';
  platform: 'ios' | 'android' | 'desktop';
}
```
- iOS: Parse `xcrun simctl list devices --json`
- Android: Parse `adb devices -l` 
- Desktop: Always 'booted'
- Use case: Check if boot needed before operations

#### 2. `findGradle(projectPath: string): Promise<string>`
- Check for `./gradlew` in projectPath
- Fallback to `gradle` if wrapper not found
- Throw error if neither exists
- Returns: `'./gradlew'` or `'gradle'`
- Use case: Shared by install/build operations

### **Core Lifecycle** (3 functions)

#### 3. `bootDevice(options: DeviceBootOptions): Promise<void>`
```typescript
interface DeviceBootOptions {
  device: Device | string;
  waitForBoot?: boolean;  // Default: true
  timeout?: number;       // Default: 30000 (overridable for CI)
}
```
- iOS: `xcrun simctl boot <device-id>` if shutdown
- Android: NOOP (auto-boot)
- Desktop: NOOP
- Handles already-booted gracefully

#### 4. `clearAppData(options: AppLifecycleOptions): Promise<void>`
- iOS: `xcrun simctl uninstall` (only way to clear data)
- Android: `adb shell pm clear <package>`
- Expo Go: NOOP
- Handles app-not-installed gracefully

#### 5. `setupPortForwarding(options: PortForwardingOptions): Promise<void>`
```typescript
interface PortForwardingOptions {
  device: Device | string;
  port: number;           // Default: 8765
  hostPort?: number;      // Default: same as port
}
```
- Android: `adb reverse tcp:<port> tcp:<hostPort>`
- iOS: NOOP (shares localhost)
- Desktop: NOOP
- Handles already-forwarded gracefully

### **Install/Uninstall** (3 functions)

#### 6. `installApp(options: InstallOptions): Promise<void>`
```typescript
interface InstallOptions extends AppLifecycleOptions {
  configuration?: 'debug' | 'release';  // Default: 'debug'
  apkPath?: string;                     // Android: direct APK install
}
```
- iOS: NOOP (auto-installed by dev server)
- Android: `adb install <apk>` OR `./gradlew installDebug`
- Expo Go: NOOP
- Uses `findGradle()` helper

#### 7. `uninstallApp(options: AppLifecycleOptions): Promise<void>`
- iOS: `xcrun simctl uninstall <device> <bundle>`
- Android: `adb uninstall <package>`
- Expo Go: NOOP
- Handles not-installed gracefully

#### 8. `reinstallApp(options: InstallOptions): Promise<void>`
```typescript
export async function reinstallApp(options: InstallOptions): Promise<void> {
  console.log('🔄 Reinstalling app...');
  await uninstallApp(options);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await installApp(options);
  console.log('✓ App reinstalled');
}
```
- Wrapper: uninstall → delay → install
- Use case: Fresh state testing

### **Build** (1 function)

#### 9. `buildApp(options: BuildOptions): Promise<void>`
```typescript
interface BuildOptions extends AppLifecycleOptions {
  configuration?: 'debug' | 'release' | string;  // Default: 'debug'
  platform?: 'ios' | 'android';                  // Multi-platform projects
  silent?: boolean;                              // Default: true (no output)
}
```

**Platform-specific implementations**:
- **Flutter**: 
  - iOS: `flutter build ios --debug`
  - Android: `cd android && ./gradlew assembleDebug`
- **Prebuilt Expo**:
  - iOS: `xcodebuild -workspace ...`
  - Android: `cd android && ./gradlew assembleDebug`
- **KMP**:
  - Android: `./gradlew assembleDebug`
  - Desktop: `./gradlew packageDistributionForCurrentOS`
- **Swift**: `xcodebuild -scheme <scheme> -configuration <config>`
- **Vite**: `npm run build`
- **Expo Go**: NOOP

**Output control**:
- `silent: true` (default): Only show "✓ Build completed"
- `silent: false`: Stream full build output to console

Uses `findGradle()` helper

### **Enhanced Existing** (2 functions)

#### 10. Enhance `startApp()` - Auto-boot iOS simulators
```typescript
// Add before launch logic:
if (platform === 'ios' && deviceObj.state === 'shutdown') {
  console.log('ℹ️  Device shutdown, booting...');
  await bootDevice({ device: deviceObj, waitForBoot: true });
}
```
- No API changes
- Improves UX for shutdown simulators
- Backward compatible

#### 11. Enhance `AppLifecycleOptions` - Support lifecycle config
```typescript
export interface AppLifecycleOptions {
  projectPath: string;
  device: Device | string;
  bundleId?: string;
  mainActivity?: string;
  force?: boolean;
  
  // NEW: Build/install configuration
  configuration?: 'debug' | 'release' | string;
  
  // NEW: Lifecycle config from agenteract.config.js (future)
  lifecycleConfig?: {
    bundleId?: { ios?: string; android?: string };
    mainActivity?: string;
    launchTimeout?: number;
    requiresInstall?: boolean;
  };
}
```
- Extends existing interface
- Backward compatible (all optional)
- Config priority: `options.bundleId` > `lifecycleConfig.bundleId` > auto-detected

---

## 🧪 Testing Strategy

### **Test File Structure** (`lifecycle-utils.test.ts`)

```typescript
// Mock setup
const mockExecFileAsync = jest.fn();
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
  spawn: mockSpawn,
}));

jest.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

describe('lifecycle-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Shared Helpers', () => {
    describe('getDeviceState', () => { /* 5 tests */ });
    describe('findGradle', () => { /* 4 tests */ });
  });

  describe('bootDevice', () => { /* 7 tests */ });
  describe('clearAppData', () => { /* 6 tests */ });
  describe('setupPortForwarding', () => { /* 6 tests */ });
  describe('installApp', () => { /* 8 tests */ });
  describe('uninstallApp', () => { /* 5 tests */ });
  describe('reinstallApp', () => { /* 3 tests */ });
  describe('buildApp', () => { /* 10 tests */ });
  describe('startApp - enhanced auto-boot', () => { /* 4 tests */ });
});
```

### **Test Coverage by Function**

1. **getDeviceState()** - 5 tests
   - ✓ Should get iOS device state (booted)
   - ✓ Should get iOS device state (shutdown)
   - ✓ Should get Android device state
   - ✓ Should return unknown for invalid device
   - ✓ Should handle desktop as always booted

2. **findGradle()** - 4 tests
   - ✓ Should find gradle wrapper (./gradlew)
   - ✓ Should fallback to global gradle
   - ✓ Should throw if gradle not found
   - ✓ Should check correct project path

3. **bootDevice()** - 7 tests
   - ✓ Should boot shutdown iOS simulator
   - ✓ Should skip if already booted (NOOP)
   - ✓ Should wait for boot completion when waitForBoot=true
   - ✓ Should not wait when waitForBoot=false
   - ✓ Should timeout if boot exceeds timeout value
   - ✓ Should handle Android as NOOP
   - ✓ Should handle desktop as NOOP

4. **clearAppData()** - 6 tests
   - ✓ Should clear Android app data via pm clear
   - ✓ Should uninstall iOS app to clear data
   - ✓ Should handle Expo Go as NOOP
   - ✓ Should handle app not installed gracefully
   - ✓ Should resolve bundle ID if not provided
   - ✓ Should use provided bundle ID

5. **setupPortForwarding()** - 6 tests
   - ✓ Should setup Android port forwarding
   - ✓ Should use custom hostPort
   - ✓ Should default hostPort to port value
   - ✓ Should handle iOS as NOOP
   - ✓ Should handle port already forwarded gracefully
   - ✓ Should handle desktop as NOOP

6. **installApp()** - 8 tests
   - ✓ Should install Android via gradle installDebug
   - ✓ Should install Android via gradle installRelease
   - ✓ Should install Android from APK path
   - ✓ Should use findGradle helper
   - ✓ Should handle iOS as NOOP
   - ✓ Should handle Expo Go as NOOP
   - ✓ Should handle Vite as NOOP
   - ✓ Should detect project type correctly

7. **uninstallApp()** - 5 tests
   - ✓ Should uninstall iOS app
   - ✓ Should uninstall Android app
   - ✓ Should handle app not installed gracefully
   - ✓ Should handle Expo Go as NOOP
   - ✓ Should resolve bundle ID

8. **reinstallApp()** - 3 tests
   - ✓ Should call uninstall then install
   - ✓ Should wait 1s between operations
   - ✓ Should pass configuration to install

9. **buildApp()** - 10 tests
   - ✓ Should build Flutter Android via gradle
   - ✓ Should build Flutter iOS via flutter build
   - ✓ Should build KMP Android
   - ✓ Should build Vite via npm run build
   - ✓ Should handle Expo Go as NOOP
   - ✓ Should use custom configuration string
   - ✓ Should stream output when silent=false
   - ✓ Should suppress output when silent=true
   - ✓ Should require platform for multi-platform projects
   - ✓ Should use findGradle helper

10. **Enhanced startApp()** - 4 tests
    - ✓ Should auto-boot shutdown iOS simulator
    - ✓ Should skip boot if already booted
    - ✓ Should not affect Android behavior
    - ✓ Should not affect desktop behavior

**Total Tests**: ~58 tests  
**Estimated Coverage**: >90% of new code

---

## 📤 Export Strategy

### **Core Package** (`/packages/core/src/node/index.ts`)

```typescript
export * from './config.js';
export * from './pnpm.js';
export * from './device-manager.js';
export * from './platform-detector.js';
export * from './bundle-resolver.js';

// Re-export from app-launcher (internal - used by CLI/server)
export { 
  launchApp, 
  stopApp as stopAppInternal,
  buildApp as buildAppInternal,
  performSetup,
  type LaunchResult,
  type BuildOptions as InternalBuildOptions,
  type SetupOptions
} from './app-launcher.js';

// Re-export from lifecycle-utils (public API)
export {
  // Platform-agnostic API
  startApp,
  stopApp,
  restartApp,
  bootDevice,
  clearAppData,
  setupPortForwarding,
  installApp,
  uninstallApp,
  reinstallApp,
  buildApp,
  isExpoGo,
  
  // Shared helpers
  getDeviceState,
  findGradle,
  
  // Low-level utilities
  stopIOSApp,
  startIOSApp,
  restartIOSApp,
  stopAndroidApp,
  startAndroidApp,
  restartAndroidApp,
  
  // Types
  type AppLifecycleOptions,
  type DeviceBootOptions,
  type PortForwardingOptions,
  type InstallOptions,
  type BuildOptions,
  type DeviceState,
} from './lifecycle-utils.js';
```

### **Agents Package** (`/packages/agents/src/index.ts`)

```typescript
export {
  // Platform-agnostic API (recommended)
  startApp,
  stopApp,
  restartApp,
  bootDevice,
  clearAppData,
  setupPortForwarding,
  installApp,
  uninstallApp,
  reinstallApp,
  buildApp,
  isExpoGo,
  
  // Shared helpers
  getDeviceState,
  findGradle,
  
  // Low-level platform commands (for advanced use)
  stopIOSApp,
  startIOSApp,
  restartIOSApp,
  stopAndroidApp,
  startAndroidApp,
  restartAndroidApp,
  
  // Types
  type Device,
  type DeviceState,
  type AppLifecycleOptions,
  type DeviceBootOptions,
  type PortForwardingOptions,
  type InstallOptions,
  type BuildOptions,
} from '@agenteract/core/node';
```

---

## 📋 Output Message Standards

### **Success Messages**
```
✓ iOS simulator booted successfully
✓ Cleared app data for com.example.app
✓ Port forwarding setup: tcp:8765 -> tcp:8765 on emulator-5554
✓ Installed app via gradle (installDebug)
✓ Uninstalled com.example.app
✓ App reinstalled successfully
✓ Build completed successfully
```

### **NOOP Messages**
```
ℹ️  Device already booted
ℹ️  Android emulators boot automatically (NOOP)
ℹ️  iOS simulators share localhost with host (NOOP)
ℹ️  iOS apps auto-install during development (NOOP)
ℹ️  Cannot clear data for Expo Go apps (NOOP)
ℹ️  Cannot uninstall Expo Go apps (NOOP)
ℹ️  Expo Go apps use OTA updates, no build required (NOOP)
ℹ️  App not installed (already clean)
```

### **Progress Messages**
```
🔄 Reinstalling app (uninstall + install)...
🔨 Building Flutter Android app (debug)...
ℹ️  Device shutdown, booting...
```

---

## 🔄 Implementation Sequence

### **Phase 1: Foundation** (Sprint 1)
1. Create test file with mock setup
2. Implement `getDeviceState()` + tests
3. Implement `findGradle()` + tests
4. Verify test infrastructure works

### **Phase 2: Core Lifecycle** (Sprint 1)
5. Implement `bootDevice()` + tests
6. Implement `clearAppData()` + tests
7. Implement `setupPortForwarding()` + tests
8. Run tests, verify all pass

### **Phase 3: Install/Uninstall** (Sprint 2)
9. Implement `installApp()` + tests
10. Implement `uninstallApp()` + tests
11. Implement `reinstallApp()` + tests
12. Run tests, verify all pass

### **Phase 4: Build** (Sprint 2)
13. Implement `buildApp()` + tests (with silent option)
14. Test build operations for each platform type
14. a. Add an option to expo e2e test that prebuilds the app
14. b. Add a pnpm script that runs the expo-ios test with the prebuild option enabled: test:e2e:expo:ios:prebuild
15. Run all tests, verify pass

### **Phase 5: Enhancements** (Sprint 3)
16. Enhance `startApp()` with auto-boot
17. Add auto-boot tests
18. Update exports in core/index.ts
19. Update exports in agents/index.ts

### **Phase 6: Integration & Polish** (Sprint 3)
20. Rebuild packages (core, agents)
21. Run full test suite (unit + E2E)
22. Verify zero breaking changes
23. Update JSDoc documentation
24. Final review

---

## 🎯 Success Criteria

### **Functional Requirements**
- ✅ All 11 new functions implemented
- ✅ All functions follow platform-agnostic pattern
- ✅ NOOPs clearly communicated in output
- ✅ Graceful error handling (no crashes)
- ✅ Configuration override support (timeout, silent, etc.)

### **Quality Requirements**
- ✅ 58+ unit tests, all passing
- ✅ >90% code coverage for new code
- ✅ All existing tests still pass
- ✅ Zero breaking changes to API
- ✅ Clear console output with emojis

### **Documentation Requirements**
- ✅ Comprehensive JSDoc for each function
- ✅ Usage examples in comments
- ✅ Type definitions exported
- ✅ README updates (future)

---

## 🚨 Risk Mitigation

### **Known Risks**

1. **Gradle Detection Complexity**
   - Risk: Different project structures may have gradle in unexpected locations
   - Mitigation: `findGradle()` has clear fallback chain, throws helpful error

2. **iOS Simulator Boot Timing**
   - Risk: Boot can be slow on older machines, default 30s may be insufficient
   - Mitigation: `timeout` is configurable in `DeviceBootOptions`

3. **Port Forwarding Conflicts**
   - Risk: Port may already be forwarded from previous session
   - Mitigation: Gracefully handle "address already in use" errors

4. **Build Output Streams**
   - Risk: Large build output may overwhelm console
   - Mitigation: `silent: true` by default, only show when explicitly requested

5. **Platform Command Variations**
   - Risk: Commands may vary across OS versions (especially Android SDK)
   - Mitigation: Extensive test coverage, graceful error messages

---

## 📊 Estimated Effort

### **Development Time**
- Phase 1 (Foundation): 2 hours
- Phase 2 (Core Lifecycle): 4 hours
- Phase 3 (Install/Uninstall): 3 hours
- Phase 4 (Build): 4 hours
- Phase 5 (Enhancements): 2 hours
- Phase 6 (Integration): 2 hours

**Total Estimated Time**: ~17 hours (2-3 days)

### **Lines of Code**
- Implementation: ~600 lines
- Tests: ~800 lines
- Documentation: ~100 lines (JSDoc)

**Total New Code**: ~1,500 lines

---

## ✅ Status

**Date Created**: 2026-02-07  
**Status**: ✅ APPROVED - Ready for Implementation  
**Last Updated**: 2026-02-07  

---

## 📚 References

- Original requirements from `yaml-tests.diff`
- Existing lifecycle utilities pattern
- App launcher test patterns from diff
- User decisions confirmed 2026-02-07
