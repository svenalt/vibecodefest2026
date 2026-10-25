import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { handlesBack, INITIAL_NAV, navReducer } from './src/app/navigation';
import { PreferencesProvider } from './src/app/PreferencesProvider';
import { SessionProvider } from './src/app/SessionProvider';
import { LiveScreen } from './src/ui/LiveScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { ThemeProvider, usePalette } from './src/ui/theme';

/** Live is the root screen; Settings opens over it and immersive mode is a presentation of it. */
function Shell() {
  const c = usePalette();
  const [nav, dispatch] = useReducer(navReducer, INITIAL_NAV);
  const onLive = nav.screen === 'live';

  // Android back: leave immersion, then Settings, then the app.
  useEffect(() => {
    if (!handlesBack(nav)) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dispatch({ type: 'back' });
      return true;
    });
    return () => sub.remove();
  }, [nav]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} hidden={nav.immersive} />
      {/* Live stays mounted (hidden) so the artwork is not re-initialised; it pauses while hidden. */}
      <View style={{ flex: 1, display: onLive ? 'flex' : 'none' }}>
        <LiveScreen
          active={onLive}
          immersive={nav.immersive}
          onImmersiveChange={(on) => dispatch({ type: on ? 'enterImmersive' : 'exitImmersive' })}
          onOpenSettings={() => dispatch({ type: 'openSettings' })}
        />
      </View>
      {!onLive && <SettingsScreen onBack={() => dispatch({ type: 'back' })} />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <ThemeProvider>
          <SessionProvider>
            <Shell />
          </SessionProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}
