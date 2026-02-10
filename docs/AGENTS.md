# Agenteract Agent Instructions

You are an expert developer assistant. Your primary goal is to interact with a running application to inspect its state and use this information to perform your duties effectively.

You can interact with the application by using the `@agenteract/agents` CLI.

## Agent vs User Responsibilities

**Agent Tasks (Automated):**
- Installing AgentDebugBridge packages
- Adding AgentDebugBridge component to the app
- **[EXPO PROJECTS]** Ask user about Expo Go vs prebuilds (only for Expo projects)
- Creating `agenteract.config.js` via `add-config` command
- Add to `.gitignore`: `agenteract.config.js`, `.agenteract-runtime.json`
- Configuring deep linking in app manifests

**User Tasks (Manual):**
- Running `npx @agenteract/cli dev` to start the multiplexed dev server
- Running `pnpm agenteract connect` and scanning QR codes for physical device pairing

**Building and Running Apps**
Most apps can be built and launched by the agent using dev servers or build commands. Check with the user what their preferred flow is.

## Project Detection

Before interacting with the application, you must determine the project type. You can do this by inspecting the `package.json` file for dependencies like `expo` or `vite`.

## Installing `AgentDebugBridge`

To communicate with the app, an AgentDebugBride is required. The setup method differs by app:
Expo:

* AgentDebugBridge example: 

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/expo-example/app/App.tsx

* Packages: 
`@agenteract/react` (`AgentDebugBridge`)

The following can be installed either in the app, or at the monorepo root if applicable.

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

`@react-native-async-storage/async-storage`

`expo-linking`

Usage:
```tsx
import { AgentDebugBridge } from '@agenteract/react';
// ...
{ __DEV__ && <AgentDebugBridge projectName="expo-app" /> }
```

React: 
AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/react-example/src/main.tsx

* Packages: 
`@agenteract/react` (`AgentDebugBridge`)

The following can be installed either in the app, or at the monorepo root if applicable.

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

Usage:

```tsx
import { AgentDebugBridge } from '@agenteract/react';
// ...
{ __DEV__ && <AgentDebugBridge projectName="react-app" /> }
```

Swift UI:

* AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/swift-app/AgenteractSwiftExample/AgenteractSwiftExample/ContentView.swift

Packages:
`https://github.com/agenteract/agenteract-swift` (SPM)

These will be called via npx, you will need to press y [enter] the first time they run.

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

**App setup (No special code needed):**

```swift
import SwiftUI

@main
struct YourApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

**Add AgentDebugBridge to your main view:**

```swift
import Agenteract
// ...
.background(
    AgentDebugBridge(projectName: "mySwiftApp")
)
```

**Important:** The `AgentDebugBridge` automatically handles:
- Deep link configuration (no manual code needed in App struct)
- WebSocket connection for both commands and logs (single connection)
- Persistent configuration storage

You don't need to create WebSocket managers or handle deep links manually in your App struct.

Kotlin Multiplatform:

* AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/kmp-example/src/commonMain/kotlin/App.kt

* Packages:
`io.agenteract:agenteract-kotlin` (Local path - not yet published)

Installation in `build.gradle.kts`:
```kotlin
kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(project(":kotlin"))
        }
    }
}
```

**For Android - MainActivity setup:**
```kotlin
import io.agenteract.AgenteractContext
import io.agenteract.DeepLinkHandler

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Agenteract context
        AgenteractContext.appContext = applicationContext

        // Handle deep link if present
        DeepLinkHandler.handleIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        DeepLinkHandler.handleIntent(intent)
    }
}
```

**AndroidManifest.xml deep link configuration:**
```xml
<activity android:name=".MainActivity" android:exported="true">
    <!-- Existing intent filters... -->

    <!-- Agenteract deep linking -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />

        <data
            android:scheme="yourapp"
            android:host="agenteract"
            android:pathPrefix="/config" />
    </intent-filter>
</activity>
```

Usage:
```kotlin
import io.agenteract.AgentDebugBridge
// ...
AgentDebugBridge(projectName = "kmp-app")
```

Making composables interactive:
```kotlin
import io.agenteract.agent

// Button with tap handler
Button(
    onClick = { handleClick() },
    modifier = Modifier.agent(
        testID = "submit-button",
        onTap = { handleClick() }
    )
) {
    Text("Submit")
}

// Text input
var text by remember { mutableStateOf("") }
TextField(
    value = text,
    onValueChange = { text = it },
    modifier = Modifier.agent(
        testID = "username-input",
        onChangeText = { text = it }
    )
)
```

Flutter:

* AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/flutter_example/lib/main.dart

* Packages:
`agenteract` (Git or local path - not yet on pub.dev)

Installation:
```yaml
dependencies:
  agenteract:
    git:
      url: https://github.com/agenteract/agenteract.git
      path: packages/flutter
```

The following can be installed either in the app, or at the monorepo root if applicable.

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

Usage:

```dart
import 'package:agenteract/agenteract.dart';
import 'package:flutter/foundation.dart';
// ...
if (kDebugMode) {
  return AgentDebugBridge(
    projectName: 'myFlutterApp',
    child: MyApp(),
  );
}
```

Making widgets interactive:

```dart
// Use the .withAgent() extension on any widget
ElevatedButton(
  onPressed: () => print('clicked'),
  child: Text('Click me'),
).withAgent('submit-button', onTap: () => print('clicked'))

// Text input
TextField(
  onChanged: (text) => print(text),
).withAgent('username-input', onChangeText: (text) => print(text))
```

## Physical Device Setup

For testing on **physical devices** (mobile phones, tablets), you need to configure deep linking to enable secure pairing between the device and the Agenteract server.

### Configuring Deep Linking

When adding a configuration for a native app, include the `--scheme` parameter:

```bash
# For React Native/Expo apps
pnpm agenteract add-config . my-app native --scheme myapp

# For Expo with Expo Go (ask user first!)
pnpm agenteract add-config . my-app expo --scheme exp

# For Expo with prebuilds (ask user first!)
pnpm agenteract add-config . my-app expo --scheme myapp

# For Swift apps
pnpm agenteract add-config . my-app native --scheme myapp

# For Kotlin/Android apps
pnpm agenteract add-config . my-app native --scheme myapp
```

### Platform-Specific Deep Link Setup

Each platform requires additional configuration in the app to handle deep links:

**React Native / Expo:**
- See [packages/react/README.md](../packages/react/README.md#deep-linking--configuration) for:
  - iOS `Info.plist` configuration
  - Android `AndroidManifest.xml` configuration
  - Expo `app.json` configuration

**Flutter:**
- See [packages/flutter/README.md](../packages/flutter/README.md#deep-linking--physical-device-setup) for:
  - iOS `Info.plist` configuration
  - Android `AndroidManifest.xml` configuration
  - Required dependencies (`shared_preferences`, `app_links`)

**Swift / iOS:**
- See [agenteract-swift README](https://github.com/agenteract/agenteract-swift#deep-linking--configuration) for:
  - `Info.plist` URL scheme configuration
  - Deep link handling in SwiftUI

**Kotlin / Android:**
- See [packages/kotlin/README.md](../packages/kotlin/README.md#deep-linking--configuration) for:
  - `AndroidManifest.xml` intent filter configuration
  - `MainActivity` deep link handling
  - `AgenteractContext` initialization

### Connecting Physical Devices

Once deep linking is configured in the app:

1. Start the dev server if not already running:
   ```bash
   pnpm agenteract dev
   ```

2. Use the connect command to generate a pairing QR code:
   ```bash
   pnpm agenteract connect
   ```

3. The user scans the QR code with their device camera

4. The app receives the deep link containing:
   - Server IP address
   - Server port
   - Authentication token

5. Configuration is saved permanently to device storage:
   - **Flutter**: SharedPreferences
   - **React Native/Expo**: AsyncStorage
   - **Swift/iOS**: UserDefaults
   - **Kotlin/Android**: SharedPreferences

### Simulators and Emulators

Simulators and emulators **do not require deep linking** - they automatically connect to `localhost:8765` without any additional configuration.

## Dev Server Setup

Agenteract offers a multiplexed terminal application that serves two purposes:
1. Route app interaction commands to multiple apps
2. Handle AgentDebugBridge connections from apps
3. Buffer dev server (eg Expo, Vite) logs and expose them to agents

For this to work, we need to configure the dev server. This can be done at a workspace root, or within a single application.

### *Step 1: Configuration*

The command below will create an initial `agenteract.config.js`, or add entries to an existing configuration.

**New Format (Generic Dev Server - Recommended):**
```bash
pnpm agenteract add-config <path> <projectName> <command> [port] --scheme myapp
```

`port` is auto assigned if not provided. This is the port that Agenteract uses to communicate internally, it's not where the dev server hosts files.


**Parameters:**
- `path`: Path to the project directory
- `projectName`: Project name as supplied to `AgentDebugBridge`
- `command`: Dev server command (e.g., `"npm run dev"`, `"remix dev"`)
- `port` (optional): PTY bridge port (auto-assigned if omitted)
- `--scheme myapp`: Scheme used for QR code / deep link pairing: See [Configuring Deep Linking](#configuring-deep-linking)

**Examples:**
```bash
# Next.js app
pnpm agenteract add-config ./apps/web next-app "npm run dev"

