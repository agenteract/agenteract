# Agenteract for Kotlin Multiplatform (Compose)

## Installation

Add the `agenteract-kotlin` dependency to your `build.gradle.kts`:

```kotlin
kotlin {
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("io.agenteract:agenteract-kotlin:0.0.1")
            }
        }
    }
}
```

## Usage

### Android Specific Setup (Troubleshooting)

If you encounter `java.net.SocketException: Operation not permitted` on Android, ensure the following:

1.  **ADB Reverse Port Forwarding**: The agent server runs on `localhost:8765`. For the Android app to connect, you need to forward this port to the device/emulator:
    ```bash
    adb reverse tcp:8765 tcp:8765
    ```

2.  **Cleartext Traffic**: Android 9 (API level 28) and higher block cleartext HTTP traffic by default. The `AgentDebugBridge` uses a WebSocket connection, which might be over cleartext during development. To allow this, add `android:usesCleartextTraffic="true"` to your `<application>` tag in `src/androidMain/AndroidManifest.xml`:
    ```xml
    <application
        ...
        android:usesCleartextTraffic="true">
        <!-- ... -->
    </application>
    ```

3.  **Internet Permission**: Ensure your app has the internet permission in `src/androidMain/AndroidManifest.xml`:
    ```xml
    <manifest ...>
        <uses-permission android:name="android.permission.INTERNET" />
        <application ...>
    </manifest>
    ```

### 1. Initialize AgentDebugBridge

Add the `AgentDebugBridge` to your Compose application hierarchy.

```kotlin
import io.agenteract.AgentDebugBridge
import androidx.compose.runtime.Composable

@Composable
fun App() {
    AgentDebugBridge(projectName = "kmp-app") {
        // Your app content
    }
}
```

### 2. Make Components Interactive

Use the `Modifier.agentBinding` modifier to expose components to the agent.

```kotlin
import io.agenteract.agentBinding
import androidx.compose.material.Button
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun InteractiveButton() {
    Button(
        onClick = { /* handle click */ },
        modifier = Modifier.agentBinding(
            testID = "submit-button",
            onTap = { /* simulated tap handler */ }
        )
    ) {
        Text("Submit")
    }
}
```

### 3. Supported Interactions

- **onTap**: Simulate a tap/click.
- **onInput**: Simulate text input (for TextFields).
- **onScroll**: Simulate scroll events.
- **onSwipe**: Simulate swipe gestures.
- **onLongPress**: Simulate long press events.

```kotlin
Modifier.agentBinding(
    testID = "text-input",
    onInput = { text -> println("Input: $text") }
)
```
