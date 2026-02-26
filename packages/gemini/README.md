> **DEPRECATED:** This package is no longer maintained. The `/gemini-agent` endpoint it relied on has been renamed to `/agent`. Use the `@agenteract/agents` CLI or `@agenteract/core` programmatic API instead. See the root [README](../../README.md) for current usage.

# Gemini / React Native Debug Bridge

Usage:
```bash
gemini extensions install .
gemini
```
Add Gemini debug bridge somewhere in your code:
```ts

import AgentDebugBridge from '@agenteract/react';

//....
return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
      {__DEV__ && <AgentDebugBridge />}
    </ThemeProvider>
  );
```

New terminal, within expo app:
```bash
npm run ios|android
```

New terminal within expo app:

```bash
npx @agenteract/server 
```

Ask Gemini about your app:
```gemini
View the app hierarchy and let me know what it shows.

Add Step 4: Don't be evil and verify it exists.
```