# Remix app (auto-assigned port)
pnpm agenteract add-config ./apps/remix remix-app "remix dev"

# Django app
pnpm agenteract add-config ./backend django-app "python manage.py runserver"
```
**Note:** The new generic format supports any dev server command, making Agenteract framework-agnostic. Legacy types (expo/vite/flutter) are automatically migrated to the new `devServer` format with preset configurations.


### *Step 2: Start Dev Server and apps*

The user (Not the agent) can now start their dev server.

Use Tab to switch between apps. This enables user to launch the app and see diagnostic output. 

At this point the agent should also have access to dev server logs.

## Agent Setup Completion Message Template

When the agent finishes setup, it should clearly tell the user:

"Agenteract setup is complete! To start using it, please run:

```bash
pnpm agenteract dev
```

This will start the dev server. Once running, I'll be able to interact with your app."

# Agent Tools

## Tool: Get Logs

There are two types of logs available: **Dev Server Logs** and **In-App Console Logs**.

### Logging Architecture by Platform

**Expo/Vite (Web/React Native):**
- Dev server logs: Captured via PTY from `expo start` / `vite`
- Runtime logs: Captured via console interception in JavaScript

**Flutter (Hybrid):**
- Dev server logs: Captured via PTY from `flutter run` (build errors, device connection, hot reload status)
- Runtime logs: Captured via WebSocket from `debugPrint` calls in the app
- **Both sources are needed**: PTY logs show build/device issues, WebSocket logs show app runtime behavior

**Swift (Native):**
- No dev server (Xcode handles building/running)
- Runtime logs: Sent via WebSocket using `AgentLogger.log()`

### 1. Dev Server Logs

These logs come from the development server process (like Vite, Expo Metro, or Flutter). They are essential for debugging **build-time errors**, such as transpilation failures, device connection issues, or server crashes. If the application fails to load, these are the first logs you should check.

**Command**
```bash
pnpm agenteract-agents dev-logs <project-name> --since 20
```

**Examples:**
```bash
# Expo project
pnpm agenteract-agents dev-logs expo-app --since 20

# Vite/React project
pnpm agenteract-agents dev-logs react-app --since 20

# Flutter project
pnpm agenteract-agents dev-logs flutter-app --since 20

# Next.js or any custom dev server
pnpm agenteract-agents dev-logs next-app --since 20
```

Note: Dev logs show the output from your dev server command (e.g., `npm run dev`, `flutter run`), including:
- Build progress and errors
- Device connection status (for mobile)
- Hot reload/restart confirmations
- Server startup messages

### 2. In-App Console Logs

These logs are captured from the running application's console/print calls. Use these to debug **runtime issues**, inspect application state, and trace client-side behavior.

**How logs are captured by platform:**
- **React/Expo/Vite**: Automatic interception of `console.log/warn/error` by AgentDebugBridge
- **Flutter**: Automatic capture of `debugPrint` calls via ConsoleLogger (sent over WebSocket)
- **Swift**: Manual logging via `AgentLogger.log()` from the Agenteract Swift package

**Command**
```bash
pnpm agenteract-agents logs <project-name> --since 20
```

**Important for Flutter**: Use both `dev-logs` and `logs` together:
- `dev-logs flutter-app` shows build and device issues from `flutter run`
- `logs flutter-app` shows runtime app behavior from your `debugPrint` statements

`since` identifies how many log lines you want to tail.

*You should ignore any WARNings unless specific asked to fix them!*

## Dev Server Commands

You can send keystrokes to the dev server console using the `cmd` command:

Note that the agenteract dev server must be started by the **user** - this enables the framework dev server PTYs (eg npx expo, etc.) to be shared by the user and agent.

```bash
pnpm agenteract dev
```

**Command**
```bash
pnpm agenteract-agents cmd <project-name> <keystroke>
```

**Examples:**

**Expo project commands:**
```bash
# Start iOS app
pnpm agenteract-agents cmd expo-app i

# Start Android app
pnpm agenteract-agents cmd expo-app a

# Reload the app
pnpm agenteract-agents cmd expo-app r
```

**Vite project commands:**
```bash
# Reload the app
pnpm agenteract-agents cmd react-app r

# Quit
pnpm agenteract-agents cmd react-app q
```

***Important: Don't forget to hot restart and check for errors after running `flutter pub get` or adding any new modules ***

**Command**
```bash
# Hot reload
pnpm agenteract-agents cmd flutter-app r

# Hot restart
pnpm agenteract-agents cmd flutter-app R

# Quit
pnpm agenteract-agents cmd flutter-app q

# Show help
pnpm agenteract-agents cmd flutter-app h
```

**Custom dev server commands:**
Commands depend on what your dev server supports. Common ones include `r` (reload), `q` (quit).

If commands don't work, instruct the user to start the CLI wrapper:

```bash
pnpm agenteract dev
```

## App Lifecycle Management Tools

Agenteract provides commands to manage app launching, stopping, building, and setup operations programmatically across all platforms.

### Tool: Launch App

Launch an application on a device or simulator. The platform is auto-detected, and the app will be built if necessary.

**Command:**
```bash
pnpm agenteract-agents launch <project> [options]
```

**Options:**
- `--device <id>`: Target specific device/simulator ID
- `--platform <type>`: Override platform detection (vite, expo, flutter, xcode, kmp-android, kmp-desktop)
- `--headless`: Launch browser in headless mode (web apps only)

**Examples:**
```bash
# Launch with auto-detected platform and default device
pnpm agenteract-agents launch expo-app

# Launch on specific iOS simulator
pnpm agenteract-agents launch expo-app --device "iPhone 15 Pro"

# Launch Flutter app on Android
pnpm agenteract-agents launch flutter-app --platform flutter --device emulator-5554

# Launch web app in headless mode
pnpm agenteract-agents launch vite-app --headless
```

**When to use:**
- Starting an app for testing or interaction
- Launching on a specific device after device selection
- Automating app startup in test workflows

**Returns:** Launch result with device info, platform, and connection status

### Tool: Stop App

Stop a running application gracefully or forcefully.

**Command:**
```bash
pnpm agenteract-agents stop <project> [options]
```

**Options:**
- `--device <id>`: Target specific device ID
- `--force`: Force stop (Android: `force-stop`, Desktop: SIGKILL)

**Examples:**
```bash
# Stop app gracefully
pnpm agenteract-agents stop expo-app

