# Future Security Roadmap: Deep Link Pairing & Token Auth

This document outlines the planned security architecture for Agenteract, moving from the current "local-trust" model to a token-based authentication system using Deep Links for configuration delivery.

## 1. The Problem

Currently, Agenteract relies on network proximity and trusted local environments.
- **No Authentication:** Any client on the network can connect to the WebSocket server.
- **Hardcoded Config:** Apps need to know the server IP/Host, which varies by network.
- **DX Friction:** Manually updating host IPs or tokens in app code is error-prone and tedious.

## 2. The Solution: Deep Link Configuration Protocol

We will implement a "Deep Link Pairing" strategy. The Agenteract CLI will generate a secure token and deliver it to the app via the operating system's native deep linking capabilities.

### A. The Configuration Payload
The configuration will be encoded into a standard URL scheme:

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
-   [ ] **Token Generation:** Generate a cryptographic token on server startup.
-   [ ] **Auth Middleware:** Reject WebSocket connections missing the valid token.
-   [ ] **New Command:** Implement `agenteract connect` to handle QR generation and `simctl`/`adb` injection.

### Client SDKs (`@agenteract/react`, `@agenteract/flutter`, `@agenteract/kotlin`)
-   [ ] **URL Handler:** Listen for the `agenteract/config` deep link path.
-   [ ] **Persistence:** Implement secure storage for `host`, `port`, and `token`.
-   [ ] **Connection Logic:** Update `AgentDebugBridge` to prioritize stored config over defaults.
-   [ ] **Fallback:** Default to `localhost:8765` (no auth) if no stored config exists, preserving the "zero config" local dev experience.

## 4. Implementation Steps

1.  **Refactor Configuration:** Unify configuration logic (currently duplicated in `cli` and `agents`) into a shared package (`@agenteract/core` or similar) to manage token generation and storage centrally.
2.  **Implement Server Auth:** Add token validation to the WebSocket server.
3.  **Update Client SDKs:** Add URL handling and persistence to the React, Flutter, and Kotlin SDKs.
4.  **Add CLI Command:** Build the `connect` command with QR and simulator support.

## 5. Reference

This plan is stored for future reference and implementation.
