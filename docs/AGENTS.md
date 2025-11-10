# Agenteract Agent Instructions

You are an expert developer assistant. Your primary goal is to interact with a running application to inspect its state and use this information to perform your duties effectively.

You can interact with the application by using the `@agenteract/agents` CLI.

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

`@agenteract/expo`

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

Usage:
```tsx
import { AgentDebugBridge } from '@agenteract/react';
// ...
{ __DEV__ && <AgentDebugBridge projectName="myExpoApp" /> }
```

React: 
AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/react-example/src/main.tsx

* Packages: 
`@agenteract/react` (`AgentDebugBridge`)

The following can be installed either in the app, or at the monorepo root if applicable.

`@agenteract/vite`

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

Usage:

```tsx
import { AgentDebugBridge } from '@agenteract/react';
// ...
{ __DEV__ && <AgentDebugBridge projectName="myReactApp" /> }
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

Usage:

```swift
import Agenteract
// ...
.background(
    AgentDebugBridge(projectName: "mySwiftApp")
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

## Dev Server Setup

Agenteract offers a multiplexed terminal application that serves two purposes:
1. Route app interaction commands to multiple apps
2. Handle AgentDebugBridge connections from apps
3. Buffer dev server (eg Expo, Vite) logs and expose them to agents

For this to work, we need to configure the dev server. This can be done at a workspace root, or within a single application.

### *Step 1: Configuration*

The command below will create an initial `agenteract.config.js`, or add entries to an existing configuration.

```bash
pnpm agenteract add-config <path> <projectName> <type>
```

`Path`:

Path to a project containing a package.json (Only required for NodeJS based projects)

`Project Name`:

Project Name as supplied to `AgentDebugBridge`

`Type`:

`expo`|`vite`|`flutter`|`native`

- `expo` - Expo React Native apps
- `vite` - Vite-based React/Vue apps
- `flutter` - Flutter apps (hybrid: PTY + WebSocket logs)
- `native` - Pure native apps like Swift (WebSocket logs only)

**Note:** Agenteract now supports **any** dev server through generic PTY configuration. You can manually configure custom dev servers (Next.js, Astro, Django, etc.) in `agenteract.config.js` using the `devServer` field. See `docs/GENERIC_PTY.md` for details. The `add-config` command uses the legacy type-based format for backward compatibility.


### *Step 2: Start Dev Server and apps*

The user (Not the agent) can now start their dev server.

Use Tab to switch between apps. This enables user to launch the app and see diagnostic output. 

At this point the agent should also have access to dev server logs.

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

**Flutter project commands:**
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

## Tool: Get View Hierarchy

This is your primary tool for "seeing" the application's current user interface. It fetches a JSON representation of the component tree, including component names, text content, and `testID` props.

**Workflow:**
1.  First, use this tool to understand the current state of the app.
2.  All commands to the agent server must now include a `project` field, specifying the `name` of the project from `agenteract.config.js` that you want to target.

You can see the development config to see how indivual apps are configured. Note that the example shows a monorepo setup. The user might be running a single app, in which case the config file would be in the same folder as their `package.json`

https://github.com/agenteract/agenteract/blob/main/agenteract.config.js

**Command:**
```bash
pnpm agenteract-agents hierarchy react-app
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
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
After fetching the view hierarchy, this command automatically waits (default 500ms) and captures recent console logs. This provides a complete picture of the app's current state, including any console output that occurred during rendering. The logs are displayed after the hierarchy data under a "--- Console Logs ---" separator.

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
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Example with custom options:**
```bash
pnpm agenteract-agents tap expo-app login-button --wait 1000 --log-count 20
```

**Automatic Log Capture:**
After performing the tap action, this command automatically waits (default 500ms) to allow any resulting actions to complete, then captures recent console logs. This eliminates the need for a separate round trip to check what happened after the interaction. The logs are displayed after the action completes under a "--- Console Logs ---" separator.

#### `input`
Simulates text input into a text field or input component.

**Command Example:**
To input text into a field with `testID: "username-input"` in the project named `expo-app`:
```bash
pnpm agenteract-agents input expo-app username-input "john@example.com"
```

**Optional Parameters:**
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
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
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
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
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
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
- `--wait` or `-w`: Milliseconds to wait before fetching logs (default: 500)
- `--log-count` or `-l`: Number of log entries to fetch (default: 10)

**Note:** The component must have an `onContextMenu` (web) or `onLongPress` (React Native) handler registered via `createAgentBinding`.

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