# Force stop on specific device
pnpm agenteract-agents stop expo-app --device emulator-5554 --force
```

**When to use:**
- Cleaning up after tests
- Stopping a frozen or unresponsive app
- Preparing for a fresh app launch

### Tool: Build App

Build an application for a target platform and configuration.

**Command:**
```bash
pnpm agenteract-agents build <project> [options]
```

**Options:**
- `--platform <type>`: Target platform (vite, expo, flutter, xcode, kmp-android, kmp-desktop)
- `--config <type>`: Build configuration: `debug` (default) or `release`

**Examples:**
```bash
# Build debug version with auto-detected platform
pnpm agenteract-agents build flutter-app

# Build release version for Android
pnpm agenteract-agents build flutter-app --platform flutter --config release

# Build Swift iOS app
pnpm agenteract-agents build swift-app --platform xcode --config debug
```

**When to use:**
- Preparing an app for deployment
- Building before running tests
- Creating release builds for distribution

**Platform-specific behavior:**
- **Flutter/KMP**: Runs `./gradlew assembleDebug/Release` or `flutter build ios`
- **Vite**: Runs `npm run build`
- **Swift**: Runs `xcodebuild -scheme ... build`

### Tool: Setup Operations

Perform setup operations like install, reinstall, or clear app data.

**Command:**
```bash
pnpm agenteract-agents setup <project> <action> [options]
```

**Actions:**
- `install`: Install the app on device
- `reinstall`: Uninstall and reinstall the app
- `clearData`: Clear app data/cache (Android) or uninstall (iOS)

**Options:**
- `--device <id>`: Target specific device ID
- `--platform <type>`: Override platform detection

**Examples:**
```bash
# Install app on default device
pnpm agenteract-agents setup expo-app install

# Reinstall on specific device
pnpm agenteract-agents setup flutter-app reinstall --device emulator-5554

# Clear app data (Android) or uninstall (iOS)
pnpm agenteract-agents setup expo-app clearData --platform expo
```

**When to use:**
- Ensuring a fresh app installation before tests
- Clearing app state between test runs
- Installing app binaries on new devices

**Platform-specific behavior:**
- **Android install**: Runs `./gradlew installDebug`
- **Android clearData**: Runs `adb shell pm clear <bundleId>`
- **iOS clearData**: Uninstalls app (iOS has no direct clear data command)

### Device Management

**Default Device Selection:**
Agenteract automatically manages device selection with the following priority:
1. Explicit `--device` flag (highest priority)
2. Default device from `.agenteract-runtime.json`
3. Auto-detected device (booted simulator or first available)

**Setting Default Device:**
When you use the `--device` flag, that device is automatically saved as the default for future commands:

```bash
# First launch with explicit device
pnpm agenteract-agents launch expo-app --device "iPhone 15 Pro"

# Future commands use this device by default
pnpm agenteract-agents launch expo-app
pnpm agenteract-agents stop expo-app
```

### Lifecycle Configuration

Add optional lifecycle configuration to `agenteract.config.js` to customize behavior:

```javascript
export default {
  projects: [
    {
      name: 'expo-app',
      path: './app',
      lifecycle: {
        bundleId: {
          ios: 'com.example.app',
          android: 'com.example.app'
        },
        mainActivity: 'com.example.app.MainActivity', // Android only
        launchTimeout: 30000, // ms
        requiresInstall: false
      }
    }
  ]
};
```

**Note:** All lifecycle config is optional. Bundle IDs and main activities are auto-detected from platform files (app.json, Info.plist, build.gradle, AndroidManifest.xml) if not specified.

### Platform Detection

Agenteract auto-detects platforms by scanning for marker files:

| Platform | Marker Files |
|----------|-------------|
| Vite | `vite.config.ts`, `vite.config.js` |
| Expo | `app.json` with `expo` key |
| Flutter | `pubspec.yaml` |
| Xcode (Swift/Objective-C) | `Package.swift`, `.xcodeproj` |
| KMP Android | `build.gradle.kts` with Kotlin/Android |
| KMP Desktop | `build.gradle.kts` with Compose Desktop |

Override detection with the `--platform` flag when needed.

### Typical Workflow Examples

**Test Setup and Execution:**
```bash
# 1. Ensure fresh app state
pnpm agenteract-agents setup expo-app reinstall

# 2. Launch the app
pnpm agenteract-agents launch expo-app

# 3. Run your tests (hierarchy, tap, input, etc.)
pnpm agenteract-agents hierarchy expo-app
pnpm agenteract-agents tap expo-app login-button

# 4. Clean up
pnpm agenteract-agents stop expo-app
```

**Multi-Device Testing:**
```bash
# Test on iOS
pnpm agenteract-agents launch expo-app --device "iPhone 15 Pro"
pnpm agenteract-agents hierarchy expo-app --device "iPhone 15 Pro"
pnpm agenteract-agents stop expo-app --device "iPhone 15 Pro"

# Test on Android
pnpm agenteract-agents launch expo-app --device emulator-5554
pnpm agenteract-agents hierarchy expo-app --device emulator-5554
pnpm agenteract-agents stop expo-app --device emulator-5554
```

**Build and Deploy:**
```bash
# Build release version
pnpm agenteract-agents build flutter-app --config release

# Install on device
pnpm agenteract-agents setup flutter-app install --device <device-id>

# Launch and verify
pnpm agenteract-agents launch flutter-app --device <device-id>
```

## Tool: Get View Hierarchy

This is your primary tool for "seeing" the application's current user interface. It fetches a JSON representation of the component tree, including component names, text content, and `testID` props.

**Workflow:**
1.  First, use this tool to understand the current state of the app.
2.  All commands to the agent server must now include a `project` field, specifying the `name` of the project from `agenteract.config.js` that you want to target.

See `add-config` for more information on creating configuration files.

**Command:**
```bash
pnpm agenteract-agents hierarchy react-app
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)
- `--filter-key` or `-k`: Filter hierarchy by property name (e.g., testID, type)
- `--filter-value` or `-v`: Filter hierarchy by property value (used with filter-key)

**Example with custom options:**
```bash
pnpm agenteract-agents hierarchy react-app --wait 1000 --log-count 20
```

**Filtering the Hierarchy:**
You can filter the hierarchy to focus on specific components by providing a key-value pair. When a match is found, the command returns that node and all its children. This is useful for reducing the output size and focusing on specific parts of the UI.

```bash
# Filter by testID
pnpm agenteract-agents hierarchy react-app --filter-key testID --filter-value login-form

# Filter by component type
pnpm agenteract-agents hierarchy react-app -k type -v Button

# Combine filtering with custom log options
pnpm agenteract-agents hierarchy react-app -k testID -v settings-panel -w 1000 -l 15
```

If multiple nodes match the filter, all matches and their children are returned. The filtering is performed client-side after fetching the full hierarchy.

**Automatic Log Capture:**
After fetching the view hierarchy, this command automatically waits and captures recent console logs. This provides a complete picture of the app's current state, including any console output that occurred during rendering. The logs are displayed after the hierarchy data under a "--- Console Logs ---" separator.

