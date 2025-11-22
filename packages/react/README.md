# Agenteract React

React and React Native integration for the Agenteract agent interaction framework.

## Overview

Agenteract React provides React/React Native bindings to make your web and mobile applications inspectable and controllable by AI agents.

## Features

- **Agent bindings** for React components (buttons, inputs, etc.)
- **DOM/View hierarchy inspection** for agents to "see" your UI
- **Console log streaming** to agents
- **WebSocket bridge** for communication with the Agenteract server
- **Deep link configuration** for physical device pairing (React Native/Expo)
- **Token-based authentication** for secure connections
- **Works with**: React web apps, React Native apps, and Expo apps

## Installation

```bash
npm install @agenteract/react
# or
yarn add @agenteract/react
# or
pnpm add @agenteract/react
```

### Additional Dependencies for React Native/Expo

For deep linking support on mobile, install these peer dependencies:

```bash
# For Expo
npx expo install @react-native-async-storage/async-storage expo-linking

# For React Native
npm install @react-native-async-storage/async-storage
```

## Quick Start - React Web

### 1. Add AgentDebugBridge to Your App

```tsx
import { AgentDebugBridge } from '@agenteract/react';

function App() {
  return (
    <>
      <YourAppContent />

      {/* Add AgentDebugBridge - invisible component */}
      <AgentDebugBridge projectName="my-app" />
    </>
  );
}
```

### 2. Add Agent Bindings to Components

```tsx
import { useAgentBinding } from '@agenteract/react';

function MyComponent() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');

  return (
    <div>
      {/* Button with tap handler */}
      <button
        {...useAgentBinding({
          testID: 'increment-button',
          onTap: () => setCount(count + 1)
        })}
        onClick={() => setCount(count + 1)}
      >
        Increment: {count}
      </button>

      {/* Text input */}
      <input
        {...useAgentBinding({
          testID: 'text-input',
          onChangeText: (value) => setText(value)
        })}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
```

### 3. Connect Your Browser

**For Local Development (Automatic):**
Web apps automatically connect to `localhost:8765` - no setup needed!

Just start the dev server:
```bash
pnpm agenteract dev
```

## Quick Start - React Native / Expo

### 1. Configure Deep Linking

#### For Expo

Add to your `app.json`:

```json
{
  "expo": {
    "scheme": "myapp",
    "plugins": [
      [
        "expo-linking",
        {
          "schemes": ["myapp"]
        }
      ]
    ]
  }
}
```

#### For React Native

**iOS** - Add to `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
  </dict>
</array>
```

**Android** - Add to `AndroidManifest.xml`:
```xml
<activity android:name=".MainActivity">
  <!-- Existing intent filters... -->

  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="myapp" />
  </intent-filter>
</activity>
```

### 2. Add AgentDebugBridge to Your App

```tsx
import { AgentDebugBridge } from '@agenteract/react';

export default function App() {
  return (
    <>
      <YourAppContent />

      {/* AgentDebugBridge handles deep linking automatically */}
      <AgentDebugBridge projectName="my-app" />
    </>
  );
}
```

The `AgentDebugBridge` automatically:
- Listens for deep link configuration (no additional code needed)
- Saves connection settings to AsyncStorage
- Reconnects automatically when the app launches

### 3. Add Agent Bindings to Components

```tsx
import { useAgentBinding } from '@agenteract/react';
import { TouchableOpacity, TextInput, Text } from 'react-native';

function MyComponent() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');

  return (
    <View>
      {/* Button with tap handler */}
      <TouchableOpacity
        {...useAgentBinding({
          testID: 'increment-button',
          onTap: () => setCount(count + 1)
        })}
        onPress={() => setCount(count + 1)}
      >
        <Text>Increment: {count}</Text>
      </TouchableOpacity>

      {/* Text input */}
      <TextInput
        {...useAgentBinding({
          testID: 'text-input',
          onChangeText: (value) => setText(value)
        })}
        value={text}
        onChangeText={setText}
      />
    </View>
  );
}
```

### 4. Connect Your Device

**For Simulators/Emulators (Automatic):**
Simulators automatically connect to `localhost:8765` - no setup needed!

**For Physical Devices (Deep Link Pairing):**

