# Security Implementation: Deep Link Pairing & Token Auth

This document describes the implemented security architecture for Agenteract, which has moved from a "local-trust" model to a token-based authentication system using Deep Links for configuration delivery.

## Status: ✅ Core Implementation Complete

The deep link pairing and token authentication system is now **fully implemented** across all platforms:
- ✅ **Backend**: Token generation, auth middleware, connect command
- ✅ **React/Expo**: Deep linking with AsyncStorage
- ✅ **Flutter**: Deep linking with SharedPreferences and uni_links
- ✅ **Swift**: Deep linking with UserDefaults
- ✅ **Kotlin**: Deep linking with SharedPreferences (Android) and UserDefaults (iOS)
- ✅ **Documentation**: Comprehensive guides for all platforms

See "Remaining Todo" section below for future enhancements.

## 1. The Problem (Original - Now Solved)

~~Currently~~Previously, Agenteract relied on network proximity and trusted local environments:
- ~~**No Authentication:** Any client on the network can connect to the WebSocket server.~~ **SOLVED**: Token-based auth now required for remote connections
- ~~**Hardcoded Config:** Apps need to know the server IP/Host, which varies by network.~~ **SOLVED**: Deep link pairing automatically delivers config
- ~~**DX Friction:** Manually updating host IPs or tokens in app code is error-prone and tedious.~~ **SOLVED**: QR code scanning with persistent storage

## 2. The Solution: Deep Link Configuration Protocol (Implemented)

We ~~will implement~~ have implemented a "Deep Link Pairing" strategy. The Agenteract CLI generates a secure token and delivers it to the app via the operating system's native deep linking capabilities.

### A. The Configuration Payload
The configuration is encoded into a standard URL scheme:

```
<scheme>://agenteract/config?host=<ip>&port=<port>&token=<secure-token>
```

Example: `expo-app://agenteract/config?host=192.168.1.5&port=8765&token=abc-123-secure`

### B. Workflow

#### 1. Physical Devices (QR Code)
1.  **CLI:** User runs `agenteract connect`.
2.  **Output:** CLI displays a QR code containing the deep link URL.
3.  **Action:** User scans the QR code with their device's system camera.
4.  **System:** Prompts to open the registered app (e.g., "Open in Expo Go").
5.  **App:** Launches, parses the URL, extracts the token/host, saves them to persistent storage, and connects.

#### 2. Simulators / Emulators (Auto-Connect)
1.  **CLI:** User runs `agenteract connect`.
2.  **Automation:** CLI detects running simulators/emulators.
3.  **Injection:** CLI executes platform-specific commands to open the URL:
    -   **iOS:** `xcrun simctl openurl booted "myapp://..."`
    -   **Android:** `adb shell am start -W -a android.intent.action.VIEW -d "myapp://..."`
4.  **App:** Launches/Focuses and configures itself automatically.

#### 3. Debugging from IDE (Persistent Storage)
1.  **Setup:** User pairs once using the methods above.
2.  **Storage:** App SDK (`AgentDebugBridge`) saves the config to device storage (e.g., `AsyncStorage`, `UserDefaults`).
3.  **Run:** User hits "Play" / "Debug" in their IDE.
4.  **Launch:** App starts, loads the saved config, and auto-connects.

## 3. Architecture Changes

### Backend (`@agenteract/server`, `@agenteract/cli`)
-   [x] **Token Generation:** Generate a cryptographic token on server startup.
-   [x] **Auth Middleware:** Reject WebSocket connections missing the valid token (with localhost exception).
-   [x] **New Command:** Implement `agenteract connect` to handle QR generation and `simctl`/`adb` injection.
-   [x] **Device Selection:** Support both device list and `--device` flag for targeted connections.
-   [x] **QR-Only Mode:** `--qr-only` flag for manual scanning without auto-opening simulators.
-   [x] **All Devices:** `--all` flag to open deep link on all detected devices.

### Client SDKs

