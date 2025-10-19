# **Agenteract**

**Agenteract** is an experimental bridge that lets large-language-model agents *see* and *interact* with running applications — starting with **React Native / Expo** and **Gemini CLI**.

It exposes the app’s internal state, view hierarchy, and actionable controls over a secure WebSocket, enabling agents (or test harnesses) to observe and trigger UI events just like a developer or user would.

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
| **Bridge** | A lightweight WebSocket endpoint inside the app (GeminiDebugBridge, AgenteractBridge, etc.) that sends UI snapshots and receives action commands. |
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

## **🚀 Getting Started (Preview)**

Install:

`npm install @agenteract/react`

Add the bridge to your app root:

```ts
import { AgenteractBridge } from '@agenteract/react';

export default function App() {
  return (
    <>
      <AgenteractBridge />
      <YourApp />
    </>
  );
}
```

Connect an external agent or test client:

```bash
node examples/agent-client.js
```

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
```

### **3. Run the Development Environment**

You'll need three separate terminal sessions

**Terminal 1: Start the Agent Server**

The agent server is the bridge that the app connects to and the agent sends commands to.

```bash
# This can run from anywhere, eventually the server will support multiple apps under dev/test
npx @agenteract/server
```

This starts the HTTP and WebSocket servers. You should see output confirming it's running:
`HTTP server for commands listening on port 8766`
`WebSocket server for app listening on port 8765`

**Terminal 2: Run the Expo Demo App**

The `@agenteract/expo` package is a wrapper around the standard `expo` CLI that injects the necessary agent logic.

```bash
cd examples/expo-demo
npx @agenteract/expo
```

This will launch the Metro bundler for the demo app located in `examples/expo-example`. Press `i` to start the iOS Simulator or `a` for the Android Emulator.

### **4. Observe and Interact**

Once the app is running, it will automatically connect to the agent server. You should see connection logs in the agent server terminal.

You can manually simulate an agent command to test the connection:

```bash
curl -s -X POST http://localhost:8766/gemini-agent -d '{"action":"getViewHierarchy"}'
```

The server will forward this to the app, and the app will respond with a JSON payload of its view hierarchy.

### **Terminal 4: Agent Interaction**

Currently only Gemini CLI is supported, but more agents are on the way

Run the agent tool from the project you want to build, like normal.
```bash
cd examples/expo-example
gemini extensions install @agenteract/gemini
gemini
```

Now try issuing some instructions:
```txt
Add a button that disappears when it is clicked.
```

Gemini should view the current hierarchy, modify the code, view again, simulate a tap, then confirm that the button disappeared by viewing the hierarchy one final time.

Because [packages/gemini/GEMINI.md](GEMINI.md) contains instructions about how to interact with the app, you don't need to explicitly tell it to use the `AgentDebugBridge`.

### **✅ Verification Checklist**

*   All packages build successfully with `pnpm build`.
*   The agent server starts and listens on ports 8765 (WS) and 8766 (HTTP).
*   The Expo app builds and connects to the server.
*   The agent server console shows "React Native app connected."
*   Sending a `getViewHierarchy` command via `curl` returns a JSON tree.

## **📜 License**

MIT — early experimental research release.  
 Copyright © 2025 Agenteract Project.

---

“What ARIA did for screen readers, Agenteract aims to do for intelligent agents, developers, and automation”

