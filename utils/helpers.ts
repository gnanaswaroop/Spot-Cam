/**
 * @file Contains miscellaneous helper functions used across the application.
 */

/**
 * Formats a Unix timestamp into a human-readable, locale-specific date and time string.
 * @param timestamp - The Unix timestamp in milliseconds.
 * @returns A formatted date-time string (e.g., "7/25/2024, 10:30:00 AM").
 */
export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

/**
 * Converts a data URL string into a File object.
 * This is useful for working with APIs that require a File, like the Web Share API.
 * @param dataUrl - The data URL string to convert (e.g., "data:image/jpeg;base64,...").
 * @param filename - The desired filename for the output File.
 * @returns A Promise that resolves to a File object.
 */
export const dataURLtoFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};
