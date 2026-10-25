export type OpenLinkResult = 'opened' | 'unavailable' | 'failed';

/** Only real HTTPS pages are linked; anything else is treated as not published. */
export function isPublicPageUrl(url: string | null): url is string {
  if (url === null) return false;
  return /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(url);
}

/** Opens a public page without ever throwing, so a broken link cannot crash Settings. */
export async function openPublicPage(
  url: string | null,
  open: (url: string) => Promise<unknown>,
): Promise<OpenLinkResult> {
  if (!isPublicPageUrl(url)) return 'unavailable';
  try {
    await open(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}
