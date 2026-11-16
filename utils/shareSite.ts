/**
 * @file Sharing the website itself (not a photo): a very short sentence and the link, through the same system
 * share window as a photo. Where sharing is not available the link is copied instead. Pure of React so it can be
 * unit tested with a fake navigator.
 */

export const SHARE_TITLE = 'SpotCam';
export const SHARE_TEXT = 'SpotCam: a free camera that stamps the date, time and place on your photos.';

export type ShareSiteResult = 'shared' | 'copied' | 'cancelled' | 'failed';

interface ShareEnvironment {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/** Opens the share window with the sentence and the link; copies the link when that is not possible. */
export async function shareWebsite(env: ShareEnvironment, url: string): Promise<ShareSiteResult> {
  if (env.share) {
    try {
      await env.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
      return 'shared';
    } catch (err) {
      // Closing the share window is not an error.
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Any other failure: fall through to copying the link.
    }
  }
  try {
    if (!env.clipboard) return 'failed';
    await env.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
