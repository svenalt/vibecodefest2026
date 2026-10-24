/** YAMNet fixed-window TFLite classification model I/O (see docs/model.md). */
export const YAMNET_SAMPLE_RATE = 16000;
export const YAMNET_INPUT_SAMPLES = 15600; // 0.975 s of mono float32
export const YAMNET_NUM_CLASSES = 521;
/** Window hop: a new inference roughly every 0.4875 s once the first window is full. */
export const YAMNET_HOP_SAMPLES = 7800;
