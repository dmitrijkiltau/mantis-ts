import type { ImageAttachment } from '../../assistant/src/pipeline';

/**
 * Parsed data URL payload.
 */
export type ParsedDataUrl = {
  base64: string;
  mimeType: string;
};

/**
 * Builds a data URL string from base64 image data.
 */
export const buildDataUrl = (base64: string, mimeType = 'image/png'): string => {
  return `data:${mimeType};base64,${base64}`;
};

/**
 * Generates a stable attachment identifier.
 */
export const buildAttachmentId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

/**
 * Reads a file into a data URL string.
 */
export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
};

/**
 * Parses a data URL into raw base64 data and mime type.
 */
export const parseDataUrl = (
  dataUrl: string,
  fallbackMimeType: string,
): ParsedDataUrl | null => {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }

  const header = trimmed.slice(0, commaIndex);
  const base64 = trimmed.slice(commaIndex + 1);
  if (!base64) {
    return null;
  }

  const match = /^data:(.+?);base64$/i.exec(header);
  const mimeType = match?.[1]?.trim() || fallbackMimeType || 'image/png';

  return { base64, mimeType };
};

/**
 * Builds an image attachment from a raw data URL payload.
 */
export const buildImageAttachmentFromDataUrl = (
  dataUrl: string,
  name: string,
  source: ImageAttachment['source'],
): ImageAttachment | null => {
  const parsed = parseDataUrl(dataUrl, 'image/png');
  if (!parsed) {
    return null;
  }

  return {
    id: buildAttachmentId(),
    name,
    mimeType: parsed.mimeType,
    data: parsed.base64,
    source,
  };
};

/**
 * Builds an image attachment from a File object.
 */
export const buildImageAttachmentFromFile = async (
  file: File,
  source: ImageAttachment['source'],
): Promise<ImageAttachment | null> => {
  const dataUrl = await readFileAsDataUrl(file);
  const parsed = parseDataUrl(dataUrl, file.type);
  if (!parsed) {
    return null;
  }

  return {
    id: buildAttachmentId(),
    name: file.name || 'image',
    mimeType: parsed.mimeType,
    data: parsed.base64,
    source,
  };
};
