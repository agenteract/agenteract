<!--
This README describes the package. If you publish this package to pub.dev,
this README's contents appear on the landing page for your package.

For information about how to write a good package README, see the guide for
[writing package pages](https://dart.dev/tools/pub/writing-package-pages).

For general information about developing packages, see the Dart guide for
[creating packages](https://dart.dev/guides/libraries/create-packages)
and the Flutter guide for
[developing packages and plugins](https://flutter.dev/to/develop-packages).
-->

Flutter package for Agenteract - enables AI agents to interact with and debug Flutter applications.

## Installation

### From GitHub (Recommended for now)

```yaml
dependencies:
  agenteract:
    git:
      url: https://github.com/agenteract/agenteract.git
      path: packages/flutter
      ref: main
```

### From local monorepo (for development)

```yaml
dependencies:
  agenteract:
    path: ../../packages/flutter
```

### From pub.dev (coming soon)

```yaml
dependencies:
  agenteract: ^0.0.1
```

Then run:
```bash
flutter pub get
```

## Usage

### 1. Add AgentDebugBridge to your app

Wrap your app with `AgentDebugBridge` in development mode:

```dart
import 'package:agenteract/agenteract.dart';
import 'package:flutter/foundation.dart';

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final app = MaterialApp(
      home: MyHomePage(),
    );

    // Wrap with AgentDebugBridge in debug mode only
    if (kDebugMode) {
      return AgentDebugBridge(
        projectName: 'my-flutter-app',
        child: app,
      );
    }
    return app;
  }
}
```

### 2. Make widgets interactive with `.withAgent()`

Use the `.withAgent()` extension method to make any widget discoverable and interactive:

```dart
import 'package:agenteract/agenteract.dart';

// Button example
ElevatedButton(
  onPressed: () => print('Button pressed'),
  child: Text('Submit'),
).withAgent('submit-button', onTap: () => print('Button pressed'))

// Text input example
TextField(
  decoration: InputDecoration(labelText: 'Username'),
  onChanged: (text) => setState(() => username = text),
).withAgent(
  'username-input',
  onChangeText: (text) => setState(() => username = text),
)

// Any widget can be made discoverable
Text('Hello World').withAgent('greeting-text')
```

## Supported Actions

- **tap**: Simulate taps on interactive widgets
- **input**: Enter text into text fields
- **scroll**: Scroll scrollable widgets
- **longPress**: Simulate long press gestures
- **swipe**: Simulate swipe gestures

## Deep Linking & Physical Device Setup

For **physical device testing** (Android phones, iPhones), you need to configure deep linking to enable secure pairing with the Agenteract server.

### Required Dependencies

Deep linking requires these packages (already included in pubspec.yaml):

```yaml
dependencies:
  shared_preferences: ^2.2.2  # Config storage
  uni_links: ^0.5.1           # Deep link handling
```

### Platform Configuration

#### iOS Setup

Add to `ios/Runner/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLName</key>
    <string>com.yourcompany.yourapp</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>yourapp</string>
    </array>
  </dict>
</array>
```

Replace `yourapp` with your app's unique URL scheme (e.g., `myflutterapp`).

#### Android Setup

Add to `android/app/src/main/AndroidManifest.xml` inside the `<activity>` tag:

```xml
<activity
    android:name=".MainActivity"
    android:exported="true">

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

Replace `yourapp` with the same scheme you used for iOS.

### How Deep Link Pairing Works

1. **Configure CLI**: Tell Agenteract your app's URL scheme:
   ```bash
   pnpm agenteract add-config . flutter-app native --scheme yourapp
   ```

2. **Start dev server**:
   ```bash
   pnpm agenteract dev
   ```

3. **Connect physical device**:
   ```bash
   pnpm agenteract connect
   ```

4. **Scan QR code** with your device camera

5. The deep link contains:
   ```
   yourapp://agenteract/config?host=192.168.1.5&port=8765&token=abc123
   ```

6. **Config persists** - Saved to SharedPreferences automatically

7. **Auto-reconnect** - Future app launches use saved config

### Deep Link URL Format

Your app must handle deep links in this format:

```
<scheme>://agenteract/config?host=<ip>&port=<port>&token=<token>
```

Where `<scheme>` matches the URL scheme you configured in Info.plist and AndroidManifest.xml.

### Security

- **Localhost/Emulator**: No token required (auto-connects to localhost or 10.0.2.2)
- **Physical devices**: Token authentication required
- **Token storage**: Securely stored in SharedPreferences
- **Manual override**: Scan new QR code to update config

### Troubleshooting Deep Links

**Deep link not opening app:**
- iOS: Check `Info.plist` has correct `CFBundleURLSchemes`
- Android: Verify `AndroidManifest.xml` intent filter is inside `<activity>` tag
- Ensure scheme matches CLI command: `add-config --scheme yourapp`
- On Android 12+, you may need to approve the deep link prompt

**Connection fails after deep linking:**
- Check dev server is running: `pnpm agenteract dev`
- Verify same WiFi network
- Check Flutter logs: `flutter logs` or in dev server output
- Look for `Agenteract: Received config via Deep Link` in logs

**SharedPreferences error:**
- Ensure `shared_preferences` package is installed
- Run `flutter pub get`

**uni_links error:**
- Ensure `uni_links` package is installed
- Run `flutter pub get`
- Hot restart after adding deep link configuration

## Configuration

Add your Flutter app to `agenteract.config.js`:

```javascript
export default {
  port: 8766,
  projects: [
    {
      name: 'flutter-app',
      path: './my-flutter-app',
      type: 'native',
      scheme: 'yourapp'  // Required for physical device pairing
    }
  ],
};
```

For projects using the new generic dev server format:

```javascript
export default {
  port: 8766,
  projects: [
    {
      name: 'flutter-app',
      path: './my-flutter-app',
      devServer: {
        command: 'flutter run',
        port: 8790
      },
      scheme: 'yourapp'  // Required for physical device pairing
    }
  ],
};
```

### Connecting Devices

**For Simulators/Emulators (Automatic):**
Simulators automatically connect to localhost - no setup needed!

- iOS Simulator: `ws://127.0.0.1:8765`
- Android Emulator: `ws://10.0.2.2:8765`

**For Physical Devices (Deep Link Pairing):**

Follow the deep linking setup above, then:

1. Configure scheme: `pnpm agenteract add-config . flutter-app native --scheme yourapp`
2. Start dev server: `pnpm agenteract dev`
3. Connect device: `pnpm agenteract connect`
4. Scan QR code with device camera

## Additional Information

This package is part of the [Agenteract monorepo](https://github.com/agenteract/agenteract).

For more information, see the [documentation](https://github.com/agenteract/agenteract/blob/main/docs/AGENTS.md).
