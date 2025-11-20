# Agenteract for Kotlin Multiplatform (Compose)

## Installation

Add the `agenteract-kotlin` dependency to your `build.gradle.kts`:

```kotlin
kotlin {
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("com.agenteract:agenteract-kotlin:0.0.1")
            }
        }
    }
}
```

## Usage

### 1. Initialize AgentDebugBridge

Add the `AgentDebugBridge` to your Compose application hierarchy.

```kotlin
import com.agenteract.AgentDebugBridge
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
import com.agenteract.agentBinding
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
