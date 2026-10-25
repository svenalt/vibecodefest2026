import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HAPTIC_ALERTS_AVAILABLE, PRE_RELEASE, PRIVACY_POLICY_URL, SUPPORT_URL } from './release';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** REQ-011 P0-D: the final release identity and links, as the native projects will resolve them. */
describe('release configuration', () => {
  const expo = JSON.parse(read('app.json')).expo;
  const eas = JSON.parse(read('eas.json'));

  it('iOS and Android both use the final identifier', () => {
    expect(expo.ios.bundleIdentifier).toBe('ch.auviona.app');
    expect(expo.android.package).toBe('ch.auviona.app');
  });

  it('keeps the EAS project, marketing version and remote build numbers', () => {
    expect(expo.extra.eas.projectId).toBe('3d58fca3-38a8-4b29-a0ea-15182cad4a1d');
    expect(expo.version).toBe('1.0.0');
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(expo.ios.buildNumber).toBeUndefined();
    expect(expo.android.versionCode).toBeUndefined();
  });

  it('is a public build with its links set and opt-in haptics kept', () => {
    expect(PRE_RELEASE).toBe(false);
    expect(HAPTIC_ALERTS_AVAILABLE).toBe(true);
    expect(PRIVACY_POLICY_URL).not.toBeNull();
    expect(SUPPORT_URL).not.toBeNull();
  });

  it('the store metadata lists the same Privacy and Support URLs', () => {
    const metadata = read('docs/release/app-store-metadata.md');
    expect(metadata).toContain(`| Privacy Policy URL | ${PRIVACY_POLICY_URL} |`);
    expect(metadata).toContain(`| Support URL | ${SUPPORT_URL} |`);
  });

  it('About keeps the safety and accuracy limitations', () => {
    const settings = read('src/ui/SettingsScreen.tsx');
    expect(settings).toMatch(/can miss or mislabel sounds and is not reliable for emergencies, alarms/);
  });
});

/** REQ-011 P0-B / P1-C: wiring that node tests cannot mount, checked on the source. */
describe('lifecycle and persistence wiring', () => {
  it('only an active app counts as foreground, at launch too', () => {
    const hook = read('src/hooks/useSoundSession.ts');
    expect(hook).toMatch(/controller\.setForeground\(isForegroundAppState\(AppState\.currentState\)\)/);
    expect(hook).not.toMatch(/!== 'background'/);
  });

  it('Settings states the save result and offers Retry', () => {
    const settings = read('src/ui/SettingsScreen.tsx');
    expect(settings).toMatch(/listeningHint\(listeningOn, listeningDesired, save\)/);
    expect(settings).toMatch(/saveNotice\(save, prefs\.listening, launchListening\)/);
    expect(settings).toMatch(/onPress=\{retrySave\}/);
    expect(settings).not.toMatch(/It stays off, even after you leave or restart/); // only via listeningHint
  });
});