Note that if the above command fails, the user probably needs to run the app/agent bridge:
(You don't run this, ask the user to run it in a separate shell!)

It appears as if the agent server might not be running. Kindly run this in a shell:
```bash
pnpm agenteract dev
```

## Tool: Interact with App

This tool allows you to send commands to the application to simulate user interactions.

**Workflow:**
1.  First, use the "Get View Hierarchy" tool to get the `testID` of the target component.
2.  Construct a command with the appropriate `project`, `action`, and `payload`.

### Supported Actions

#### `tap`
Simulates a press on a component. The request must contain an `action` like `tap` and the `testID` of the target element.

**Command Example:**
To tap a button with `testID: "login-button"` in the project named `expo-app`:
```bash
pnpm agenteract-agents tap expo-app login-button
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Example with custom options:**
```bash
pnpm agenteract-agents tap expo-app login-button --wait 1000 --log-count 20
```

**Configuring Default Wait Time:**
You can configure the default wait time for all agent commands in your `agenteract.config.js`:
```javascript
export default {
  port: 8766,
  waitLogTimeout: 0,  // Set to 0 for no wait (recommended for test scripts)
  projects: [...]
};
```

**Note:** The default wait time will change from 500ms to 0ms in the next major version. To prepare for this change and silence deprecation warnings, explicitly set `waitLogTimeout` in your config.

**Automatic Log Capture:**
After performing the tap action, this command automatically waits to allow any resulting actions to complete, then captures recent console logs. This eliminates the need for a separate round trip to check what happened after the interaction. The logs are displayed after the action completes under a "--- Console Logs ---" separator.

#### `input`
Simulates text input into a text field or input component.

**Command Example:**
To input text into a field with `testID: "username-input"` in the project named `expo-app`:
```bash
pnpm agenteract-agents input expo-app username-input "john@example.com"
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Note:** The component must have an `onChange` (web) or `onChangeText` (React Native) handler registered via `createAgentBinding`.

#### `scroll`
Scrolls a scrollable component (like ScrollView, FlatList, or a scrollable div) in a specific direction by a given amount. **Scrolling is relative** - each scroll command moves the view by the specified amount from its current position.

**Command Example:**
To scroll down 200 pixels on a list with `testID: "main-list"` in the project named `expo-app`:
```bash
pnpm agenteract-agents scroll expo-app main-list down 200
```

To scroll with default amount (100 pixels):
```bash
pnpm agenteract-agents scroll expo-app main-list up
```

**Parameters:**
- `direction`: One of `up`, `down`, `left`, or `right`
- `amount`: Number of pixels to scroll (optional, default: 100)

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Implementation Notes:**
- **Web**: Uses native `scrollBy()` for smooth relative scrolling
- **React Native**: Automatically tracks scroll position via `onScroll` events. The `createAgentBinding` function automatically adds scroll tracking to any scrollable component, even if you don't provide your own `onScroll` handler. If you do provide an `onScroll` handler, it will be wrapped to track position and then call your handler.

#### `swipe`
Simulates a swipe gesture on a component, useful for gesture-based navigation like swiping between screens or dismissing items.

**Command Example:**
To swipe left with medium velocity on a card with `testID: "swipeable-card"` in the project named `expo-app`:
```bash
pnpm agenteract-agents swipe expo-app swipeable-card left
```

To swipe with fast velocity:
```bash
pnpm agenteract-agents swipe expo-app swipeable-card left fast
```

**Parameters:**
- `direction`: One of `up`, `down`, `left`, or `right`
- `velocity`: One of `slow`, `medium`, or `fast` (optional, default: "medium")

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Implementation:**
To support swipe gestures, register an `onSwipe` handler via `createAgentBinding`:

```tsx
<View
  {...createAgentBinding({
    testID: 'swipeable-card',
    onSwipe: (direction, velocity) => {
      console.log('Swiped:', direction, 'with velocity:', velocity);
      // Handle swipe - dismiss card, navigate, etc.
    },
  })}
>
  <Text>Swipe me!</Text>
</View>
```

**Fallback behavior:**
- For **ScrollView** components without an explicit `onSwipe` handler, the swipe command will fall back to programmatic scrolling
- For **web**, touch events are dispatched to trigger any existing gesture handlers
- For other React Native components without handlers, an error will be logged

#### `longPress`
Simulates a long press (press and hold) on a component, typically used for contextual menus or special actions.

**Command Example:**
To long press on an item with `testID: "list-item-1"` in the project named `expo-app`:
```bash
pnpm agenteract-agents longPress expo-app list-item-1
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: configured via `waitLogTimeout` in agenteract.config.js, or 500ms if not configured)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Note:** The component must have an `onContextMenu` (web) or `onLongPress` (React Native) handler registered via `createAgentBinding`.

## Tool: AgentClient (Node.js Programmatic API)

For writing **integration tests** and **automation scripts** in Node.js/TypeScript, Agenteract provides the **AgentClient** API - a programmatic alternative to CLI commands.

### Overview

AgentClient connects directly to the Agenteract server via WebSocket and provides the same interaction primitives as CLI commands, but with better performance and developer experience.

**Import:**
```typescript
import { AgentClient } from '@agenteract/core/node';
```

**Key Differences from CLI:**
- **Connection**: Persistent WebSocket vs spawning subprocess for each command
- **Performance**: ~10x faster for repeated commands (no subprocess overhead)
- **Return values**: Returns JavaScript objects, not JSON strings
- **Async/await**: Native Promise-based API
- **Log streaming**: Real-time log events via callback
- **Type safety**: Full TypeScript support with autocomplete

### Basic Usage

```typescript
import { AgentClient } from '@agenteract/core/node';

// 1. Create client instance
const client = new AgentClient('ws://localhost:8765');

// 2. Connect to server
await client.connect();

// 3. Use interaction methods
await client.tap('expo-app', 'login-button');
await client.input('expo-app', 'username', 'john@example.com');
const hierarchy = await client.getViewHierarchy('expo-app');

// 4. Clean up
client.disconnect();
```

### Complete API Reference

#### Interaction Primitives

All the same primitives from CLI commands are available:

**`tap(project: string, testID: string): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents tap expo-app login-button
await client.tap('expo-app', 'login-button');
```

**`input(project: string, testID: string, value: string): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents input expo-app username "john@example.com"
await client.input('expo-app', 'username', 'john@example.com');
```

**`scroll(project: string, testID: string, direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents scroll expo-app main-list down 200
await client.scroll('expo-app', 'main-list', 'down', 200);
await client.scroll('expo-app', 'main-list', 'up'); // default amount: 100
```

**`swipe(project: string, testID: string, direction: 'up' | 'down' | 'left' | 'right', velocity?: 'slow' | 'medium' | 'fast'): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents swipe expo-app swipeable-card left fast
await client.swipe('expo-app', 'swipeable-card', 'left', 'fast');
await client.swipe('expo-app', 'swipeable-card', 'right'); // default velocity: 'medium'
```

**`longPress(project: string, testID: string): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents longPress expo-app list-item-1
await client.longPress('expo-app', 'list-item-1');
```

**`getViewHierarchy(project: string): Promise<any>`**
```typescript
// CLI equivalent: pnpm agenteract-agents hierarchy expo-app
const hierarchy = await client.getViewHierarchy('expo-app');
console.log(hierarchy.root.children);
```

**`agentLink(project: string, url: string): Promise<void>`**
```typescript
// CLI equivalent: pnpm agenteract-agents agent-link expo-app agenteract://reset_state
await client.agentLink('expo-app', 'agenteract://reset_state');
await client.agentLink('expo-app', 'agenteract://navigate?screen=settings');
```

#### Utility Methods

These utilities make test writing easier with built-in waiting and log capture:

**`getLogs(project: string, count?: number): Promise<string[]>`**
```typescript
// Get last 10 logs (default)
const logs = await client.getLogs('expo-app');

// Get last 20 logs
const logs = await client.getLogs('expo-app', 20);
```

**`waitForLog(project: string, pattern: string | RegExp, timeout?: number): Promise<void>`**
```typescript
// Wait for specific log message (default timeout: 5000ms)
await client.waitForLog('expo-app', 'Login successful');

// With custom timeout and regex pattern
await client.waitForLog('expo-app', /User \d+ logged in/, 10000);

// Throws error if pattern not found within timeout
try {
  await client.waitForLog('expo-app', 'Error occurred', 2000);
} catch (err) {
  console.log('Expected error did not occur');
}
```

**`waitForElement(project: string, testID: string, timeout?: number): Promise<void>`**
```typescript
// Wait for element to appear in hierarchy (default timeout: 5000ms)
await client.waitForElement('expo-app', 'dashboard');

// With custom timeout
await client.waitForElement('expo-app', 'loading-spinner', 10000);

// Useful after navigation or async operations
await client.tap('expo-app', 'login-button');
await client.waitForElement('expo-app', 'user-profile'); // Wait for navigation
```

**`waitForCondition(project: string, predicate: (hierarchy: any) => boolean, timeout?: number): Promise<void>`**
```typescript
// Wait for custom condition on hierarchy
await client.waitForCondition(
  'expo-app',
  (hierarchy) => {
    // Custom condition: check if counter value >= 5
    const counter = findElementByTestID(hierarchy, 'counter-text');
    return counter && parseInt(counter.text) >= 5;
  },
  5000
);
```

#### Real-Time Log Streaming

AgentClient can stream logs in real-time as they occur in the app:

**`onLog(callback: (log: { project: string; message: string; timestamp: number }) => void): void`**
```typescript
// Listen to all logs from all projects
client.onLog((log) => {
  console.log(`[${log.project}] ${log.message}`);
});

// Then perform actions - logs are streamed automatically
await client.tap('expo-app', 'increment-button');
// Logs appear immediately without polling
```

#### Connection Management

**`connect(): Promise<void>`**
```typescript
await client.connect();
```

**`disconnect(): void`**
```typescript
client.disconnect();
```

**`isConnected(): boolean`**
```typescript
if (client.isConnected()) {
  await client.tap('expo-app', 'button');
}
```

### Complete Testing Example

Here's a complete integration test using AgentClient with Jest:

```typescript
import { AgentClient } from '@agenteract/core/node';

describe('Expo App Login Flow', () => {
  let client: AgentClient;

  beforeAll(async () => {
    client = new AgentClient('ws://localhost:8765');
    await client.connect();
  });

  afterAll(() => {
    client.disconnect();
  });

  beforeEach(async () => {
    // Reset app state before each test
    await client.agentLink('expo-app', 'agenteract://reset_state');
    await client.waitForElement('expo-app', 'login-screen');
  });

  test('should login successfully with valid credentials', async () => {
    // 1. Verify initial state
    const initialHierarchy = await client.getViewHierarchy('expo-app');
    expect(findElementByTestID(initialHierarchy, 'login-button')).toBeDefined();

    // 2. Fill in login form
    await client.input('expo-app', 'username-input', 'john@example.com');
    await client.input('expo-app', 'password-input', 'password123');

    // 3. Submit form
    await client.tap('expo-app', 'login-button');

    // 4. Wait for successful login
    await client.waitForLog('expo-app', 'Login successful', 3000);
    await client.waitForElement('expo-app', 'dashboard', 5000);

    // 5. Verify dashboard loaded
    const finalHierarchy = await client.getViewHierarchy('expo-app');
    expect(findElementByTestID(finalHierarchy, 'user-profile')).toBeDefined();
  });

  test('should show error with invalid credentials', async () => {
    // Fill in invalid credentials
    await client.input('expo-app', 'username-input', 'invalid@example.com');
    await client.input('expo-app', 'password-input', 'wrong');

    // Submit
    await client.tap('expo-app', 'login-button');

    // Wait for error message
    await client.waitForLog('expo-app', /Login failed/, 3000);
    await client.waitForElement('expo-app', 'error-message', 2000);

    // Verify still on login screen
    const hierarchy = await client.getViewHierarchy('expo-app');
    expect(findElementByTestID(hierarchy, 'login-button')).toBeDefined();
  });
});

// Helper function to find elements in hierarchy
function findElementByTestID(hierarchy: any, testID: string): any {
  if (!hierarchy) return null;
  if (hierarchy.testID === testID) return hierarchy;
  
  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      const found = findElementByTestID(child, testID);
      if (found) return found;
    }
  }
  
  return null;
}
```

### Comparison: CLI vs AgentClient

| Feature | CLI Command | AgentClient |
|---------|------------|-------------|
| **Connection** | New subprocess per command | Persistent WebSocket |
| **Performance** | ~100-200ms per command | ~10-20ms per command |
| **Return Type** | JSON string (stdout) | Native JavaScript object |
| **Error Handling** | Exit codes + stderr parsing | Promise rejection with error objects |
| **Log Capture** | Manual `--wait` and `--log-count` | Built-in utilities + real-time streaming |
| **Type Safety** | None (string output) | Full TypeScript support |
| **Use Case** | AI agents, manual testing, CI scripts | Integration tests, automation scripts |

### When to Use Each

**Use CLI Commands when:**
- Writing AI agent instructions (easier for agents to understand)
- Running manual tests from terminal
- Integrating with shell scripts or CI pipelines
- Quick ad-hoc testing during development

**Use AgentClient when:**
- Writing integration tests in Jest/Mocha/Vitest
- Building automation scripts in Node.js/TypeScript
- Need fast, repeated interactions (e.g., stress testing)
- Want type-safe API with IDE autocomplete
- Need real-time log streaming

### AgentClient with Different Test Frameworks

**Jest:**
```typescript
import { AgentClient } from '@agenteract/core/node';

