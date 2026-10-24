import { Asset } from 'expo-asset';

/**
 * Resolves the bundled YAMNet model (assets/model/yamnet.tflite) to a plain file path.
 * In a release build the asset is embedded in the app; in a dev build it is fetched from
 * Metro on first use. No cloud service is involved either way.
 */
export async function resolveModelPath(): Promise<string> {
  const asset = Asset.fromModule(require('../../assets/model/yamnet.tflite'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri.startsWith('file://')) {
    throw new Error(`YAMNet model is not available as a local file (got ${uri})`);
  }
  return decodeURIComponent(uri.slice('file://'.length));
}
