/** YAMNet fixed-window TFLite classification model I/O (see docs/model.md). */
export const YAMNET_SAMPLE_RATE = 16000;
export const YAMNET_INPUT_SAMPLES = 15600; // 0.975 s of mono float32
export const YAMNET_NUM_CLASSES = 521;
/** Window hop: a new inference roughly every 0.4875 s once the first window is full. */
export const YAMNET_HOP_SAMPLES = 7800;
/**
 * Classes each native adapter sends per inference: the best of all 521, after the full output was
 * checked. Pinned with the Kotlin and Swift constants (src/native/nativePins.test.ts).
 */
export const YAMNET_TOP_K = 10;
