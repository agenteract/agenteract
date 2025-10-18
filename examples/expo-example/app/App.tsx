import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { AgentDebugBridge } from '@agenteract/react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import HomeScreen from './HomeScreen';

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HomeScreen />
      <StatusBar style="auto" />
      { __DEV__ && <AgentDebugBridge /> }
    </ThemeProvider>
  );
}
