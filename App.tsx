import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MainScreen } from './src/ui/MainScreen';
import { ThemeProvider, usePalette } from './src/ui/theme';

function ThemedApp() {
  const c = usePalette();
  return (
    <>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
      <MainScreen />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
