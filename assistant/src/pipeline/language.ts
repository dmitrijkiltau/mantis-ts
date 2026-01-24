export type DetectedLanguage = string;

export const LANGUAGE_FALLBACK: DetectedLanguage = 'unknown';

/**
 * Normalize an ISO code into a DetectedLanguage (string).
 */
export function deriveDetectedLanguage(code?: string): DetectedLanguage {
  if (!code) {
    return LANGUAGE_FALLBACK;
  }

  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return LANGUAGE_FALLBACK;
  }

  if (normalized === LANGUAGE_FALLBACK) {
    return LANGUAGE_FALLBACK;
  }

  return normalized;
} 
