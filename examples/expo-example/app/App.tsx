import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { AgentDebugBridge } from '@agenteract/react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import HomeScreen from './HomeScreen';
import { useState, useCallback } from 'react';
import { parseURL } from './utils/deepLinkUtils';

export default function App() {
  const colorScheme = useColorScheme();
  const [appState, setAppState] = useState({ username: '', count: 0 });

  const handleDeepLink = useCallback(async (url: string): Promise<boolean> => {
    console.log('[App] Deep link received:', url);

    const { hostname, queryParams } = parseURL(url);
    console.log('[App] Parsed hostname:', hostname, 'params:', queryParams);

    switch (hostname) {
      case 'reset_state':
        console.log('[App] Resetting app state');
        setAppState({ username: '', count: 0 });
        console.log('[App] App state cleared');
        return true;

      case 'reload':
        console.log('[App] Reload requested via deep link');
        // Note: Expo.reloadAppAsync() would require importing expo
        // For now, just log it
        return true;

      default:
        // Let AgentDebugBridge handle it
        return false;
    }
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HomeScreen appState={appState} setAppState={setAppState} />
      <StatusBar style="auto" />
      { __DEV__ && <AgentDebugBridge projectName="expo-app" onDeepLink={handleDeepLink} /> }
    </ThemeProvider>
  );
}
