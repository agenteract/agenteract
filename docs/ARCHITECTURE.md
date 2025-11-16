# Agenteract Architecture Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Core Packages](#3-core-packages)
4. [System Architecture](#4-system-architecture)
5. [Communication Flow](#5-communication-flow)
6. [AgentDebugBridge Component Architecture](#6-agentdebugbridge-component-architecture)
7. [CLI Development Environment](#7-cli-development-environment)
8. [Protocol & Message Format](#8-protocol--message-format)
9. [Technology Stack](#9-technology-stack)
10. [Key Architectural Patterns](#10-key-architectural-patterns)
11. [Data Flow Summary](#11-data-flow-summary)
12. [Port Allocation](#12-port-allocation)
13. [Security & Scope](#13-security--scope)

---

## 1. Project Overview

**Agenteract** is an experimental bridge framework that enables AI agents to interact with running applications in real-time. Instead of relying on vision or accessibility APIs, applications self-report their UI structure and expose actionable controls over WebSocket connections.

### Key Features

- **Real-time view hierarchy inspection**: AI agents can query the complete UI tree structure
- **Programmatic UI interaction**: Execute actions like tap, input, scroll, swipe programmatically
- **Multi-platform support**: Works with React Native, React Web, Flutter, and Swift UI
- **Developer-friendly monorepo**: Organized workspace with shared packages
- **WebSocket-based protocol**: Low-latency bidirectional communication

### Use Cases

- AI-driven development and testing
- Automated UI testing workflows
- Interactive debugging and inspection
- Agent-assisted application development

---

## 2. Monorepo Structure

The project is organized as a **pnpm workspace monorepo** with the following structure:

```
agenteract/
├── packages/           # Core packages
│   ├── core/          # Protocol definitions & utilities
│   ├── server/        # WebSocket & HTTP server
│   ├── cli/           # Command-line interface
│   ├── pty/           # Generic process manager
│   ├── react/         # React/React Native bindings
│   ├── expo/          # Expo utilities (deprecated)
│   ├── vite/          # Vite utilities (deprecated)
│   ├── flutter-cli/   # Flutter CLI wrapper
│   ├── flutter/       # Flutter package (Dart)
│   ├── dom/           # DOM utilities
│   ├── agents/        # Agent instruction installer
│   └── gemini/        # Gemini integration
├── examples/          # Example applications
│   ├── expo-example/
│   ├── react-example/
│   ├── flutter_example/
│   └── swift-app/
├── tests/             # Test suites
│   ├── integration/
│   └── e2e/
└── docs/              # Documentation
```

---

## 3. Core Packages

### Package Overview

| Package | Version | Purpose | Key Dependencies |
|---------|---------|---------|------------------|
| **@agenteract/core** | 0.0.3 | Protocol schema, message encoding/decoding | None (base package) |
| **@agenteract/server** | 0.0.4 | WebSocket + HTTP server for agent communication | ws, express, uuid |
| **@agenteract/cli** | 0.0.8 | Unified CLI for managing dev environment | @agenteract/core, yargs, node-pty |
| **@agenteract/pty** | 0.0.4 | Generic PTY process manager for dev servers | @agenteract/core, express, node-pty |
| **@agenteract/react** | 0.0.4 | React/React Native bridge component | @agenteract/core, @agenteract/dom |
| **@agenteract/dom** | 0.0.2 | DOM utilities for web applications | None |
| **@agenteract/agents** | 0.0.10 | Agent instruction installer (creates AGENTS.md) | axios, glob, yargs |
| **@agenteract/expo** | 0.0.3 | Expo wrapper (deprecated) | @agenteract/core, @agenteract/pty |
| **@agenteract/vite** | 0.0.3 | Vite wrapper (deprecated) | @agenteract/core, @agenteract/pty |
| **@agenteract/flutter-cli** | - | Flutter CLI wrapper | - |

### Package Relationships

```mermaid
graph TB
    CORE["agenteract/core<br/>Protocol & Types"]

    SERVER["agenteract/server<br/>WebSocket Server"]
    CLI["agenteract/cli<br/>CLI Tool"]
    PTY["agenteract/pty<br/>Process Manager"]
    REACT["agenteract/react<br/>React Bindings"]
    DOM["agenteract/dom<br/>DOM Utilities"]
    AGENTS["agenteract/agents<br/>Agent Instructions"]
    EXPO["agenteract/expo<br/>Deprecated"]
    VITE["agenteract/vite<br/>Deprecated"]

    CORE --> SERVER
    CORE --> CLI
    CORE --> PTY
    CORE --> REACT
    CORE --> EXPO
    CORE --> VITE

    PTY --> CLI
    PTY --> EXPO
    PTY --> VITE

    DOM --> REACT

    style CORE fill:#ffe1e1
    style SERVER fill:#e1f5ff
    style CLI fill:#e1ffe1
    style EXPO fill:#f0f0f0
    style VITE fill:#f0f0f0
```

---

## 4. System Architecture

The following diagram illustrates the high-level system architecture showing how all components interact:

```mermaid
graph TB
    subgraph "AI Agent Layer"
        AGENT[AI Coding Agent<br/>Gemini CLI / Cursor / Aider / etc.]
    end

    subgraph "Agenteract Infrastructure"
        CLI["Agenteract CLI<br/>agenteract/cli"]
        SERVER["Agent Server<br/>agenteract/server<br/>HTTP: 8766<br/>WebSocket: 8765"]
        LOGSERVER["Log Server<br/>WebSocket: 8767"]
        PTY1["PTY Bridge 1<br/>agenteract/pty<br/>Port 8790"]
        PTY2["PTY Bridge 2<br/>agenteract/pty<br/>Port 8791"]
        PTY3["PTY Bridge N<br/>agenteract/pty<br/>Port 879X"]
    end

    subgraph "Application Layer"
        APP1[Expo App<br/>AgentDebugBridge]
        APP2[React Web App<br/>AgentDebugBridge]
        APP3[Flutter App<br/>AgentDebugBridge]
        APP4[Swift App<br/>AgentDebugBridge]
    end

    subgraph "Development Servers"
        DEV1[Expo Dev Server<br/>npx expo start]
        DEV2[Vite Dev Server<br/>npx vite]
        DEV3[Flutter Process<br/>flutter run]
    end

    AGENT -->|HTTP POST<br/>Commands| SERVER
    SERVER -->|WebSocket<br/>View Hierarchy &<br/>UI Commands| APP1
    SERVER -->|WebSocket<br/>View Hierarchy &<br/>UI Commands| APP2
    SERVER -->|WebSocket<br/>View Hierarchy &<br/>UI Commands| APP3
    SERVER -->|WebSocket<br/>View Hierarchy &<br/>UI Commands| APP4

    CLI -->|Spawns & Manages| SERVER
    CLI -->|Spawns & Manages| LOGSERVER
    CLI -->|Spawns & Manages| PTY1
    CLI -->|Spawns & Manages| PTY2
    CLI -->|Spawns & Manages| PTY3

    PTY1 -->|Controls via PTY| DEV1
    PTY2 -->|Controls via PTY| DEV2
    PTY3 -->|Controls via PTY| DEV3

    DEV1 -.->|Serves HMR| APP1
    DEV2 -.->|Serves HMR| APP2
    DEV3 -.->|Compiles & Runs| APP3

    APP1 -->|Responses &<br/>View Hierarchy| SERVER
    APP2 -->|Responses &<br/>View Hierarchy| SERVER
    APP3 -->|Responses &<br/>View Hierarchy| SERVER
    APP4 -->|Responses &<br/>View Hierarchy| SERVER

    APP1 -.->|Console Logs| LOGSERVER
    APP2 -.->|Console Logs| LOGSERVER
    APP3 -.->|Console Logs| LOGSERVER
    APP4 -.->|Console Logs| LOGSERVER

    style AGENT fill:#e1f5ff
    style SERVER fill:#ffe1e1
    style LOGSERVER fill:#ffe1e1
    style CLI fill:#ffe1e1
    style APP1 fill:#e1ffe1
    style APP2 fill:#e1ffe1
    style APP3 fill:#e1ffe1
    style APP4 fill:#e1ffe1
```

### Architecture Layers

1. **AI Agent Layer**: External AI agents (Gemini, Cursor, Aider) that send commands
2. **Infrastructure Layer**: Core services (CLI, Server, PTY bridges) that orchestrate the system
3. **Application Layer**: Running apps with AgentDebugBridge integration
4. **Development Server Layer**: Framework-specific dev servers for hot reloading

---

## 5. Communication Flow

The following sequence diagram shows how an AI agent command flows through the system:

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Server as Agent Server<br/>(Port 8766/8765)
    participant App as Application<br/>(AgentDebugBridge)
    participant Registry as AgentRegistry
    participant UI as UI Components

    Note over Agent,UI: Flow 1: Get View Hierarchy
    Agent->>Server: POST /gemini-agent<br/>{action: "getViewHierarchy", project: "expo-app"}
    Server->>Server: Generate UUID for request
    Server->>App: WebSocket: {action: "getViewHierarchy", id: "uuid"}
    App->>App: Call getFilteredHierarchy()
    App->>UI: Traverse React Fiber tree
    UI-->>App: Component tree with testIDs & handlers
    App->>Registry: Read registered testID mappings
    Registry-->>App: Handler references
    App->>Server: WebSocket: {status: "success", hierarchy: {...}, id: "uuid"}
    Server-->>Agent: HTTP 200: {status: "success", hierarchy: {...}}

    Note over Agent,UI: Flow 2: Execute UI Action (Tap)
    Agent->>Server: POST /gemini-agent<br/>{action: "tap", testID: "loginButton", project: "expo-app"}
    Server->>Server: Generate UUID for request
    Server->>App: WebSocket: {action: "tap", testID: "loginButton", id: "uuid"}
    App->>App: Call simulateTap("loginButton")
    App->>Registry: Lookup node by testID
    Registry-->>App: Handler reference
    App->>UI: Execute onPress handler
    UI->>UI: Run button's onPress()
    UI-->>App: Handler completed
    App->>Server: WebSocket: {status: "ok", id: "uuid"}
    Server-->>Agent: HTTP 200: {status: "ok"}

    Note over Agent,UI: Flow 3: Get Console Logs
    Agent->>Server: POST /gemini-agent<br/>{action: "getConsoleLogs", project: "expo-app"}
    Server->>Server: Generate UUID for request
    Server->>App: WebSocket: {action: "getConsoleLogs", id: "uuid"}
    App->>App: Return captured console logs
    App->>Server: WebSocket: {status: "ok", logs: [...], id: "uuid"}
    Server-->>Agent: HTTP 200: {status: "ok", logs: [...]}
```

### Message Flow Characteristics

- **Request-Response Pattern**: HTTP endpoint accepts commands, waits for WebSocket response
- **UUID-based Correlation**: Each request gets a unique ID to match responses
- **Timeout Handling**: Server waits up to 30 seconds for WebSocket responses
- **Project Routing**: WebSocket connections are project-specific via URL path

---

## 6. AgentDebugBridge Component Architecture

The `AgentDebugBridge` is the core React component that applications integrate to enable agent interaction:

```mermaid
graph TB
    subgraph "Application Code"
        APP[App.tsx<br/>Root Component]
        COMPONENTS[UI Components<br/>Button, TextInput, ScrollView, etc.<br/>with testID props]
    end

    subgraph "AgentDebugBridge Core"
        BRIDGE[AgentDebugBridge<br/>React Component]
        WS[WebSocket Client<br/>ws://localhost:8765/projectName]
        LOGGER[Console Logger<br/>Intercepts console.log/warn/error]
    end

    subgraph "Registry & Hierarchy"
        REGISTRY[AgentRegistry<br/>Map: testID → RefObject]
        HIERARCHY[getFilteredHierarchy<br/>Fiber Tree Traversal]
    end

    subgraph "Action Handlers"
        TAP[simulateTap<br/>Execute onPress]
        INPUT[simulateInput<br/>Execute onChangeText]
        SCROLL[simulateScroll<br/>Execute scrollTo]
        SWIPE[simulateSwipe<br/>Execute gesture]
        LONG[simulateLongPress<br/>Execute onLongPress]
    end

    subgraph "Server"
        SERVER[Agent Server<br/>ws://localhost:8765]
    end

    APP -->|Renders as child| BRIDGE
    APP -->|Contains| COMPONENTS

    COMPONENTS -->|useAgentBinding hook| REGISTRY
    REGISTRY -->|Stores| COMPONENTS

    BRIDGE -->|Manages| WS
    WS <-->|WebSocket Protocol| SERVER

    WS -->|Receives command| BRIDGE

    BRIDGE -->|getViewHierarchy| HIERARCHY
    HIERARCHY -->|Traverses| APP
    HIERARCHY -->|Reads| REGISTRY
    HIERARCHY -->|Returns tree| BRIDGE

    BRIDGE -->|tap action| TAP
    BRIDGE -->|input action| INPUT
    BRIDGE -->|scroll action| SCROLL
    BRIDGE -->|swipe action| SWIPE
    BRIDGE -->|longPress action| LONG

    TAP -->|Lookup in| REGISTRY
    INPUT -->|Lookup in| REGISTRY
    SCROLL -->|Lookup in| REGISTRY
    SWIPE -->|Lookup in| REGISTRY
    LONG -->|Lookup in| REGISTRY

    REGISTRY -->|Get ref & execute| COMPONENTS

    BRIDGE -->|Intercepts| LOGGER
    LOGGER -->|Captures| COMPONENTS

    style BRIDGE fill:#ffe1e1
    style REGISTRY fill:#e1f5ff
    style SERVER fill:#e1ffe1
    style HIERARCHY fill:#fff4e1
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **AgentDebugBridge** | Main coordinator, manages WebSocket connection, routes commands |
| **AgentRegistry** | Stores testID → component ref mappings for quick lookup |
| **getFilteredHierarchy** | Traverses React Fiber tree to build view hierarchy JSON |
| **Action Handlers** | Execute UI interactions (tap, input, scroll, etc.) |
| **Console Logger** | Intercepts and stores console output for agent inspection |
| **WebSocket Client** | Bidirectional communication with agent server |

---

## 7. CLI Development Environment

The CLI orchestrates the entire development environment using a custom terminal multiplexer:

```mermaid
graph TB
    subgraph "CLI Process (@agenteract/cli dev)"
        MAIN[Main CLI Process<br/>Terminal Multiplexer<br/>Raw Mode stdin]

        subgraph "Spawned Processes (node-pty)"
            SERVER["Agent Server<br/>npx agenteract/server<br/>Ports 8765-8766"]
            LOG["Log Server<br/>WebSocket Server<br/>Port 8767"]
            PTY1[PTY Bridge 1<br/>expo-app:8790<br/>npx expo start]
            PTY2[PTY Bridge 2<br/>react-app:8791<br/>npx vite]
            PTY3[PTY Bridge 3<br/>flutter-app:8792<br/>flutter run]
        end

        subgraph "Terminal Views"
            TAB1[Terminal 1: agent-server<br/>Buffered output]
            TAB2[Terminal 2: log-server<br/>Buffered output]
            TAB3[Terminal 3: expo-app<br/>Buffered output]
            TAB4[Terminal 4: react-app<br/>Buffered output]
            TAB5[Terminal 5: flutter-app<br/>Buffered output]
        end
    end

    USER[Developer]
    CONFIG[agenteract.config.js<br/>Configuration File]

    USER -->|npx @agenteract/cli dev| MAIN
    MAIN -->|Reads| CONFIG

    CONFIG -.->|server.port: 8766<br/>projects config<br/>projectNames config| MAIN

    MAIN -->|Spawns via node-pty| SERVER
    MAIN -->|Spawns via node-pty| LOG
    MAIN -->|Spawns via node-pty| PTY1
    MAIN -->|Spawns via node-pty| PTY2
    MAIN -->|Spawns via node-pty| PTY3

    SERVER -.->|stdout/stderr to buffer| TAB1
    LOG -.->|stdout/stderr to buffer| TAB2
    PTY1 -.->|stdout/stderr to buffer| TAB3
    PTY2 -.->|stdout/stderr to buffer| TAB4
    PTY3 -.->|stdout/stderr to buffer| TAB5

    MAIN -->|Renders active terminal| USER

    USER -->|Tab key: cycle terminals| MAIN
    USER -->|Ctrl+C: quit| MAIN
    USER -->|Enter: restart exited process| MAIN

    style MAIN fill:#ffe1e1
    style CONFIG fill:#e1f5ff
    style USER fill:#e1ffe1
```

### CLI Features

- **Unified Interface**: Single command starts entire development environment
- **Terminal Multiplexer**: Custom multiplexer using raw mode stdin and ANSI escape codes (no external UI library)
- **Tab Navigation**: Press Tab to cycle through terminals, each showing buffered output
- **Process Management**: Spawns and manages multiple child processes via node-pty
- **Auto Port Allocation**: Automatically assigns sequential ports to PTY bridges
- **Process Restart**: Press Enter on exited terminals to restart them
- **Graceful Shutdown**: Cleans up all child processes on exit (Ctrl+C)
- **Buffer Management**: Each terminal maintains up to 1000 lines of scrollback

### Configuration Schema

```javascript
// agenteract.config.js
module.exports = {
  server: {
    port: 8766,          // Agent server HTTP port
    wsPort: 8765,        // Agent server WebSocket port
    logPort: 8767        // Log server WebSocket port
  },
  projects: [
    {
      name: 'expo-app',
      cwd: './examples/expo-example',
      command: 'npx expo start'
    },
    {
      name: 'react-app',
      cwd: './examples/react-example',
      command: 'npx vite'
    }
  ]
};
```

---

## 8. Protocol & Message Format

The communication protocol uses JSON with versioning for compatibility:

```mermaid
graph TB
    subgraph "Core Protocol (@agenteract/core)"
        SCHEMA[Protocol Schema<br/>TypeScript Definitions]
        ENC[encodeMessage<br/>Adds version metadata]
        DEC[decodeMessage<br/>Version-aware parsing]
    end

    subgraph "Message Structure"
        BASE["Base Message<br/>_v: 1.0.0"]
        CMD["AgentCommand<br/>action, id, params"]
        RESP["AgentResponse<br/>status, id, data"]
    end

    subgraph "Command Actions"
        GET[getViewHierarchy<br/>Returns UI tree]
        TAP[tap<br/>testID, x?, y?]
        INPUT[input<br/>testID, text]
        SCROLL[scroll<br/>testID, direction, amount]
        SWIPE[swipe<br/>testID, direction]
        LONG[longPress<br/>testID, duration]
        LOGS[getConsoleLogs<br/>Returns log array]
        CLEAR[clearConsoleLogs<br/>Clears buffer]
    end

    subgraph "Response Types"
        SUCCESS["success<br/>status: success, data"]
        OK["ok<br/>status: ok"]
        ERROR["error<br/>status: error, error"]
    end

    SCHEMA --> ENC
    SCHEMA --> DEC

    ENC -->|Produces| BASE
    BASE --> CMD
    BASE --> RESP

    CMD --> GET
    CMD --> TAP
    CMD --> INPUT
    CMD --> SCROLL
    CMD --> SWIPE
    CMD --> LONG
    CMD --> LOGS
    CMD --> CLEAR

    RESP --> SUCCESS
    RESP --> OK
    RESP --> ERROR

    style SCHEMA fill:#ffe1e1
    style CMD fill:#e1f5ff
    style RESP fill:#e1ffe1
```

### Message Examples

#### Get View Hierarchy Request
```json
{
  "_v": "1.0.0",
  "action": "getViewHierarchy",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Get View Hierarchy Response
```json
{
  "_v": "1.0.0",
  "status": "success",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "hierarchy": {
    "type": "View",
    "children": [
      {
        "type": "Button",
        "testID": "loginButton",
        "props": {
          "title": "Login"
        }
      }
    ]
  }
}
```

#### Tap Action Request
```json
{
  "_v": "1.0.0",
  "action": "tap",
  "testID": "loginButton",
  "id": "550e8400-e29b-41d4-a716-446655440001"
}
```

#### Tap Action Response
```json
{
  "_v": "1.0.0",
  "status": "ok",
  "id": "550e8400-e29b-41d4-a716-446655440001"
}
```

### Protocol Versioning

- **Current Version**: 1.0.0
- **Version Field**: `_v` added by `encodeMessage()`
- **Forward Compatibility**: Clients can reject incompatible versions
- **Backward Compatibility**: Server can support multiple protocol versions

---

## 9. Technology Stack

```mermaid
graph TB
    subgraph "Package Management"
        PNPM[pnpm<br/>Monorepo Workspaces]
        NPM_REG[NPM Registry<br/>Public Distribution]
        VERDACCIO[Verdaccio<br/>Local Testing Registry]
    end

    subgraph "Backend Runtime & Libraries"
        NODE[Node.js 18+]
        TS[TypeScript 5.x]
        EXPRESS[Express<br/>HTTP Server]
        WS[ws<br/>WebSocket Server]
        PTY[node-pty<br/>Pseudo Terminal]
    end

    subgraph "Frontend Frameworks"
        REACT[React 19]
        RN[React Native]
        EXPO[Expo SDK]
        FLUTTER[Flutter/Dart]
        SWIFT[Swift UI]
    end

    subgraph "Build & Compilation"
        TSC[tsc<br/>TypeScript Compiler]
        BABEL[Babel<br/>JS Transpiler]
        METRO[Metro Bundler<br/>React Native]
        VITE_BUILD[Vite<br/>Web Bundler]
    end

    subgraph "Testing Infrastructure"
        JEST[Jest<br/>Unit Testing]
        PUPPETEER[Puppeteer<br/>Chrome launcher for E2E]
    end

    subgraph "CI/CD"
        GHA[GitHub Actions]
    end

    PNPM -->|Manages| NODE
    NODE -->|Runs| EXPRESS
    NODE -->|Runs| WS
    NODE -->|Runs| PTY

    TS -->|Compiles with| TSC
    TSC -->|Outputs to| NPM_REG

    REACT -.->|Integrates via| WS
    RN -.->|Integrates via| WS
    EXPO -.->|Integrates via| WS
    FLUTTER -.->|Integrates via| WS
    SWIFT -.->|Integrates via| WS

    EXPO -->|Uses| METRO
    REACT -->|Uses| VITE_BUILD

    GHA -->|Tests publishing to| VERDACCIO
    GHA -->|Runs| JEST
    GHA -->|Uses for Chrome| PUPPETEER

    style NODE fill:#68a063
    style REACT fill:#61dafb
    style TS fill:#3178c6
    style PNPM fill:#f9ad00
```

### Technology Choices Rationale

| Technology | Reason for Choice |
|------------|-------------------|
| **pnpm** | Efficient monorepo management, fast installs, strict dependency resolution |
| **TypeScript** | Type safety across packages, better IDE support, fewer runtime errors |
| **node-pty** | Cross-platform pseudo-terminal for managing dev servers |
| **ws** | Lightweight, performant WebSocket library |
| **Express** | Simple HTTP server for agent endpoints |
| **React 19** | Latest React features, concurrent rendering support |
| **Jest** | Industry-standard testing framework |
| **Puppeteer** | Launches Chrome browser for E2E testing |
| **Verdaccio** | Local npm registry for testing package publishing |

---

## 10. Key Architectural Patterns

### 1. Bridge Pattern
**Implementation**: `AgentDebugBridge`

The bridge acts as an interface between the application's UI layer and the agent server, translating agent commands into UI actions.

```
Application UI ←→ AgentDebugBridge ←→ Agent Server ←→ AI Agent
```

### 2. Registry Pattern
**Implementation**: `AgentRegistry`

Maintains a centralized map of `testID → component reference` for O(1) lookup during action execution.

```javascript
const registry = new Map<string, RefObject>();
registry.set('loginButton', buttonRef);
```

### 3. Command Pattern
**Implementation**: `AgentCommand` messages

Commands are encapsulated as JSON objects with an `action` field, allowing extensible action types.

```javascript
interface AgentCommand {
  action: 'tap' | 'input' | 'scroll' | ...;
  id: string;
  [key: string]: any;
}
```

### 4. Observer Pattern
**Implementation**: WebSocket bidirectional communication

Server and apps observe each other's messages, reacting to events in real-time.

### 5. Multiplexer Pattern
**Implementation**: Custom terminal multiplexer

Single CLI process multiplexes multiple PTY processes, maintaining separate buffers and switching views with Tab key. Implemented using raw mode stdin and ANSI escape codes (without external UI libraries).

### 6. Plugin Architecture
**Implementation**: Framework-specific packages

- `@agenteract/react` - React bindings
- `@agenteract/flutter` - Flutter bindings
- `@agenteract/swift` - Swift bindings (planned)

Each extends the core protocol with framework-specific features.

### 7. Proxy Pattern
**Implementation**: PTY bridges

PTY bridges act as proxies between the CLI and dev servers, capturing output and forwarding input.

```
CLI ←→ PTY Bridge ←→ Dev Server Process
```

---

## 11. Data Flow Summary

The following flowchart shows the complete data flow from developer initialization to agent interaction:

```mermaid
flowchart TD
    START([Developer runs<br/>npx @agenteract/cli dev])

    START --> LOAD[CLI loads<br/>agenteract.config.js]
    LOAD --> VALIDATE{Config<br/>valid?}

    VALIDATE -->|No| ERROR1[Show error<br/>Exit]
    VALIDATE -->|Yes| SPAWN[CLI spawns processes:<br/>1. Agent Server port 8766/8765<br/>2. Log Server port 8767<br/>3. PTY Bridges 8790+]

    SPAWN --> START_DEV[PTY bridges start<br/>dev servers:<br/>expo start, vite, flutter run]

    START_DEV --> APPS_BUILD[Apps build and launch]

    APPS_BUILD --> BRIDGE_CONNECT[AgentDebugBridge<br/>connects to WebSocket<br/>ws://localhost:8765/projectName]

    BRIDGE_CONNECT --> CONNECTED{Connection<br/>successful?}

    CONNECTED -->|No| RETRY[Retry connection<br/>with backoff]
    RETRY --> CONNECTED

    CONNECTED -->|Yes| READY[System Ready<br/>Agent can interact]

    READY --> AGENT_REQ[Agent sends HTTP request<br/>POST /gemini-agent]

    AGENT_REQ --> SERVER_GEN_ID[Server generates UUID<br/>for request tracking]

    SERVER_GEN_ID --> ROUTE{Which<br/>project?}

    ROUTE -->|expo-app| WS1[Forward to expo-app<br/>WebSocket connection]
    ROUTE -->|react-app| WS2[Forward to react-app<br/>WebSocket connection]
    ROUTE -->|flutter-app| WS3[Forward to flutter-app<br/>WebSocket connection]

    WS1 --> EXEC
    WS2 --> EXEC
    WS3 --> EXEC

    EXEC[App receives command<br/>via WebSocket]

    EXEC --> ACTION{Action<br/>type?}

    ACTION -->|getViewHierarchy| HIERARCHY[Traverse Fiber tree<br/>Build JSON hierarchy]
    ACTION -->|tap| TAP_EXEC[Lookup testID in registry<br/>Execute onPress]
    ACTION -->|input| INPUT_EXEC[Lookup testID in registry<br/>Execute onChangeText]
    ACTION -->|scroll| SCROLL_EXEC[Lookup testID in registry<br/>Execute scrollTo]
    ACTION -->|getConsoleLogs| LOGS_EXEC[Return console buffer]

    HIERARCHY --> RESPOND
    TAP_EXEC --> RESPOND
    INPUT_EXEC --> RESPOND
    SCROLL_EXEC --> RESPOND
    LOGS_EXEC --> RESPOND

    RESPOND[App sends response<br/>via WebSocket<br/>with same UUID]

    RESPOND --> SERVER_MATCH[Server matches UUID<br/>to pending HTTP request]

    SERVER_MATCH --> RETURN[Server returns<br/>HTTP 200 response<br/>to agent]

    RETURN --> READY

    START --> UI[CLI shows multiplexed terminal UI<br/>Active: first terminal]

    UI --> SWITCH[Developer presses Tab<br/>to switch terminals]
    SWITCH --> UI

    UI --> QUIT[Developer presses Ctrl+C]
    QUIT --> CLEANUP[Kill all child processes<br/>Close connections]
    CLEANUP --> EXIT([Exit])

    style START fill:#e1f5ff
    style READY fill:#e1ffe1
    style EXEC fill:#ffe1e1
    style ERROR1 fill:#ffe1e1
```

---

## 12. Port Allocation

### Default Port Assignments

| Service | Default Port | Configurable | Purpose |
|---------|-------------|--------------|---------|
| **Agent Server (HTTP)** | 8766 | Yes | Agent command endpoint (`POST /gemini-agent`) |
| **Agent Server (WebSocket)** | 8765 | Yes | App connection endpoint (`ws://localhost:8765/{project}`) |
| **Log Server (WebSocket)** | 8767 | Yes | Native app log streaming |
| **PTY Bridge (Project 1)** | 8790 | Auto | Dev server management for first project |
| **PTY Bridge (Project 2)** | 8791 | Auto | Dev server management for second project |
| **PTY Bridge (Project N)** | 8790 + N - 1 | Auto | Auto-incremented for additional projects |

### Port Configuration

Ports are configured in `agenteract.config.js`:

```javascript
module.exports = {
  server: {
    port: 8766,          // HTTP endpoint
    wsPort: 8765,        // WebSocket endpoint
    logPort: 8767        // Log streaming
  },
  projects: [/* ... */]  // PTY ports auto-allocated
};
```

### Port Conflict Resolution

- **Pre-flight Check**: CLI checks if ports are available before spawning
- **Auto-increment**: If a port is busy, CLI tries the next port
- **Error Reporting**: Clear error messages if all port ranges exhausted

---

## 13. Security & Scope

### Current Security Model

**⚠️ Agenteract is designed for local development only**

- **Localhost Binding**: All servers bind to `127.0.0.1` (localhost)
- **No Authentication**: Current version has no auth layer
- **No Encryption**: WebSocket connections are unencrypted (`ws://` not `wss://`)
- **Same Machine Only**: Requires agent and apps on same machine

### Security Considerations

| Threat | Current Mitigation | Future Plans |
|--------|-------------------|--------------|
| **Remote Access** | Localhost-only binding | Add option for secure remote access with auth |
| **Unauthorized Commands** | None | Token-based authentication |
| **MITM Attacks** | None (local only) | TLS/SSL for remote scenarios |
| **DoS Attacks** | Rate limiting on HTTP endpoints | Enhanced rate limiting |
| **Data Leakage** | Apps self-report UI only | Configurable filtering of sensitive data |

### Recommended Security Practices

1. **Never expose ports publicly**: Use firewall rules to block external access to 8765-8790
2. **Trust your agent**: Only run agents from trusted sources
3. **Review hierarchy data**: Ensure sensitive data isn't exposed in view hierarchy
4. **Use testID carefully**: Don't include sensitive information in testID values
5. **Monitor console logs**: Log server captures all console output

### Future Security Roadmap

- [ ] Token-based authentication for agent connections
- [ ] TLS/SSL support for encrypted WebSocket connections
- [ ] Session management and timeout controls
- [ ] Configurable data filtering for sensitive information
- [ ] Audit logging for all agent actions
- [ ] IP whitelisting for restricted environments

---

## Appendix A: Message Reference

### AgentCommand Types

| Action | Parameters | Description |
|--------|-----------|-------------|
| `getViewHierarchy` | - | Returns the complete UI tree structure |
| `tap` | `testID: string, x?: number, y?: number` | Simulates a tap on a component |
| `input` | `testID: string, text: string` | Inputs text into a TextInput |
| `scroll` | `testID: string, direction: "up"\|"down", amount: number` | Scrolls a ScrollView |
| `swipe` | `testID: string, direction: "up"\|"down"\|"left"\|"right"` | Simulates a swipe gesture |
| `longPress` | `testID: string, duration?: number` | Simulates a long press |
| `getConsoleLogs` | - | Returns captured console logs |
| `clearConsoleLogs` | - | Clears the console log buffer |

### AgentResponse Types

| Status | Fields | Description |
|--------|--------|-------------|
| `success` | `data: any` | Command succeeded with return data |
| `ok` | - | Command succeeded with no return data |
| `error` | `error: string` | Command failed with error message |

---

## Appendix B: Configuration Reference

### agenteract.config.js Schema

```typescript
interface AgenteractConfig {
  server: {
    port: number;        // Default: 8766
    wsPort: number;      // Default: 8765
    logPort: number;     // Default: 8767
  };
  projects: Array<{
    name: string;        // Unique project identifier
    cwd: string;         // Working directory for dev server
    command: string;     // Command to start dev server
  }>;
}
```

### Example Configuration

```javascript
module.exports = {
  server: {
    port: 8766,
    wsPort: 8765,
    logPort: 8767
  },
  projects: [
    {
      name: 'expo-app',
      cwd: './examples/expo-example',
      command: 'npx expo start --clear'
    },
    {
      name: 'web-app',
      cwd: './examples/react-example',
      command: 'npx vite --host'
    },
    {
      name: 'flutter-app',
      cwd: './examples/flutter_example',
      command: 'flutter run -d chrome'
    }
  ]
};
```

---

## Appendix C: Integration Guide

### Integrating with React/React Native

1. Install the package:
```bash
npm install @agenteract/react
```

2. Wrap your app with `AgentDebugBridge`:
```jsx
import { AgentDebugBridge } from '@agenteract/react';

function App() {
  return (
    <AgentDebugBridge projectName="my-app">
      <YourApp />
    </AgentDebugBridge>
  );
}
```

3. Add `testID` props to components you want agents to interact with:
```jsx
<Button testID="submitButton" onPress={handleSubmit} title="Submit" />
<TextInput testID="emailInput" onChangeText={setEmail} />
```

### Integrating with Flutter

1. Add dependency to `pubspec.yaml`:
```yaml
dependencies:
  agenteract: ^0.0.1
```

2. Initialize in your main app:
```dart
import 'package:agenteract/agenteract.dart';

void main() {
  runApp(
    AgentDebugBridge(
      projectName: 'flutter-app',
      child: MyApp(),
    ),
  );
}
```

3. Add keys to widgets:
```dart
ElevatedButton(
  key: Key('submitButton'),
  onPressed: handleSubmit,
  child: Text('Submit'),
)
```

---

## Appendix D: Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| WebSocket connection failed | Server not running | Ensure `npx @agenteract/cli dev` is running |
| "Project not found" error | Invalid project name | Check `projectName` matches config |
| testID not found | Component not registered | Verify `testID` prop is set correctly |
| HTTP timeout | App not responding | Check app is connected via WebSocket |
| Port already in use | Previous process still running | Kill processes on ports 8765-8790 |
| Blank hierarchy returned | No components with testID | Add `testID` props to components |

### Debug Mode

Enable debug logging:

```bash
DEBUG=agenteract:* npx @agenteract/cli dev
```

This will show detailed logs for:
- WebSocket connections/disconnections
- Command routing
- Response correlation
- Error stack traces

---

## Conclusion

Agenteract provides a robust, extensible architecture for AI agent interaction with running applications. The modular monorepo structure, clear separation of concerns, and WebSocket-based protocol enable seamless integration across multiple platforms while maintaining developer productivity.

For questions, issues, or contributions, visit:
- **GitHub**: https://github.com/agenteract/agenteract
- **NPM**: https://www.npmjs.com/org/agenteract
- **Documentation**: See `/docs` folder for additional guides

**Version**: 1.0.0
**Last Updated**: November 2024
**Status**: Experimental