describe('My App Tests', () => {
  let client: AgentClient;

  beforeAll(async () => {
    client = new AgentClient();
    await client.connect();
  });

  afterAll(() => client.disconnect());

  test('example', async () => {
    await client.tap('my-app', 'button');
  });
});
```

**Mocha:**
```typescript
import { AgentClient } from '@agenteract/core/node';
import { expect } from 'chai';

describe('My App Tests', function() {
  let client: AgentClient;

  before(async function() {
    client = new AgentClient();
    await client.connect();
  });

  after(function() {
    client.disconnect();
  });

  it('should work', async function() {
    await client.tap('my-app', 'button');
    const hierarchy = await client.getViewHierarchy('my-app');
    expect(hierarchy).to.exist;
  });
});
```

**Vitest:**
```typescript
import { describe, test, beforeAll, afterAll } from 'vitest';
import { AgentClient } from '@agenteract/core/node';

describe('My App Tests', () => {
  let client: AgentClient;

  beforeAll(async () => {
    client = new AgentClient();
    await client.connect();
  });

  afterAll(() => client.disconnect());

  test('example', async () => {
    await client.tap('my-app', 'button');
  });
});
```

### Best Practices

1. **Connection Management**: Create one client per test suite, not per test
   ```typescript
   // Good - reuse connection
   beforeAll(async () => {
     client = new AgentClient();
     await client.connect();
   });
   
   // Bad - reconnecting every test is slow
   beforeEach(async () => {
     client = new AgentClient();
     await client.connect();
   });
   ```

2. **Use agentLink for state reset**: Faster than reinstalling app
   ```typescript
   beforeEach(async () => {
     await client.agentLink('expo-app', 'agenteract://reset_state');
   });
   ```

3. **Wait for elements after actions**: Don't assume immediate rendering
   ```typescript
   await client.tap('expo-app', 'submit-button');
   await client.waitForElement('expo-app', 'success-message'); // Wait for result
   ```

4. **Use waitForLog to verify behavior**: More reliable than polling hierarchy
   ```typescript
   await client.tap('expo-app', 'save-button');
   await client.waitForLog('expo-app', 'Data saved successfully');
   ```

5. **Always disconnect in cleanup**: Prevent connection leaks
   ```typescript
   afterAll(() => {
     client.disconnect();
   });
   ```

### Example Test Projects

See the following examples for complete working tests:

- **Node.js Integration Test**: [`tests/e2e/node-client/test-agent-client.ts`](../tests/e2e/node-client/test-agent-client.ts) - Complete AgentClient usage with Jest
- **Vite Test**: [`tests/e2e/vite/test-app-launch.ts`](../tests/e2e/vite/test-app-launch.ts) - Web app testing
- **Expo Test**: [`tests/e2e/expo/test-app-launch.ts`](../tests/e2e/expo/test-app-launch.ts) - React Native testing
- **Flutter Test**: [`tests/e2e/flutter/test-app-launch-ios.ts`](../tests/e2e/flutter/test-app-launch-ios.ts) - Flutter testing

---

**Creating components:**

For you to be able to interact with a component, two things are required

1. a `testID`
2. a way to call event handlers

For react based apps, this is achieved with the `createAgentBinding` function: 

https://github.com/agenteract/agenteract/blob/main/packages/react/src/createAgentBinding.ts

(Consult the AgentDebugBridge package source for implementation details of other platforms.)

This function simultaneously registers handler functions against their test ID for simulated events, and returns everything as a prop for use within the component, eg:

```ts
import { createAgentBinding } from '@agenteract/react';
```

```tsx
<Pressable {...createAgentBinding({
    testID: 'button',
    onPress: () => console.log('Simulate button pressed'),
    })}
