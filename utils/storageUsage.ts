/** How much space the saved photos take, and how much the browser still has to give. */

/** The size in bytes of the image inside a `data:` URL (base64 carries 3 bytes in every 4 characters). */
export const dataUrlBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',');
  const base64Length = dataUrl.length - (comma + 1);
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64Length * 3) / 4) - padding);
};

/** "512 KB", "24.3 MB", "1.2 GB": short sizes for people, not exact ones. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/** The room left for this site (the browser's estimate), or null when the browser cannot say. */
export const estimateFreeBytes = async (): Promise<number | null> => {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) return null;
    return Math.max(0, quota - usage);
  } catch {
    return null;
  }
};

/** Asks the browser not to clear the photos when the device runs low on space. Safe to call often; it never prompts on most browsers. */
export const requestPersistentStorage = async (): Promise<void> => {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not available: nothing to do */
  }
};

/** "Low" when under 100 MB. */
export const isLowOnSpace = (freeBytes: number | null): boolean => freeBytes !== null && freeBytes < 100 * 1024 * 1024;
