# Agenteract Swift Example

This is an example iOS app demonstrating how to integrate Agenteract with Swift/SwiftUI.

## Setup

### 1. Add Files to Xcode Project

The Swift files have been created, but you need to add them to your Xcode project:

1. Open `AgenteractSwiftExample.xcodeproj` in Xcode
2. Right-click on the `AgenteractSwiftExample` folder in the Project Navigator
3. Select "Add Files to 'AgenteractSwiftExample'..."
4. Navigate to the `AgenteractSwiftExample` folder and select:
   - `AgentDebugBridge.swift`
   - `AgentBinding.swift`
5. Make sure "Copy items if needed" is **unchecked** (files are already in the right location)
6. Make sure "Add to targets" has `AgenteractSwiftExample` checked
7. Click "Add"

### 2. Build and Run

1. Select a simulator or device
2. Press `Cmd + R` to build and run
3. The app should launch showing the Agenteract example UI

### 3. Connect to Agent Server

From the agenteract root directory, start the agent server:

```bash
pnpm agenterserve dev
```

The iOS app will automatically connect to the agent server via WebSocket at `ws://127.0.0.1:8765/swift-app`.

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
