# Agenteract Kotlin

Kotlin Multiplatform integration for the Agenteract agent interaction framework.

## Overview

Agenteract Kotlin provides Compose Multiplatform bindings to make your Android and Desktop applications inspectable and controllable by AI agents.

## Features

- **Agent bindings** for Compose UI components
- **View hierarchy inspection** for agents to "see" your UI
- **Console log streaming** to agents
- **WebSocket bridge** for communication with the Agenteract server
- **Deep link configuration** for physical device pairing
- **Token-based authentication** for secure connections

## Requirements

- Kotlin 1.9+
- Compose Multiplatform
- Android: minSdk 24+
- JVM: Java 11+

## Installation

Add to your `build.gradle.kts`:

```kotlin
dependencies {
    implementation("io.agenteract:agenteract-kotlin:1.0.0")
}
```

## Quick Start - Android

### 1. Configure Deep Linking

Add to your `AndroidManifest.xml`:

```xml
<activity
    android:name=".MainActivity"
    android:exported="true">

    <!-- Your existing intent filters... -->

    <!-- Add this for Agenteract deep linking -->
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

Replace `yourapp` with your app's unique URL scheme.

### 2. Handle Deep Links in Your Activity

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize context for Agenteract
        AgenteractContext.appContext = applicationContext

        // Handle deep link if present
        DeepLinkHandler.handleIntent(intent)

        setContent {
            MyApp()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // Handle deep links when app is already running
        DeepLinkHandler.handleIntent(intent)
    }
}
```

### 3. Add AgentDebugBridge to Your Compose UI

```kotlin
@Composable
fun MyApp() {
    MaterialTheme {
        // Your UI here
        Column {
            Text("Hello World")
        }

        // Add AgentDebugBridge (invisible component)
        AgentDebugBridge(projectName = "my-app")
    }
}
```

The `AgentDebugBridge`:
- Automatically loads saved configuration from SharedPreferences
- Connects to the agent server
- Handles incoming commands
- No UI - purely functional

### 4. Add Agent Bindings to UI Components

Use the `agentModifier` to make components controllable:

```kotlin
// Button with tap handler
Button(
    onClick = { handleClick() },
    modifier = Modifier.agentModifier(
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
    modifier = Modifier.agentModifier(
        testID = "username-input",
        onChangeText = { text = it }
    )
)
```

### 5. Connect Your Device

**For Emulators (Automatic):**
Emulators automatically connect to `10.0.2.2:8765` - no setup needed!

**For Physical Devices (Deep Link Pairing):**

1. Configure your app in the CLI:
   ```bash
   pnpm agenteract add-config . my-app native --scheme yourapp
   ```

2. Start the dev server:
   ```bash
   pnpm agenteract dev
   ```

3. Connect your device:
   ```bash
   pnpm agenteract connect
   ```

4. Scan the QR code with your device camera

The app will receive the deep link, save the configuration, and connect automatically!

## Deep Linking & Configuration

### How Deep Link Pairing Works

1. **CLI generates URL**: When you run `pnpm agenteract connect yourapp`:
   ```
   yourapp://agenteract/config?host=192.168.1.5&port=8765&token=abc123
   ```

2. **Device receives link**: Opens your app via QR code or emulator injection

3. **App parses config**: `DeepLinkHandler` extracts host, port, and token

4. **Config persists**: Saved to SharedPreferences automatically

5. **Auto-reconnect**: Future app launches use saved config

### AndroidManifest.xml Deep Link Setup

The intent filter must match this pattern:

```xml
<data
    android:scheme="yourapp"        <!-- Your unique scheme -->
    android:host="agenteract"        <!-- Must be "agenteract" -->
    android:pathPrefix="/config" />  <!-- Must be "/config" -->
```

**Complete example:**

```xml
<activity android:name=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="myapp"
            android:host="agenteract"
            android:pathPrefix="/config" />
    </intent-filter>
</activity>
```

### Security

- **Localhost/Emulator**: No token required (connects to `10.0.2.2` or `127.0.0.1`)
- **Physical devices**: Token authentication required
- **Token storage**: Securely stored in SharedPreferences
- **Manual override**: Scan new QR code to update config

## API Reference

### AgentDebugBridge

```kotlin
@Composable
fun AgentDebugBridge(
    projectName: String,
    host: String = "localhost",      // Override default host
    port: Int = 8765,                 // Override default port
    token: String? = null,            // Override default token
    onConfigUpdate: ((AgenteractConfig) -> Unit)? = null
)
```

### DeepLinkHandler (Android)

```kotlin
// Parse Intent to AgenteractConfig
val config: AgenteractConfig? = DeepLinkHandler.parseIntent(intent)

// Parse Uri directly
val config: AgenteractConfig? = DeepLinkHandler.parseUri(uri)

// Handle Intent and save config automatically
val handled: Boolean = DeepLinkHandler.handleIntent(intent)
```

### AgentConfigManager

```kotlin
// Save configuration
AgentConfigManager.saveConfig(
    AgenteractConfig(host = "192.168.1.5", port = 8765, token = "abc123")
)

// Load saved configuration
val config: AgenteractConfig? = AgentConfigManager.loadConfig()

// Clear configuration
AgentConfigManager.clearConfig()
```

### agentModifier

```kotlin
Modifier.agentModifier(
    testID: String,                           // Required: unique identifier
    onTap: (() -> Unit)? = null,             // Tap handler
    onLongPress: (() -> Unit)? = null,       // Long press handler
    onChangeText: ((String) -> Unit)? = null, // Text input handler
    onScroll: ((String, Double) -> Unit)? = null,    // Scroll handler (direction, amount)
    onSwipe: ((String, String) -> Unit)? = null      // Swipe handler (direction, velocity)
)
```

## Troubleshooting

### Deep Link Not Opening App

- Verify `android:scheme` in AndroidManifest matches CLI command
- Ensure `android:host="agenteract"` and `android:pathPrefix="/config"`
- Check that activity has `android:exported="true"`
- On Android 12+, you may need to approve the deep link prompt

### Connection Fails After Deep Linking

- Check agent server is running: `pnpm agenteract dev`
- Verify same WiFi network
- Check Logcat for connection errors
- Confirm config was saved: Look for `[Agenteract] Config saved` in logs

### SharedPreferences Error

- Ensure `AgenteractContext.appContext` is set in `onCreate`
- Must be set before calling `AgentDebugBridge`

## Desktop Support

For desktop apps, the library uses in-memory configuration storage. Deep linking is not supported on desktop - use localhost connection.

## License

MIT

## Contributing

See the main [Agenteract repository](https://github.com/agenteract/agenteract) for contribution guidelines.