1. Configure your app in the CLI:
   ```bash
   pnpm agenteract add-config . my-app native --scheme myapp
   ```

   For Expo apps, use scheme `exp`:
   ```bash
   pnpm agenteract add-config . my-app expo --scheme exp
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

1. **CLI generates URL**: When you run `pnpm agenteract connect myapp`:
   ```
   myapp://agenteract/config?host=192.168.1.5&port=8765&token=abc123
   ```

   For Expo Go:
   ```
   exp://192.168.1.5:8081/--/agenteract/config?host=192.168.1.5&port=8765&token=abc123
   ```

2. **Device receives link**: Opens your app via QR code or simulator injection

3. **App parses config**: `AgentDebugBridge` extracts host, port, and token

4. **Config persists**: Saved to AsyncStorage automatically

5. **Auto-reconnect**: Future app launches use saved config

### Deep Link URL Format

Your app must handle deep links in one of these formats:

**Standard apps:**
```
<scheme>://agenteract/config?host=<ip>&port=<port>&token=<token>
```

**Expo Go:**
```
exp://<ip>:8081/--/agenteract/config?host=<ip>&port=<port>&token=<token>
```

### Security

- **Localhost/Emulator**: No token required (connects to `localhost` or `127.0.0.1`)
- **Physical devices**: Token authentication required
- **Token storage**: Securely stored in AsyncStorage
- **Manual override**: Scan new QR code to update config

## API Reference

### AgentDebugBridge

```tsx
interface AgentDebugBridgeProps {
  projectName: string;              // Required: matches agenteract.config.js
  host?: string;                    // Override default host (default: "localhost")
  port?: number;                    // Override default port (default: 8765)
  token?: string;                   // Override default token
  onConfigUpdate?: (config: AgenteractConfig) => void;  // Called when config changes
}
```

### useAgentBinding

```tsx
interface AgentBindingProps {
  testID: string;                   // Required: unique identifier
  onTap?: () => void;              // Tap handler
  onLongPress?: () => void;        // Long press handler
  onChangeText?: (text: string) => void;  // Text input handler
  onScroll?: (direction: string, amount: number) => void;  // Scroll handler
  onSwipe?: (direction: string, velocity: string) => void;  // Swipe handler
}

// Returns props to spread onto your component
const props = useAgentBinding({ testID: 'my-button', onTap: handleTap });
```

### AgentLogger

```tsx
import { logToAgent } from '@agenteract/react';

// Log messages visible to both console and agent
logToAgent('User logged in');
logToAgent('Error: Failed to fetch data', { userId: 123 });
```

## Troubleshooting

### Deep Link Not Opening App (React Native/Expo)

- **Expo**: Verify `scheme` is set in `app.json`
- **React Native iOS**: Check `Info.plist` has correct CFBundleURLSchemes
- **React Native Android**: Verify `AndroidManifest.xml` intent filter
- Ensure scheme matches what you used in CLI: `add-config --scheme myapp`
- On iOS 14+, you may need to approve the deep link prompt

### Connection Fails After Deep Linking

- Check agent server is running: `pnpm agenteract dev`
- Verify same WiFi network for physical devices
- Check React Native debugger/Expo logs for connection errors
- Confirm config was saved: Look for `[Agenteract] Config saved` in logs

### AsyncStorage Error (React Native)

- Ensure `@react-native-async-storage/async-storage` is installed
- For Expo: `npx expo install @react-native-async-storage/async-storage`
- For RN: `npm install @react-native-async-storage/async-storage && cd ios && pod install`

### Expo Linking Error

- Ensure `expo-linking` is installed: `npx expo install expo-linking`
- For Expo Go, use scheme `exp` or `exps`

### Agent Not Seeing Components

Ensure:
1. Components have `testID` set via `useAgentBinding()`
2. The `AgentDebugBridge` is rendered in your component tree
3. The app is connected (check WebSocket connection logs)

## Platform Support

- ✅ React Web (Chrome, Firefox, Safari, Edge)
- ✅ React Native iOS (iOS 13+)
- ✅ React Native Android (API 21+)
- ✅ Expo Go
- ✅ Expo managed workflow
- ✅ Expo bare workflow

## Examples

See the example apps:
- [React Web Example](../../examples/vite-example) - Vite + React web app
- [Expo Example](../../examples/expo-example) - Expo mobile app
- [React Native Example](../../examples/react-native-example) - Bare RN app

## License

MIT

## Contributing

See the main [Agenteract repository](https://github.com/agenteract/agenteract) for contribution guidelines.
