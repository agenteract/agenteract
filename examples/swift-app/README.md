# Agenteract Swift Example

This is an example iOS app demonstrating how to integrate Agenteract with Swift/SwiftUI.

## Setup

### 1. Add Agenteract Swift Package to Xcode Project

The example app uses the local Agenteract Swift package:

1. Open `AgenteractSwiftExample.xcodeproj` in Xcode
2. Select the project in the Project Navigator
3. Select the `AgenteractSwiftExample` target
4. Go to the "General" tab
5. Scroll to "Frameworks, Libraries, and Embedded Content"
6. Click the "+" button
7. Click "Add Other..." → "Add Package Dependency..."
8. In the search field, paste the local path: `../../agenteract/agenteract/packages/swift`
   - Or click "Add Local..." and navigate to `packages/swift`
9. Click "Add Package"
10. Ensure the `Agenteract` library is selected and click "Add Package"

### 2. Update Imports

Make sure your Swift files import the Agenteract module:

```swift
import Agenteract
```

### 3. Build and Run

1. Select a simulator or device
2. Press `Cmd + R` to build and run
3. The app should launch showing the Agenteract example UI

### 3. Configure URL Scheme (Required for Deep Linking)

To enable deep link pairing:

1. In Xcode, select your project in the Project Navigator
2. Select the `AgenteractSwiftExample` target
3. Go to the "Info" tab
4. Expand "URL Types"
5. Click the "+" button to add a new URL type
6. Set the following:
   - **Identifier**: `com.agenteract.swift-example` (or your bundle ID)
   - **URL Schemes**: `agenteract-swift-example`
   - **Role**: Editor

This allows the app to receive deep links like `agenteract-swift-example://agenteract/config?host=...&port=...&token=...`

### 4. Connect to Agent Server

#### Option A: Using Deep Link Pairing (Recommended for Physical Devices)

1. Start the agent server from the agenteract root directory:
   ```bash
   pnpm agenteract dev
   ```

2. Pair your device:
   ```bash
   pnpm agenteract connect agenteract-swift-example
   ```

3. Scan the QR code with your device or select your simulator from the list

The app will automatically save the configuration and connect.

#### Option B: Localhost (Simulators Only)

If running on a simulator, the app will automatically connect to `ws://127.0.0.1:8765/swift-app` (no deep linking needed).

## Architecture

### AgentDebugBridge.swift

Core bridge between the Swift app and the agent server:

- **AgentRegistry**: Thread-safe registry that stores references to views with testIDs and their interaction handlers
- **AgentWebSocketManager**: Manages WebSocket connection to agent server with automatic reconnection
- **ViewHierarchyInspector**: Extracts the current view hierarchy for inspection
- **Simulation functions**: Execute tap, input, and long press actions on registered views

### AgentBinding.swift

Provides convenient SwiftUI APIs for making views agent-controllable:

- **`.agentBinding()` modifier**: Add agent capabilities to any view
- **`AgentButton`**: Pre-configured button with agent binding
- **`AgentTextField`**: Pre-configured text field with agent binding

### ContentView.swift

Example implementation showing:

- Button tap interactions with `AgentButton`
- Text input with `AgentTextField`
- Long press gestures
- Using the `.agentBinding()` modifier directly on views
- Integration of `AgentDebugBridge` component

## Usage from CLI

Once the app is running and connected to the agent server, you can interact with it using the agenteract CLI:

### Get View Hierarchy

```bash
pnpm agenteract-agents hierarchy swift-app
```

### Simulate Tap

```bash
pnpm agenteract-agents tap swift-app tap-button
```

### Simulate Text Input

```bash
pnpm agenteract-agents input swift-app text-input "Hello from agent"
```

### Get Console Logs

```bash
pnpm agenteract-agents logs swift-app --since 20
```

## Adding Agent Binding to Your Views

### Method 1: Using the Modifier

```swift
Button("Click Me") {
    print("Button clicked")
}
.agentBinding(testID: "my-button", onTap: {
    print("Button clicked via agent")
})
```

### Method 2: Using AgentButton

```swift
AgentButton(testID: "my-button") {
    print("Button clicked")
} label: {
    Text("Click Me")
}
```

### Method 3: Using AgentTextField

```swift
@State private var text = ""

AgentTextField(
    testID: "my-input",
    placeholder: "Enter text",
    text: $text
)
```

## Project Configuration

The project name in `AgentDebugBridge(projectName: "swift-app")` must match the name used in your agenteract configuration.

## Notes

- The WebSocket connection automatically reconnects if disconnected
- Console logs are captured automatically (up to 2000 lines)
- View hierarchy inspection returns registered testIDs
- All simulation functions run on the main actor for thread safety

## Known Issues

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for detailed information about:
- ✅ Tap interactions (working!)
- ❌ Text input not working yet
- ❌ Console logs require `simctl`/`devicectl` integration
- ❌ Device detection needed for log capture

## Future Enhancements

- [ ] Full SwiftUI view tree traversal for hierarchy inspection
- [ ] Scroll gesture simulation
- [ ] More comprehensive accessibility label support
- [ ] Screenshot capture capability
- [ ] Performance metrics collection
