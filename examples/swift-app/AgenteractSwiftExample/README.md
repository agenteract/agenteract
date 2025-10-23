# Integrating Agenteract in a SwiftUI App

This guide explains how to integrate the Agenteract debug bridge and logging functionality into your SwiftUI application. This will allow the `agenteract` CLI to inspect your app's view hierarchy, simulate user interactions, and view application logs.

## Prerequisites

Ensure the Agenteract development environment is running. This is typically started with the `agenteract dev` command in your project's root directory. This command starts the necessary agent and log servers that the app will connect to.

## Step 1: Add Bridge and Helper Files to Your Project

The integration requires three files from this example project:

1.  `AgentDebugBridge.swift`: Contains the core logic for connecting to the Agenteract servers.
2.  `Logger.swift`: Provides a convenient wrapper for logging.
3.  `AgentBinding.swift`: Provides a `ViewModifier` to simplify exposing UI elements to Agenteract.

Copy all three of these files into your Xcode project. Ensure they are included in your app's target.

## Step 2: Instantiate the Bridge in Your Root View

The `AgentDebugBridge` view component needs to be active in your application's view hierarchy to establish and maintain the WebSocket connections. The easiest way to do this is to add it as a background element to your app's root view.

In your main `ContentView.swift` or equivalent root view, embed your primary view within a `ZStack` and add the `AgentDebugBridge`.

```swift
// ContentView.swift
import SwiftUI

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