#### React/React Native/Expo (`@agenteract/react`)
-   [x] **URL Handler:** Listen for the `agenteract/config` deep link path (using `expo-linking`).
-   [x] **Persistence:** Implement AsyncStorage for `host`, `port`, and `token`.
-   [x] **Connection Logic:** `AgentDebugBridge` prioritizes stored config over defaults.
-   [x] **Fallback:** Defaults to `localhost:8765` (no auth) if no stored config exists.
-   [x] **Expo Go Support:** Special URL format `exp://host:port/--/agenteract/config?...`.

#### Flutter (`agenteract`)
-   [x] **URL Handler:** Listen for deep links using `uni_links` package.
-   [x] **Persistence:** Implement SharedPreferences for `host`, `port`, and `token`.
-   [x] **Connection Logic:** `AgentDebugBridge` prioritizes stored config over defaults.
-   [x] **Fallback:** Defaults to `127.0.0.1:8765` (iOS) or `10.0.2.2:8765` (Android) if no stored config.
-   [x] **Platform Detection:** Automatic platform-specific localhost URLs.

#### Swift (`agenteract-swift`)
-   [x] **URL Handler:** SwiftUI `.onOpenURL` modifier for deep link handling.
-   [x] **Persistence:** UserDefaults for `host`, `port`, and `token`.
-   [x] **Connection Logic:** `AgentWebSocketManager` uses stored config or defaults.
-   [x] **Fallback:** Defaults to `127.0.0.1:8765` if no stored config.

#### Kotlin Multiplatform (`@agenteract/kotlin`)
-   [x] **URL Handler (Android):** `DeepLinkHandler` parses Android Intents.
-   [x] **Persistence:** SharedPreferences (Android), UserDefaults (iOS), in-memory (Desktop).
-   [x] **Connection Logic:** `AgentDebugBridge` loads saved config on initialization.
-   [x] **Fallback:** Defaults to `localhost:8765` if no stored config.
-   [x] **Context Initialization:** `AgenteractContext.appContext` for Android SharedPreferences access.
-   [x] **Error Handling:** Graceful degradation when config storage unavailable.

## 4. Implementation Steps

1.  [x] **Refactor Configuration:** Token generation and storage centralized in `@agenteract/server` with `.agenteract-runtime.json` persistence.
2.  [x] **Implement Server Auth:** Token validation added to WebSocket server with localhost exception.
3.  [x] **Update Client SDKs:** All SDKs (React, Flutter, Swift, Kotlin) support deep linking and config persistence.
4.  [x] **Add CLI Command:** `agenteract connect` with QR, device detection, and platform-specific URL opening.
5.  [x] **Documentation:** Comprehensive deep linking docs for all platforms (README.md, AGENTS.md, package READMEs).

## 5. Reference

This plan is stored for future reference and implementation.

## Implementation Status

### ✅ Completed
- [x] **Token Generation:** Server generates cryptographic token on startup
- [x] **Token Persistence:** Tokens saved to `.agenteract-runtime.json` and reused across restarts
- [x] **Auth Middleware:** WebSocket server validates tokens (with localhost exception)
- [x] **Connect Command:** `agenteract connect` with QR generation and simulator/emulator auto-open
- [x] **Device Detection:** Automatic detection of iOS simulators and Android emulators by ID
- [x] **Configurable Scheme:** Projects can set URL schemes via `--scheme` flag in `add-config`
- [x] **Localhost Exception:** Connections from localhost don't require tokens for zero-config local dev

