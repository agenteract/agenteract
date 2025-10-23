# Agenteract Agent Instructions

You are an expert developer assistant. Your primary goal is to interact with a running application to inspect its state and use this information to perform your duties effectively.

You can interact with the application by using the `@agenteract/agents` CLI.

## Project Detection

Before interacting with the application, you must determine the project type. You can do this by inspecting the `package.json` file for dependencies like `expo` or `vite`.

## Tool: Get Logs

There are two types of logs available: **Dev Server Logs** and **In-App Console Logs**.

### 1. Dev Server Logs

These logs come from the development server process (like Vite or Expo Metro). They are essential for debugging **build-time errors**, such as transpilation failures or server crashes. If the application fails to load, these are the first logs you should check.

**Expo Command**
```bash
pnpm agenteract-agents dev-logs expo --since 20
```

**Vite Command**
```bash
pnpm agenteract-agents dev-logs vite --since 20
```

### 2. In-App Console Logs

These logs are captured from the running application's `console.log`, `console.warn`, and `console.error` calls. Use these to debug **runtime issues**, inspect application state, and trace client-side behavior.

**Command**
```bash
pnpm agenteract-agents logs <project-name> --since 20
```

`since` identifies how many log lines you want to tail.

*You should ignore any WARNings unless specific asked to fix them!*

## Dev Server Commands

Similarly, you can send keystrokes (`cmd` in the json payment) to the dev server console:

**Expo Commands**

`i`: start the ios app
`a`: start the android app
`r`: reload the app

**Command**
```bash
pnpm agenteract-agents cmd expo r
```

**Vite Commands**

`r`: reload the app
`q`: quit

**Command**
```bash
pnpm agenteract-agents cmd vite r
```

If dev server commands don't work, instruct the user to start the CLI wrapper:

```bash
pnpm agenteract dev
```

## Tool: Get View Hierarchy

This is your primary tool for "seeing" the application's current user interface. It fetches a JSON representation of the component tree, including component names, text content, and `testID` props.

**Workflow:**
1.  First, use this tool to understand the current state of the app.
2.  All commands to the agent server must now include a `project` field, specifying the `name` of the project from `agenteract.config.js` that you want to target.

**Command:**
```bash
pnpm agenteract-agents hierarchy react-app
```

Note that if the above command fails, the user probably needs to run the app/agent bridge:
(You don't run this, ask the user to run it in a separate shell!)

It appears as if the agent server might not be running. Kindly run this in a shell:
```bash
pnpm agenterserve dev
```

## Tool: Interact with App

This tool allows you to send commands to the application to simulate user interactions.

**Workflow:**
1.  First, use the "Get View Hierarchy" tool to get the `testID` of the target component.
2.  Construct a command with the appropriate `project`, `action`, and `payload`.

### Supported Actions

#### `tap`
Simulates a press on a component. The request must contain an `action` like `tap` and the `testID` of the target element.

**Command Example:**
To tap a button with `testID: "login-button"` in the project named `expo-app`:
```bash
pnpm agenteract-agents tap expo-app login-button
```

**Creating components:**

For you to be able to interact with a component, two things are required

1. a `testID`
2. a way to call event handlers

This is achieved with the `useAgentBinding` hook: 

```ts
export function useAgentBinding<T extends object>({
  testID,
  onPress,
  onChangeText,
}: AgentBindingProps) {
  const ref = useRef<T>(null);

  // register this node + handlers in the global registry
  useEffect(() => {
    registerNode(testID, { ref, onPress, onChangeText });
    return () => unregisterNode(testID);
  }, [testID, onPress, onChangeText]);

  // return a “blobject” that can be spread directly into any component
  return useMemo(
    () => ({
      ref,
      testID,
      onPress,
      onChangeText,
      accessible: true,
    }),
    [onPress, onChangeText, testID]
  );
}
```

This hook simultaneously registers handler functions against their test ID for simulated events, and returns everything as a prop for use within the component, eg:

```ts
import { createAgentBinding } from '@agenteract/react';
```

```tsx
<Pressable {...createAgentBinding({
    testID: 'button',
    onPress: () => console.log('Simulate button pressed'),
    })}
>
    <ThemedText>Simulate Target</ThemedText>
</Pressable>
```

You can see how this is handled by agent-server requests in `https://raw.githubusercontent.com/agenteract/agenteract/refs/heads/main/packages/react/src/AgentDebugBridge.tsx`.
