import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValueStore } from '../app/preferences';

/** Device-local key-value storage for preferences only. Nothing here leaves the device. */
export const deviceKeyValueStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};
