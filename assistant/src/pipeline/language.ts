export type DetectedLanguage = { language: string; name: string };

export const LANGUAGE_FALLBACK: DetectedLanguage = {
  language: 'unknown',
  name: 'Unknown',
};

const languageDisplayNameFormatter = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

/**
 * Formats a friendly display name for a language code.
 */
function formatLanguageDisplayName(code: string): string {
  if (!code) {
    return LANGUAGE_FALLBACK.name;
  }

  if (code === LANGUAGE_FALLBACK.language) {
    return LANGUAGE_FALLBACK.name;
  }

  const displayName = languageDisplayNameFormatter?.of(code);
  if (displayName && displayName.toLowerCase() !== code) {
    return displayName;
  }

  return `${code.charAt(0).toUpperCase()}${code.slice(1)}`;
}

/**
 * Normalize an ISO code into a DetectedLanguage, deriving a friendly name via Intl when available.
 */
export function deriveDetectedLanguage(code?: string): DetectedLanguage {
  if (!code) {
    return LANGUAGE_FALLBACK;
  }

  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return LANGUAGE_FALLBACK;
  }

  if (normalized === LANGUAGE_FALLBACK.language) {
    return LANGUAGE_FALLBACK;
  }

  return {
    language: normalized,
    name: formatLanguageDisplayName(normalized),
  };
}
