# **Agenteract**

*Let your agents interact...*

**Agenteract** is an experimental bridge that lets large-language-model agents *see* and *interact* with running applications — starting with **React Native / Expo** and **Gemini CLI**.

It exposes the app’s internal state, view hierarchy, and actionable controls over a secure WebSocket, enabling agents (or test harnesses) to observe and trigger UI events just like a developer or user would.

   <p align="center">
     <img src="demo.gif" alt="Demo" width="600">
   </p>

---

## **✨ Why**

Most “AI agents” rely on vision or accessibility APIs to understand an app’s UI.  
 That approach is heavy, slow, and unreliable.  
 Agenteract flips the model — apps can **self-report** their structure and controls in a simple, semantic format.

Agents no longer guess what’s on screen; they can query the actual component tree and call meaningful actions.

---

## **🧩 Core Concepts**

| Concept | Description |
| ----- | ----- |
| **Bridge** | A lightweight WebSocket endpoint inside the app (AgentDebugBridge, AgenteractBridge, etc.) that sends UI snapshots and receives action commands. |
| **Hierarchy Provider** | Gathers a filtered React Fiber tree with component names, testIDs, and text. |
| **Agent Registry** | Maps component actions (for example, onPress or onChangeText) to callable handlers. |
| **Agent Commands** | JSON messages such as `{ "action": "tap", "target": "loginButton" }`. |
| **Protocol** | Human-readable JSON over WebSocket; future versions will support HTTP and gRPC. |

---

## **🧱 Example Flow**

**Agent requests hierarchy**

`{ "action": "getViewHierarchy" }`

**App responds**

`{ "status": "success", "hierarchy": { "root": "main(RootComponent)", "children": [...] } }`

**Agent performs action**

`{ "action": "press", "target": "loginButton" }`

**App executes bound handler and returns**

`{ "status": "ok", "result": "Button pressed" }`

---

## **⚙️ Packages**