### Authentication Behavior
- **Localhost Connections**: Token is **optional** when detected via:
  - Remote address: `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
  - Host header: `localhost`, `127.0.0.1`, `[::1]`
  - Use cases:
    - iOS/Android simulators/emulators on same machine
    - Web browsers connecting to local vite/webpack dev servers
    - Maintains zero-config developer experience
- **Remote Connections** (physical devices, network): Token is **required**
  - Must use `agenteract connect` for deep link pairing
  - Provides security when server is network-accessible

## Platform-Specific Implementation Details

### React/Expo
- **Deep Link Format:** `scheme://agenteract/config?host=...&port=...&token=...`
- **Expo Go Format:** `exp://host:port/--/agenteract/config?host=...&port=...&token=...`
- **Storage:** AsyncStorage (`@react-native-async-storage/async-storage`)
- **Deep Link Library:** `expo-linking` for Expo, native for React Native
- **Docs:** `packages/react/README.md#deep-linking--configuration`

### Flutter
- **Deep Link Format:** `scheme://agenteract/config?host=...&port=...&token=...`
- **Storage:** SharedPreferences (`shared_preferences` package)
- **Deep Link Library:** `uni_links` package
- **Platform Detection:** Automatic selection of `127.0.0.1` (iOS) or `10.0.2.2` (Android)
- **Docs:** `packages/flutter/README.md#deep-linking--physical-device-setup`

### Swift
- **Deep Link Format:** `scheme://agenteract/config?host=...&port=...&token=...`
- **Storage:** UserDefaults
- **Deep Link Handler:** SwiftUI `.onOpenURL` modifier in `AgentDebugBridge`
- **Docs:** `agenteract-swift/README.md#deep-linking--configuration`

### Kotlin Multiplatform
- **Deep Link Format:** `scheme://agenteract/config?host=...&port=...&token=...`
- **Storage:** SharedPreferences (Android), UserDefaults (iOS), in-memory (Desktop)
- **Deep Link Handler:** `DeepLinkHandler.handleIntent()` in MainActivity
- **Android Setup:** Requires `AgenteractContext.appContext` initialization
- **Docs:** `packages/kotlin/README.md#deep-linking--configuration`

## Remaining Todo:
 - [ ] pty servers should be authenticated automatically: They can read a token from disk, don't pass by command line
 - [x] ~~Expo go - Deep linking should work for sending endpoint and token~~ (Completed: Special exp:// URL format implemented)
 - [ ] endpoint and token should support app side configuration by user code - Downstream apps may want to implement their own mechanisms
 - [ ] Automatically identify scheme based on project contents (e.g., parse AndroidManifest.xml, Info.plist)
 - [ ] Deep linking in general should be seen as a way of starting apps with a specific state to enable quicker dev/test of specific features - Eg don't require entire app flow to reach feature A. Use a predefined app state (eg logged in user) and then navigate to feature A screen for dev/test.
 - [x] ~~Document in README~~ (Completed: Full documentation in all package READMEs, main README, and AGENTS.md)
 - [ ] SSL support (wss:// protocol)


## Physical Device Testing
- [x] Expo / Android
- [x] Expo / iOS
- [x] Flutter / Android
- [x] Flutter / iOS
- [x] KMP / Android
- [x] Swift / iOS

Expo Issues:
- [x] ~~Settings not saving - connect works, but settings might be lost on hot reload, app still tries to connect to 10.0.0.2~~ (Fixed: Added configLoadedRef to prevent reload race conditions)
- [x] ~~Log connection errors, catch exceptions (Don't show red box)~~ (Fixed: All errors now logged via console.log/warn instead of throwing)
- [x] ~~Only try 10.0.2.2 from emulator (non physical device)~~ (Fixed: Added isPhysicalDevice() detection using Platform.constants)
- [x] ~~Allow user to configure ADB to only connect with valid parameters - Don't connect automatically~~ (Fixed: Added autoConnect prop, defaults to false on physical devices without config)

General:
- [x] Multiple devices - devs often have simulator and physical device running.
It should be possible to set a default device (Otherwise we need to update all APIs to accept a device id which is too heavy + context wasting)


- [x] Expo
- [x] Flutter
- [x] KMP
- [x] Swift

- [x] Expo e2e failing - Was incorrectly finding text in logs before, rather than UI hierarchy?

- [ ] Local simulators that have token set won't be able to reconnect without clearing token - Bad for e2e
