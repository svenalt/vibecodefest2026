import { describe, expect, it } from 'vitest';

import { isPublicPageUrl, openPublicPage } from './publicLinks';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from './release';

describe('public privacy and support links', () => {
  it('accepts only HTTPS pages on a real host', () => {
    expect(isPublicPageUrl('https://example.org/privacy')).toBe(true);
    expect(isPublicPageUrl('https://example.org')).toBe(true);
    for (const bad of [null, '', 'http://example.org/privacy', 'https://localhost/x', 'mailto:a@b.c', 'auviona://x']) {
      expect(isPublicPageUrl(bad)).toBe(false);
    }
  });

  it('configured release links are HTTPS or explicitly unpublished (null)', () => {
    for (const url of [PRIVACY_POLICY_URL, SUPPORT_URL]) {
      expect(url === null || isPublicPageUrl(url)).toBe(true);
    }
  });

  it('opens a configured page', async () => {
    const opened: string[] = [];
    const result = await openPublicPage('https://example.org/support', async (u) => void opened.push(u));
    expect(result).toBe('opened');
    expect(opened).toEqual(['https://example.org/support']);
  });

  it('reports an unpublished page without trying to open it', async () => {
    let calls = 0;
    expect(await openPublicPage(null, async () => void calls++)).toBe('unavailable');
    expect(calls).toBe(0);
  });

  it('never throws when the system cannot open the page', async () => {
    const result = await openPublicPage('https://example.org/privacy', async () => {
      throw new Error('No browser');
    });
    expect(result).toBe('failed');
  });
});