>
    <ThemedText>Simulate Target</ThemedText>
</Pressable>
```

You can see how this is handled by agent-server requests in `https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/packages/react/src/AgentDebugBridge.tsx`.

## Tool: Agent Links (agentLink)

Agent Links provide a way to trigger app-specific actions through deep link-style URLs sent over the WebSocket connection. Unlike pairing deep links (which configure the server connection), agentLinks are sent to already-connected apps to trigger custom behaviors.

**Use Cases:**
- Reset app state during automated testing
- Navigate to specific screens or routes
- Reload or restart the app
- Trigger any custom app action

**Command:**
```bash
pnpm agenteract-agents agent-link <project> <url>
```

**Examples:**
```bash
# Reset application state (commonly used in tests)
pnpm agenteract-agents agent-link expo-app agenteract://reset_state

# Navigate to a specific screen
pnpm agenteract-agents agent-link expo-app agenteract://navigate?screen=settings

# Reload the application
pnpm agenteract-agents agent-link expo-app agenteract://reload

# Custom action with parameters
pnpm agenteract-agents agent-link expo-app agenteract://custom?param1=value1&param2=value2
```

**How It Works:**

When you send an agentLink, the app's `onAgentLink` handler receives the URL and decides how to process it:

1. If the handler returns `true`, the app processed the link
2. If the handler returns `false`, `AgentDebugBridge` handles it (for pairing/config links)

**URL Format:**
- Scheme: `agenteract://`
- Hostname: Action identifier (e.g., `reset_state`, `navigate`, `reload`)
- Query parameters: Optional parameters (e.g., `?screen=settings&tab=profile`)

**Implementation Guide:**

Apps must provide an `onAgentLink` handler to `AgentDebugBridge` to process agentLinks. See the platform-specific examples below.

**React/Expo Example:**
```tsx
import { AgentDebugBridge } from '@agenteract/react';

// URL parsing helper
const parseURL = (url: string) => {
  const [schemeAndHostname, queryString] = url.split('?');
  const hostname = schemeAndHostname.split('://')[1] || '';
  
  const queryParams: Record<string, string> = {};
  if (queryString) {
    queryString.split('&').forEach(param => {
      const [key, value] = param.split('=');
      queryParams[key] = decodeURIComponent(value);
    });
  }
  
  return { hostname, queryParams };
};

const handleAgentLink = async (url: string): Promise<boolean> => {
  const { hostname, queryParams } = parseURL(url);
  
  switch (hostname) {
    case 'reset_state':
      // Reset your app state
      resetAppState();
      return true; // Handled by app
    case 'navigate':
      // Navigate to screen from query params
      navigation.navigate(queryParams.screen);
      return true;
    case 'reload':
      // Reload the app
      Updates.reloadAsync();
      return true;
    default:
      return false; // Let AgentDebugBridge handle config links
  }
};

<AgentDebugBridge 
  projectName="expo-app"
  onAgentLink={handleAgentLink}
/>
```

**Flutter Example:**
```dart
import 'package:agenteract/agenteract.dart';

Future<bool> handleAgentLink(String url) async {
  final uri = Uri.parse(url);
  
  switch (uri.host) {
    case 'reset_state':
      // Reset your app state
      resetAppState();
      return true;
    case 'navigate':
      // Navigate to screen
      final screen = uri.queryParameters['screen'];
      if (screen != null) {
        Navigator.pushNamed(context, screen);
      }
      return true;
    case 'reload':
      // Reload the app (platform-specific)
      await SystemNavigator.pop();
      return true;
    default:
      return false;
  }
}

AgentDebugBridge(
  projectName: 'flutter-app',
  onAgentLink: handleAgentLink,
  child: MyApp(),
)
```

**Kotlin (Compose Multiplatform) Example:**
```kotlin
import io.agenteract.AgentDebugBridge
import java.net.URI

val handleAgentLink: suspend (String) -> Boolean = { url ->
    val uri = URI(url)
    when (uri.host) {
        "reset_state" -> {
            resetAppState()
            true
        }
        "navigate" -> {
            // Parse query parameters
            val params = uri.query?.split("&")
                ?.associate {
                    val (key, value) = it.split("=")
                    key to value
                }
            val screen = params?.get("screen")
            navController.navigate(screen ?: "home")
            true
        }
        "reload" -> {
            // Reload logic (platform-specific)
            restartApp()
            true
        }
        else -> false
    }
}

AgentDebugBridge(
    projectName = "kmp-app",
    onAgentLink = handleAgentLink
)
```

**Best Practices:**

1. **Always return a boolean**: Return `true` if handled, `false` otherwise
2. **Validate parameters**: Check query parameters exist before using them
3. **Log actions**: Use console logging to confirm agentLinks were processed
4. **Handle errors gracefully**: Catch exceptions and return `false` on error
5. **Document your links**: Keep a list of supported agentLink actions in your code

**Helper Utilities:**

The example apps include URL parsing utilities that you can reference:
- React/Expo: `/examples/expo-example/app/utils/deepLinkUtils.ts`
- React (web): `/examples/react-example/src/utils/deepLinkUtils.ts`

**Common Patterns:**

**Reset State Pattern (for testing):**
```tsx
case 'reset_state':
  // Clear all state
  setCounter(0);
  setUserData(null);
  setFormValues(defaultFormValues);
  console.log('State reset');
  return true;
```

**Navigation Pattern:**
```tsx
case 'navigate':
  const { screen, params } = queryParams;
  if (screen) {
    // Parse params if needed (e.g., params={"userId":123})
    const parsedParams = params ? JSON.parse(params) : undefined;
    navigation.navigate(screen, parsedParams);
    return true;
  }
  return false;
```

**Reload Pattern:**
```tsx
case 'reload':
  // React Native/Expo
  if (Updates.reloadAsync) {
    Updates.reloadAsync();
  } else {
    // Dev mode reload
    DevSettings.reload();
  }
  return true;
```

**Platform-Specific Notes:**

- **React/Expo**: AgentLinks are handled alongside pairing deep links in the same `onAgentLink` handler
- **Flutter**: Uses the same `onAgentLink` callback, requires async handling
- **Kotlin**: Uses suspend function for `onAgentLink`, supports coroutines
- **Swift**: Not yet implemented (coming soon)

**Debugging:**

If agentLinks aren't working:
1. Check that `onAgentLink` handler is provided to `AgentDebugBridge`
2. Verify the app is connected (use `hierarchy` command to confirm)
3. Check console logs to see if the handler was called
4. Ensure you're returning `true` for handled links
5. Use dev-logs to see any error messages

**Testing Example:**

A complete test workflow using agentLinks:
```bash
# 1. Check initial state
pnpm agenteract-agents hierarchy expo-app

# 2. Perform some interactions
pnpm agenteract-agents tap expo-app increment-button
pnpm agenteract-agents tap expo-app increment-button

# 3. Verify state changed
pnpm agenteract-agents hierarchy expo-app
# (should show counter = 2)

# 4. Reset state using agentLink
pnpm agenteract-agents agent-link expo-app agenteract://reset_state

# 5. Confirm state was reset
pnpm agenteract-agents hierarchy expo-app
# (should show counter = 0)
```

---

## Lifecycle Utilities for Automated Testing

Agenteract provides platform-agnostic lifecycle utilities in `@agenteract/core` that enable agents to programmatically manage app lifecycles for automated testing and development workflows.

### Overview

The lifecycle utilities provide a comprehensive API for:
- **Device Management**: Boot devices, check device state
- **Build Operations**: Build apps for iOS, Android across frameworks
- **Installation**: Install, uninstall, and reinstall apps
- **Data Management**: Clear app data and cache
- **App Control**: Start, stop, and restart apps

All functions are platform-agnostic and automatically detect the correct platform based on the device type.

