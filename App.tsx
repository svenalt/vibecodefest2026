import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from './src/app/SessionProvider';
import { ComingSoonScreen } from './src/ui/ComingSoonScreen';
import { LiveScreen } from './src/ui/LiveScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { TabBar, type TabKey } from './src/ui/TabBar';
import { ThemeProvider, usePalette } from './src/ui/theme';

function Shell() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { effectiveViz } = useSession();
  const [tab, setTab] = useState<TabKey>('live');
  const [immersiveRequested, setImmersive] = useState(false);
  // Immersion needs the artwork: it ends if the visualization is turned off.
  const immersive = immersiveRequested && tab === 'live' && effectiveViz !== 'off';

  useEffect(() => {
    if (effectiveViz === 'off') setImmersive(false);
  }, [effectiveViz]);

  // Android back leaves immersion first.
  useEffect(() => {
    if (!immersive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setImmersive(false);
      return true;
    });
    return () => sub.remove();
  }, [immersive]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} hidden={immersive} />
      <View style={{ flex: 1 }}>
        {/* Live stays mounted (hidden) so the artwork is not re-initialised; it pauses while hidden. */}
        <View style={{ flex: 1, display: tab === 'live' ? 'flex' : 'none' }}>
          <LiveScreen
            active={tab === 'live'}
            topInset={insets.top}
            immersive={immersive}
            onImmersiveChange={setImmersive}
          />
        </View>
        {tab === 'walk' && (
          <ComingSoonScreen
            title="Sound Walk"
            icon="walk"
            topInset={insets.top}
            blurb="Sound Walk will let you take a walk and see how the sounds around you change along the way."
          />
        )}
        {tab === 'gallery' && (
          <ComingSoonScreen
            title="Gallery"
            icon="gallery"
            topInset={insets.top}
            blurb="Gallery will be a place to look back at artworks made from your listening sessions."
          />
        )}
        {tab === 'settings' && <SettingsScreen topInset={insets.top} />}
      </View>
      {!immersive && <TabBar active={tab} onChange={setTab} />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
