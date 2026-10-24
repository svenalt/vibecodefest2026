import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionProvider } from './src/app/SessionProvider';
import { ComingSoonScreen } from './src/ui/ComingSoonScreen';
import { LiveScreen } from './src/ui/LiveScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { TabBar, type TabKey } from './src/ui/TabBar';
import { ThemeProvider, usePalette } from './src/ui/theme';

function Shell() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('live');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/* Live stays mounted (hidden) so the artwork is not re-initialised; it pauses while hidden. */}
        <View style={{ flex: 1, display: tab === 'live' ? 'flex' : 'none' }}>
          <LiveScreen active={tab === 'live'} topInset={insets.top} />
        </View>
        {tab === 'walk' && (
          <ComingSoonScreen
            title="Sound Walk"
            icon="🚶"
            topInset={insets.top}
            blurb="Sound Walk will let you take a walk and see how the sounds around you change along the way."
          />
        )}
        {tab === 'gallery' && (
          <ComingSoonScreen
            title="Gallery"
            icon="🖼️"
            topInset={insets.top}
            blurb="Gallery will be a place to look back at artworks made from your listening sessions."
          />
        )}
        {tab === 'settings' && <SettingsScreen topInset={insets.top} />}
      </View>
      <TabBar active={tab} onChange={setTab} />
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