### Supported Frameworks

- **Expo**: Expo Go and prebuilt modes
- **React Native**: Prebuilt apps
- **Flutter**: iOS and Android
- **Swift**: Native iOS apps
- **Kotlin Multiplatform**: Android and iOS
- **Vite**: Web applications

---

## Device Utilities

### `getDeviceState(device)`

Check the current state of a device (booted, shutdown, or unknown).

**Parameters:**
- `device`: Device object or device ID string

**Returns:** `Promise<DeviceState>` with `id`, `state`, and `platform`

**Example:**
```typescript
import { getDeviceState } from '@agenteract/core';

const state = await getDeviceState(myDevice);
console.log(`Device ${state.id} is ${state.state}`);

if (state.state === 'shutdown') {
  console.log('Device needs to be booted');
}
```

**Platform Behavior:**
- **iOS**: Returns 'booted' or 'shutdown' from xcrun simctl
- **Android**: Returns 'booted' if device is online, 'shutdown' if offline
- **Desktop**: Always returns 'booted'

---

### `bootDevice(options)`

Boot a device (start/power on).

**Parameters:**
- `device`: Device object or device ID string
- `waitForBoot`: Wait for boot completion (default: true)
- `timeout`: Boot timeout in milliseconds (default: 30000)

**Returns:** `Promise<void>`

**Example:**
```typescript
import { bootDevice } from '@agenteract/core';

// Boot and wait for completion
await bootDevice({
  device: myIOSSimulator,
  waitForBoot: true,
  timeout: 30000
});

// Quick boot without waiting
await bootDevice({
  device: myIOSSimulator,
  waitForBoot: false
});
```

**Platform Behavior:**
- **iOS**: Boots simulator using `xcrun simctl boot`, optionally waits for completion
- **Android**: NOOP (Android emulators boot automatically when accessed)
- **Desktop**: NOOP (desktop is always booted)

**Auto-Boot Integration:**
The `startApp()` function automatically boots shutdown devices before launching, so manual boot calls are usually not needed.

---

## Data Management

### `clearAppData(options)`

Clear app data and cache without uninstalling.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `bundleId`: Optional bundle ID override

**Returns:** `Promise<void>`

**Example:**
```typescript
import { clearAppData } from '@agenteract/core';

// Clear data for a prebuilt app
await clearAppData({
  projectPath: '/path/to/app',
  device: myDevice,
  bundleId: 'com.example.myapp' // optional
});
```

**Platform Behavior:**
- **iOS**: Uses `xcrun simctl uninstall` to reset app container
- **Android**: Uses `adb shell pm clear` to clear data
- **Expo Go**: Not supported (use `agenteract://reset_state` instead)
- **Desktop**: NOOP (not applicable)

**Best Practice:**
For E2E tests, prefer using `agenteract://reset_state` agentLink over `clearAppData()` - it's faster and doesn't require reinstalling.

---

## Installation

### `installApp(options)`

Install an app on a device.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `configuration`: 'debug' or 'release' (default: 'debug')
- `apkPath`: Optional APK path for Android
- `bundleId`: Optional bundle ID override

**Returns:** `Promise<void>`

**Example:**
```typescript
import { installApp } from '@agenteract/core';

// Install Flutter app in debug mode
await installApp({
  projectPath: '/path/to/flutter-app',
  device: androidEmulator,
  configuration: 'debug'
});

// Install from APK file
await installApp({
  projectPath: '/path/to/app',
  device: androidEmulator,
  apkPath: '/path/to/app-release.apk'
});
```

**Platform Behavior:**
- **iOS**: Uses `xcrun simctl install` with .app bundle
- **Android**: Uses gradle tasks or `adb install`
- **Expo Go**: NOOP (cannot install Expo Go)
- **Desktop**: NOOP (not applicable)

---

### `uninstallApp(options)`

Uninstall an app from a device.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `bundleId`: Optional bundle ID override

**Returns:** `Promise<void>`

**Example:**
```typescript
import { uninstallApp } from '@agenteract/core';

await uninstallApp({
  projectPath: '/path/to/app',
  device: myDevice
});
```

**Platform Behavior:**
- **iOS**: Uses `xcrun simctl uninstall`
- **Android**: Uses `adb uninstall`
- **Expo Go**: NOOP (cannot uninstall Expo Go)

---

### `reinstallApp(options)`

Reinstall an app (uninstall then install).

**Parameters:**
Same as `installApp()`

**Returns:** `Promise<void>`

**Example:**
```typescript
import { reinstallApp } from '@agenteract/core';

// Get completely fresh app state
await reinstallApp({
  projectPath: '/path/to/app',
  device: myDevice,
  configuration: 'debug'
});
```

**Use Cases:**
- Getting a completely clean slate during testing
- Resetting app state when `agenteract://reset_state` isn't implemented
- Verifying fresh install behavior

**Note:** Slower than `clearAppData()` - use sparingly in E2E tests.

---

## Build Operations

### `buildApp(options)`

Build an app for deployment.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `configuration`: 'debug', 'release', or custom config (default: 'debug')
- `platform`: 'ios' or 'android' (auto-detected if not provided)
- `silent`: Suppress build output (default: true)

**Returns:** `Promise<void>`

**Example:**
```typescript
import { buildApp } from '@agenteract/core';

// Build in silent mode (default)
await buildApp({
  projectPath: '/path/to/flutter-app',
  device: androidDevice,
  configuration: 'debug'
});

// Build with full output
await buildApp({
  projectPath: '/path/to/app',
  device: iosDevice,
  configuration: 'release',
  silent: false
});
```

**Platform Behavior:**
- **Flutter**: Uses gradle for Android, `flutter build ios` for iOS
- **Expo Prebuilt**: Uses gradle for Android, xcodebuild for iOS
- **KMP**: Uses gradle tasks
- **Swift**: Uses xcodebuild
- **Vite**: Uses `npm run build`
- **Expo Go**: NOOP (uses OTA updates)

**Build Output:**
By default, build output is suppressed (`silent: true`). Set `silent: false` to stream build output for debugging.

**Expo Note:**
For Expo apps, prefer using `expo run:ios` or `expo run:android` which handles prebuild + build + install + launch in one command.

---

## App Control

### `startApp(options)`

Start/launch an app on a device.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `bundleId`: Optional bundle ID override
- `mainActivity`: Optional Android main activity
- `projectName`: Optional project name (for Expo Go)
- `cwd`: Optional working directory (for Expo Go)

**Returns:** `Promise<void>`

**Example:**
```typescript
import { startApp } from '@agenteract/core';

// Start prebuilt app
await startApp({
  projectPath: '/path/to/app',
  device: myDevice
});

// Start Expo Go app
await startApp({
  projectPath: '/path/to/expo-app',
  device: myDevice,
  projectName: 'expo-app',
  cwd: '/path/to/workspace'
});

// Start Android app with custom activity
await startApp({
  projectPath: '/path/to/app',
  device: androidDevice,
  mainActivity: '.MainActivity'
});
```

**Auto-Boot Feature:**
`startApp()` automatically boots shutdown devices before launching. This ensures apps can launch successfully without manual intervention.

**Platform Behavior:**
- **iOS**: Uses `xcrun simctl launch`, auto-boots if shutdown
- **Android**: Uses `adb shell am start`, auto-boots if offline
- **Expo Go**: Sends CLI command to open project
- **Desktop**: Opens URL in default browser

---

### `stopApp(options)`

Stop/terminate a running app.

**Parameters:**
- `projectPath`: Project root path
- `device`: Device object or device ID string
- `bundleId`: Optional bundle ID override
- `force`: Force stop on Android (default: false)

**Returns:** `Promise<void>`

**Example:**
```typescript
import { stopApp } from '@agenteract/core';

// Graceful stop
await stopApp({
  projectPath: '/path/to/app',
  device: myDevice
});

// Force stop on Android
await stopApp({
  projectPath: '/path/to/app',
  device: androidDevice,
  force: true
});
```

