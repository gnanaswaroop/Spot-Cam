import { describe, expect, it, vi } from 'vitest';
import { SHARE_TEXT, shareWebsite } from '../../utils/shareSite';

const url = 'https://example.test/';

describe('shareWebsite', () => {
  it('opens the share window with a short sentence and the link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareWebsite({ share }, url)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'SpotCam', text: SHARE_TEXT, url });
    expect(SHARE_TEXT.length).toBeLessThanOrEqual(200); // short enough for a chat message
    expect(SHARE_TEXT).toMatch(/GPS location/);
    expect(SHARE_TEXT).toMatch(/Nothing to install/);
  });

  it('is not an error when the share window is closed', async () => {
    const writeText = vi.fn();
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    expect(await shareWebsite({ share, clipboard: { writeText } }, url)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when sharing is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareWebsite({ clipboard: { writeText } }, url)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('copies the link when sharing fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await shareWebsite({ share, clipboard: { writeText } }, url)).toBe('copied');
  });

  it('says so when neither works', async () => {
    expect(await shareWebsite({}, url)).toBe('failed');
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    expect(await shareWebsite({ clipboard: { writeText } }, url)).toBe('failed');
  });
});
