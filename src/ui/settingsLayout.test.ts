import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/**
 * The screens render through React Native, which these node tests cannot mount, so REQ-010's
 * visibility rules are checked on the source: what release builds can put on screen.
 */
describe('Settings (REQ-010)', () => {
  const settings = read('src/ui/SettingsScreen.tsx');
  // Strip the development-only block; everything left is what release builds can show.
  const release = settings.replace(/\{__DEV__ && \([\s\S]*?\n {6}\)\}/, '');

  it('release builds show only Listening, Appearance and About, in that order', () => {
    const groups = [...release.matchAll(/<Group title="([^"]+)"/g)].map((m) => m[1]);
    expect(groups).toEqual(['Listening', 'Appearance', 'About']);
  });

  it('has no Motion or Diagnostics controls outside the development-only block', () => {
    expect(release).not.toMatch(/Visualization|Motion|Animated|Reduced|setVizChoice|<Diagnostics|diagnostics'/);
    expect(settings).toMatch(/\{__DEV__ && \(\s*<Group title="Developer"[^>]*>\s*<Diagnostics /);
  });

  it('the stored preferences no longer carry a motion choice', () => {
    expect(read('src/app/preferences.ts')).not.toMatch(/\bviz\s*:/);
  });
});

describe('Immersive overlay (REQ-010)', () => {
  const overlay = read('src/ui/ImmersiveOverlay.tsx');

  it('has no Current sound button, caption timer or fade', () => {
    expect(overlay).not.toMatch(/>Current sound<|showCaption|setTimeout|Animated/);
  });

  it('renders the card from the live session state on every render', () => {
    expect(overlay).toMatch(/immersiveCard\(presentation, mic\.kind, current, lastPrediction !== null\)/);
  });
});
