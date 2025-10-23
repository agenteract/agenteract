# Integrating Agenteract in a SwiftUI App

### 1. Add Agenteract Swift Package to Xcode Project

The example app uses the local Agenteract Swift package:

1. Open XCode
2. Create a new IOS / Swift UI project
3. Click "Add Other..." → "Add Package Dependency..."
4. Enter `https://github.com/agenteract/agenteract-swift` in Search for URL or package
5. Click "Add Package"
8. Ensure the `Agenteract` library is selected and click "Add Package"

## Step 2: Instantiate the Bridge in Your Root View

The `AgentDebugBridge` view component needs to be active in your application's view hierarchy to establish and maintain the WebSocket connections. The easiest way to do this is to add it as a background element to your app's root view.

In your main `ContentView.swift` or equivalent root view, embed your primary view within a `ZStack` and add the `AgentDebugBridge`.

```swift
// ContentView.swift
import SwiftUI
import Agenteract

struct ContentView: View {
    var body: some View {
        ZStack {
            // Your app's main view content goes here
            MyMainView()

            // Add the AgentDebugBridge. It's an invisible view.
            // The `projectName` must match the project name in your agenteract.config.js
            AgentDebugBridge(projectName: "swift-app")
        }
    }
}
```

## Step 3: Expose UI Elements to Agenteract

With `AgentBinding.swift` included in your project, you can use the `.agentBinding()` view modifier to easily expose UI elements to Agenteract for both inspection and interaction. This modifier handles setting the `accessibilityIdentifier` and registering the necessary action handlers automatically.

**Example: Button**

Simply add the `.agentBinding()` modifier to your button. The `testID` is used for identification, and the `onTap` closure provides the action for the agent to execute.

```swift
Button("My Button") {
    // This is the user-facing action
    AppLogger.info("Button tapped by user!")
}
.agentBinding(testID: "my-button", onTap: {
    // This is the action the agent will execute
    AppLogger.info("Button tapped by agent!")
})
```

**Example: TextField**

For text input, use the `onChangeText` handler to update the state bound to the `TextField`.

```swift
@State private var username: String = ""

TextField("Enter username", text: $username)
    .agentBinding(testID: "username-input", onChangeText: { newText in
        // The agent calls this closure to simulate typing
        self.username = newText
    })
```

## Step 4: Implement Logging

With the `Logger.swift` file added to your project, you have access to a convenient `AppLogger` class that forwards logs to both the Xcode console and the `agenteract dev` environment.

To add a log entry from anywhere in your app, simply call one of the static methods on `AppLogger`:

```swift
AppLogger.info("User has logged in successfully.")
AppLogger.error("Failed to load resource from network.")
AppLogger.debug("Current state is: \(myStateObject.description)")
```

Alternatively, you can use the global convenience function `appLog`:

```swift
appLog("This is a default log message.")
```

These logs will appear simultaneously in the Xcode debug console and in the terminal tab corresponding to your native app project in the Agenteract CLI.

---

With these steps completed, your SwiftUI application is fully integrated with Agenteract, enabling deep inspection, automated interaction, and real-time logging.
