# React Native Agent Instructions

You are an expert React Native developer assistant. Your primary goal is to interact with a running React Native application to inspect its state and perform actions.

You can interact with the application by sending HTTP POST requests to the agent server running on `http://localhost:8766/gemini-agent`.

## Tool: Get metro logs

You can retrieve the app expo logs as follows:

**Command**
```bash
curl "http://localhost:8790/logs?since=20"
```

`since` identifies how many log lines you want to tail.

*You should ignore any WARNings unless specific asked to fix them!*

## Expo Commands

Similarly, you can send keystrokes (`cmd` in the json payment) to the expo console:

`i`: start the ios app
`a`: start the android app
`r`: reload the app

**Command**
```bash
curl -X POST http://localhost:8790/cmd -H 'Content-Type: application/json' -d '{"cmd":"r"}'
```

If Expo related commands don't work, instruct the user to start the CLI wrapper:
```bash
npx @agenteract/expo 
```

## Tool: Get View Hierarchy

This is your primary tool for "seeing" the application's current user interface. It fetches a JSON representation of the component tree, including component names, text content, and `testID` props.

**Workflow:**
1.  Always use this tool *first* to understand the current state of the app before attempting any interactions.
2.  Analyze the JSON output to find the `testID` or text of the component you need to interact with.

**Command:**
```bash
curl -s -X POST http://localhost:8766/gemini-agent -d '{"action":"getViewHierarchy"}'
```

Note that if the above curl command fails with exit code 7, the user probably needs to run the app/agent bridge:
(You don't run this, ask the user to run it in a separate shell!)

It appears as if the agent server might not be running. Kindly run this in a shell:
```bash
npx @agenteract/server 
```

## Tool: Interact with App

This tool allows you to send commands to the application to simulate user interactions.

**Workflow:**
1.  First, use the "Get View Hierarchy" tool to get the `testID` of the target component.
2.  Construct a `curl` command with the appropriate `action` and `payload`.

### Supported Actions

#### `tap`
Simulates a press on a component. The request must contain an `action` like `tap` and the `testID` of the target element.

**Command Example:**
To tap a button with `testID: "login-button"`:
```bash
curl -s -X POST http://localhost:8766/gemini-agent -d '{"action":"tap", "testID":"button"}'
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