| Package | Purpose |
| ----- | ----- |
| `@agenteract/core` | Core schema, message protocol, and bridge utilities |
| `@agenteract/react` | React / React Native bindings (`useAgentBinding`, registry hooks) |
| `@agenteract/expo` | Expo bridge utilities and CLI |
| `@agenteract/vite` | Vite bridge utilities and CLI |
| `@agenteract/flutter-cli` | Flutter bridge utilities and CLI |
| `@agenteract/cli` | Unified command-line interface for Agenteract |
| `@agenteract/server` | Agent command server and runtime bridge |
| `@agenteract/agents` | Agent instructions installer (creates AGENTS.md) |
| `@agenteract/dom` | DOM utilities for web applications |
| [agenteract-swift](https://github.com/agenteract/agenteract-swift) | iOS / Swift Bindings / Package
| [flutter](./packages/flutter/) | Flutter Bindings Package

## **🚀 Getting Started (Preview)**

## **1. Installation**

First, you'll need to install the Agenteract CLI. This tool manages the communication between the AI agent and your local development servers.

```bash
npm install -g @agenteract/cli
```

Next, install the appropriate package for your project.

**For React Native (Expo):**

```bash
npm install @agenteract/expo
```

**For React (Vite):**

```bash
npm install @agenteract/react
```

## **2. AGENTS.md**

Next, install `AGENTS.md` - This will allow your coding assistant to understand how agenteract works.

If you already have an `AGENTS.md`, our contents will be appended.

```bash
npx @agenteract/agents
```

Copy the file to a specific agent name if required:

```bash
cp AGENTS.md GEMINI.md
```

Now you can reference the file for your agent in a message, or restart the CLI for it to take effect.

At this point you can ask your agent to start setting up Agenteract.

## **3. Configuration**

The command below will create an initial `agenteract.config.js`, or add entries to an existing configuration.

**New Format (Generic Dev Server):**
```bash
npx @agenteract/cli add-config <path> <projectName> <command> [port]
```

`port` is auto assigned if not provided. This is the port that Agenteract uses to communicate internally, it's not where the dev server hosts files.

Examples:
```bash
# Next.js app with explicit port
npx @agenteract/cli add-config ./apps/web next-app "npm run dev"

# Remix app with auto-assigned port
npx @agenteract/cli add-config ./apps/remix remix-app "remix dev"

# Custom dev server
npx @agenteract/cli add-config ./apps/custom my-app "pnpm start:dev"
```

**Legacy Format (Still Supported):**
```bash
# For Expo, Vite, or Flutter projects
npx @agenteract/cli add-config <path> <projectName> <type>
# where type is: expo | vite | flutter | native
```

Examples:
```bash
npx @agenteract/cli add-config ./my-vite-app vite-app vite
npx @agenteract/cli add-config ./my-expo-app expo-app expo
npx @agenteract/cli add-config ./my-swift-app swift-app native
```

Here is an example configuration for a monorepo containing multiple projects:

```javascript
// agenteract.config.js
export default {
  /**
   * The port for the central Agenteract server.
   * The agent connects to this port.
   */
  port: 8766,

  /**
   * An array of projects to manage.
   */
  projects: [
    {
      // A unique identifier for this app. Used for targeting commands.
      name: 'expo-app',
      // The path to the app's root directory, relative to this config file.
      path: './examples/expo-example',
      // Generic dev server configuration
      devServer: {
        command: 'npx expo start',
        port: 8790,
      }
    },
    {
      name: 'react-app',
      path: './examples/react-example',
      devServer: {
        command: 'npx vite',
        port: 8791,
      }
    },
    {
      name: 'flutter-app',
      path: './examples/flutter_example',
      devServer: {
        command: 'flutter run',
        port: 8792,
        validation: {
          fileExists: ['pubspec.yaml'],
          commandInPath: 'flutter',
        }
      }
    },
    {
      name: 'next-app',
      path: './apps/web',
      devServer: {
        command: 'npm run dev',
        port: 8793,
      }
    },
    {
      name: 'swift-app',
      path: './examples/swift-app',
      type: 'native'  // Native apps don't have dev servers
    }
  ],
};
```

### Configuration Options

-   `port`: The main port for the Agenteract server.
-   `projects`: An array of project objects.
    -   `name`: A unique name for your app (used in agent commands).
    -   `path`: The relative path to your app's root directory.
    -   `devServer`: Dev server configuration (optional for native apps).
        -   `command`: The shell command to start the dev server (e.g., `'npm run dev'`, `'flutter run'`).
        -   `port`: A unique port for the PTY (pseudo-terminal) bridge.
        -   `cwd`: (Optional) Override working directory.
        -   `env`: (Optional) Additional environment variables.
        -   `validation`: (Optional) Pre-flight checks.
            -   `fileExists`: Files that must exist (e.g., `['package.json']`).
            -   `commandInPath`: Commands that must be in PATH (e.g., `'node'`, `'flutter'`).
            -   `errorHints`: Custom error messages for common issues.
    -   `type`: (Deprecated) Legacy type field. Use `devServer` instead.

**Note:** The old `type` and `ptyPort` fields are deprecated but still supported for backward compatibility. See `docs/MIGRATION_V2.md` for migration instructions.

## **4. Instrumenting Your Application**

To allow Agenteract to "see" and interact with your application, you need to add the `AgentBridge` component to your app's entry point.

**For React Native (Expo) - `App.tsx`:**

```tsx
import { AgentBridge } from '@agenteract/expo';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      {/* Your existing application */}
      <Text>Welcome to my app!</Text>

      {/* Add the AgentBridge */}
      <AgentBridge />
    </View>
  );
}
```

**For React (Vite) - `src/App.tsx`:**

```tsx
import { AgentBridge } from '@agenteract/react';

function App() {
  return (
    <>
      {/* Your existing application */}
      <h1>Welcome to my app!</h1>

      {/* Add the AgentBridge */}
      <AgentBridge />
    </>
  );
}

export default App;
```

**For Flutter `lib/main.dart`**:

* AgentDebugBridge example:

https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/examples/flutter_example/lib/main.dart

* Packages:
`agenteract` (Git or local path - not yet on pub.dev)

Installation:
```yaml
dependencies:
  agenteract:
    git:
      url: https://github.com/agenteract/agenteract.git
      path: packages/flutter
```

The following can be installed either in the app, or at the monorepo root if applicable.

`@agenteract/cli`

`@agenteract/server`

`@agenteract/agents`

Usage:

```dart
import 'package:agenteract/agenteract.dart';
import 'package:flutter/foundation.dart';
// ...
if (kDebugMode) {
  return AgentDebugBridge(
    projectName: 'myFlutterApp',
    child: MyApp(),
  );
}
```

Making widgets interactive:

```dart
// Use the .withAgent() extension on any widget
ElevatedButton(
  onPressed: () => print('clicked'),
  child: Text('Click me'),
).withAgent('submit-button', onTap: () => print('clicked'))

// Text input
TextField(
  onChanged: (text) => print(text),
).withAgent('username-input', onChangeText: (text) => print(text))
```

**For Swift UI**

See [agenteract-swift](https://github.com/agenteract/agenteract-swift)

## **5. Running Agenteract**

With your configuration in place and your app instrumented, you can now start Agenteract.

Open a terminal and run the following command from the root of your project (where your `agenteract.config.js` is located):

```bash
npx @agenteract/cli dev
```

This command will:
-   Start the central Agenteract server on the configured `port`.
-   Start a PTY bridge for each project on its configured `ptyPort`.
-   Automatically start the development server for each of your configured projects (e.g., `npm run dev` or `npx expo start`).

AI agents can now connect to the Agenteract server using the tools described in `AGENTS.md`. The agent can view your app's component hierarchy and perform actions like tapping buttons or typing into text fields.

Your agent is now ready to Agenteract!


---

## **🔒 Security & Scope**

* Designed for **local development, testing, and accessibility research**.

* Future versions will include authentication, session control.

---

## **⛏️ Development**

This guide covers how to set up the local development environment to run the Expo example app and the agent server.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for in depth information about the project structure.

### **1. Prerequisites**

First, clone the repository and ensure you have [pnpm](https://pnpm.io/) installed.

```bash
git clone https://github.com/agenteract/agenteract.git
cd agenteract
git submodule update --init --recursive
npm install -g pnpm
```

### **2. Install Dependencies & Build**

Install all dependencies for the monorepo and build the packages from the root directory.

```bash
npm install -g pnpm
pnpm install
pnpm build
```

We need to use linking to work locally:

Usage:
```bash
cd packages/server
pnpm link --global
cd packages/agents
pnpm link --global
cd packages/cli
pnpm link --global
cd packages/expo
pnpm link --global
cd packages/vite
pnpm link --global
cd packages/flutter-cli
pnpm link --global

```

### **3. Run the Development Environment**

Start the Agenteract development environment using the unified CLI:

```bash
pnpm agenteract dev

# once published, you can use:
npx @agenteract/cli dev
```

This will:
- Start the central Agenteract server
- Start PTY bridges for each configured project
- Automatically launch all development servers defined in your `agenteract.config.js`

The multiplexed output will show logs from all your running applications in a single terminal.

### **4. Observe and Interact**

Once the app is running, it will automatically connect to the agent server. You should see connection logs in the multiplexed output.

You can manually simulate an agent command to test the connection:

```bash
curl -s -X POST http://localhost:8766/expo-app -d '{"action":"getViewHierarchy"}'
```

The server will forward this to the app, and the app will respond with a JSON payload of its view hierarchy.

### **5. Agent Interaction**

This step creates or appends to your AGENTS.md file. This informs coding agents how to interact with the app.

```bash
npx @agenteract/agents md [dest] # You can specific the name, eg GEMINI.md
```


If you are using a separate agent to your IDE, start it now, otherwise you can use the built in agent (Tested with Cursor, Gemini CLI)

Issue some instructions. You might need to prime the agent the first time
```txt
You can use the Get View Hieararchy tool to inspect the current app state.
Add a button that disappears when it is clicked.
Confirm that it works using a simulated action.
```

Agents should view the current hierarchy, modify the code, view again, simulate a tap, then confirm that the button disappeared by viewing the hierarchy one final time.

Because [packages/agents/AGENTS.md](packages/agents/AGENTS.md) contains instructions about how to interact with the app, you don't need to explicitly tell it to use the `AgentDebugBridge`.

### **✅ Verification Checklist**

*   All packages build successfully with `pnpm build`.
*   The Agenteract server starts and listens on the configured port (default 8766).
*   All configured apps start and connect to the server.
*   The multiplexed output shows connection messages from your apps.
*   Sending a `getViewHierarchy` command via `curl` to your app returns a JSON tree.

## **🧪 Testing**

This project uses Jest for testing.

### **Run All Tests**

To run the tests for all packages, use the following command from the root directory:

```bash
pnpm test
```

### **Run Tests for a Single Package**

To run the tests for a specific package, use the `--filter` flag:

```bash
pnpm --filter @agenteract/react test
```

### **Continuous Integration**

Tests are run automatically on every push and pull request to the `main` branch using GitHub Actions.

### **Integration Testing**

Integration tests verify that packages can be installed and used correctly after publication. They use [Verdaccio](https://verdaccio.org/), a lightweight private npm registry running in Docker.

**Local testing workflow:**

```bash
# run some basic tests
pnpm test:full_integration
```

We can also run a full set of e2e tests locally. These tests confirm that the AgentDebugBridge and dev cli work together.

```bash
pnpm test:e2e:vite
pnpm test:e2e:flutter:ios
# Expo is currently disabled in CI as there is an undiagnosed issue where the app doesn't respond
pnpm test:e2e:expo:ios
```

**GitHub Actions:** Integration tests run automatically on PRs and pushes to `main` and `release/**` branches using Verdaccio as a service container.

**Authentication:** Uses `expect` to automate the authentication process. See [docs/VERDACCIO_AUTH.md](docs/VERDACCIO_AUTH.md) for details.

See [docs/INTEGRATION_TESTING.md](docs/INTEGRATION_TESTING.md) for complete information.

### **Releases & Publishing**

We support multiple release strategies with automated NPM publishing:

```bash
# Version bump and release (all packages)
pnpm version:patch  # 1.0.0 → 1.0.1
pnpm version:minor  # 1.0.0 → 1.1.0
pnpm version:major  # 1.0.0 → 2.0.0

# Version bump for specific packages
./scripts/version.sh minor agents        # Single package
./scripts/version.sh patch core,react    # Multiple packages

# Push tags to trigger NPM publish
git push && git push --tags
```

**Prerelease testing:**
```bash
pnpm version:alpha   # All packages
pnpm version:beta    # All packages
pnpm version:rc      # All packages

./scripts/version.sh alpha agents        # Single package
./scripts/version.sh beta agents,core    # Multiple packages

git push && git push --tags
# Published with @next tag on NPM
```

See [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) for the complete release guide and [docs/CI_CD_SUMMARY.md](docs/CI_CD_SUMMARY.md) for a quick reference.

## **📜 License**

This project uses dual licensing:

- **MIT License**: Most packages (`@agenteract/react`, `@agenteract/expo`, `@agenteract/vite`, `@agenteract/flutter-cli`, `@agenteract/flutter`, `@agenteract/cli`, `@agenteract/server`, `@agenteract/dom`, `@agenteract/gemini`)
- **Apache-2.0 License**: Core infrastructure packages (`@agenteract/core`, `@agenteract/agents`, `@agenteract/pty`)

Copyright © 2025 Agenteract Project.

---

[https://agenteract.io/](https://agenteract.io/)
