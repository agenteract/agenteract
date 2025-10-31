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

## Configuration

Add your Flutter app to `agenteract.config.js`:

```javascript
export default {
  port: 8766,
  projects: [
    {
      name: 'flutter-app',
      path: './my-flutter-app',
      type: 'native'
    }
  ],
};
```

## Additional Information

This package is part of the [Agenteract monorepo](https://github.com/agenteract/agenteract).

For more information, see the [documentation](https://github.com/agenteract/agenteract/blob/main/docs/AGENTS.md).
