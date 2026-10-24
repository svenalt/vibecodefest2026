// Verifies the pinned YAMNet artifacts in assets/model against docs/model.md's checksums.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PINNED = {
  'assets/model/yamnet.tflite': {
    bytes: 4126810,
    sha256: '4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf',
  },
  'assets/model/yamnet_class_map.csv': {
    bytes: null,
    sha256: 'cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2',
  },
};

const root = fileURLToPath(new URL('..', import.meta.url));
let failed = false;
for (const [path, pin] of Object.entries(PINNED)) {
  const data = readFileSync(root + path);
  const sha256 = createHash('sha256').update(data).digest('hex');
  const ok = sha256 === pin.sha256 && (pin.bytes === null || data.length === pin.bytes);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${path} ${data.length} bytes sha256=${sha256}`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