**Platform Behavior:**
- **iOS**: Uses `xcrun simctl terminate`
- **Android**: Uses `adb shell am force-stop` (if force) or kills process
- **Expo Go**: Not supported (cannot stop Expo Go itself)

---

### `restartApp(options)`

Restart an app (stop then start).

**Parameters:**
Same as `startApp()`

**Returns:** `Promise<void>`

**Example:**
```typescript
import { restartApp } from '@agenteract/core';

await restartApp({
  projectPath: '/path/to/app',
  device: myDevice
});
```

**Use Cases:**
- Applying configuration changes
- Resetting app state without reinstalling
- Testing launch behavior

---

## Complete Testing Workflow Example

Here's a complete agent-driven testing workflow using lifecycle utilities:

```typescript
import {
  getDeviceState,
  bootDevice,
  buildApp,
  installApp,
  startApp,
  stopApp,
  clearAppData,
  reinstallApp
} from '@agenteract/core';
import { getAvailableDevice } from '@agenteract/core';

// 1. Get device and check state
const device = await getAvailableDevice('ios');
const state = await getDeviceState(device);

// 2. Boot device if needed (usually not needed - startApp auto-boots)
if (state.state === 'shutdown') {
  await bootDevice({ device, waitForBoot: true });
}

// 3. Build the app
await buildApp({
  projectPath: '/path/to/app',
  device,
  configuration: 'debug'
});

// 4. Install the app
await installApp({
  projectPath: '/path/to/app',
  device
});

// 5. Start the app (auto-boots if needed)
await startApp({
  projectPath: '/path/to/app',
  device
});

// 6. Run tests using agent commands
// (Use hierarchy, tap, input, etc.)

// 7. Reset state between tests
await clearAppData({
  projectPath: '/path/to/app',
  device
});

// Or use agentLink for faster reset
// await agentLink({ url: 'agenteract://reset_state' });

// 8. Restart app with clean state
await restartApp({
  projectPath: '/path/to/app',
  device
});

// 9. Run more tests...

// 10. Clean up
await stopApp({
  projectPath: '/path/to/app',
  device
});
```

---

## Expo-Specific Workflows

### Expo Go Mode

```typescript
// Expo Go apps don't need build/install steps
await startApp({
  projectPath: '/path/to/expo-app',
  device: myDevice,
  projectName: 'expo-app',
  cwd: '/path/to/workspace'
});

// Metro serves JavaScript over the air
// No build/install needed
```

### Expo Prebuild Mode

```bash
# For Expo prebuilt apps, use expo run:ios/android
# This handles prebuild + build + install + launch

# Clean prebuild
rm -rf ios android

# Run (auto prebuild + build + install + launch)
expo run:ios --device <device-name>

# Or for Android
expo run:android --device <device-id>
```

**Important:** Prebuilt Expo apps still need Metro bundler running! Start Metro first:
```bash
npx expo start --localhost
```

Then launch the app via `expo run:ios` or using lifecycle utilities.

---

## Framework Detection

All lifecycle utilities automatically detect the framework and platform based on:

1. **Project files**: Check for `package.json`, `pubspec.yaml`, `build.gradle`, etc.
2. **Device type**: Infer platform from device (iOS simulator, Android emulator, desktop)
3. **Directory structure**: Check for `ios/`, `android/`, framework-specific folders

You don't need to manually specify the framework - it's detected automatically!

---

## Best Practices

### State Management in Tests

**Prefer agentLink over reinstall:**
```typescript
// ❌ Slow - reinstalls app every time
await reinstallApp({ projectPath, device });

// ✅ Fast - just resets state
await agentLink({ url: 'agenteract://reset_state' });
```

**Implement `reset_state` in your app:**
```tsx
// In your AgentDebugBridge handler
case 'reset_state':
  setCounter(0);
  setUserData(null);
  setFormValues(defaultFormValues);
  console.log('State reset');
  return true;
```

### Device Boot Management

**Let startApp auto-boot:**
```typescript
// ❌ Manual boot not needed
await bootDevice({ device });
await startApp({ projectPath, device });

// ✅ Auto-boots if needed
await startApp({ projectPath, device });
```

### Build Output

**Use silent mode by default:**
```typescript
// ✅ Silent - less noise
await buildApp({ projectPath, device, silent: true });

// Only show output when debugging build issues
await buildApp({ projectPath, device, silent: false });
```

### Error Handling

```typescript
try {
  await installApp({ projectPath, device });
} catch (error) {
  if (error.message.includes('already installed')) {
    // App is already installed - this is OK
    console.log('App already installed, continuing...');
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

---

## TypeScript Support

All lifecycle utilities are fully typed with TypeScript:

```typescript
import type {
  AppLifecycleOptions,
  DeviceState,
  DeviceBootOptions,
  InstallOptions,
  BuildOptions,
  PortForwardingOptions
} from '@agenteract/core';

// Type-safe configuration
const options: InstallOptions = {
  projectPath: '/path/to/app',
  device: myDevice,
  configuration: 'debug'
};

await installApp(options);
```

---

## Utility Functions

### `isExpoGo(projectPath)`

Detect if an Expo project uses Expo Go or is prebuilt.

```typescript
import { isExpoGo } from '@agenteract/core';

const usesExpoGo = isExpoGo('/path/to/expo-app');

if (usesExpoGo) {
  console.log('Using Expo Go - no build needed');
} else {
  console.log('Prebuilt Expo - needs build step');
}
```

Returns `true` if no `ios/` or `android/` directories exist.

### `findGradle(projectPath)`

Find gradle executable (wrapper or global).

```typescript
import { findGradle } from '@agenteract/core';

const gradle = await findGradle('/path/to/android/project');
// Returns './gradlew' or 'gradle'
```

Checks for `./gradlew` first, then falls back to global `gradle`.

---

## Platform-Specific Notes

### iOS
- Requires Xcode and command-line tools
- Uses `xcrun simctl` for device management
- Auto-detects .app bundle location after build
- Supports simulator-specific configurations

### Android
- Requires Android SDK and ADB
- Uses gradle for builds
- Supports both emulators and physical devices
- Activity names: Use `.MainActivity` format for relative activities

### Expo
- **Expo Go**: No build/install needed, uses OTA updates
- **Prebuilt**: Same as React Native but needs Metro running
- Use `expo run:ios` / `expo run:android` for comprehensive workflow
- Clean `ios/android` folders before `expo run` for fresh prebuild

### Flutter
- Requires Flutter SDK
- Uses gradle for Android, `flutter build ios` for iOS
- Supports debug and release configurations
- Auto-detects Flutter project structure

### Swift
- Native iOS apps built with xcodebuild
- Requires Xcode project or workspace
- Supports schemes and configurations
- Uses `-derivedDataPath` for predictable output

### Kotlin Multiplatform
- Uses gradle for both iOS and Android
- Supports shared code across platforms
- Platform-specific build tasks detected automatically

---

## Troubleshooting

### "Device not found"
- Check device is listed: `xcrun simctl list` (iOS) or `adb devices` (Android)
- Verify device ID is correct
- Boot device first if shutdown

### "Build failed"
- Set `silent: false` to see full build output
- Check project builds manually first
- Verify dependencies are installed
- Clean build folder and retry

### "App not installed"
- Check bundle ID is correct
- Verify build succeeded
- Try manual install first to diagnose
- Check device has enough storage

### "Cannot start app"
- Verify app is installed
- Check device is booted
- Ensure Metro is running (for Expo prebuilt)
- Check bundle ID matches installed app

### "clearAppData fails"
- App must be installed first
- Not supported for Expo Go (use agentLink instead)
- Check bundle ID is correct

---

## Additional Resources

- **API Documentation**: Full JSDoc in `@agenteract/core/src/node/lifecycle-utils.ts`
- **Example Tests**: `/tests/e2e/expo/test-app-launch-ios.ts`
- **Type Definitions**: `@agenteract/core` exports all types
- **Source Code**: `/packages/core/src/node/lifecycle-utils.ts`

---
