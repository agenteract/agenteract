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
| `@agenteract/examples` | Demo apps (Expo first, web and desktop next) |
| [agenteract-swift](https://github.com/agenteract/agenteract-swift) | iOS / Swift Package

## **🚀 Getting Started (Preview)**

## **1. Installation**

First, you'll need to install the Agenteract CLI and server. These tools manage the communication between the AI agent and your local development servers.

```bash
npm install -g @agenteract/cli @agenteract/server
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

## 3. AGENTS.md

Next, install `AGENTS.md` - This will allow your coding assistant to undertand how agenteract works. 

If you already have an `AGENTS.md`, our contents will be appended.

```bash
npx @agenteract/agents
```

Copy the file to a specific agent name if required:

```bash
cp AGENTS.md GEMINI.md
```

Now you can reference the file for your agent in a message, or restart the a CLI for it to take effect.

## 2. Configuration

Create an `agenteract.config.js` file in the root of your project. This file defines which applications Agenteract will manage.

Here is an example configuration for a monorepo containing an Expo and a Vite project:

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
      // The type of project. Can be 'expo' or 'vite'.
      type: 'expo',
      // The port for this app's dev server PTY bridge.
      ptyPort: 8790,
    },
    {
      name: 'react-app',
      path: './examples/react-example',
      type: 'vite',
      ptyPort: 8791,
    },
    {
      name: 'swift-app',
      path: './examples/swift-app',
      type: 'native'
    }
  ],
};
```

### Configuration Options

-   `port`: The main port for the Agenteract server.
-   `projects`: An array of project objects.
    -   `name`: A unique name for your app.
    -   `path`: The relative path to your app's root directory.
    -   `type`: The project type. Supported types are `expo` and `vite`.
    -   `ptyPort`: A unique port for the PTY (pseudo-terminal) bridge that allows Agenteract to interact with your app's dev server.

## 3. Instrumenting Your Application

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

**For Swift UI**

See [agenteract-swift](https://github.com/agenteract/agenteract-swift)

## 4. Running Agenteract

With your configuration in place and your app instrumented, you can now start the Agenteract server.

1.  **Start the Agenteract Server:**
    Open a terminal and run the following command from the root of your project (where your `agenteract.config.js` is located):

    ```bash
    agenteract start
    ```

    This command will:
    -   Start the central Agenteract server on the configured `port`.
    -   Start a PTY bridge for each project on its configured `ptyPort`.
    -   Automatically start the development server for each of your configured projects (e.g., `npm run dev` or `npx expo start`).

2.  **Interact with Your App:**
    AI agents can now connect to the Agenteract server using the tools described in `AGENTS.md`. The agent can now view your app's component hierarchy and perform actions like tapping buttons or typing into text fields.

Your agent is now ready to Agenteract!


---

## **🔒 Security & Scope**

* Designed for **local development, testing, and accessibility research**.

* Future versions will include authentication, session control.

---

## **⛏️ Development**

This guide covers how to set up the local development environment to run the Expo example app and the agent server.

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
cd packages/expo
pnpm link --global
cd ../../
cd packages/server
pnpm link --global
cd packages/agents
pnpm link --global
```

### **3. Run the Development Environment**

You'll need three separate terminal sessions

**Terminal 1: Start the Agent Server**

The agent server is the bridge that the app connects to and the agent sends commands to.

```bash
# This can run from anywhere, eventually the server will support multiple apps under dev/test
pnpm agenterserve

# once published, you can use npm:
npx @agenteract/server
```

This starts the HTTP and WebSocket servers. You should see output confirming it's running:
`HTTP server for commands listening on port 8766`
`WebSocket server for app listening on port 8765`

**Terminal 2: Run the Expo Demo App**

The `@agenteract/expo` package is a wrapper around the standard `expo` CLI that injects the necessary agent logic.

```bash
cd examples/expo-demo
pnpm agenterexpo

# once published, you can use npm:
npx @agenteract/expo
```


This will launch the Metro bundler for the demo app located in `examples/expo-example`. Press `i` to start the iOS Simulator or `a` for the Android Emulator.

Or for a vite project:
```bash
cd examples/react-example
pnpm @agentervite

# once published, you can use npm:
npx @agenteract/vite
```

### **4. Observe and Interact**

Once the app is running, it will automatically connect to the agent server. You should see connection logs in the agent server terminal.

You can manually simulate an agent command to test the connection:

```bash
curl -s -X POST http://localhost:8766/gemini-agent -d '{"action":"getViewHierarchy"}'
```

The server will forward this to the app, and the app will respond with a JSON payload of its view hierarchy.

### **Terminal 3: Agent Interaction**

This step creates or appends to your AGENTS.md file. This informs coding agents how to interact with the app.

```bash
cd examples/expo-example
npx @agenteract/agents
```

If you are using Gemini:
```bash
cat AGENTS.md >> GEMINI.md
rm AGENTS.md
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
*   The agent server starts and listens on ports 8765 (WS) and 8766 (HTTP).
*   The Expo app builds and connects to the server.
*   The agent server console shows "React Native app connected."
*   Sending a `getViewHierarchy` command via `curl` returns a JSON tree.

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
# Start local npm registry
pnpm verdaccio:start

# Build and publish packages to local registry
pnpm verdaccio:publish

# Run integration tests
pnpm test:integration

# Clean up
pnpm verdaccio:stop
```

**GitHub Actions:** Integration tests run automatically on PRs and pushes to `main` and `release/**` branches using Verdaccio as a service container.

**Authentication:** Uses `expect` to automate the authentication process. See [docs/VERDACCIO_AUTH_QUICK.md](docs/VERDACCIO_AUTH_QUICK.md) for details.

See [docs/INTEGRATION_TESTING.md](docs/INTEGRATION_TESTING.md) for complete information.

### **Releases & Publishing**

We support multiple release strategies with automated NPM publishing:

```bash
# Version bump and release
pnpm version:patch  # 1.0.0 → 1.0.1
pnpm version:minor  # 1.0.0 → 1.1.0
pnpm version:major  # 1.0.0 → 2.0.0

# Push tags to trigger NPM publish
git push && git push --tags
```

**Prerelease testing:**
```bash
pnpm version:prerelease alpha
git push && git push --tags
# Published with @alpha tag on NPM
```

See [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) for the complete release guide and [docs/CI_CD_SUMMARY.md](docs/CI_CD_SUMMARY.md) for a quick reference.

## **📜 License**

MIT
 Copyright © 2025 Agenteract Project.

---

[https://agenteract.io/](https://agenteract.io/)
